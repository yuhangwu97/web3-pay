const { createClient } = require('redis');

let client;

const getClient = () => {
  if (!client) {
    client = createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      database: process.env.REDIS_DB || 0
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });
  }
  return client;
};

const testConnection = async () => {
  try {
    const redisClient = getClient();
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    return false;
  }
};

module.exports = {
  getClient,
  testConnection
};
