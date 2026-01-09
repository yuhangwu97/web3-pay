import React from 'react';

interface PaymentSuccessProps {
  orderId: string;
  amount: number;
  tokenType: string;
  networkName: string;
  onBackToHome: () => void;
}

const PaymentSuccess: React.FC<PaymentSuccessProps> = ({
  orderId,
  amount,
  tokenType,
  networkName,
  onBackToHome
}) => {
  return (
    <div className="payment-success">
      {/* 步骤指示器 */}
      <div className="steps">
        <div className="step completed">
          <div className="step-number">1</div>
          <div className="step-content">
            <div className="step-title">创建支付订单</div>
            <div className="step-description">订单已创建</div>
          </div>
        </div>

        <div className="step completed">
          <div className="step-number">2</div>
          <div className="step-content">
            <div className="step-title">支付确认</div>
            <div className="step-description">支付已完成</div>
          </div>
        </div>

        <div className="step completed">
          <div className="step-number">3</div>
          <div className="step-content">
            <div className="step-title">支付成功</div>
            <div className="step-description">服务已激活</div>
          </div>
        </div>
      </div>

      {/* 成功图标和消息 */}
      <div className="success-content">
        <div className="success-icon">🎉</div>
        <h2 className="success-title">支付成功！</h2>
        <p className="success-message">
          您的支付已确认，服务已成功激活
        </p>

        {/* 支付详情 */}
        <div className="success-details">
          <div className="detail-item">
            <span className="label">订单号:</span>
            <span className="value">{orderId}</span>
          </div>
          <div className="detail-item">
            <span className="label">支付金额:</span>
            <span className="value amount">{amount} {tokenType}</span>
          </div>
          <div className="detail-item">
            <span className="label">区块链网络:</span>
            <span className="value">{networkName}</span>
          </div>
          <div className="detail-item">
            <span className="label">支付时间:</span>
            <span className="value">{new Date().toLocaleString()}</span>
          </div>
        </div>

        {/* 后续操作提示 */}
        <div className="next-steps">
          <h3>📋 接下来您可以：</h3>
          <ul>
            <li>查看您的服务激活状态</li>
            <li>开始使用已购买的服务</li>
            <li>在订单历史中查看此交易</li>
            <li>分享您的支付体验</li>
          </ul>
        </div>

        {/* 操作按钮 */}
        <div className="success-actions">
          <button
            className="button primary"
            onClick={onBackToHome}
          >
            🏠 返回首页
          </button>
          <button
            className="button secondary"
            onClick={() => window.print()}
          >
            🖨️ 打印收据
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
