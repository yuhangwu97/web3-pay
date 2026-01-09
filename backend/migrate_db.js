#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/config/database');

async function migrateDatabase() {
  try {
    console.log('开始数据库迁移...');
    console.log('数据库配置:', {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      database: process.env.DB_NAME || 'web3_payment'
    });

    // 测试数据库连接
    console.log('测试数据库连接...');
    const [rows] = await db.execute('SELECT 1');
    console.log('数据库连接成功');

    // 检查 orders 表是否存在
    console.log('检查 orders 表...');
    const [tables] = await db.execute('SHOW TABLES LIKE "orders"');
    if (tables.length === 0) {
      throw new Error('orders 表不存在，请先运行数据库初始化脚本');
    }
    console.log('orders 表存在');

    // 检查现有列
    console.log('检查现有列...');
    const [columns] = await db.execute('DESCRIBE orders');
    const columnNames = columns.map(col => col.Field);
    console.log('现有列:', columnNames.join(', '));

    // 添加 purchase_id 列
    if (!columnNames.includes('purchase_id')) {
      console.log('添加 purchase_id 列...');
      await db.execute(`
        ALTER TABLE orders
        ADD COLUMN purchase_id VARCHAR(64) DEFAULT NULL COMMENT 'NOWPayments购买ID'
      `);
      console.log('purchase_id 列添加成功');
    } else {
      console.log('purchase_id 列已存在，跳过');
    }

    // 添加 receive_address 列
    if (!columnNames.includes('receive_address')) {
      console.log('添加 receive_address 列...');
      await db.execute(`
        ALTER TABLE orders
        ADD COLUMN receive_address VARCHAR(128) DEFAULT NULL COMMENT '收款地址'
      `);
      console.log('receive_address 列添加成功');
    } else {
      console.log('receive_address 列已存在，跳过');
    }

    console.log('数据库迁移完成！');
    process.exit(0);
  } catch (error) {
    console.error('数据库迁移失败:', error);
    console.error('错误详情:', error.message);
    if (error.code) {
      console.error('错误代码:', error.code);
    }
    process.exit(1);
  }
}

migrateDatabase();
