const express = require('express');
const router = express.Router();
const orderService = require('../services/order');
const nowpaymentsService = require('../services/nowpayments');
const db = require('../config/database');
const crypto = require('crypto');

// NOWPayments Webhook回调
router.post('/nowpayments', async (req, res) => {
  // 注意：在 index.js 中需要为此路由使用 express.raw({type: 'application/json'}) 中间件以便签名验证
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const signature = req.headers['x-nowpayments-signature'] || req.headers['x-signature'] || '';

  try {
    // 签名验证
    if (process.env.NOWPAYMENTS_WEBHOOK_SECRET) {
      const valid = nowpaymentsService.verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        console.warn('Webhook 签名验证失败');
        return res.status(403).send('Invalid signature');
      }
    }

    const webhookData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('收到NOWPayments Webhook:', JSON.stringify(webhookData, null, 2));

    const paymentId = webhookData.payment_id || webhookData.purchase_id || webhookData.invoice_id;
    const invoiceId = webhookData.invoice_id || webhookData.order_id || webhookData.payment_id;
    const paymentStatus = webhookData.payment_status || webhookData.status;

    if (!paymentId || !paymentStatus) {
      console.warn('Webhook 数据缺失', { paymentId, paymentStatus });
      return res.status(400).send('invalid payload');
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 幂等检查：查看是否已存在相同 payment_id 且 processed=1 的记录
      const [existing] = await conn.query('SELECT * FROM payment_webhooks WHERE payment_id = ? AND event_status = ? AND processed = 1 LIMIT 1', [paymentId, paymentStatus]);
      if (existing.length > 0) {
        await conn.commit();
        console.log('重复回调，已跳过处理', { paymentId, paymentStatus });
        return res.status(200).send('already processed');
      }

      // 保存 webhook 原始 payload（processed 默认为0）
      await conn.query('INSERT INTO payment_webhooks (payment_id, order_id, event_status, payload, processed) VALUES (?, ?, ?, ?, 0)', [paymentId, invoiceId, paymentStatus, JSON.stringify(webhookData)]);

      // 查订单（用 payment_id 或 order_id）
      const [orders] = await conn.query('SELECT * FROM orders WHERE payment_id = ? OR order_id = ? FOR UPDATE', [paymentId, invoiceId]);
      if (orders.length === 0) {
        // 未找到订单，标记为已处理以防止无限回调存储
        await conn.query('UPDATE payment_webhooks SET processed = 1, processed_at = NOW() WHERE payment_id = ? AND event_status = ?', [paymentId, paymentStatus]);
        await conn.commit();
        console.warn('Webhook: 关联订单未找到', { paymentId, invoiceId });
        return res.status(200).send('order not found');
      }

      const order = orders[0];

      // 更新 webhook 接收时间
      await conn.query('UPDATE orders SET webhook_received_at = NOW() WHERE order_id = ?', [order.order_id]);

      // 如果已激活则跳过
      if (order.status === 'activated') {
        await conn.query('UPDATE payment_webhooks SET processed = 1, processed_at = NOW() WHERE payment_id = ? AND event_status = ?', [paymentId, paymentStatus]);
        await conn.commit();
        console.log('订单已激活，跳过', { orderId: order.order_id });
        return res.status(200).send('already activated');
      }

      // 根据状态处理
      if (['confirmed', 'finished', 'sending'].includes(paymentStatus)) {
        // 更新订单状态为 paid/activated，并激活服务
        await conn.query('UPDATE orders SET payment_status = ?, status = ? WHERE order_id = ?', [paymentStatus, 'activated', order.order_id]);

        // 激活服务（使用已有的 orderService 方法）
        // 注意：orderService.activateUserService 会执行独立的 DB 操作；为了保证一致性，这里调用后再提交事务
        await conn.commit(); // 先提交订单更新

        const serviceData = await orderService.activateUserService(order.order_id, order.user_id);

        const conn2 = await db.getConnection();
        try {
          await conn2.beginTransaction();
          // 标记 webhook 已处理
          await conn2.query('UPDATE payment_webhooks SET processed = 1, processed_at = NOW() WHERE payment_id = ? AND event_status = ?', [paymentId, paymentStatus]);
          await conn2.commit();
        } finally {
          conn2.release();
        }

        console.log('激活成功', { orderId: order.order_id, token: serviceData.accessToken });
        return res.status(200).json({ success: true, orderId: order.order_id, accessToken: serviceData.accessToken });
      } else if (['failed', 'expired', 'refunded'].includes(paymentStatus)) {
        await conn.query('UPDATE orders SET payment_status = ?, status = ? WHERE order_id = ?', [paymentStatus, 'failed', order.order_id]);
        await conn.query('UPDATE payment_webhooks SET processed = 1, processed_at = NOW() WHERE payment_id = ? AND event_status = ?', [paymentId, paymentStatus]);
        await conn.commit();
        return res.status(200).json({ success: true, message: 'payment failed' });
      } else {
        // waiting / confirming 等，只更新支付状态
        await conn.query('UPDATE orders SET payment_status = ? WHERE order_id = ?', [paymentStatus, order.order_id]);
        await conn.query('UPDATE payment_webhooks SET processed = 1, processed_at = NOW() WHERE payment_id = ? AND event_status = ?', [paymentId, paymentStatus]);
        await conn.commit();
        return res.status(200).json({ success: true, message: 'status updated' });
      }
    } catch (err) {
      await conn.rollback();
      console.error('Webhook处理事务错误', err);
      return res.status(500).send('internal error');
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('处理Webhook错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '处理Webhook失败'
    });
  }
});

module.exports = router;





















