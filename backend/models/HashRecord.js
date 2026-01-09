const { getPool } = require('../config/database');

class HashRecord {
  constructor(data) {
    this.id = data.id;
    this.orderId = data.orderId;
    this.transactionHash = data.transactionHash;
    this.userId = data.userId;
    this.isVerified = data.isVerified || false;
    this.verificationResult = data.verificationResult || null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // 创建Hash记录
  static async create(hashData) {
    const pool = getPool();
    const record = new HashRecord(hashData);

    const query = `
      INSERT INTO hash_records (id, order_id, transaction_hash, user_id, is_verified, verification_result, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      record.id,
      record.orderId,
      record.transactionHash,
      record.userId,
      record.isVerified,
      JSON.stringify(record.verificationResult),
      record.createdAt,
      record.updatedAt
    ];

    await pool.execute(query, values);
    return record;
  }

  // 根据Hash查找记录
  static async findByHash(transactionHash) {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM hash_records WHERE transaction_hash = ?',
      [transactionHash]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    if (row.verification_result) {
      // mysql2 driver might automatically parse JSON columns
      row.verificationResult = typeof row.verification_result === 'string'
        ? JSON.parse(row.verification_result)
        : row.verification_result;
    } else {
      row.verificationResult = null;
    }
    return new HashRecord(row);
  }

  // 检查Hash是否已被使用
  static async isHashUsed(transactionHash) {
    const record = await this.findByHash(transactionHash);
    return record !== null;
  }

  // 根据订单ID查找记录
  static async findByOrderId(orderId) {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM hash_records WHERE order_id = ? ORDER BY created_at DESC',
      [orderId]
    );

    return rows.map(row => {
      if (row.verification_result) {
        row.verificationResult = typeof row.verification_result === 'string'
          ? JSON.parse(row.verification_result)
          : row.verification_result;
      } else {
        row.verificationResult = null;
      }
      return new HashRecord(row);
    });
  }

  // 更新验证结果
  static async updateVerification(id, isVerified, verificationResult) {
    const pool = getPool();
    const updatedAt = new Date();

    await pool.execute(
      'UPDATE hash_records SET is_verified = ?, verification_result = ?, updated_at = ? WHERE id = ?',
      [isVerified, JSON.stringify(verificationResult), updatedAt, id]
    );
  }

  // 获取Hash记录详情
  toPublic() {
    return {
      id: this.id,
      orderId: this.orderId,
      transactionHash: this.transactionHash,
      isVerified: this.isVerified,
      verificationResult: this.verificationResult,
      createdAt: this.createdAt
    };
  }
}

module.exports = HashRecord;
