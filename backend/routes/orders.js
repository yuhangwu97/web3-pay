const express = require('express');
const router = express.Router();

const OrderService = require('../services/orderService');
const paymentQueue = require('../services/paymentQueue');
const {
  orderCreationRateLimit,
  userRateLimit,
  validateOrder
} = require('../middleware/security');
const idempotency = require('../middleware/idempotency');

// 创建支付订单
router.post('/', idempotency, orderCreationRateLimit, validateOrder, async (req, res) => {
  try {
    const {
      userId,
      amount,
      tokenType,
      networkId,
      recipientAddress,
      paymentMethod
    } = req.body;

    // 从请求中提取用户ID（实际应用中应该从JWT或其他认证中获取）
    const actualUserId = userId || req.ip || 'anonymous';

    const result = await OrderService.createOrder({
      userId: actualUserId,
      amount,
      tokenType,
      networkId,
      recipientAddress,
      paymentMethod
    });

    res.status(201).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create order',
      message: error.message
    });
  }
});

// 获取订单详情
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderService.getOrder(orderId);

    // // Lazy Polling: If order is pending, trigger monitoring
    // if (order && order.status === 'pending') {
    //   try {
    //     await paymentQueue.addPaymentMonitoring(orderId, order.network_id || 11155111);
    //   } catch (err) {
    //     console.error(`Failed to trigger monitoring for order ${orderId}:`, err.message);
    //   }
    // }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(404).json({
      success: false,
      error: 'Order not found',
      message: error.message
    });
  }
});

// 获取用户订单列表
router.get('/user/:userId', userRateLimit(20, 5 * 60 * 1000, 'user-orders'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const orders = await OrderService.getUserOrders(userId, parseInt(page), parseInt(limit));

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error.message
    });
  }
});



// 更新订单状态（管理员接口）
router.put('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!['pending', 'paid', 'expired', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        message: 'Status must be one of: pending, paid, expired, failed'
      });
    }

    const result = await OrderService.updateOrderStatus(orderId, status);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update order status',
      message: error.message
    });
  }
});

module.exports = router;
