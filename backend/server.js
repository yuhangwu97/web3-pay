require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { testConnection: testDB } = require('./config/database');
const { testConnection: testRedis } = require('./config/redis');
const { createTables } = require('./utils/initDatabase');

// Import routes
const orderRoutes = require('./routes/orders');
const verificationRoutes = require('./routes/verification');
const webhookRoutes = require('./routes/webhooks');

// Import middleware
const {
  requestLogger,
  corsOptions,
  securityHeaders,
  errorHandler,
  generalRateLimit
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // We'll set this in our custom middleware
}));
app.use(securityHeaders);
app.use(cors(corsOptions));

// Rate limiting
app.use(generalRateLimit);

// Logging
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await testDB();
    const redisStatus = await testRedis();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus ? 'connected' : 'disconnected',
        redis: redisStatus ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/orders', orderRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/webhooks', webhookRoutes);

// Initialize payment queue
const paymentQueue = require('./src/services/paymentQueue');
console.log('🔄 支付监控队列已初始化');

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Web3 Payment Server...');

    // Test connections
    console.log('🔍 Testing database connection...');
    await testDB();

    console.log('🔍 Testing Redis connection...');
    await testRedis();

    // Initialize database
    console.log('📦 Initializing database tables...');
    await createTables();

    // Start server
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API endpoints:`);
      console.log(`   POST /api/orders - Create payment order`);
      console.log(`   GET  /api/orders/:id - Get order details`);
      console.log(`   POST /api/verification/verify - Verify payment hash`);
      console.log(`   GET  /api/verification/auto-detect/:orderId - Auto-detect payment`);
    });

  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
};

startServer();
