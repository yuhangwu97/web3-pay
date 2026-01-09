-- Web3 Payment System Database Initialization
-- Database: web3_payment

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS web3_payment
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use the database
USE web3_payment;

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '订单ID',
  user_id VARCHAR(255) NOT NULL COMMENT '用户ID',
  recipient_address VARCHAR(42) NOT NULL COMMENT '收款地址',
  amount DECIMAL(36, 18) NOT NULL COMMENT '支付金额',
  token_type VARCHAR(10) NOT NULL DEFAULT 'ETH' COMMENT '代币类型',
  network_id INT NOT NULL DEFAULT 1 COMMENT '网络ID',
  status ENUM('pending', 'paid', 'expired', 'failed') NOT NULL DEFAULT 'pending' COMMENT '订单状态',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  purchase_id VARCHAR(64) DEFAULT NULL COMMENT 'NOWPayments购买ID',
  receive_address VARCHAR(128) DEFAULT NULL COMMENT '收款地址',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_user_id (user_id),
  KEY idx_status (status),
  KEY idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- Create hash_records table
CREATE TABLE IF NOT EXISTS hash_records (
  id VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '记录ID',
  order_id VARCHAR(36) NOT NULL COMMENT '订单ID',
  transaction_hash VARCHAR(66) NOT NULL COMMENT '交易哈希',
  user_id VARCHAR(255) NOT NULL COMMENT '用户ID',
  is_verified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已验证',
  verification_result JSON COMMENT '验证结果',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_transaction_hash (transaction_hash),
  KEY idx_order_id (order_id),
  KEY idx_user_id (user_id),
  KEY idx_is_verified (is_verified),
  CONSTRAINT fk_hash_records_order_id FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='交易哈希记录表';

-- Create user_tokens table
CREATE TABLE IF NOT EXISTS user_tokens (
  id VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '令牌ID',
  user_id VARCHAR(255) NOT NULL COMMENT '用户ID',
  order_id VARCHAR(36) NOT NULL COMMENT '订单ID',
  token VARCHAR(36) NOT NULL COMMENT '访问令牌',
  is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否激活',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  last_used_at DATETIME NULL COMMENT '最后使用时间',
  UNIQUE KEY uk_token (token),
  KEY idx_user_id (user_id),
  KEY idx_order_id (order_id),
  KEY idx_is_active (is_active),
  KEY idx_expires_at (expires_at),
  CONSTRAINT fk_user_tokens_order_id FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户令牌表';

-- Create indexes for better performance
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_updated_at ON orders(updated_at);
CREATE INDEX idx_hash_records_created_at ON hash_records(created_at);
CREATE INDEX idx_hash_records_updated_at ON hash_records(updated_at);
CREATE INDEX idx_user_tokens_created_at ON user_tokens(created_at);

-- Optional: Create a view for order summary
CREATE OR REPLACE VIEW order_summary AS
SELECT
  o.id,
  o.user_id,
  o.recipient_address,
  o.amount,
  o.token_type,
  o.network_id,
  o.status,
  o.purchase_id,
  o.receive_address,
  o.created_at,
  o.expires_at,
  COUNT(hr.id) as hash_count,
  COUNT(CASE WHEN hr.is_verified = 1 THEN 1 END) as verified_hash_count,
  COUNT(ut.id) as token_count,
  COUNT(CASE WHEN ut.is_active = 1 THEN 1 END) as active_token_count
FROM orders o
LEFT JOIN hash_records hr ON o.id = hr.order_id
LEFT JOIN user_tokens ut ON o.id = ut.order_id
GROUP BY o.id, o.user_id, o.recipient_address, o.amount, o.token_type, o.network_id, o.status, o.purchase_id, o.receive_address, o.created_at, o.expires_at;

-- Success message
SELECT 'Web3 Payment Database initialized successfully!' AS message;
