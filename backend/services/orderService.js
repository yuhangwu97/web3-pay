const { ethers } = require('ethers');
const Order = require('../models/Order');
const { getNetworkConfig, getTokenConfig, DEFAULT_NETWORK, DEFAULT_TOKEN } = require('../config/blockchain');

class OrderService {
  // 生成支付订单
  static async createOrder(orderData) {
    const {
      userId,
      amount,
      tokenType = DEFAULT_TOKEN.symbol,
      networkId = DEFAULT_NETWORK.id,
      recipientAddress = process.env.RECEIVING_ADDRESS,
      paymentMethod
    } = orderData;

    // 验证参数
    this.validateOrderParams(amount, tokenType, networkId, recipientAddress);

    // 验证网络和代币支持
    const networkConfig = getNetworkConfig(networkId);
    const tokenConfig = getTokenConfig(tokenType);

    if (!networkConfig) {
      throw new Error(`Unsupported network: ${networkId}`);
    }

    if (!tokenConfig) {
      throw new Error(`Unsupported token: ${tokenType}`);
    }

    // 验证收款地址格式 - 清理可能存在的引号
    let cleanAddress = recipientAddress;
    if (typeof cleanAddress === 'string') {
      cleanAddress = cleanAddress.replace(/^["']|["']$/g, '');
    }

    if (!ethers.isAddress(cleanAddress)) {
      throw new Error('Invalid recipient address format');
    }

    // 创建订单
    const order = await Order.create({
      userId,
      recipientAddress: cleanAddress,
      amount: parseFloat(amount),
      tokenType: tokenType.toUpperCase(),
      networkId,
      paymentMethod
    });

    // 生成支付URI
    const paymentUri = this.generatePaymentUri(order);

    return {
      order: order.toPublic(),
      paymentUri
    };
  }

  // 验证订单参数
  static validateOrderParams(amount, tokenType, networkId, recipientAddress) {
    if (!amount || parseFloat(amount) <= 0) {
      throw new Error('Invalid amount: must be greater than 0');
    }

    if (!recipientAddress) {
      throw new Error('Recipient address is required');
    }

    // 检查金额精度
    const tokenConfig = getTokenConfig(tokenType);
    if (tokenConfig) {
      const decimals = tokenConfig.decimals;
      const amountStr = amount.toString();
      const decimalPlaces = amountStr.includes('.') ? amountStr.split('.')[1].length : 0;

      if (decimalPlaces > decimals) {
        throw new Error(`Amount precision exceeds token decimals (${decimals})`);
      }
    }
  }

  // 生成EIP-681支付URI
  static generatePaymentUri(order) {
    const { recipientAddress, amount, tokenType, networkId } = order;
    const tokenConfig = getTokenConfig(tokenType);

    // 基础URI格式: ethereum:<address>[@<chain_id>]
    let uri = `ethereum:${recipientAddress}`;

    // 添加网络ID
    if (networkId !== 1) { // 1是Ethereum主网，不需要显式指定
      uri += `@${networkId}`;
    }

    // 添加支付参数
    if (tokenConfig.isNative) {
      // 原生代币支付
      const valueInWei = ethers.parseEther(amount.toString());
      uri += `?value=${valueInWei}`;
    } else {
      // ERC20代币支付 - 生成完整的transfer调用
      const contractAddress = tokenConfig.contractAddress;
      const amountInUnits = ethers.parseUnits(amount.toString(), tokenConfig.decimals);

      // 创建transfer函数调用数据
      const transferData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [recipientAddress, amountInUnits]
      );

      // 完整的函数调用数据 = 函数签名 + 参数编码
      const functionSignature = '0xa9059cbb'; // transfer(address,uint256)
      const callData = functionSignature + transferData.slice(2); // 移除0x前缀

      uri += `/${contractAddress}?value=0&data=${callData}`;
    }

    return uri;
  }

  // 获取订单详情
  static async getOrder(orderId) {
    const order = await Order.findById(orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    return order.toPublic();
  }

  // 获取用户订单列表
  static async getUserOrders(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const orders = await Order.findByUserId(userId, limit, offset);

    return orders.map(order => order.toPublic());
  }

  // 检查订单状态
  static async checkOrderStatus(orderId) {
    const order = await Order.findById(orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    // 检查是否过期
    if (order.isExpired() && order.status === 'pending') {
      await Order.updateStatus(orderId, 'expired');
      order.status = 'expired';
    }

    return {
      orderId,
      status: order.status,
      isExpired: order.isExpired(),
      canVerify: order.canVerify()
    };
  }

  // 更新订单状态
  static async updateOrderStatus(orderId, status) {
    const validStatuses = ['pending', 'paid', 'expired', 'failed'];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    await Order.updateStatus(orderId, status);
    return { orderId, status };
  }

  // 清理过期订单
  static async cleanupExpiredOrders() {
    const pool = require('../config/database').getPool();

    const [result] = await pool.execute(
      "UPDATE orders SET status = 'expired', updated_at = NOW() WHERE status = 'pending' AND expires_at < NOW()"
    );

    return result.affectedRows;
  }
  // 兼容旧方法的别名
  static async getOrderByOrderId(orderId) {
    return this.getOrder(orderId);
  }

  // 激活用户服务 (从旧的order.js迁移)
  static async activateUserService(orderId, userId) {
    const crypto = require('crypto');
    // 生成Token
    const token = `token_${crypto.randomBytes(32).toString('hex')}`;
    const tokenExpire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天有效期

    // 使用 db (Pool) 直接操作，因为 Order Model 可能没有这些方法
    const pool = require('../config/database').getPool();

    // 1. 更新订单状态
    await this.updateOrderStatus(orderId, 'activated');
    // 注意: updateOrderStatus 已经更新了 orders 表。
    // 旧代码在这里还会更新 activated_at，Order Model 应该处理这个。

    // 2. 创建或更新用户服务记录
    const [existing] = await pool.execute('SELECT * FROM user_services WHERE order_id = ?', [orderId]);

    if (existing.length > 0) {
      // 更新现有记录
      await pool.execute(
        "UPDATE user_services SET access_token = ?, token_expire = ?, service_status = 'active', activated_at = NOW() WHERE order_id = ?",
        [token, tokenExpire, orderId]
      );
    } else {
      // 创建新记录
      await pool.execute(
        "INSERT INTO user_services (user_id, order_id, access_token, token_expire, service_status, activated_at) VALUES (?, ?, ?, ?, 'active', NOW())",
        [userId || 'anonymous', orderId, token, tokenExpire]
      );
    }

    return {
      accessToken: token,
      expireTime: Math.floor(tokenExpire.getTime() / 1000)
    };
  }
}

module.exports = OrderService;
