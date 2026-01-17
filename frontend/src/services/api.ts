const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.200.177:9082';

interface CreateOrderRequest {
  userId: string;
  amount: number;
  tokenType: string;
  networkId: number;
  recipientAddress: string;
  paymentMethod: 'direct' | 'qr';
}

interface VerifyPaymentRequest {
  orderId: string;
  transactionHash: string;
  userId: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface OrderResponse {
  order: {
    id: string;
    recipientAddress: string;
    amount: number;
    tokenType: string;
    networkId: number;
    status: string;
    expiresAt: string;
    createdAt: string;
    paymentMethod: 'direct' | 'qr';
  };
  paymentUri: string;
}

class ApiService {
  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // 创建支付订单
  async createOrder(data: CreateOrderRequest): Promise<ApiResponse<OrderResponse>> {
    return this.request<OrderResponse>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // 获取订单详情
  async getOrder(orderId: string) {
    return this.request(`/api/orders/${orderId}`);
  }

  // 获取订单状态
  async getOrderStatus(orderId: string) {
    return this.request(`/api/orders/${orderId}/status`);
  }

  // 验证支付Hash
  async verifyPayment(data: VerifyPaymentRequest) {
    return this.request('/api/verification/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // 自动检测支付
  async autoDetectPayment(orderId: string) {
    return this.request(`/api/verification/auto-detect/${orderId}`);
  }

  // 获取验证历史
  async getVerificationHistory(orderId: string) {
    return this.request(`/api/verification/history/${orderId}`);
  }
}

const api = new ApiService();
export default api;
