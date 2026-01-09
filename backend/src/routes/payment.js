const express = require('express');
const router = express.Router();
const orderService = require('../services/order');
const nowpaymentsService = require('../services/nowpayments');
const paymentQueue = require('../services/paymentQueue');
const web3PaymentService = require('../services/web3Payment');

// 创建 Web3 支付订单
router.post('/create', async (req, res) => {
  try {
    const { amount, tokenType = 'ETH', networkId = 1, recipientAddress, userId, paymentMethod = 'qr' } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: '支付金额无效'
      });
    }

    // Web3 支付的最小金额验证 (ETH)
    const minAmount = 0.001; // 0.001 ETH
    const amountNum = parseFloat(amount);
    if (amountNum < minAmount) {
      return res.status(400).json({
        success: false,
        message: `支付金额不能少于 ${minAmount} ETH，当前金额：${amountNum} ETH`
      });
    }

    // 验证网络ID
    const supportedNetworks = [1, 11155111]; // Ethereum Mainnet, Sepolia Testnet
    if (!supportedNetworks.includes(networkId)) {
      return res.status(400).json({
        success: false,
        message: '不支持的网络，仅支持 Ethereum 主网或 Sepolia 测试网',
        error: 'Unsupported network'
      });
    }

    // 验证币种
    const supportedTokens = ['ETH', 'USDT'];
    const payToken = tokenType.toUpperCase();

    if (!supportedTokens.includes(payToken)) {
      return res.status(400).json({
        success: false,
        message: '不支持的代币，仅支持 ETH 或 USDT'
      });
    }

    // 生成订单ID
    const orderId = orderService.generateOrderId();

    // 使用提供的收款地址或默认合约地址
    const contractAddress = recipientAddress || process.env.CONTRACT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

    // 生成 EIP-681 支付链接（使用正确的网络ID）
    const paymentLink = web3PaymentService.generatePaymentLink(
      contractAddress,
      amountNum.toString(),
      networkId.toString(),
      payToken
    );

    // 保存订单到数据库
    const order = await orderService.createOrder({
      userId: userId || 'anonymous',
      recipientAddress: contractAddress,
      amount: amountNum.toString(),
      tokenType: payToken,
      networkId: networkId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
      orderId: orderId
    });

    console.log(`✅ Web3 支付订单创建成功 - 订单: ${order.id}, 金额: ${amountNum} ${payToken}, 网络: ${networkId === 1 ? 'Ethereum' : 'Sepolia'}, 模式: ${paymentMethod}`);

    // 如果是直接支付模式，启动支付监控队列
    if (paymentMethod === 'direct') {
      try {
        await paymentQueue.addPaymentMonitoring(order.id, networkId, {
          maxConfirmations: networkId === 1 ? 3 : 1, // 主网3个确认，测试网1个确认
          maxAttempts: 120 // 20分钟监控
        });
        console.log(`🔄 已启动支付监控队列 - 订单: ${order.id}`);
      } catch (queueError) {
        console.error(`❌ 启动支付监控队列失败: ${order.id}`, queueError);
        // 不影响订单创建，只是监控失败
      }
    }

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          recipientAddress: contractAddress,
          amount: amountNum,
          tokenType: payToken,
          networkId: networkId,
          status: 'pending',
          paymentMethod: paymentMethod,
          expiresAt: order.expiresAt,
          createdAt: order.createdAt
        },
        paymentUri: paymentLink
      }
    });
  } catch (error) {
    console.error('创建 Web3 支付订单错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '创建支付订单失败'
    });
  }
});

// 获取订单状态（用于实时状态同步）
router.get('/order/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: '订单ID不能为空'
      });
    }

    // 查询订单
    const order = await orderService.getOrderByOrderId(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    // 获取队列状态（如果订单还在监控中）
    let queueStatus = null;
    if (order.status === 'pending') {
      try {
        const queueStats = await paymentQueue.getQueueStatus();
        queueStatus = queueStats;
      } catch (queueError) {
        console.warn('获取队列状态失败:', queueError.message);
      }
    }

    res.json({
      success: true,
      data: {
        orderStatus: order.status,
        paymentStatus: order.payment_status,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        queueStatus: queueStatus
      }
    });

  } catch (error) {
    console.error('获取订单状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取订单状态失败',
      error: error.message
    });
  }
});

// 查询支付状态
router.get('/status', async (req, res) => {
  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: '订单ID不能为空'
      });
    }

    // 查询订单
    const order = await orderService.getOrderByOrderId(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    // 如果订单已激活，返回访问令牌
    if (order.status === 'activated') {
      const db = require('../config/database');
      const [services] = await db.query(
        'SELECT access_token, token_expire FROM user_services WHERE order_id = ?',
        [orderId]
      );

      if (services.length > 0) {
        return res.json({
          success: true,
          status: 'success',
          data: {
            orderStatus: order.status,
            paymentStatus: order.payment_status,
            accessToken: services[0].access_token,
            expireTime: Math.floor(new Date(services[0].token_expire).getTime() / 1000)
          }
        });
      }
    }

    // 使用队列系统查询NOWPayments支付状态
    if (order.payment_id) {
      try {
        const paymentStatus = await nowpaymentsService.getPaymentStatus(order.payment_id);

        // 如果支付状态已确认但订单未激活，触发激活流程
        if (['finished', 'confirmed', 'sending'].includes(paymentStatus.payment_status) && order.status !== 'activated') {
          // 手动触发激活（队列可能还在处理中）
          await orderService.activateUserService(orderId, 'manual_check');
          await orderService.updateOrderStatus(orderId, 'activated', paymentStatus.payment_status);

          // 获取访问令牌
          const db = require('../config/database');
          const [services] = await db.query(
            'SELECT access_token, token_expire FROM user_services WHERE order_id = ?',
            [orderId]
          );

          if (services.length > 0) {
            return res.json({
              success: true,
              status: 'success',
              data: {
                orderStatus: 'activated',
                paymentStatus: paymentStatus.payment_status,
                paymentId: order.payment_id,
                accessToken: services[0].access_token,
                expireTime: Math.floor(new Date(services[0].token_expire).getTime() / 1000)
              }
            });
          }
        }

        return res.json({
          success: true,
          status: order.status,
          data: {
            orderStatus: order.status,
            paymentStatus: paymentStatus.payment_status || order.payment_status,
            paymentId: order.payment_id
          }
        });
      } catch (error) {
        console.error('查询支付状态失败:', error);
      }
    }

    res.json({
      success: true,
      status: order.status,
      data: {
        orderStatus: order.status,
        paymentStatus: order.payment_status,
        paymentId: order.payment_id
      }
    });
  } catch (error) {
    console.error('查询支付状态错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '查询支付状态失败'
    });
  }
});

// 手动检查支付状态（用于前端主动触发）
router.post('/check-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: '订单ID不能为空'
      });
    }

    console.log(`🔍 前端手动检查支付状态 - 订单: ${orderId}`);

    const result = await paymentQueue.manualCheckPayment(orderId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } else {
      res.json({
        success: false,
        message: result.message || result.error,
        data: result
      });
    }
  } catch (error) {
    console.error('手动检查支付状态错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '手动检查失败'
    });
  }
});

// 获取队列状态（用于监控）
router.get('/queue/stats', async (req, res) => {
  try {
    const stats = await paymentQueue.getQueueStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取队列状态错误:', error);
    res.status(500).json({
      success: false,
      message: '获取队列状态失败',
      error: error.message
    });
  }
});

// Web3 交易验证接口
router.post('/verify-transaction/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { txHash } = req.body;

    if (!orderId || !txHash) {
      return res.status(400).json({
        success: false,
        message: '订单ID和交易哈希不能为空'
      });
    }

    console.log(`🔍 开始验证交易 - 订单: ${orderId}, 哈希: ${txHash}`);

    // 获取订单信息
    const order = await orderService.getOrderByOrderId(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    if (order.status === 'activated') {
      return res.json({
        success: true,
        message: '订单已激活',
        data: { status: 'already_activated' }
      });
    }

    // 验证交易
    const verificationResult = await web3PaymentService.verifyTransaction(
      txHash,
      order.receive_address || order.payAddress,
      order.amount,
      order.token_type || 'ETH',
      null, // tokenAddress
      3, // minConfirmations
      order.network_id || 1 // chainId
    );

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.error,
        code: verificationResult.code
      });
    }

    console.log(`✅ 交易验证成功 - 订单: ${orderId}`);

    // 激活用户服务
    const serviceResult = await web3PaymentService.activateUserService(
      req.body.userAddress || '0x0000000000000000000000000000000000000000', // 从前端传递用户地址
      orderId,
      30 // 30天服务
    );

    if (!serviceResult.success) {
      console.error('激活服务失败:', serviceResult.error);
      return res.status(500).json({
        success: false,
        message: '交易验证成功但激活服务失败，请联系管理员',
        error: serviceResult.error
      });
    }

    // 更新订单状态
    await orderService.updateOrderStatus(orderId, 'activated', 'web3_verified');

    // 生成访问令牌
    const tokenResult = await orderService.activateUserService(orderId, order.user_id || 'anonymous');

    console.log(`🎉 订单激活成功 - 订单: ${orderId}, 令牌: ${tokenResult.accessToken}`);

    res.json({
      success: true,
      message: '交易验证成功，服务已激活',
      data: {
        accessToken: tokenResult.accessToken,
        expireTime: tokenResult.expireTime,
        transaction: verificationResult.transaction,
        contractTx: serviceResult.transaction
      }
    });

  } catch (error) {
    console.error('交易验证错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '交易验证失败'
    });
  }
});

// 生成支付链接（EIP-681格式）
router.get('/payment-link/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await orderService.getOrderByOrderId(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    // 支持USDT的代币地址
    let tokenAddress = null;
    if (order.currency === 'USDT') {
      tokenAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT合约地址
    }

    const paymentLink = web3PaymentService.generatePaymentLink(
      order.receive_address || order.payAddress,
      order.amount,
      '1', // Ethereum Mainnet
      order.currency || 'ETH',
      tokenAddress
    );

    res.json({
      success: true,
      data: {
        paymentLink,
        orderId,
        amount: order.amount,
        currency: order.currency,
        address: order.receive_address || order.payAddress
      }
    });

  } catch (error) {
    console.error('生成支付链接错误:', error);
    res.status(500).json({
      success: false,
      message: '生成支付链接失败'
    });
  }
});

// Webhook端点 - 用于接收Alchemy通知（推荐的回调方案）
const WebhookService = require('../services/webhookService');
const webhookService = new WebhookService();

router.post('/webhook/alchemy', async (req, res) => {
  try {
    const webhookData = req.body;

    console.log(`🔔 收到Alchemy Webhook:`, {
      webhookId: webhookData.webhookId,
      type: webhookData.event?.type,
      network: webhookData.event?.network
    });

    // 生产环境需要验证签名
    // const signature = req.headers['x-alchemy-signature'];
    // const secret = process.env.ALCHEMY_WEBHOOK_SECRET;
    // if (!webhookService.verifyAlchemySignature(signature, webhookData, secret)) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    // 处理Webhook
    const result = await webhookService.processAlchemyWebhook(webhookData);

    if (result.success) {
      res.json({
        success: true,
        received: true,
        processed: result.processed,
        message: result.message,
        ...result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Webhook处理错误:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed',
      details: error.message
    });
  }
});

// 自动检测支付交易（备用方案）
router.post('/auto-detect/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await orderService.getOrderByOrderId(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    console.log(`🔍 开始自动检测订单 ${orderId} 的支付...`);

    // 调用自动检测服务
    const detectedTx = await web3PaymentService.autoDetectPayment(
      order.receive_address || order.payAddress,
      order.amount,
      order.currency || 'ETH'
    );

    if (detectedTx) {
      // 找到了匹配的交易
      console.log(`✅ 检测到匹配交易: ${detectedTx.hash}`);

      // 自动验证这笔交易
      const verificationResult = await web3PaymentService.verifyTransaction(
        detectedTx.hash,
        order.receive_address || order.payAddress,
        order.amount,
        order.currency || 'ETH'
      );

      if (verificationResult.success) {
        // 激活服务
        const serviceResult = await web3PaymentService.activateUserService(
          detectedTx.from, // 使用交易发送者作为用户地址
          orderId,
          30
        );

        if (serviceResult.success) {
          const tokenResult = await orderService.activateUserService(orderId, order.user_id || 'system');
          await orderService.updateOrderStatus(orderId, 'activated', 'auto_detected');

          return res.json({
            success: true,
            message: '自动检测成功，服务已激活！',
            data: {
              found: true,
              txHash: detectedTx.hash,
              accessToken: tokenResult.accessToken,
              transaction: verificationResult.transaction
            }
          });
        }
      }

      return res.json({
        success: false,
        message: '检测到交易但验证失败，请手动输入哈希验证'
      });

    } else {
      // 未检测到交易
      return res.json({
        success: true,
        message: '未检测到匹配的支付交易',
        data: { found: false }
      });
    }

  } catch (error) {
    console.error('自动检测错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '自动检测失败'
    });
  }
});

module.exports = router;

