import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi'
import { config } from './wagmiConfig'
import PaymentForm from './components/PaymentForm';
import PaymentDisplay from './components/PaymentDisplay';
import VerificationForm from './components/VerificationForm';
import PaymentSuccess from './components/PaymentSuccess';
import { ToastProvider } from './components/Toast';

// 创建QueryClient实例
const queryClient = new QueryClient()

export interface Order {
  id: string;
  recipientAddress: string;
  amount: number;
  tokenType: string;
  networkId: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  paymentMethod: 'direct' | 'qr';
}

export interface PaymentData {
  order: Order;
  paymentUri: string;
}

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<'form' | 'verification' | 'success'>('form');
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);

  const handleOrderCreated = (data: PaymentData) => {
    setPaymentData(data);
    // 订单创建后显示支付界面
  };

  const handleProceedToVerification = () => {
    setCurrentStep('verification');
  };

  const handlePaymentSuccess = () => {
    setCurrentStep('success');
  };

  const handleBackToHome = () => {
    setCurrentStep('form');
    setPaymentData(null);
  };

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
      <div style={{
        maxWidth: '600px',
        width: '100%',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
        padding: '40px',
        margin: '20px'
      }}>
        {/* <h1 style={{
          textAlign: 'center',
          marginBottom: '32px',
          color: '#2d3748',
          fontSize: '28px'
        }}>
          💰 Web3支付
        </h1>
        <p style={{
          textAlign: 'center',
          color: '#718096',
          marginBottom: '24px',
          fontSize: '14px'
        }}>
          安全便捷的加密货币支付
        </p> */}

        {currentStep === 'form' && !paymentData && (
          <PaymentForm onOrderCreated={handleOrderCreated} />
        )}

        {paymentData && currentStep === 'form' && (
          <PaymentDisplay
            paymentData={paymentData}
            onProceedToVerification={handleProceedToVerification}
            onPaymentSuccess={handlePaymentSuccess}
            onBack={() => setPaymentData(null)}
          />
        )}

        {currentStep === 'verification' && paymentData && (
          <VerificationForm
            orderId={paymentData.order.id}
            onBack={() => setCurrentStep('form')}
          />
        )}

        {currentStep === 'success' && paymentData && (
          <PaymentSuccess
            orderId={paymentData.order.id}
            amount={paymentData.order.amount}
            tokenType={paymentData.order.tokenType}
            networkName={paymentData.order.networkId === 1 ? 'Ethereum' : 'Sepolia'}
            onBackToHome={handleBackToHome}
          />
        )}
        </div>
        </div>
        </ToastProvider>
        </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
