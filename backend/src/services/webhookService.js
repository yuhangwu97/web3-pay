const crypto = require('crypto');
const web3Payment = require('./web3Payment');
const OrderService = require('../../services/orderService');

class WebhookService {
  constructor() {
    this.web3Payment = web3Payment;
  }

  /**
   * 验证Alchemy Webhook签名
   * @param {string} signature - 请求签名
   * @param {Object} payload - 请求数据
   * @param {string} secret - Webhook密钥
   * @returns {boolean} 验证结果
   */
  verifyAlchemySignature(signature, payload, secret) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      console.error('签名验证失败:', error);
      return false;
    }
  }

  /**
   * 处理Alchemy Webhook
   * @param {Object} webhookData - Webhook数据
   * @returns {Promise<Object>} 处理结果
   */
  async processAlchemyWebhook(webhookData) {
    try {
      const { webhookId, event } = webhookData;

      console.log(`🔔 处理Alchemy Webhook: ${webhookId}`, {
        type: event.type,
        network: event.network
      });

      if (event.type === 'MINED_TRANSACTION') {
        return await this.handleMinedTransaction(event, webhookId);
      }

      if (event.type === 'DROPPED_TRANSACTION') {
        return await this.handleDroppedTransaction(event, webhookId);
      }

      return {
        success: true,
        message: `未处理的Webhook类型: ${event.type}`,
        processed: false
      };

    } catch (error) {
      console.error('处理Webhook失败:', error);
      return {
        success: false,
        error: error.message,
        processed: false
      };
    }
  }

  /**
   * 处理已确认交易
   * @param {Object} event - 事件数据
   * @param {string} webhookId - Webhook ID
   * @returns {Promise<Object>} 处理结果
   */
  async handleMinedTransaction(event, webhookId) {
    const { transaction, network } = event;

    console.log(`💰 处理已确认交易: ${transaction.hash}`, {
      from: transaction.from,
      to: transaction.to,
      value: transaction.value,
      network: network
    });

    try {
      // 查找匹配的订单
      const order = await this.findMatchingOrder(transaction);

      if (!order) {
        console.log(`⚠️ 未找到匹配订单: ${transaction.hash}`);
        return {
          success: true,
          message: '未找到匹配订单',
          processed: false
        };
      }

      // 验证交易
      const chainId = this.getChainIdFromNetwork(network);
      const verificationResult = await this.web3Payment.verifyTransaction(
        transaction.hash,
        transaction.to,
        this.formatValue(transaction.value),
        transaction.asset || 'ETH',
        null,
        this.getMinConfirmations(chainId),
        chainId
      );

      if (verificationResult.success) {
        // 更新订单状态
        await OrderService.updateOrderStatus(order.id, 'activated', 'webhook_verified');
        await OrderService.activateUserService(order.id, order.user_id);

        console.log(`✅ Webhook激活订单成功: ${order.id}`);

        return {
          success: true,
          message: '订单激活成功',
          processed: true,
          orderId: order.id,
          transactionHash: transaction.hash
        };
      } else {
        console.warn(`❌ 交易验证失败: ${verificationResult.error}`);
        return {
          success: false,
          message: verificationResult.error,
          processed: false
        };
      }

    } catch (error) {
      console.error('处理已确认交易失败:', error);
      return {
        success: false,
        error: error.message,
        processed: false
      };
    }
  }

  /**
   * 处理丢弃交易
   * @param {Object} event - 事件数据
   * @param {string} webhookId - Webhook ID
   * @returns {Promise<Object>} 处理结果
   */
  async handleDroppedTransaction(event, webhookId) {
    const { transaction } = event;

    console.log(`❌ 处理丢弃交易: ${transaction.hash}`);

    // 可以在这里添加丢弃交易的处理逻辑
    // 比如标记订单为失败状态

    return {
      success: true,
      message: '丢弃交易已记录',
      processed: true
    };
  }

  /**
   * 根据交易信息查找匹配的订单
   * @param {Object} transaction - 交易信息
   * @returns {Promise<Object|null>} 匹配的订单
   */
  async findMatchingOrder(transaction) {
    try {
      // 获取我们的收款地址列表
      const ourAddresses = [
        process.env.CONTRACT_ADDRESS,
        '0xFc09bB2B2cEc3eCc8Fc17DfA73a0C4BEF159f3Cd' // 默认测试地址
      ];

      // 检查是否是我们的收款地址
      if (!ourAddresses.includes(transaction.to)) {
        return null;
      }

      // 查找最近的pending订单
      const orders = await OrderService.getRecentPendingOrders(
        transaction.to,
        10 // 查找最近10个订单
      );

      // 根据金额和时间匹配订单
      const transactionValue = this.formatValue(transaction.value);
      const transactionTime = new Date(transaction.timestamp * 1000);

      for (const order of orders) {
        // 检查金额匹配（允许小额误差）
        const orderAmount = parseFloat(order.amount);
        const txAmount = parseFloat(transactionValue);
        const amountMatch = Math.abs(orderAmount - txAmount) < 0.0001; // 0.0001 ETH误差

        // 检查时间匹配（订单创建后的5分钟内）
        const orderTime = new Date(order.created_at);
        const timeDiff = Math.abs(transactionTime.getTime() - orderTime.getTime());
        const timeMatch = timeDiff < 5 * 60 * 1000; // 5分钟内

        if (amountMatch && timeMatch) {
          console.log(`🎯 找到匹配订单: ${order.id}`);
          return order;
        }
      }

      return null;

    } catch (error) {
      console.error('查找匹配订单失败:', error);
      return null;
    }
  }

  /**
   * 从网络名称获取链ID
   * @param {string} network - 网络名称
   * @returns {number} 链ID
   */
  getChainIdFromNetwork(network) {
    const networkMap = {
      'ETH_MAINNET': 1,
      'ETH_SEPOLIA': 11155111,
      'MATIC_MAINNET': 137,
      'MATIC_MUMBAI': 80001
    };

    return networkMap[network] || 1;
  }

  /**
   * 获取最小确认数
   * @param {number} chainId - 链ID
   * @returns {number} 最小确认数
   */
  getMinConfirmations(chainId) {
    // 测试网使用1个确认，主网使用3个确认
    return chainId === 1 ? 3 : 1;
  }

  /**
   * 格式化交易值
   * @param {string} value - 原始值
   * @returns {string} 格式化后的值
   */
  formatValue(value) {
    // 如果是十六进制，转换为十进制然后格式化为ETH
    if (value.startsWith('0x')) {
      const bigIntValue = BigInt(value);
      return ethers.formatEther(bigIntValue.toString());
    }
    return value;
  }

  /**
   * 创建Webhook配置
   * @param {Object} config - 配置参数
   * @returns {Object} Webhook配置
   */
  createWebhookConfig(config) {
    return {
      type: 'Mined Transactions',
      network: config.network || 'ETH_SEPOLIA',
      webhookUrl: config.url,
      addresses: config.addresses || [],
      confirmations: config.confirmations || 1
    };
  }
}

module.exports = WebhookService;
