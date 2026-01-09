const Queue = require('bull');
const WebhookService = require('../src/services/webhookService');
const webhookService = new WebhookService();

// 创建 Webhook 处理队列
const webhookQueue = new Queue('alchemy-webhook', {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0
    },
    defaultJobOptions: {
        attempts: 5, // 重试 5 次
        backoff: {
            type: 'exponential',
            delay: 2000 // 初始延迟 2秒，指数增长
        },
        removeOnComplete: true, // 完成后移除
        removeOnFail: false // 失败保留以便检查
    }
});

// 处理队列任务
webhookQueue.process(async (job) => {
    const { event, webhookId } = job.data;

    console.log(`🔄 Processing webhook job ${job.id}: ${webhookId}`);

    try {
        const result = await webhookService.processAlchemyWebhook({ webhookId, event });

        if (!result.success && !result.processed) {
            // 如果处理失败且明确未被处理（非忽略类型），抛出错误以触发重试
            throw new Error(result.error || result.message || 'Unknown processing error');
        }

        return result;
    } catch (error) {
        console.error(`❌ Webhook job ${job.id} failed:`, error.message);
        throw error; // 重新抛出错误，触发 Bull 重试机制
    }
});

// 监听队列事件
webhookQueue.on('completed', (job, result) => {
    console.log(`✅ Webhook job ${job.id} completed`);
});

webhookQueue.on('failed', (job, err) => {
    console.error(`❌ Webhook job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`);
});

module.exports = webhookQueue;
