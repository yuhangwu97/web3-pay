const express = require('express');
const router = express.Router();

const VerificationService = require('../services/verificationService');
const {
  verificationRateLimit,
  userRateLimit,
  validateHash
} = require('../middleware/security');
const idempotency = require('../middleware/idempotency');

// 验证支付Hash
router.post('/verify', idempotency, verificationRateLimit, validateHash, async (req, res) => {
  try {
    const {
      orderId,
      transactionHash,
      userId
    } = req.body;

    // 从请求中提取用户ID（实际应用中应该从JWT或其他认证中获取）
    const actualUserId = userId || req.ip || 'anonymous';

    const result = await VerificationService.verifyPayment(
      orderId,
      transactionHash,
      actualUserId
    );

    if (result.isValid) {
      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Payment verification failed',
        message: 'Transaction does not match order requirements',
        data: result
      });
    }

  } catch (error) {
    console.error('Verify payment error:', error);

    // 根据错误类型返回不同状态码
    let statusCode = 500;
    if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('already been used') ||
      error.message.includes('cannot be verified')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      error: 'Verification failed',
      message: error.message
    });
  }
});

// 自动检测支付（半自动优化功能）
router.get('/auto-detect/:orderId', userRateLimit(30, 60 * 1000, 'auto-detect'), async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await VerificationService.autoDetectPayment(orderId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Auto-detect payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Auto-detection failed',
      message: error.message
    });
  }
});

// 获取验证历史
router.get('/history/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const history = await VerificationService.getVerificationHistory(orderId);

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Get verification history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch verification history',
      message: error.message
    });
  }
});

// 批量验证（管理员接口，用于处理积压的验证请求）
router.post('/batch-verify', async (req, res) => {
  try {
    const { verifications } = req.body;

    if (!Array.isArray(verifications)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'verifications must be an array'
      });
    }

    const results = [];

    for (const verification of verifications) {
      try {
        const result = await VerificationService.verifyPayment(
          verification.orderId,
          verification.transactionHash,
          verification.userId || 'batch'
        );
        results.push({
          orderId: verification.orderId,
          success: result.isValid,
          result
        });
      } catch (error) {
        results.push({
          orderId: verification.orderId,
          success: false,
          error: error.message
        });
      }

      // 添加小延迟避免RPC限制
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    res.json({
      success: true,
      data: {
        total: verifications.length,
        processed: results.length,
        results
      }
    });

  } catch (error) {
    console.error('Batch verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Batch verification failed',
      message: error.message
    });
  }
});

module.exports = router;
