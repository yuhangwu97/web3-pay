const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class UserToken {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userId = data.userId;
    this.orderId = data.orderId;
    this.token = data.token || uuidv4();
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.expiresAt = data.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1年过期
    this.createdAt = data.createdAt || new Date();
    this.lastUsedAt = data.lastUsedAt || null;
  }

  // 创建用户令牌
  static async create(tokenData) {
    const pool = getPool();
    const token = new UserToken(tokenData);

    const query = `
      INSERT INTO user_tokens (id, user_id, order_id, token, is_active, expires_at, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      token.id,
      token.userId,
      token.orderId,
      token.token,
      token.isActive,
      token.expiresAt,
      token.createdAt,
      token.lastUsedAt
    ];

    await pool.execute(query, values);
    return token;
  }

  // 根据令牌查找记录
  static async findByToken(token) {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM user_tokens WHERE token = ? AND is_active = 1',
      [token]
    );

    if (rows.length === 0) {
      return null;
    }

    return new UserToken(rows[0]);
  }

  // 根据用户ID查找令牌
  static async findByUserId(userId, limit = 10, offset = 0) {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM user_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );

    return rows.map(row => new UserToken(row));
  }

  // 更新最后使用时间
  static async updateLastUsed(token) {
    const pool = getPool();
    const lastUsedAt = new Date();

    await pool.execute(
      'UPDATE user_tokens SET last_used_at = ? WHERE token = ?',
      [lastUsedAt, token]
    );
  }

  // 停用令牌
  static async deactivate(token) {
    const pool = getPool();

    await pool.execute(
      'UPDATE user_tokens SET is_active = 0 WHERE token = ?',
      [token]
    );
  }

  // 清理过期令牌
  static async cleanupExpired() {
    const pool = getPool();
    const now = new Date();

    const [result] = await pool.execute(
      'UPDATE user_tokens SET is_active = 0 WHERE expires_at < ? AND is_active = 1',
      [now]
    );

    return result.affectedRows;
  }

  // 检查令牌是否有效
  isValid() {
    return this.isActive && new Date() < this.expiresAt;
  }

  // 获取令牌详情（不包含敏感信息）
  toPublic() {
    return {
      id: this.id,
      userId: this.userId,
      orderId: this.orderId,
      token: this.token,
      isActive: this.isActive,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt
    };
  }
}

module.exports = UserToken;
