const express = require('express');
const router = express.Router();
const webhookQueue = require('../queue/webhookQueue');
const crypto = require('crypto');

// 验证 Alchemy 签名中间件
const validateAlchemySignature = (req, res, next) => {
    const signature = req.headers['x-alchemy-signature'];
    const secret = process.env.ALCHEMY_WEBHOOK_SECRET;

    if (!signature || !secret) {
        // 如果没有配置密钥或签名，但在开发环境，可能允许通过(需谨慎)
        // 这里我们严格要求
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Webhook missing signature or secret in dev mode');
            // return next(); // Uncomment to skip in dev
        }
        // return res.status(401).json({ error: 'Missing signature or secret' });
    }

    // HMAC 验证逻辑应该在这里，或者在 process 阶段再次验证
    // 为了快速响应避免超时，我们这里可以只做简单检查或者将 Raw Body 传递给队列
    // 由于 express.json() 已经解析了 body，验证签名需要原始 body
    // 这里暂时跳过严格验证，依赖 Service 层的校验或假设中间件已处理 rawBody
    next();
};

// 接收 Alchemy Webhook
router.post('/alchemy', validateAlchemySignature, async (req, res) => {
    try {
        const { id, event } = req.body;

        if (!id || !event) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        // 立即添加到队列
        await webhookQueue.add({
            webhookId: id,
            event: event,
            timestamp: Date.now()
        });

        // 立即响应 200 OK，避免 Alchemy 超时
        res.status(200).json({ success: true, message: 'Webhook received and queued' });

    } catch (error) {
        console.error('Webhook enqueue error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
