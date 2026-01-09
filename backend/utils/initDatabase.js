const { getPool } = require('../config/database');

const createTables = async () => {
  const pool = getPool();

  try {
    // 检查表是否存在，防止重复初始化
    const [tables] = await pool.execute('SHOW TABLES LIKE "orders"');
    if (tables.length > 0) {
      console.log('✅ Database tables already exist, skipping initialization');
      return;
    }

    console.log('📦 Initializing database tables...');

    // 创建订单表
    const createOrdersTable = `
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        recipient_address VARCHAR(42) NOT NULL,
        amount DECIMAL(36, 18) NOT NULL,
        token_type VARCHAR(10) NOT NULL DEFAULT 'ETH',
        network_id INT NOT NULL DEFAULT 1,
        status ENUM('pending', 'paid', 'expired', 'failed') NOT NULL DEFAULT 'pending',
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_id (user_id),
        KEY idx_status (status),
        KEY idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await pool.execute(createOrdersTable);
    console.log('✅ Orders table created');

    // 创建Hash记录表（无外键约束）
    const createHashRecordsTable = `
      CREATE TABLE IF NOT EXISTS hash_records (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        transaction_hash VARCHAR(66) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        is_verified TINYINT(1) NOT NULL DEFAULT 0,
        verification_result JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_transaction_hash (transaction_hash),
        KEY idx_order_id (order_id),
        KEY idx_user_id (user_id),
        KEY idx_is_verified (is_verified)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await pool.execute(createHashRecordsTable);
    console.log('✅ Hash records table created');

    // 创建用户令牌表（无外键约束）
    const createUserTokensTable = `
      CREATE TABLE IF NOT EXISTS user_tokens (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        order_id VARCHAR(36) NOT NULL,
        token VARCHAR(36) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME NULL,
        UNIQUE KEY uk_token (token),
        KEY idx_user_id (user_id),
        KEY idx_order_id (order_id),
        KEY idx_is_active (is_active),
        KEY idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await pool.execute(createUserTokensTable);
    console.log('✅ User tokens table created');

    // 添加外键约束
    console.log('🔗 Adding foreign key constraints...');

    const addHashRecordsFK = `
      ALTER TABLE hash_records
      ADD CONSTRAINT fk_hash_records_order_id
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
    `;

    const addUserTokensFK = `
      ALTER TABLE user_tokens
      ADD CONSTRAINT fk_user_tokens_order_id
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
    `;

    try {
      await pool.execute(addHashRecordsFK);
      console.log('✅ Hash records foreign key added');
    } catch (e) {
      // 忽略外键已存在的错误
      if (e.code !== 'ER_DUP_KEY' && !e.message.includes('Duplicate')) {
        console.warn('⚠️ Could not add Hash records FK (might already exist)');
      }
    }

    try {
      await pool.execute(addUserTokensFK);
      console.log('✅ User tokens foreign key added');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEY' && !e.message.includes('Duplicate')) {
        console.warn('⚠️ Could not add User tokens FK (might already exist)');
      }
    }

    console.log('🎉 Database initialization completed successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

module.exports = {
  createTables
};
