import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import DirectPayment from './DirectPayment';
import { PaymentData } from '../App';

type QRCodeType = 'uri' | 'address';

interface PaymentDisplayProps {
  paymentData: PaymentData;
  onProceedToVerification?: () => void;
  onPaymentSuccess?: () => void;
  onBack: () => void;
}

const PaymentDisplay: React.FC<PaymentDisplayProps> = ({
  paymentData,
  onProceedToVerification,
  onPaymentSuccess = onProceedToVerification,
  onBack
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [qrCodeType, setQrCodeType] = useState<QRCodeType>('uri');
  const [autoDetectResult, setAutoDetectResult] = useState<any>(null);
  const [autoDetectLoading, setAutoDetectLoading] = useState<boolean>(false);

  const { order, paymentUri } = paymentData;

  // 生成二维码
  useEffect(() => {
    const generateQR = async () => {
      try {
        const qrContent = qrCodeType === 'uri' ? paymentUri : order.recipientAddress;

        const dataUrl = await QRCode.toDataURL(qrContent, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error('QR Code generation failed:', error);
      }
    };

    generateQR();
  }, [paymentUri, order.recipientAddress, qrCodeType]);

  // 自动检测支付（每10秒执行一次）
  useEffect(() => {
    const autoDetectInterval = setInterval(async () => {
      if (order.status === 'pending') {
        try {
          setAutoDetectLoading(true);
          const response = await fetch(`/api/verification/auto-detect/${order.id}`);
          const result = await response.json();

          if (result.data.found) {
            setAutoDetectResult(result.data);
            clearInterval(autoDetectInterval);
          }
        } catch (error) {
          console.error('Auto-detect failed:', error);
        } finally {
          setAutoDetectLoading(false);
        }
      }
    }, 10000); // 每10秒检测一次

    return () => clearInterval(autoDetectInterval);
  }, [order.id, order.status]);

  const getNetworkName = (networkId: number) => {
    const networks: { [key: number]: string } = {
      1: 'Ethereum',
      11155111: 'Sepolia',
      8453: 'Base',
      42161: 'Arbitrum'
    };
    return networks[networkId] || 'Unknown';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add toaster notification here
  };

  const getCurrentQRContent = () => {
    return qrCodeType === 'uri' ? paymentUri : order.recipientAddress;
  };

  // Direct payment mode
  if (order.paymentMethod === 'direct') {
    return (
      <DirectPayment
        paymentData={paymentData}
        onPaymentSuccess={onPaymentSuccess || (() => { })}
        onBack={onBack}
      />
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto' }}>
      <h2 style={{
        textAlign: 'center',
        marginBottom: '32px',
        color: '#1a202c',
        fontSize: '24px',
        fontWeight: '700'
      }}>
        📱 二维码支付
      </h2>

      <div className="qr-container" style={{
        background: '#fff',
        borderRadius: '20px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
        padding: '32px 24px',
        margin: '0',
        border: '1px solid #edf2f7'
      }}>

        {/* Amount Display */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '14px', color: '#718096', marginBottom: '4px' }}>支付金额</div>
          <div style={{ fontSize: '36px', fontWeight: '800', color: '#2d3748', lineHeight: '1.2' }}>
            {order.amount} <span style={{ fontSize: '20px', fontWeight: '600' }}>{order.tokenType}</span>
          </div>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            background: '#ebf8ff',
            color: '#3182ce',
            borderRadius: '20px',
            fontSize: '12px',
            marginTop: '8px',
            fontWeight: '600'
          }}>
            {getNetworkName(order.networkId)} 网络
          </div>
        </div>

        {/* QR Code Section */}
        <div style={{
          background: '#f8fafc',
          padding: '24px',
          borderRadius: '16px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            background: '#e2e8f0',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '24px',
            width: '100%'
          }}>
            <button
              onClick={() => setQrCodeType('uri')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: qrCodeType === 'uri' ? '#fff' : 'transparent',
                color: qrCodeType === 'uri' ? '#2d3748' : '#718096',
                fontWeight: qrCodeType === 'uri' ? '600' : '500',
                boxShadow: qrCodeType === 'uri' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              二维码
            </button>
            <button
              onClick={() => setQrCodeType('address')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: qrCodeType === 'address' ? '#fff' : 'transparent',
                color: qrCodeType === 'address' ? '#2d3748' : '#718096',
                fontWeight: qrCodeType === 'address' ? '600' : '500',
                boxShadow: qrCodeType === 'address' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              仅地址
            </button>
          </div>

          <div style={{
            padding: '16px',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
            border: '1px solid #e2e8f0',
            marginBottom: '16px'
          }}>
            {qrCodeDataUrl ? (
              <img src={qrCodeDataUrl} alt="Payment QR Code" style={{ width: '200px', height: '200px', display: 'block' }} />
            ) : (
              <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e0' }}>
                生成中...
              </div>
            )}
          </div>

          <div style={{
            fontSize: '13px',
            color: '#718096',
            textAlign: 'center',
            maxWidth: '280px',
            lineHeight: '1.5'
          }}>
            {qrCodeType === 'uri'
              ? '推荐使用钱包App直接扫描'
              : '扫描地址二维码进行转账'}
          </div>
        </div>

        {/* Address & Copy Actions */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            marginBottom: '8px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#718096',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            收款地址
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: '#f7fafc',
            border: '1px solid #edf2f7',
            borderRadius: '12px',
            padding: '0'
          }}>
            <code style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '13px',
              color: '#4a5568',
              wordBreak: 'break-all',
              background: 'transparent'
            }}>
              {order.recipientAddress}
            </code>
            <button
              onClick={() => copyToClipboard(order.recipientAddress)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '12px 16px',
                cursor: 'pointer',
                color: '#667eea',
                fontWeight: '600',
                fontSize: '13px',
                borderLeft: '1px solid #edf2f7'
              }}
            >
              复制
            </button>
          </div>
        </div>

        {/* ERC20 Warning (Simplified) */}
        {order.tokenType !== 'ETH' && (
          <div style={{
            padding: '12px 16px',
            background: '#fffaf0',
            border: '1px solid #feebc8',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#9c4221',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'start'
          }}>
            <span style={{ marginRight: '8px' }}>⚠️</span>
            <div>
              请确保仅转入 <strong>{order.tokenType}</strong> (ERC20)。
              转入其他代币将无法找回。
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button
            className="button button-secondary"
            onClick={onBack}
            style={{
              background: '#f7fafc',
              color: '#4a5568',
              border: '1px solid #e2e8f0'
            }}
          >
            返回
          </button>
          <button
            className="button"
            onClick={() => onProceedToVerification && onProceedToVerification()}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 4px 14px 0 rgba(102, 126, 234, 0.39)'
            }}
          >
            我已支付
          </button>
        </div>

      </div>

      {/* Auto Detect Status */}
      {(autoDetectResult || autoDetectLoading) && (
        <div style={{
          marginTop: '24px',
          background: autoDetectResult ? '#f0fff4' : '#ebf8ff',
          border: `1px solid ${autoDetectResult ? '#c6f6d5' : '#bee3f8'}`,
          borderRadius: '12px',
          padding: '16px',
          textAlign: 'center'
        }}>
          {autoDetectResult ? (
            <>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#276749', marginBottom: '8px' }}>
                🎉 检测到支付！
              </div>
              <div style={{ fontSize: '13px', color: '#2f855a' }}>
                Hash: {autoDetectResult.transactionHash.slice(0, 10)}...
              </div>
            </>
          ) : (
            <div style={{ color: '#2b6cb0', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="loading" style={{ width: '16px', height: '16px', marginRight: '8px', borderWidth: '2px' }}></span>
              正在自动检测支付...
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div style={{ textAlign: 'center', marginTop: '32px', color: '#a0aec0', fontSize: '12px' }}>
        订单 ID: {order.id} • {new Date(order.expiresAt).toLocaleTimeString()} 过期
      </div>
    </div>
  );
};

export default PaymentDisplay;
