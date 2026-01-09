const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const ethers = require('ethers');

class OrderService {
  // 生成订单ID
  generateOrderId() {
    return `order_${Date.now()}_${uuidv4().substring(0, 8)}`;
  }

  // 生成访问令牌
  generateAccessToken() {
    return `token_${crypto.randomBytes(32).toString('hex')}`;
  }

  // 创建订单
  async createOrder(orderData) {
    const {
      userId,
      currency,
      amount,
      paymentId,
      paymentUrl,
      expireTime,
      receiveAddress,
      purchaseId
    } = orderData;

    const orderId = this.generateOrderId();
    const expireTimestamp = new Date(Date.now() + (expireTime || 30 * 60 * 1000)); // 默认30分钟

    // 临时方案：检查数据库是否有 purchase_id 和 receive_address 列
    let hasPurchaseId = false;
    let hasReceiveAddress = false;

    try {
      const [columns] = await db.query('DESCRIBE orders');
      const columnNames = columns.map(col => col.Field);
      hasPurchaseId = columnNames.includes('purchase_id');
      hasReceiveAddress = columnNames.includes('receive_address');
    } catch (error) {
      console.warn('无法检查数据库列，将使用兼容模式:', error.message);
    }

    // 动态构建查询语句
    const insertFields = ['order_id', 'user_id', 'currency', 'chain', 'amount', 'payment_id', 'payment_status', 'status', 'qr_code', 'expire_time'];
    const insertValues = [orderId, userId || 'anonymous', currency, 'ETH', amount, paymentId, 'waiting', 'pending', paymentUrl, expireTimestamp];

    if (hasReceiveAddress) {
      insertFields.push('receive_address');
      insertValues.push(receiveAddress || null);
    }

    if (hasPurchaseId) {
      insertFields.push('purchase_id');
      insertValues.push(purchaseId || null);
    }

    const query = `
      INSERT INTO orders (${insertFields.join(', ')}, created_at)
      VALUES (${insertValues.map(() => '?').join(', ')}, NOW())
    `;

    const values = insertValues;

    const [result] = await db.query(query, values);
    return {
      orderId,
      ...orderData
    };
  }

  // 根据订单ID查询订单
  async getOrderByOrderId(orderId) {
    const query = 'SELECT * FROM orders WHERE order_id = ?';
    const [rows] = await db.query(query, [orderId]);
    return rows[0] || null;
  }

  // 根据支付ID查询订单
  async getOrderByPaymentId(paymentId) {
    const query = 'SELECT * FROM orders WHERE payment_id = ?';
    const [rows] = await db.query(query, [paymentId]);
    return rows[0] || null;
  }

  // 更新订单状态
  async updateOrderStatus(orderId, status, paymentStatus = null) {
    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }

    if (paymentStatus) {
      updates.push('payment_status = ?');
      values.push(paymentStatus);
    }

    if (status === 'paid' || status === 'activated') {
      updates.push('activated_at = NOW()');
    }

    if (updates.length === 0) return;

    values.push(orderId);
    const query = `UPDATE orders SET ${updates.join(', ')} WHERE order_id = ?`;
    await db.query(query, values);
  }

  // 更新Webhook接收时间
  async updateWebhookReceived(orderId) {
    const query = 'UPDATE orders SET webhook_received_at = NOW() WHERE order_id = ?';
    await db.query(query, [orderId]);
  }

  // 激活用户服务
  async activateUserService(orderId, userId) {
    const token = this.generateAccessToken();
    const tokenExpire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天有效期

    // 更新订单状态
    await this.updateOrderStatus(orderId, 'activated', 'confirmed');

    // 创建或更新用户服务记录
    const checkQuery = 'SELECT * FROM user_services WHERE order_id = ?';
    const [existing] = await db.query(checkQuery, [orderId]);

    if (existing.length > 0) {
      // 更新现有记录
      const updateQuery = `
        UPDATE user_services 
        SET access_token = ?, token_expire = ?, service_status = 'active', activated_at = NOW()
        WHERE order_id = ?
      `;
      await db.query(updateQuery, [token, tokenExpire, orderId]);
    } else {
      // 创建新记录
      const insertQuery = `
        INSERT INTO user_services (user_id, order_id, access_token, token_expire, service_status, activated_at)
        VALUES (?, ?, ?, ?, 'active', NOW())
      `;
      await db.query(insertQuery, [userId, orderId, token, tokenExpire]);
    }

    return {
      accessToken: token,
      expireTime: Math.floor(tokenExpire.getTime() / 1000)
    };
  }

  // 检查订单是否过期
  isOrderExpired(expireTime) {
    return new Date(expireTime) < new Date();
  }
}

module.exports = new OrderService();





















