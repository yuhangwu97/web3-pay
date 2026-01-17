const Queue = require('bull');
const Web3PaymentService = require('./web3Payment');
const OrderService = require('./orderService');
const logger = require('../utils/logger');

// 创建支付监控队列
const paymentQueue = new Queue('payment-monitoring', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  settings: {
    lockDuration: 300000, // 5 mins
    stalledInterval: 300000, // 5 mins
    maxStalledCount: 3
  },
  defaultJobOptions: {
    removeOnComplete: 50, // 完成时保留50个作业
    removeOnFail: 20,    // 失败时保留20个作业
  },
});

// 支付监控处理器
paymentQueue.process(async (job) => {
  const { orderId, networkId, maxConfirmations = 1, maxAttempts = 60 } = job.data;
  const pollingInterval = parseInt(process.env.PAYMENT_POLLING_INTERVAL) || 5000;

  logger.business(`开始监控订单支付: ${orderId}`, { networkId, maxConfirmations });

  try {
    const web3Service = Web3PaymentService;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 检查订单状态
        const order = await OrderService.getOrderByOrderId(orderId);
        if (!order) {
          logger.warn(`订单不存在: ${orderId}`);
          return { success: false, error: 'Order not found' };
        }

        logger.info(`执行支付检查 (${attempt}/${maxAttempts}): ${orderId}`, {
          amount: order.amount,
          token: order.tokenType,
          address: order.recipientAddress,
          networkId: order.networkId
        });

        // 如果订单已经激活，停止监控
        if (order.status === 'activated') {
          logger.business(`订单已激活，停止监控: ${orderId}`);
          return { success: true, message: 'Order already activated' };
        }

        // 检查是否有新的支付
        const autoDetectResult = await web3Service.autoDetectPayment(
          order.recipientAddress,
          order.amount.toString(),
          order.tokenType,
          300, // lookbackBlocks - Increased to 300 (~1 hour) to catch older txs
          order.networkId
        );

        if (autoDetectResult.success && autoDetectResult.data.found) {
          logger.business(`检测到支付成功: ${orderId}`, {
            transactionHash: autoDetectResult.data.transactionHash,
            confirmations: autoDetectResult.data.confirmations
          });

          // 激活订单
          await OrderService.updateOrderStatus(orderId, 'activated', 'auto_detected');
          await OrderService.activateUserService(orderId, order.user_id);

          return {
            success: true,
            message: 'Payment detected and order activated',
            transactionHash: autoDetectResult.data.transactionHash,
            confirmations: autoDetectResult.data.confirmations
          };
        } else {
          logger.info(`未检测到支付 (${attempt}/${maxAttempts})`);
        }

        // 更新进度
        await job.progress(Math.floor((attempt / maxAttempts) * 100));

        // 如果还没到最大尝试次数，等待后继续
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollingInterval));
        }

      } catch (error) {
        logger.error(`监控尝试失败 (${attempt}/${maxAttempts}): ${orderId}`, error);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollingInterval));
        }
      }
    }

    // 达到最大尝试次数
    logger.warn(`监控超时，未检测到支付: ${orderId}`, { maxAttempts });
    await OrderService.updateOrderStatus(orderId, 'expired', 'monitoring_timeout');

    return {
      success: false,
      error: 'Payment monitoring timeout',
      attempts: maxAttempts
    };

  } catch (error) {
    logger.error(`支付监控队列处理失败: ${orderId}`, error);
    throw error;
  }
});

// 队列事件监听
paymentQueue.on('completed', (job, result) => {
  logger.business(`支付监控任务完成: ${job.data.orderId}`, result);
});

paymentQueue.on('failed', (job, err) => {
  logger.error(`支付监控任务失败: ${job.data.orderId}`, err);
});

paymentQueue.on('stalled', (job) => {
  logger.warn(`支付监控任务停滞: ${job.data.orderId}`, { jobId: job.id });
});

// 添加支付监控任务
const addPaymentMonitoring = async (orderId, networkId, options = {}) => {
  try {
    // Check if job already exists to avoid duplicate logs/actions
    const existingJob = await paymentQueue.getJob(orderId);
    if (existingJob) {
      const state = await existingJob.getState();
      // If job is already active, waiting, or delayed, don't add again
      if (['active', 'waiting', 'delayed'].includes(state)) {
        // logger.debug(`Payment monitoring already active for: ${orderId} (State: ${state})`);
        return existingJob;
      }
      // If job is completed or failed, we might want to restart it, but for now let's assume deduplication is main goal
      // or optionally remove old job and add new one if specifically requested. 
      // For this lazy polling implementation, if it's failed/completed, we probably shouldn't auto-restart blindly without user action?
      // But let's stick to simple deduplication.
    }

    const job = await paymentQueue.add({
      orderId,
      networkId,
      maxConfirmations: options.maxConfirmations || 1,
      maxAttempts: options.maxAttempts || Math.ceil((parseInt(process.env.PAYMENT_POLLING_DURATION) || 1200000) / (parseInt(process.env.PAYMENT_POLLING_INTERVAL) || 5000)),
    }, {
      jobId: orderId, // 使用订单ID作为Job ID，防止重复添加
      delay: 2000, // 2秒后开始监控
      attempts: 3,
      backoff: {
        type: 'fixed', // 使用固定间隔
        delay: parseInt(process.env.PAYMENT_POLLING_INTERVAL) || 5000,
      },
    });

    logger.business(`添加支付监控任务: ${orderId}`, {
      jobId: job.id,
      networkId,
      maxAttempts: options.maxAttempts || 60
    });

    return job;

  } catch (error) {
    logger.error(`添加支付监控任务失败: ${orderId}`, error);
    throw error;
  }
};

// 获取队列状态
const getQueueStatus = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      paymentQueue.getWaiting(),
      paymentQueue.getActive(),
      paymentQueue.getCompleted(),
      paymentQueue.getFailed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };

  } catch (error) {
    logger.error('获取队列状态失败', error);
    return null;
  }
};

// 停止队列
const stopQueue = async () => {
  try {
    await paymentQueue.close();
    logger.info('支付监控队列已停止');
  } catch (error) {
    logger.error('停止支付监控队列失败', error);
  }
};

module.exports = {
  paymentQueue,
  addPaymentMonitoring,
  getQueueStatus,
  stopQueue,
};