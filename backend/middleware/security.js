const rateLimit = require('express-rate-limit');
const { getClient } = require('../config/redis');

// IP-based rate limiting for general requests
const createRateLimit = (windowMs, maxRequests, message) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      error: 'Too many requests',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Use Redis store if available
    store: getClient().isOpen ? new RedisStore({
      sendCommand: (...args) => getClient().sendCommand(args),
    }) : undefined
  });
};

// General API rate limit: 100 requests per 15 minutes per IP
const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100,
  'Too many requests from this IP, please try again later.'
);

// Strict rate limit for payment verification: 10 requests per minute per IP
const verificationRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  10,
  'Too many verification attempts, please wait before trying again.'
);

// Order creation rate limit: 100 orders per hour per IP (for development)
const orderCreationRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  100,
  'Order creation limit exceeded, please try again later.'
);

// User-based rate limiting middleware
const userRateLimit = (maxRequests, windowMs, keyPrefix = 'user') => {
  return async (req, res, next) => {
    try {
      const redisClient = getClient();

      if (!redisClient.isOpen) {
        return next(); // Skip if Redis not available
      }

      const userId = req.body.userId || req.user?.id || req.ip;
      const key = `${keyPrefix}:${userId}`;

      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > maxRequests) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Too many ${keyPrefix} requests`,
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      // Add rate limit headers
      res.set('X-RateLimit-Limit', maxRequests);
      res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
      res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + Math.ceil(windowMs / 1000));

      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      next(); // Continue on error
    }
  };
};

// Hash validation middleware
const validateHash = (req, res, next) => {
  const { transactionHash } = req.body;

  if (!transactionHash) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Transaction hash is required'
    });
  }

  // Basic format validation
  if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid transaction hash format'
    });
  }

  next();
};

// Order validation middleware
const validateOrder = (req, res, next) => {
  const { amount, tokenType, networkId, recipientAddress } = req.body;

  const errors = [];

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    errors.push('Valid amount is required');
  }

  // Handle recipientAddress - it might be a string with quotes
  let cleanAddress = recipientAddress;
  if (typeof cleanAddress === 'string') {
    // Remove surrounding quotes if present
    cleanAddress = cleanAddress.replace(/^["']|["']$/g, '');
  }

  if (!cleanAddress || !/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
    errors.push('Valid recipient address is required');
  }

  if (tokenType && !['ETH', 'USDT', 'USDC'].includes(tokenType.toUpperCase())) {
    errors.push('Unsupported token type');
  }

  if (networkId && ![1, 8453, 42161, 11155111].includes(parseInt(networkId))) {
    errors.push('Unsupported network');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation error',
      message: errors.join(', ')
    });
  }

  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms - ${req.ip}`);
  });

  next();
};

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self' https://*.infura.io https://*.alchemy.com; " +
    "frame-ancestors 'none';"
  );

  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: Object.values(err.errors).map(e => e.message).join(', ')
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Authentication error',
      message: 'Invalid token'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
};

module.exports = {
  generalRateLimit,
  verificationRateLimit,
  orderCreationRateLimit,
  userRateLimit,
  validateHash,
  validateOrder,
  requestLogger,
  corsOptions,
  securityHeaders,
  errorHandler
};
