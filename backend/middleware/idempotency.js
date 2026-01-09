const { getClient } = require('../config/redis');

/**
 * 幂等性中间件
 * 
 * 防止重复处理相同的请求。
 * 客户端需要在 Header 中携带 X-Idempotency-Key
 * 服务端会缓存响应结果，当收到相同的 Key 时直接返回缓存结果
 */
const idempotency = async (req, res, next) => {
    const key = req.headers['x-idempotency-key'];

    // 如果没有携带幂等键，直接跳过
    if (!key) {
        return next();
    }

    const client = getClient();

    try {
        // 确保 Redis 已连接
        if (!client.isOpen) {
            await client.connect();
        }

        const redisKey = `idempotency:${key}`;

        // 检查是否有缓存
        const cachedResponse = await client.get(redisKey);

        if (cachedResponse) {
            console.log(`🔄 Idempotency hit: ${key}`);
            const result = JSON.parse(cachedResponse);
            return res.status(result.status).json(result.data);
        }

        // 劫持 res.json 以捕获响应
        const originalJson = res.json;

        res.json = function (data) {
            const statusCode = res.statusCode || 200;

            // 只缓存非服务器错误的响应 (2xx, 4xx)
            // 5xx 错误不缓存，允许重试
            if (statusCode < 500) {
                const responseToCache = {
                    status: statusCode,
                    data: data,
                    cachedAt: new Date().toISOString()
                };

                // 异步缓存，不阻塞响应
                // 设置 24 小时过期
                client.set(redisKey, JSON.stringify(responseToCache), { EX: 86400 })
                    .catch(err => console.error('Failed to cache idempotency key:', err));
            }

            return originalJson.call(this, data);
        };

        next();

    } catch (error) {
        console.error('Idempotency middleware error:', error);
        // 发生错误时降级处理，不阻塞正常流程
        next();
    }
};

module.exports = idempotency;
