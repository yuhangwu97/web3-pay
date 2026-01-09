const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Order {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userId = data.userId || data.user_id;
    this.recipientAddress = data.recipientAddress || data.recipient_address;
    // 确保amount是数字类型
    const rawAmount = data.amount !== undefined ? data.amount : data.amount;
    this.amount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
    this.tokenType = data.tokenType || data.token_type || 'ETH';
    // 确保networkId是数字类型
    const rawNetworkId = data.networkId !== undefined ? data.networkId : data.network_id;
    this.networkId = typeof rawNetworkId === 'string' ? parseInt(rawNetworkId) : rawNetworkId || 1;
    this.status = data.status || 'pending';
    this.paymentMethod = data.paymentMethod || data.payment_method || 'qr';
    this.expiresAt = data.expiresAt || data.expires_at || new Date(Date.now() + 30 * 60 * 1000); // 30分钟过期
    this.createdAt = data.createdAt || data.created_at || new Date();
    this.updatedAt = data.updatedAt || data.updated_at || new Date();
  }

  // 创建订单
  static async create(orderData) {
    const pool = getPool();
    const order = new Order(orderData);

    const query = `
      INSERT INTO orders (id, user_id, recipient_address, amount, token_type, network_id, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      order.id,
      order.userId,
      order.recipientAddress,
      order.amount,
      order.tokenType,
      order.networkId,
      order.status,
      order.expiresAt,
      order.createdAt,
      order.updatedAt
    ];

    await pool.execute(query, values);
    return order;
  }

  // 根据ID查找订单
  static async findById(id) {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return new Order(rows[0]);
  }

  // 根据用户ID查找订单
  static async findByUserId(userId, limit = 10, offset = 0) {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );

    return rows.map(row => new Order(row));
  }

  // 更新订单状态
  static async updateStatus(id, status) {
    const pool = getPool();
    const updatedAt = new Date();

    await pool.execute(
      'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?',
      [status, updatedAt, id]
    );
  }

  // 检查订单是否过期
  isExpired() {
    return new Date() > this.expiresAt;
  }

  // 检查订单是否可以验证
  canVerify() {
    return this.status === 'pending' && !this.isExpired();
  }

  // 获取订单详情（不包含敏感信息）
  toPublic() {
    return {
      id: this.id,
      recipientAddress: this.recipientAddress,
      amount: this.amount,
      tokenType: this.tokenType,
      networkId: this.networkId,
      status: this.status,
      paymentMethod: this.paymentMethod,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt
    };
  }
}

module.exports = Order;
