const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const paymentRoutes = require('./routes/payment');
const webhookRoutes = require('./routes/webhook');
const db = require('./config/database');
const paymentQueue = require('./services/paymentQueue');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// 保留原始 body 用于 webhook 签名验证
app.use('/webhook/nowpayments', express.raw({ type: 'application/json' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 路由
app.use('/api/payment', paymentRoutes);
app.use('/webhook', webhookRoutes);

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false, 
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
async function startServer() {
  try {
    // 测试数据库连接
    await db.query('SELECT 1');
    console.log('✅ 数据库连接成功');

    // 测试队列连接
    const queueStats = await paymentQueue.getQueueStats();
    if (queueStats.error) {
      console.warn('⚠️  队列连接失败 (可选):', queueStats.error);
      console.log('💡 如果不需要队列功能，可以忽略此警告');
    } else {
      console.log('✅ 支付队列初始化成功');
      console.log(`📊 队列状态: ${queueStats.total} 个作业`);
    }

    const server = app.listen(PORT, () => {
      console.log(`🚀 服务器运行在端口 ${PORT}`);
      console.log(`🔄 支付状态检查: 每5秒轮询，最长10分钟`);
      console.log(`📡 Webhook 模式: 已禁用 (使用队列替代)`);
    });

    // 优雅关闭处理
    process.on('SIGTERM', async () => {
      console.log('📴 收到 SIGTERM 信号，开始优雅关闭...');
      server.close(async () => {
        console.log('✅ HTTP 服务器已关闭');
        await paymentQueue.closeQueue();
        console.log('✅ 支付队列已关闭');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('📴 收到 SIGINT 信号，开始优雅关闭...');
      server.close(async () => {
        console.log('✅ HTTP 服务器已关闭');
        await paymentQueue.closeQueue();
        console.log('✅ 支付队列已关闭');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

startServer();





















