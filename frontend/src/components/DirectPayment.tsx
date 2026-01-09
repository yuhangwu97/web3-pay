import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSendTransaction, useWaitForTransactionReceipt, useWriteContract, useSwitchChain } from 'wagmi';
import { parseEther, parseUnits } from 'viem';
import styled, { keyframes, css } from 'styled-components';
import { useToast } from './Toast';

// Animations
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

// Styled Components
const PageContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
  background-color: #f8fafc;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`;

const Card = styled.div`
  width: 100%;
  max-width: 480px;
  background: white;
  border-radius: 24px;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.1);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: ${fadeIn} 0.5s ease-out;
  position: relative;
  overflow: hidden;

  @media (max-width: 640px) {
    padding: 24px;
    border-radius: 20px;
  }
`;

const StatusHeader = styled.div<{ $status: 'connected' | 'processing' | 'disconnected' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 9999px; // Pill shape
  background-color: ${props =>
    props.$status === 'connected' ? '#ecfdf5' :
      props.$status === 'processing' ? '#eff6ff' : '#fef2f2'};
  color: ${props =>
    props.$status === 'connected' ? '#059669' :
      props.$status === 'processing' ? '#2563eb' : '#dc2626'};
  font-size: 14px;
  font-weight: 600;
  align-self: center;
  margin-bottom: 8px;
  transition: all 0.3s ease;
`;

const AmountSection = styled.div`
  text-align: center;
  padding: 24px 0;
  position: relative;
`;

const AmountValue = styled.div`
  font-size: 48px;
  font-weight: 800;
  color: #111827;
  line-height: 1.1;
  letter-spacing: -0.02em;
  
  span {
    font-size: 24px;
    color: #6b7280;
    font-weight: 600;
    margin-left: 4px;
  }
`;

const NetworkLabel = styled.div`
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 12px;
  background-color: #f3f4f6;
  color: #4b5563;
  font-size: 13px;
  font-weight: 500;
`;

const InfoGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
  
  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

const Label = styled.div`
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
`;

const Value = styled.div`
  color: #111827;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Address = styled.code`
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #e2e8f0;
  }
`;

const ConnectButton = styled.button`
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(245, 158, 11, 0.2);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3);
  }
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary', $isLoading?: boolean }>`
  width: 100%;
  padding: 16px;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: transform 0.1s, opacity 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  
  ${props => props.$variant === 'secondary' ? css`
    background-color: #f3f4f6;
    color: #4b5563;
    &:hover { background-color: #e5e7eb; }
  ` : css`
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    &:hover { 
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
    }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  ${props => props.$isLoading && css`
    pointer-events: none;
  `}
`;

const Spinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255,255,255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const ErrorMessage = styled.div`
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ProgressOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: #e2e8f0;
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 30%;
    background: #4f46e5;
    border-radius: 0 2px 2px 0;
    animation: moveIndeterminate 1.5s infinite linear;
  }

  @keyframes moveIndeterminate {
    0% { left: -30%; width: 30%; }
    50% { width: 50%; }
    100% { left: 100%; width: 30%; }
  }
`;

interface DirectPaymentProps {
  paymentData: any;
  onPaymentSuccess: () => void;
  onBack: () => void;
}

const DirectPayment: React.FC<DirectPaymentProps> = ({ paymentData, onPaymentSuccess, onBack }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [userCancelled, setUserCancelled] = useState(false);
  const [copied, setCopied] = useState(false);

  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { showToast } = useToast();

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash
  });

  // 监听交易确认并上报后端
  useEffect(() => {
    if (isConfirmed && receipt && txHash) {
      const verifyTransaction = async () => {
        try {
          // 调用后端验证接口关联订单和Hash
          await import('../services/api').then(module => {
            module.default.verifyPayment({
              orderId: paymentData.order.id,
              transactionHash: txHash,
              userId: paymentData.order.userId
            });
          });
          onPaymentSuccess();
        } catch (err) {
          console.error('Verification reporting failed:', err);
          // 即使上报失败，只要链上确认了，也可以让用户通过
          onPaymentSuccess();
        }
      };
      verifyTransaction();
    }
  }, [isConfirmed, receipt, txHash, paymentData.order, onPaymentSuccess]);

  // ERC20代币合约ABI（只包含transfer方法）
  const ERC20_ABI = [
    {
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' }
      ],
      name: 'transfer',
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ];

  const TOKEN_CONTRACTS: { [key: string]: string } = {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86a33E6441c86Cd40B2C6E1240F93b0c8c6c7'
  };

  const TOKEN_DECIMALS: { [key: string]: number } = {
    ETH: 18,
    USDT: 6,
    USDC: 6
  };

  const handleConnectWallet = async () => {
    try {
      const metaMaskConnector = connectors.find((c: any) =>
        c.name.toLowerCase().includes('metamask') ||
        c.id === 'metaMask' ||
        c.id === 'io.metamask'
      );

      if (metaMaskConnector) {
        await connect({ connector: metaMaskConnector });
      } else {
        setError('未检测到MetaMask钱包。请安装后重试。');
      }
    } catch (err: any) {
      if (err.message && err.message.includes('User rejected')) return;
      setError('连接钱包失败: ' + (err.message || '未知错误'));
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(paymentData.order.recipientAddress);
      setCopied(true);
      showToast('已复制', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePayment = async () => {
    if (!isConnected || !address) {
      setError('请先连接钱包');
      return;
    }

    setIsProcessing(true);
    setError('');
    setUserCancelled(false);

    try {
      const { order } = paymentData;
      const { tokenType, amount, recipientAddress, networkId } = order;

      if (chain?.id !== networkId) {
        try {
          await switchChainAsync({ chainId: networkId });
          // Wait a bit for network switch to stabilize
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (switchError: any) {
          setError(`网络切换失败: ${switchError.message}`);
          setIsProcessing(false);
          return;
        }
      }

      if (chain?.id !== networkId) {
        setError('请切换到正确的网络');
        setIsProcessing(false);
        return;
      }

      let hash: `0x${string}`;
      const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

      if (tokenType === 'ETH') {
        hash = await sendTransactionAsync({
          to: recipientAddress,
          value: parseEther(numericAmount.toString()),
        });
      } else if (TOKEN_CONTRACTS[tokenType]) {
        const contractAddress = TOKEN_CONTRACTS[tokenType];
        const decimals = TOKEN_DECIMALS[tokenType];
        const amountInUnits = parseUnits(numericAmount.toString(), decimals);

        hash = await writeContractAsync({
          address: contractAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipientAddress, amountInUnits],
        });
      } else {
        throw new Error(`不支持的代币类型: ${tokenType}`);
      }

      console.log('Transaction sent:', hash);
      setTxHash(hash);
      // isConfirming will become true via hook

    } catch (err: any) {
      console.error('支付失败:', err);
      if (err.code === 4001 || err.message?.includes('User rejected')) {
        setUserCancelled(true);
      } else {
        setError('支付失败: ' + (err.message || '未知错误'));
      }
      setIsProcessing(false);
    }
  };

  const getNetworkName = (id: number) => {
    if (id === 1) return 'Ethereum Mainnet';
    if (id === 11155111) return 'Sepolia Testnet';
    return `Chain ID: ${id}`;
  };

  // derived state
  const isCorrectNetwork = chain?.id === paymentData.order.networkId;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  return (
    <PageContainer>
      <div className="pay-card-wrapper" style={{ width: '100%', maxWidth: '480px' }}>
        <Card>
          {isProcessing && <ProgressOverlay />}

          <StatusHeader $status={isProcessing ? 'processing' : isConnected ? 'connected' : 'disconnected'}>
            {isProcessing ? '⚡ 处理中...' : isConnected ? '● 已连接' : '○ 请连接钱包'}
          </StatusHeader>

          <AmountSection>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>支付金额</div>
            <AmountValue>
              {typeof paymentData.order.amount === 'number'
                ? paymentData.order.amount.toFixed(4)
                : paymentData.order.amount}
              <span>{paymentData.order.tokenType}</span>
            </AmountValue>
            <NetworkLabel>
              {getNetworkName(paymentData.order.networkId)}
            </NetworkLabel>
          </AmountSection>

          <InfoGrid>
            <InfoRow>
              <Label>支付账户</Label>
              <Value>
                {isConnected ? (
                  <>
                    <span style={{ color: '#059669', fontSize: '12px' }}>●</span>
                    {shortAddress}
                    <button onClick={() => disconnect()} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0 4px' }} title="断开">×</button>
                  </>
                ) : (
                  <ConnectButton onClick={handleConnectWallet}>
                    连接钱包
                  </ConnectButton>
                )}
              </Value>
            </InfoRow>

            <InfoRow>
              <Label>收款地址</Label>
              <Value>
                <Address onClick={copyAddress} title="点击复制">
                  {paymentData.order.recipientAddress.slice(0, 8)}...{paymentData.order.recipientAddress.slice(-8)}
                  {copied && <span style={{ marginLeft: '4px' }}>✓</span>}
                </Address>
              </Value>
            </InfoRow>

            <InfoRow>
              <Label>预估手续费</Label>
              <Value>~0.001 {paymentData.order.tokenType}</Value>
            </InfoRow>

            {isCorrectNetwork === false && isConnected && (
              <InfoRow style={{ background: '#fff7ed', margin: '0 -8px', padding: '8px', borderRadius: '8px' }}>
                <Label style={{ color: '#c2410c' }}>注意</Label>
                <Value style={{ color: '#9a3412' }}>网络不匹配，支付时将自动切换</Value>
              </InfoRow>
            )}
          </InfoGrid>

          {error && (
            <ErrorMessage>
              <span>⚠️</span>
              {error}
            </ErrorMessage>
          )}

          {userCancelled && (
            <ErrorMessage style={{ background: '#fff7ed', borderColor: '#fdba74', color: '#c2410c' }}>
              <span>🚫</span>
              用户取消了交易
            </ErrorMessage>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <ActionButton
              $variant="secondary"
              onClick={onBack}
              disabled={isProcessing}
            >
              返回
            </ActionButton>

            {isCorrectNetwork ? (
              <ActionButton
                onClick={handlePayment}
                disabled={isProcessing || !isConnected}
                $isLoading={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Spinner />
                    {isConfirming ? '区块确认中...' : '发送中...'}
                  </>
                ) : (
                  '立即支付'
                )}
              </ActionButton>
            ) : (
              <ActionButton
                onClick={() => switchChainAsync({ chainId: paymentData.order.networkId })}
                disabled={isProcessing || !isConnected}
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
              >
                切换到 {getNetworkName(paymentData.order.networkId)}
              </ActionButton>
            )}
          </div>

        </Card>

        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          color: '#94a3b8',
          fontSize: '12px'
        }}>
          安全支付由 Web3 Payment 提供技术支持
        </div>
      </div>
    </PageContainer >
  );
};

export default DirectPayment;
