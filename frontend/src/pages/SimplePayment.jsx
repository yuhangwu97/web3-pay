import React, { useState } from 'react';
import { Card, Form, Input, Select, Button, message, Typography, Space, Alert, Divider } from 'antd';
import { createPayment, getPaymentStatus } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

function SimplePayment() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const handleSubmit = async (values) => {
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

  const handleCheckStatus = async () => {
    if (!paymentData?.orderId) return;

    setCheckingStatus(true);
    try {
      const result = await getPaymentStatus(paymentData.orderId);
      if (result.success) {
        if (result.data?.orderStatus === 'activated') {
          message.success('支付成功！服务已激活');
          // 这里可以跳转到成功页面或显示令牌
        } else {
          message.info(`当前状态: ${result.data?.orderStatus || '等待支付'}`);
        }
      } else {
        message.error('检查状态失败');
      }
    } catch (error) {
      message.error('检查状态失败，请稍后重试');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setPaymentData(null);
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
            🚀 简易 Web3 支付
          </Title>

          <Alert
            message="NOWPayments 界面优化版"
            description="由于 NOWPayments 官方界面存在问题，我们提供了简化的直接支付方式。直接向地址转账，系统自动确认。"
            type="info"
            showIcon
            style={{ marginBottom: '24px' }}
          />

          {!paymentData ? (
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                currency: 'eth',
                amount: '1.00'
              }}
            >
              <Form.Item
                label="支付金额 (USD)"
                name="amount"
                rules={[
                  { required: true, message: '请输入支付金额' },
                  { pattern: /^\d+(\.\d{1,2})?$/, message: '请输入有效的金额' },
                  {
                    validator: (_, value) => {
                      const amount = parseFloat(value);
                      if (!value || isNaN(amount)) {
                        return Promise.reject(new Error('请输入有效的金额'));
                      }
                      if (amount < 1.0) {
                        return Promise.reject(new Error('支付金额不能少于 $1.00'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
                extra="最小支付金额：$1.00"
              >
                <Input placeholder="例如: 1.00" type="number" min="1" step="0.001" size="large" />
              </Form.Item>

              <Form.Item
                label="支付币种"
                name="currency"
                rules={[{ required: true, message: '请选择支付币种' }]}
              >
                <Select size="large">
                  <Option value="eth">ETH (以太坊)</Option>
                  <Option value="usdt">USDT (ERC-20)</Option>
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
              <Title level={4} style={{ textAlign: 'center', marginBottom: '20px' }}>
                📋 订单信息
              </Title>

              <div style={{ marginBottom: '24px' }}>
                <Text strong>订单号: </Text><Text code>{paymentData.orderId}</Text>
                <br />
                <Text strong>支付金额: </Text><Text>{paymentData.amount} USD</Text>
                <br />
                <Text strong>支付币种: </Text><Text>{paymentData.currency}</Text>
              </div>

              <Divider />

              <Title level={4} style={{ textAlign: 'center', marginBottom: '20px', color: '#52c41a' }}>
                🎯 直接支付信息
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

                <div style={{ textAlign: 'center' }}>
                  <Space>
                    <Button
                      type="primary"
                      size="large"
                      style={{
                        background: '#52c41a',
                        borderColor: '#52c41a'
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText(paymentData.payAddress);
                        message.success('地址已复制！请在钱包中粘贴');
                      }}
                    >
                      📋 复制地址
                    </Button>

                    <Button
                      type="default"
                      size="large"
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        borderColor: 'rgba(255,255,255,0.3)',
                        color: 'white'
                      }}
                      onClick={handleCheckStatus}
                      loading={checkingStatus}
                    >
                      🔍 检查支付状态
                    </Button>
                  </Space>
                </div>
              </div>

              <Alert
                message="支付提示"
                description={
                  <ul>
                    <li>复制上方地址到您的钱包 (MetaMask, Trust Wallet, etc.)</li>
                    <li>确保发送正确的金额和代币类型</li>
                    <li>交易确认后，点击"检查支付状态"按钮</li>
                    <li>系统会在支付确认后自动激活您的服务</li>
                  </ul>
                }
                type="success"
                showIcon
              />

              <div style={{ textAlign: 'center', marginTop: '24px' }}>
                <Button onClick={handleReset}>
                  创建新订单
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card style={{ marginTop: '20px' }}>
          <Title level={4}>支持的钱包</Title>
          <Paragraph>
            <ul>
              <li><strong>浏览器钱包:</strong> MetaMask, Coinbase Wallet, Trust Wallet</li>
              <li><strong>移动端:</strong> MetaMask App, Trust Wallet, Coinbase Wallet</li>
              <li><strong>硬件钱包:</strong> Ledger, Trezor (通过连接软件)</li>
              <li><strong>交易所:</strong> Binance, OKX, Coinbase 等支持提币的交易所</li>
            </ul>
          </Paragraph>
        </Card>
      </div>
    </div>
  );
}

export default SimplePayment;




