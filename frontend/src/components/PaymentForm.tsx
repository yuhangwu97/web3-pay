import React, { useState } from 'react';
import { PaymentData } from '../App';
import api from '../services/api';

interface Network {
  id: number;
  name: string;
  description: string;
  fee: string;
}

const NETWORKS: Network[] = [
  // 暂时隐藏的其他网络
  // {
  //   id: 8453,
  //   name: 'Base',
  //   description: '推荐 - Gas费极低',
  //   fee: '~0.001 USD'
  // },
  {
    id: 1,
    name: 'Ethereum',
    description: '主网 - 安全性最高',
    fee: '~1-5 USD'
  },
  {
    id: 11155111,
    name: 'Sepolia',
    description: '测试网 - 免费测试',
    fee: '~0.00 USD'
  },
  // {
  //   id: 42161,
  //   name: 'Arbitrum',
  //   description: '快速确认',
  //   fee: '~0.001 USD'
  // }
];

interface PaymentFormProps {
  onOrderCreated: (data: PaymentData) => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ onOrderCreated }) => {
  const [amount, setAmount] = useState<string>('0.001');
  const [tokenType, setTokenType] = useState<string>('ETH');
  const [networkId, setNetworkId] = useState<number>(11155111); // Default to Sepolia for testing
  const [recipientAddress, setRecipientAddress] = useState<string>('0xFc09bB2B2cEc3eCc8Fc17DfA73a0C4BEF159f3Cd');
  const [userId] = useState<string>('user_' + Date.now());
  const [loading, setLoading] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<'direct' | 'qr'>('direct'); // 默认直接支付
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Submitting order:', {
        userId,
        amount: parseFloat(amount),
        tokenType,
        networkId,
        recipientAddress
      });

      const response = await api.createOrder({
        userId,
        amount: parseFloat(amount),
        tokenType,
        networkId,
        recipientAddress,
        paymentMethod
      });

      console.log('API Response:', response);

      if (response.success) {
        console.log('Order created successfully:', response.data);

        if (paymentMethod === 'direct') {
          // 直接支付模式：创建订单后立即调用MetaMask
          console.log('Starting direct MetaMask payment...');
          // 这里将在后续实现MetaMask调用
          onOrderCreated(response.data!);
        } else {
          // 二维码支付模式：跳转到支付显示页面
          onOrderCreated(response.data!);
        }
      } else {
        console.error('API returned success=false:', response.message);
        setError(response.message || '创建订单失败');
      }
    } catch (err: any) {
      console.error('API call failed:', err);
      setError(err.response?.data?.message || err.message || '创建订单失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto' }}>
      <h2 style={{
        textAlign: 'center',
        marginBottom: '32px',
        color: '#1a202c',
        fontSize: '24px',
        fontWeight: '700'
      }}>
        💰 创建支付订单
      </h2>

      <div style={{
        background: '#fff',
        borderRadius: '20px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
        padding: '32px 24px',
        border: '1px solid #edf2f7'
      }}>
        <form onSubmit={handleSubmit}>

          {/* Amount Input */}
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="label" style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#4a5568'
            }}>支付金额</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="0.000001"
                min="0"
                className="input"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '2px solid #e2e8f0',
                  fontSize: '16px',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Token Type */}
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="label" style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#4a5568'
            }}>代币类型</label>
            <select
              className="select"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '2px solid #e2e8f0',
                fontSize: '16px',
                appearance: 'none',
                backgroundColor: '#fff',
                backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23CBD5E0%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px top 50%',
                backgroundSize: '12px auto'
              }}
              value={tokenType}
              onChange={(e) => setTokenType(e.target.value)}
            >
              <option value="ETH">ETH</option>
              <option value="USDT">USDT (ERC20)</option>
              <option value="USDC">USDC (ERC20)</option>
            </select>
          </div>

          {/* Network Selection */}
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="label" style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#4a5568'
            }}>区块链网络</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {NETWORKS.map((network) => (
                <div
                  key={network.id}
                  onClick={() => setNetworkId(network.id)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${networkId === network.id ? '#667eea' : '#e2e8f0'}`,
                    background: networkId === network.id ? '#ebf4ff' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ fontWeight: '600', color: '#2d3748' }}>{network.name}</div>
                  <div style={{ fontSize: '12px', color: '#718096' }}>{network.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="label" style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#4a5568'
            }}>支付方式</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setPaymentMethod('direct')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: `2px solid ${paymentMethod === 'direct' ? '#667eea' : '#e2e8f0'}`,
                  background: paymentMethod === 'direct' ? '#ebf4ff' : '#fff',
                  color: paymentMethod === 'direct' ? '#5a67d8' : '#718096',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ⚡ 直接支付
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('qr')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: `2px solid ${paymentMethod === 'qr' ? '#667eea' : '#e2e8f0'}`,
                  background: paymentMethod === 'qr' ? '#ebf4ff' : '#fff',
                  color: paymentMethod === 'qr' ? '#5a67d8' : '#718096',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                📱 二维码
              </button>
            </div>
          </div>

          {/* Recipient Address */}
          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label className="label" style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#4a5568'
            }}>收款地址</label>
            <input
              type="text"
              className="input"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '2px solid #e2e8f0',
                fontSize: '14px',
                fontFamily: 'monospace',
                transition: 'all 0.2s',
                outline: 'none',
                background: '#f7fafc'
              }}
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="0x..."
              required
            />
          </div>

          {/* Hidden User ID */}
          <input type="hidden" value={userId} />

          {error && (
            <div className="status status-error" style={{
              marginBottom: '20px',
              padding: '12px',
              borderRadius: '8px',
              background: '#fed7d7',
              color: '#9b2c2c',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="button"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 14px 0 rgba(102, 126, 234, 0.39)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="loading" style={{
                  marginRight: '8px',
                  width: '16px',
                  height: '16px',
                  border: '2px solid #fff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%'
                }}></span>
                创建订单中...
              </span>
            ) : (
              paymentMethod === 'direct' ? '启动 MetaMask 支付' : '生成支付二维码'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PaymentForm;
