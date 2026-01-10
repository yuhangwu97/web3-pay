import React, { useState } from 'react';
import { formatEther } from 'viem';
import api from '../services/api';

interface VerificationFormProps {
  orderId: string;
  onBack: () => void;
}

interface VerificationResult {
  isValid: boolean;
  orderId: string;
  transactionHash: string;
  details: any;
}

const VerificationForm: React.FC<VerificationFormProps> = ({ orderId, onBack }) => {
  const [transactionHash, setTransactionHash] = useState('');
  const [userId, setUserId] = useState('user_' + Date.now());
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionHash.trim()) {
      setErrorMsg('请输入交易Hash');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setResult(null);

    try {
      const response = await api.verifyPayment({
        orderId,
        transactionHash: transactionHash.trim(),
        userId: userId
      });

      if (response.success) {
        setResult(response.data);
      } else {
        setErrorMsg(response.message || '验证失败');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || '验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const formatHash = (hash: string) => {
    if (!hash) return 'N/A';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  const renderVerificationDetails = (details: any) => {
    if (!details) return null;

    return (
      <div style={{ marginTop: '20px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ background: '#f7fafc', padding: '12px 16px', fontWeight: '600', borderBottom: '1px solid #e2e8f0' }}>交易详情</div>
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#718096' }}>交易Hash:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatHash(details.transaction?.hash)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#718096' }}>发送地址:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatHash(details.transaction?.from)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#718096' }}>接收地址:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatHash(details.transaction?.to)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#718096' }}>金额:</span>
            <span>{details.transaction?.value ? `${formatEther(BigInt(details.transaction.value))} ETH` : 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#718096' }}>区块号:</span>
            <span>{details.transaction?.blockNumber}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#718096' }}>状态:</span>
            <span>
              {details.status === 1 || details.receipt?.status === 1 || details.isValid ? (
                <span style={{ background: '#c6f6d5', color: '#22543d', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>成功</span>
              ) : (
                <span style={{ background: '#fed7d7', color: '#742a2a', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>失败</span>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#718096' }}>验证时间:</span>
            <span>{details.verifiedAt ? new Date(details.verifiedAt).toLocaleString() : 'N/A'}</span>
          </div>
        </div>
      </div>
    );
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
        🛡️ 支付验证
      </h2>

      {/* Steps Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px', position: 'relative' }}>
        {['扫码支付', '获取Hash', '提交验证'].map((step, index) => (
          <div key={index} style={{ textAlign: 'center', zIndex: 1, flex: 1 }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: index <= 2 ? '#667eea' : '#e2e8f0',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              margin: '0 auto 8px auto'
            }}>
              {index + 1}
            </div>
            <div style={{ fontSize: '12px', color: index <= 2 ? '#2d3748' : '#718096', fontWeight: index === 2 ? '600' : '400' }}>{step}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', top: '16px', left: '16%', right: '16%', height: '2px', background: '#e2e8f0', zIndex: 0 }}>
          <div style={{ width: '100%', height: '100%', background: '#667eea' }}></div>
        </div>
      </div>

      <div style={{
        background: '#fff',
        borderRadius: '20px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
        padding: '32px 24px',
        border: '1px solid #edf2f7'
      }}>
        {!result ? (
          <>
            <div style={{ background: '#ebf8ff', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #bee3f8', color: '#2b6cb0', fontSize: '14px' }}>
              <strong>ℹ️ 说明:</strong> 请输入您完成的交易Hash进行验证。请确保Hash完整且正确，从钱包或交易所的交易记录中复制。
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>订单ID</label>
                <input
                  type="text"
                  className="input"
                  value={orderId}
                  disabled
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#f7fafc', color: '#a0aec0' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>交易Hash (TxID)</label>
                <input
                  type="text"
                  className="input"
                  value={transactionHash}
                  onChange={(e) => setTransactionHash(e.target.value)}
                  placeholder="0x..."
                  required
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>示例: 0x123...abc (66位字符)</div>
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>用户ID</label>
                <input
                  type="text"
                  className="input"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0' }}
                />
              </div>

              {errorMsg && (
                <div style={{ marginBottom: '20px', padding: '12px', borderRadius: '8px', background: '#fed7d7', color: '#9b2c2c', fontSize: '14px' }}>
                  ❌ {errorMsg}
                </div>
              )}

              <button
                type="submit"
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
                  marginBottom: '12px',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                }}
              >
                {loading ? '验证中...' : '提交验证'}
              </button>

              <button
                type="button"
                onClick={onBack}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'transparent',
                  color: '#718096',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                返回支付页面
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {result.isValid ? "🎉" : "⚠️"}
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px', color: result.isValid ? '#2f855a' : '#c53030' }}>
              {result.isValid ? "验证成功！" : "验证失败"}
            </h3>
            <p style={{ color: '#718096', fontSize: '14px', marginBottom: '24px' }}>
              {result.isValid ? "您的支付已被确认，订单已完成。" : "交易不符合订单要求，请查看详情或联系客服。"}
            </p>

            <div style={{ textAlign: 'left' }}>
              {renderVerificationDetails(result.details?.details || result.details)}
            </div>

            {result.details?.errors && result.details.errors.length > 0 && (
              <div style={{ marginTop: '20px', textAlign: 'left', background: '#fff5f5', padding: '16px', borderRadius: '12px', border: '1px solid #feb2b2' }}>
                <div style={{ fontWeight: '600', color: '#c53030', marginBottom: '8px' }}>错误信息:</div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#c53030', fontSize: '13px' }}>
                  {result.details.errors.map((err: string, idx: number) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: result.isValid ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <button
                onClick={onBack}
                style={{
                  padding: '12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px 0 rgba(102, 126, 234, 0.39)',
                }}
              >
                返回首页
              </button>
              {!result.isValid && (
                <button
                  onClick={() => setResult(null)}
                  style={{
                    padding: '12px',
                    background: '#fff',
                    color: '#4a5568',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  重试
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!result && (
        <div style={{ marginTop: '20px', padding: '20px', background: '#f7fafc', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4a5568' }}>验证说明</h4>
          <ul style={{ color: '#718096', lineHeight: '1.6', paddingLeft: '20px', margin: 0, fontSize: '13px' }}>
            <li>请确保输入完整的交易Hash（以0x开头）</li>
            <li>验证需要等待足够的区块链确认数（通常需要1-3分钟）</li>
            <li>每个Hash只能验证一次，重复使用会被拒绝</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default VerificationForm;
