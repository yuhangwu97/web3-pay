const axios = require('axios');
require('dotenv').config();

const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

class NowPaymentsService {
  constructor() {
    this.apiKey = NOWPAYMENTS_API_KEY;
    this.baseURL = NOWPAYMENTS_API_URL;
  }

  // 获取请求头
  getHeaders() {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  // 创建支付订单
  async createPayment(paymentData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/payment`,
        paymentData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('创建支付订单失败:', error.response?.data || error.message);
      
      // 处理各种错误情况
      if (error.response?.data) {
        const errorData = error.response.data;
        const errorMessage = errorData.message || errorData.errors?.[0]?.message || '创建支付订单失败';
        
        // 如果是金额错误，提供更详细的提示
        if (errorData.code === 'AMOUNT_MINIMAL_ERROR' || errorMessage.includes('less than minimal')) {
          throw new Error(`支付金额过小：${errorMessage}。NOWPayments要求的最小金额通常为 $1 或更高。`);
        }
        
        throw new Error(errorMessage);
      }
      
      throw new Error(error.message || '创建支付订单失败');
    }
  }

  // 创建支付并返回规范化对象（包含 paymentUrl、pay_address 等）
  async createPaymentNormalized(paymentData) {
    const raw = await this.createPayment(paymentData);

    // 验证响应数据的完整性
    if (!raw || typeof raw !== 'object') {
      throw new Error('支付创建响应无效：未返回有效数据');
    }

    // 检查是否有必要的标识符
    if (!raw.payment_id && !raw.purchase_id) {
      throw new Error('支付创建响应无效：缺少支付ID或购买ID');
    }

    console.log('NOWPayments原始响应:', JSON.stringify(raw, null, 2));

    // Normalize fields
    const paymentId = raw.payment_id || raw.purchase_id || null;
    const purchaseId = raw.purchase_id || null;
    const payAddress = raw.pay_address || raw.address || null;
    const payCurrency = raw.pay_currency || raw.currency || null;

    // 根据 NOWPayments API 文档，优先使用 API 返回的 payment_url
    // 如果没有，则使用标准的 NOWPayments 支付页面格式
    let paymentUrl = raw.payment_url || raw.pay_url || raw.url || null;

    // NOWPayments API 文档显示，支付链接应使用标准格式
    // 不再尝试使用非标准的 invoice 端点，避免 API 错误
    if (!paymentUrl && raw.payment_id) {
      paymentUrl = `https://nowpayments.io/payment/?iid=${raw.payment_id}${payCurrency ? `&pay_currency=${payCurrency}` : ''}`;
      console.log('使用标准的 NOWPayments 支付链接格式:', paymentUrl);
    }

    // 如果仍然没有支付链接，抛出错误
    if (!paymentUrl) {
      throw new Error('无法生成支付链接：支付创建成功但未返回有效的支付URL');
    }

    return {
      raw,
      paymentId,
      purchaseId,
      payAddress,
      payCurrency,
      paymentUrl
    };
  }

  // 查询支付状态
  async getPaymentStatus(paymentId, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`查询支付状态 (尝试 ${attempt}/${maxRetries}): ${paymentId}`);

        const response = await axios.get(
          `${this.baseURL}/payment/${paymentId}`,
          { headers: this.getHeaders() }
        );

        if (response.data && typeof response.data === 'object') {
          return response.data;
        } else {
          console.warn(`支付状态响应数据异常，重试中... (尝试 ${attempt}/${maxRetries})`);
        }
      } catch (error) {
        console.error(`查询支付状态失败 (尝试 ${attempt}/${maxRetries}):`, error.response?.data || error.message);

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          throw new Error(error.response?.data?.message || '查询支付状态失败');
        }

        // 等待后重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`等待 ${delay}ms 后重试查询支付状态...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // 验证Webhook签名
  verifyWebhookSignature(body, signature) {
    // NOWPayments的Webhook签名验证逻辑
    // 根据NOWPayments文档实现签名验证
    // 这里简化处理，实际应该验证签名
    const webhookSecret = process.env.NOWPAYMENTS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('未配置NOWPAYMENTS_WEBHOOK_SECRET，跳过签名验证');
      return true;
    }
    try {
      const crypto = require('crypto');
      const computedHex = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
      const computedBase64 = crypto.createHmac('sha256', webhookSecret).update(body).digest('base64');

      if (!signature) return false;
      const sig = signature.toString();
      // 支持多种格式对比
      if (sig === computedHex || sig === `sha256=${computedHex}` || sig === computedBase64) {
        return true;
      }
      console.warn('Webhook 签名不匹配', { signature: sig, computedHex, computedBase64 });
      return false;
    } catch (err) {
      console.error('签名验证异常', err);
      return false;
    }
  }

  // 获取支持的币种列表
  async getCurrencies() {
    try {
      const response = await axios.get(
        `${this.baseURL}/currencies`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('获取币种列表失败:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || '获取币种列表失败');
    }
  }

  // 获取支付发票链接（如果API支持）
  async getInvoiceLink(paymentId, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`尝试获取发票链接 (尝试 ${attempt}/${maxRetries}): ${paymentId}`);

        // 尝试使用 invoice 端点获取支付链接
        const response = await axios.get(
          `${this.baseURL}/invoice/${paymentId}`,
          { headers: this.getHeaders() }
        );

        // 验证响应数据完整性
        if (response.data && typeof response.data === 'object') {
          return response.data;
        } else {
          console.warn(`发票响应数据不完整，重试中... (尝试 ${attempt}/${maxRetries})`);
        }
      } catch (error) {
        console.log(`获取发票链接失败 (尝试 ${attempt}/${maxRetries}):`, error.message);

        // 如果是最后一次尝试，返回null
        if (attempt === maxRetries) {
          console.error(`获取发票链接失败，已重试 ${maxRetries} 次，使用默认支付链接格式。PaymentID: ${paymentId}`);
          return null;
        }

        // 等待一段时间后重试 (指数退避)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`等待 ${delay}ms 后重试... (尝试 ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return null;
  }
}

module.exports = new NowPaymentsService();

