const Queue = require('bull');
const Web3PaymentService = require('./web3Payment');
const OrderService = require('./order');
const logger = require('../../utils/logger');

// 创建支付监控队列
const paymentQueue = new Queue('payment-monitoring', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 50, // 完成时保留50个作业
    removeOnFail: 20,    // 失败时保留20个作业
  },
});

// 支付监控处理器
paymentQueue.process(async (job) => {
  const { orderId, networkId, maxConfirmations = 1, maxAttempts = 60 } = job.data;

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

        // 如果订单已经激活，停止监控
        if (order.status === 'activated') {
          logger.business(`订单已激活，停止监控: ${orderId}`);
          return { success: true, message: 'Order already activated' };
        }

        // 获取支付链接以获取交易详情
        const paymentData = await web3Service.generatePaymentLink({
          amount: order.amount,
          tokenType: order.token_type,
          networkId: order.network_id,
          recipientAddress: order.recipient_address
        });

        // 检查是否有新的支付
        const autoDetectResult = await web3Service.autoDetectPayment(
          orderId,
          paymentData.recipientAddress,
          order.amount,
          order.token_type,
          order.network_id
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
        }

        // 如果还没到最大尝试次数，等待后继续
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒间隔
        }

      } catch (error) {
        logger.error(`监控尝试失败 (${attempt}/${maxAttempts}): ${orderId}`, error);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // 失败时等待5秒
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
    const job = await paymentQueue.add({
      orderId,
      networkId,
      maxConfirmations: options.maxConfirmations || 1,
      maxAttempts: options.maxAttempts || 60, // 默认10分钟监控
    }, {
      delay: 2000, // 2秒后开始监控
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
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