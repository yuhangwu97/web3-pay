import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Alert, Divider, Spin } from 'antd';
import { createPayment, getPaymentStatus } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';

const { Title, Text, Paragraph } = Typography;

function Web3Payment() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  // 创建支付订单
  const handleCreatePayment = async (values) => {
    try {
      setLoading(true);
      const result = await createPayment({
        amount: values.amount,
        currency: values.currency,
        userId: values.userId || 'anonymous'
      });

      if (result.success) {
        setPaymentData(result.data);
        message.success('支付订单创建成功！请按指示完成支付');
      } else {
        message.error(result.message || '创建支付订单失败');
      }
    } catch (error) {
      console.error('创建支付订单错误:', error);
      message.error(error.response?.data?.message || '创建支付订单失败');
    } finally {
      setLoading(false);
    }
  };

  // 验证交易 hash
  const handleVerifyTransaction = async (values) => {
    if (!paymentData?.orderId) {
      message.error('请先创建支付订单');
      return;
    }

    try {
      setVerifying(true);

      // 调用后端验证 API
      const response = await fetch(`/api/payment/verify-transaction/${paymentData.orderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash: values.txHash
        })
      });

      const result = await response.json();

      if (result.success) {
        message.success('交易验证成功！服务已激活');
        setAccessToken(result.data.accessToken);
      } else {
        message.error(result.message || '交易验证失败');
      }
    } catch (error) {
      console.error('验证交易失败:', error);
      message.error('验证失败，请稍后重试');
    } finally {
      setVerifying(false);
    }
  };

  // 自动检测支付
  const handleAutoDetect = async () => {
    if (!paymentData?.orderId || !paymentData?.payAddress) {
      message.error('请先创建支付订单');
      return;
    }

    try {
      setAutoDetecting(true);
      setLastChecked(new Date());

      // 调用后端自动检测 API
      const response = await fetch(`/api/payment/auto-detect/${paymentData.orderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();

      if (result.success && result.data?.found) {
        message.success(`🎉 检测到支付！交易哈希: ${result.data.txHash.substring(0, 10)}...`);
        // 自动填充交易哈希
        form.setFieldsValue({ txHash: result.data.txHash });
        // 可以选择自动验证
        // handleVerifyTransaction({ txHash: result.data.txHash });
      } else if (result.success && !result.data?.found) {
        message.info('未检测到匹配的支付交易，请稍后再试或手动输入哈希');
      } else {
        message.warning(result.message || '自动检测失败');
      }
    } catch (error) {
      console.error('自动检测失败:', error);
      message.error('自动检测失败，请稍后重试');
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setPaymentData(null);
    setAccessToken(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <Card>
          <Title level={2} style={{ textAlign: 'center', marginBottom: '30px' }}>
            🌐 Web3 原生支付
          </Title>

          <Alert
            message="真正的去中心化支付"
            description="直接使用 ETH 钱包支付，无需第三方支付网关。支持 MetaMask、Trust Wallet 等任何以太坊钱包。"
            type="info"
            showIcon
            style={{ marginBottom: '24px' }}
          />

          {!paymentData ? (
            <Form
              form={form}
              layout="vertical"
              onFinish={handleCreatePayment}
              initialValues={{
                currency: 'eth',
                amount: '0.001'
              }}
            >
              <Form.Item
                label="支付金额 (ETH)"
                name="amount"
                rules={[
                  { required: true, message: '请输入支付金额' },
                  { pattern: /^\d+(\.\d{1,8})?$/, message: '请输入有效的 ETH 金额' },
                  {
                    validator: (_, value) => {
                      const amount = parseFloat(value);
                      if (!value || isNaN(amount)) {
                        return Promise.reject(new Error('请输入有效的金额'));
                      }
                      if (amount < 0.001) {
                        return Promise.reject(new Error('支付金额不能少于 0.001 ETH'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
                extra="建议测试金额：0.001 ETH"
              >
                <Input placeholder="例如: 0.001" type="number" min="0.001" step="0.001" size="large" />
              </Form.Item>

              <Form.Item
                label="支付币种"
                name="currency"
                rules={[{ required: true, message: '请选择支付币种' }]}
              >
                <Select size="large">
                  <Option value="eth">
                    <div>
                      <div>ETH (以太坊原生代币)</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>推荐 - Gas费最低</div>
                    </div>
                  </Option>
                  <Option value="usdt">
                    <div>
                      <div>USDT (ERC-20稳定币)</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>美元稳定币</div>
                    </div>
                  </Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="用户ID (可选)"
                name="userId"
              >
                <Input placeholder="留空则使用匿名用户" size="large" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" block loading={loading} size="large">
                  创建支付订单
                </Button>
              </Form.Item>
            </Form>
          ) : (
            <div>
              {accessToken ? (
                <div style={{ textAlign: 'center' }}>
                  <Title level={3} style={{ color: '#52c41a' }}>
                    ✅ 支付成功！
                  </Title>
                  <Card style={{ marginTop: '20px', background: '#f6ffed' }}>
                    <Title level={4}>访问令牌</Title>
                    <Paragraph copyable style={{ fontSize: '16px', wordBreak: 'break-all' }}>
                      {accessToken}
                    </Paragraph>
                    <Text type="secondary">
                      令牌有效期：30天
                    </Text>
                  </Card>
                  <Button
                    type="primary"
                    onClick={handleReset}
                    style={{ marginTop: '20px' }}
                    size="large"
                  >
                    创建新订单
                  </Button>
                </div>
              ) : (
                <div>
                  <Title level={4} style={{ textAlign: 'center', marginBottom: '20px' }}>
                    📋 订单信息
                  </Title>

                  <div style={{ marginBottom: '24px' }}>
                    <Text strong>订单号: </Text><Text code>{paymentData.orderId}</Text>
                    <br />
                    <Text strong>支付金额: </Text><Text>{paymentData.amount} {paymentData.currency?.toUpperCase()}</Text>
                    <br />
                    <Text strong>支付币种: </Text><Text>{paymentData.currency}</Text>
                  </div>

                  <Divider />

                  <Title level={4} style={{ textAlign: 'center', marginBottom: '20px', color: '#1890ff' }}>
                    💰 支付信息
                  </Title>

                  <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    color: 'white',
                    marginBottom: '24px'
                  }}>
                    <div style={{ marginBottom: '16px' }}>
                      <Text style={{ color: 'white', display: 'block', marginBottom: '8px', fontSize: '16px' }}>
                        📍 收款地址 ({paymentData.currency?.toUpperCase()}):
                      </Text>
                      <div style={{
                        background: 'rgba(255,255,255,0.2)',
                        padding: '12px',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        wordBreak: 'break-all',
                        border: '1px solid rgba(255,255,255,0.3)'
                      }}>
                        {paymentData.payAddress}
                      </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <Text style={{ color: 'white', display: 'block', marginBottom: '8px', fontSize: '16px' }}>
                        💵 支付金额:
                      </Text>
                      <div style={{
                        background: 'rgba(255,255,255,0.2)',
                        padding: '12px',
                        borderRadius: '6px',
                        textAlign: 'center',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#ffd700'
                      }}>
                        {paymentData.amount} {paymentData.currency?.toUpperCase()}
                      </div>
                    </div>

                    {/* 显示二维码 */}
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                      <Text style={{ color: 'white', display: 'block', marginBottom: '12px', fontSize: '16px' }}>
                        📱 扫码支付:
                      </Text>
                      <div style={{
                        background: 'white',
                        padding: '16px',
                        borderRadius: '8px',
                        display: 'inline-block'
                      }}>
                        <QRCodeSVG
                          value={paymentData.paymentUrl || `ethereum:${paymentData.payAddress}`}
                          size={160}
                          level="H"
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <Space direction="vertical" size="small">
                        <Text style={{ color: 'white', fontSize: '14px' }}>
                          🔄 使用任何 ETH 钱包扫码或直接转账
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>
                          支持 MetaMask、Trust Wallet、Coinbase Wallet 等
                        </Text>
                      </Space>
                    </div>
                  </div>

                  <Divider />

                  <Title level={4} style={{ textAlign: 'center', marginBottom: '20px', color: '#fa8c16' }}>
                    🔍 交易验证
                  </Title>

                  <Alert
                    message="两种验证方式"
                    description={
                      <div>
                        <strong>方式1（推荐）：</strong> 点击"自动检测支付"按钮，系统会扫描您的收款地址<br/>
                        <strong>方式2：</strong> 手动复制钱包中的交易哈希进行验证
                      </div>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: '20px' }}
                  />

                  {/* 自动检测按钮 */}
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <Button
                      type="primary"
                      size="large"
                      loading={autoDetecting}
                      onClick={handleAutoDetect}
                      style={{
                        background: '#52c41a',
                        borderColor: '#52c41a',
                        marginBottom: '8px'
                      }}
                    >
                      🔍 自动检测支付
                    </Button>
                    {lastChecked && (
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        上次检查: {lastChecked.toLocaleTimeString()}
                      </div>
                    )}
                  </div>

                  <Divider>或手动输入交易哈希</Divider>

                  <Form onFinish={handleVerifyTransaction} layout="vertical">
                    <Form.Item
                      label="交易哈希 (Transaction Hash)"
                      name="txHash"
                      rules={[
                        { required: true, message: '请输入交易哈希' },
                        {
                          pattern: /^0x[a-fA-F0-9]{64}$/,
                          message: '请输入有效的以太坊交易哈希'
                        }
                      ]}
                      extra="在钱包交易记录中找到哈希并复制粘贴"
                    >
                      <Input
                        placeholder="0x..."
                        size="large"
                        autoComplete="off"
                      />
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={verifying}
                        size="large"
                        style={{ background: '#52c41a', borderColor: '#52c41a' }}
                      >
                        验证交易并激活服务
                      </Button>
                    </Form.Item>
                  </Form>

                  <div style={{ textAlign: 'center', marginTop: '24px' }}>
                    <Button onClick={handleReset}>
                      取消并创建新订单
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card style={{ marginTop: '20px' }}>
          <Title level={4}>📖 使用说明</Title>
          <Paragraph>
            <ol>
              <li><strong>创建订单：</strong>选择支付金额和币种（ETH更便宜）</li>
              <li><strong>扫码支付：</strong>使用任意 ETH 钱包扫码或直接转账到显示的地址</li>
              <li><strong>自动检测：</strong>点击"自动检测支付"让系统扫描您的收款地址</li>
              <li><strong>手动验证：</strong>或从钱包复制交易哈希进行验证</li>
              <li><strong>激活服务：</strong>验证成功后自动获得访问令牌</li>
            </ol>
          </Paragraph>

          <Divider />

          <Title level={5}>🚀 自动检测功能</Title>
          <Paragraph style={{ color: '#666' }}>
            <strong>什么是自动检测？</strong><br/>
            系统会扫描您的收款地址，查找最近的匹配金额交易，无需手动复制哈希。
            <br/><br/>
            <strong>优势：</strong>
            <ul>
              <li>✅ 无需手动复制哈希</li>
              <li>✅ 降低用户操作错误</li>
              <li>✅ 更流畅的用户体验</li>
            </ul>
          </Paragraph>

          <Divider />

          <Title level={5}>🔧 支持的钱包</Title>
          <Paragraph>
            <ul>
              <li><strong>浏览器钱包:</strong> MetaMask, Coinbase Wallet</li>
              <li><strong>移动钱包:</strong> Trust Wallet, MetaMask Mobile</li>
              <li><strong>硬件钱包:</strong> Ledger, Trezor (推荐)</li>
              <li><strong>去中心化交易所:</strong> Uniswap, 1inch</li>
            </ul>
          </Paragraph>
        </Card>
      </div>
    </div>
  );
}

export default Web3Payment;
