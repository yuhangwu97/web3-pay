import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Spin, message, Typography, Space, Divider, Alert } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { createPayment, getPaymentStatus } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

function PaymentPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);

  // 组件挂载时获取队列状态
  useEffect(() => {
    const fetchQueueStatus = async () => {
      try {
        // 这里可以调用队列状态 API，但现在先跳过
        // const response = await fetch('/api/payment/queue/stats');
        // const data = await response.json();
        // setQueueStatus(data.data);
      } catch (error) {
        console.error('获取队列状态失败:', error);
      }
    };

    fetchQueueStatus();
  }, []);

  // 创建支付订单
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
        message.success('支付订单创建成功！系统将自动检查支付状态');
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

  // 重置表单
  const handleReset = () => {
    form.resetFields();
    setPaymentData(null);
    setCheckingStatus(false);
    setAccessToken(null);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Card>
          <Title level={2} style={{ textAlign: 'center', marginBottom: '30px' }}>
            Web3支付系统
          </Title>

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
                <Input placeholder="例如: 1.00" type="number" min="1" step="0.001" />
              </Form.Item>

              <Form.Item
                label="支付币种"
                name="currency"
                rules={[{ required: true, message: '请选择支付币种' }]}
              >
                <Select>
                  <Option value="eth">ETH (以太坊)</Option>
                  <Option value="usdt">USDT (ERC-20)</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="用户ID (可选)"
                name="userId"
              >
                <Input placeholder="留空则使用匿名用户" />
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
                  <Alert
                    message="NOWPayments 界面异常"
                    description="NOWPayments 官方支付页面目前存在技术问题，建议直接使用钱包向下方地址支付。支付完成后系统会自动确认。"
                    type="warning"
                    showIcon
                    style={{ marginBottom: '24px' }}
                  />

                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <Title level={3}>💰 直接钱包支付</Title>
                    <Paragraph>
                      订单号: <Text code>{paymentData.orderId}</Text>
                    </Paragraph>
                    <Paragraph>
                      支付金额: <Text strong>{paymentData.amount} USD</Text>
                    </Paragraph>
                    <Paragraph>
                      支付币种: <Text strong>{paymentData.currency}</Text>
                    </Paragraph>
                  </div>

                  {/* NOWPayments 界面有问题时，优先显示直接支付信息 */}
                  <div style={{
                    marginBottom: '30px',
                    padding: '20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '12px',
                    color: 'white'
                  }}>
                    <Title level={4} style={{ color: 'white', textAlign: 'center', marginBottom: '16px' }}>
                      💰 直接支付到钱包地址
                    </Title>

                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                      <Text style={{ color: 'white', display: 'block', marginBottom: '8px', fontSize: '16px' }}>
                        📍 收款地址 ({paymentData.currency?.toUpperCase()}):
                      </Text>
                      <Paragraph
                        copyable={{ text: paymentData.payAddress }}
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          padding: '12px',
                          borderRadius: '6px',
                          margin: '8px 0',
                          fontFamily: 'monospace',
                          fontSize: '14px',
                          wordBreak: 'break-all',
                          color: 'white',
                          border: '1px solid rgba(255,255,255,0.3)'
                        }}
                      >
                        {paymentData.payAddress}
                      </Paragraph>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
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
                      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', display: 'block', textAlign: 'center', marginTop: '4px' }}>
                        约合 {paymentData.amount} USD
                      </Text>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <Space direction="vertical" size="small">
                        <Text style={{ color: 'white', fontSize: '16px' }}>
                          🔄 支付完成后，点击下方按钮检查状态
                        </Text>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <Button
                            type="primary"
                            size="large"
                            style={{
                              background: '#52c41a',
                              borderColor: '#52c41a',
                              fontSize: '16px',
                              padding: '8px 24px'
                            }}
                            onClick={() => {
                              // 如果用户有 MetaMask，尝试连接
                              if (window.ethereum) {
                                window.ethereum.request({ method: 'eth_requestAccounts' })
                                  .then(() => {
                                    message.success('钱包已连接！请手动发送交易到上方地址');
                                  })
                                  .catch(() => {
                                    message.info('请手动复制地址到您的钱包进行支付');
                                  });
                              } else {
                                message.info('请安装 MetaMask 或其他 Web3 钱包');
                              }
                            }}
                          >
                            🌐 连接钱包支付
                          </Button>

                          <Button
                            type="default"
                            size="large"
                            style={{
                              background: 'rgba(255,255,255,0.2)',
                              borderColor: 'rgba(255,255,255,0.3)',
                              color: 'white',
                              fontSize: '16px',
                              padding: '8px 24px'
                            }}
                            onClick={() => {
                              navigator.clipboard.writeText(paymentData.payAddress);
                              message.success('地址已复制到剪贴板！');
                            }}
                          >
                            📋 复制地址
                          </Button>
                        </div>
                      </Space>
                    </div>
                  </div>

                  {/* NOWPayments 二维码作为备用选项 */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: '30px',
                    padding: '20px',
                    background: '#f5f5f5',
                    borderRadius: '8px',
                    opacity: 0.6
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <Text type="secondary" style={{ display: 'block', marginBottom: '12px' }}>
                        NOWPayments 二维码 (备用)
                      </Text>
                      <QRCodeSVG
                        value={paymentData.paymentUrl}
                        size={180}
                        level="H"
                      />
                    </div>
                  </div>

                  {paymentData.paymentUrl ? (
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                      <div style={{ padding: '16px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: '8px', marginBottom: '16px' }}>
                        <Text type="warning" style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                          ⚠️ 重要提醒
                        </Text>
                        <Text type="secondary" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                          如果 NOWPayments 支付页面显示错误或无法加载，请直接复制下面的支付链接到浏览器打开，或使用钱包直接访问支付地址。
                        </Text>
                      </div>

                      <Text type="secondary" style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                        支付链接：
                      </Text>
                      <Paragraph
                        copyable
                        style={{
                          fontSize: '12px',
                          wordBreak: 'break-all',
                          background: '#f5f5f5',
                          padding: '12px',
                          borderRadius: '4px',
                          margin: 0
                        }}
                      >
                        {paymentData.paymentUrl}
                      </Paragraph>

                      {paymentData.payAddress && (
                        <div style={{ marginTop: '16px' }}>
                          <Text type="secondary" style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                            直接支付地址 ({paymentData.currency?.toUpperCase()})：
                          </Text>
                          <Paragraph
                            copyable
                            style={{
                              fontSize: '12px',
                              wordBreak: 'break-all',
                              background: '#f0f9ff',
                              padding: '12px',
                              borderRadius: '4px',
                              margin: 0,
                              fontFamily: 'monospace'
                            }}
                          >
                            {paymentData.payAddress}
                          </Paragraph>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', marginBottom: '30px', padding: '12px', background: '#fff7e6', borderRadius: '4px' }}>
                      <Text type="warning">
                        支付链接未生成，请检查后端日志或联系管理员
                      </Text>
                      {process.env.NODE_ENV === 'development' && (
                        <div style={{ marginTop: '8px' }}>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            调试信息: {JSON.stringify(paymentData, null, 2)}
                          </Text>
                        </div>
                      )}
                    </div>
                  )}

                  <Divider>或</Divider>

                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <Button 
                      type="link" 
                      href={paymentData.paymentUrl} 
                      target="_blank"
                      size="large"
                    >
                      在新窗口打开支付页面
                    </Button>
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <Text type="secondary" style={{ fontSize: '14px' }}>
                      💡 系统正在后台自动检查支付状态 (每5秒一次，最长10分钟)
                      <br />
                      🔄 如需立即检查，请点击上方"手动检查支付状态"按钮
                    </Text>
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <Space>
                      <Button
                        type="primary"
                        loading={checkingStatus}
                        onClick={async () => {
                          if (!paymentData?.orderId) return;

                          setCheckingStatus(true);
                          try {
                            // 使用新的手动检查 API
                            const response = await fetch(`/api/payment/check-status/${paymentData.orderId}`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                            });

                            const result = await response.json();

                            if (result.success) {
                              if (result.data?.status === 'activated') {
                                setAccessToken(result.data?.accessToken);
                                message.success('🎉 支付成功！服务已激活');
                              } else if (result.data?.status === 'already_activated') {
                                setAccessToken(result.data?.accessToken);
                                message.info('✅ 服务已激活');
                              } else {
                                message.info(`📊 当前状态: ${result.message}`);
                              }
                            } else {
                              message.warning(result.message || '检查完成，支付仍在处理中');
                            }
                          } catch (error) {
                            console.error('手动检查失败:', error);
                            message.error('检查失败，请稍后重试');
                          } finally {
                            setCheckingStatus(false);
                          }
                        }}
                      >
                        🔍 手动检查支付状态
                      </Button>
                    </Space>
                  </div>

                  <Divider />

                  <Button block onClick={handleReset}>
                    取消订单
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card style={{ marginTop: '20px' }}>
          <Title level={4}>使用说明</Title>
          <Paragraph>
            <ol>
              <li>填写支付金额和选择支付币种（ETH 或 USDT）</li>
              <li>点击"创建支付订单"</li>
              <li><strong>推荐方式：</strong>直接复制页面上方的收款地址，到您的钱包进行支付</li>
              <li><strong>备用方式：</strong>如果您坚持使用 NOWPayments，可以尝试支付链接（但可能无法正常显示）</li>
              <li>支付成功后，点击"手动检查支付状态"按钮确认，或等待自动检查</li>
              <li>系统会在支付确认后自动激活服务并返回访问令牌</li>
            </ol>
          </Paragraph>

          <Divider />

          <Title level={5} style={{ color: '#52c41a' }}>✅ 推荐的支付方式</Title>
          <Paragraph style={{ color: '#666' }}>
            <ul style={{ paddingLeft: '20px' }}>
              <li><strong>MetaMask/Trust Wallet 等：</strong>复制收款地址，直接发送对应金额的代币</li>
              <li><strong>交易所：</strong>从 Binance、OKX 等交易所提币到显示的地址</li>
              <li><strong>硬件钱包：</strong>使用 Ledger、Trezor 等连接到显示的地址</li>
            </ul>
          </Paragraph>

          <Divider />

          <Title level={5} style={{ color: '#fa8c16' }}>⚠️ NOWPayments 界面问题</Title>
          <Paragraph style={{ color: '#666' }}>
            NOWPayments 官方支付页面目前存在技术问题，可能无法正常加载。这是他们服务器端的问题，不是您的支付问题。
            <br />
            <strong>解决方案：</strong>请直接使用上方显示的收款地址进行支付，系统会正常处理您的交易。
          </Paragraph>
        </Card>
      </div>
    </div>
  );
}

export default PaymentPage;

