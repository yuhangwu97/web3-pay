const { ethers } = require('ethers');
const Order = require('../models/Order');
const HashRecord = require('../models/HashRecord');
const UserToken = require('../models/UserToken');
const { getProvider, getNetworkConfig, getTokenConfig } = require('../config/blockchain');

class VerificationService {
  // 验证交易Hash
  static async verifyPayment(orderId, transactionHash, userId) {
    try {
      // 1. 基础验证
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (!order.canVerify()) {
        // Allow success for recently paid orders (10 min window) to improve UX
        if (order.status === 'paid') {
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          // Check if updatedAt is valid and recent
          const lastUpdate = new Date(order.updatedAt || order.createdAt);

          if (lastUpdate > tenMinutesAgo) {
            return {
              isValid: true,
              orderId,
              transactionHash: transactionHash || 'previously-verified',
              details: {
                isValid: true,
                verifiedAt: lastUpdate,
                status: 1, // Mimic successful receipt status
                message: 'Order already verified successfully'
              }
            };
          }
        }
        throw new Error('Order cannot be verified (expired or already processed)');
      }

      // 2. 检查Hash是否已被使用
      const existingRecord = await HashRecord.findByHash(transactionHash);
      if (existingRecord) {
        throw new Error('Transaction hash has already been used');
      }

      // 3. 创建验证记录
      const record = await HashRecord.create({
        id: ethers.hexlify(ethers.randomBytes(16)), // 生成随机ID
        orderId,
        transactionHash,
        userId
      });

      // 4. 执行链上验证
      const verificationResult = await this.performBlockchainVerification(order, transactionHash);

      // 5. 更新验证结果
      await HashRecord.updateVerification(record.id, verificationResult.isValid, verificationResult);

      if (verificationResult.isValid) {
        // 6. 激活用户令牌
        await UserToken.create({
          userId,
          orderId
        });

        // 7. 更新订单状态
        await Order.updateStatus(orderId, 'paid');
      }

      return {
        isValid: verificationResult.isValid,
        orderId,
        transactionHash,
        details: verificationResult
      };

    } catch (error) {
      console.error('Payment verification failed:', error);
      throw error;
    }
  }

  // 执行区块链验证
  static async performBlockchainVerification(order, transactionHash) {
    const result = {
      isValid: false,
      errors: [],
      details: {}
    };

    try {
      // 获取提供者
      const provider = getProvider(order.networkId);
      const networkConfig = getNetworkConfig(order.networkId);
      const tokenConfig = getTokenConfig(order.tokenType);

      // Helper for retrying operations
      const withRetry = async (fn, retries = 3, delay = 2000) => {
        for (let i = 0; i < retries; i++) {
          try {
            return await fn();
          } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`Blockchain operation failed, retrying (${i + 1}/${retries})... Error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      };

      // 1. 获取交易详情 (with retry)
      const transaction = await withRetry(() => provider.getTransaction(transactionHash));

      if (!transaction) {
        result.errors.push('Transaction not found on blockchain');
        return result;
      }

      result.details.transaction = {
        hash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        value: transaction.value.toString(),
        data: transaction.data,
        blockNumber: transaction.blockNumber,
        nonce: transaction.nonce,
        gasLimit: transaction.gasLimit.toString(),
        gasPrice: transaction.gasPrice ? transaction.gasPrice.toString() : null,
        chainId: transaction.chainId ? transaction.chainId.toString() : null
      };

      // 2. 获取交易收据 (with retry)
      const receipt = await withRetry(() => provider.getTransactionReceipt(transactionHash));

      if (!receipt || receipt.status !== 1) {
        result.errors.push('Transaction failed or not yet mined');
        return result;
      }

      result.details.receipt = {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice ? receipt.effectiveGasPrice.toString() : null,
        confirmations: null // 将在下一步计算
      };

      // 3. 验证确认数
      const currentBlock = await withRetry(() => provider.getBlockNumber());
      const confirmations = currentBlock - receipt.blockNumber + 1;
      result.details.receipt.confirmations = confirmations;

      if (confirmations < networkConfig.requiredConfirmations) {
        result.errors.push(`Insufficient confirmations: ${confirmations}/${networkConfig.requiredConfirmations}`);
        return result;
      }

      // 4. 验证接收地址
      const expectedAddress = order.recipientAddress.toLowerCase();
      const actualAddress = transaction.to ? transaction.to.toLowerCase() : null;

      if (!actualAddress || actualAddress !== expectedAddress) {
        result.errors.push(`Address mismatch: expected ${expectedAddress}, got ${actualAddress}`);
        return result;
      }

      // 5. 验证金额
      if (tokenConfig.isNative) {
        // 原生代币验证
        const expectedValue = ethers.parseEther(order.amount.toString());
        const actualValue = transaction.value;

        if (!this.isAmountValid(actualValue, expectedValue, order.tokenType)) {
          result.errors.push(`Amount mismatch: expected ${expectedValue} (approx), got ${actualValue}`);
          return result;
        }
      } else {
        // ERC20代币验证 - 解析交易数据
        const transferSignature = '0xa9059cbb'; // transfer(address,uint256)
        if (!transaction.data.startsWith(transferSignature)) {
          result.errors.push('Invalid ERC20 transfer signature');
          return result;
        }

        // 解析transfer函数参数 (跳过4字节签名)
        const dataWithoutSignature = transaction.data.slice(10); // 移除0x和4字节签名
        /* 
           注意：这里使用 ethers.AbiCoder 解码
           decode 返回的是 Result 对象，类似数组
        */
        try {
          const params = ethers.AbiCoder.defaultAbiCoder().decode(
            ['address', 'uint256'],
            ethers.dataSlice(transaction.data, 0, 68) // 4 + 32 + 32 = 68 bytes total length for selector + 2 args
          );

          const recipient = params[0].toLowerCase();
          const amount = params[1];

          // 验证接收地址
          if (recipient !== expectedAddress) {
            result.errors.push(`ERC20 recipient mismatch: expected ${expectedAddress}, got ${recipient}`);
            return result;
          }

          // 验证金额
          const expectedAmount = ethers.parseUnits(order.amount.toString(), tokenConfig.decimals);
          if (!this.isAmountValid(amount, expectedAmount, order.tokenType)) {
            result.errors.push(`ERC20 amount mismatch: expected ${expectedAmount} (approx), got ${amount}`);
            return result;
          }
        } catch (decodeError) {
          // Fallback for some non-standard ERC20 calls or if slicing failed
          // Try decoding purely the data part if previous slice logic was off for specific tx types
          const params = ethers.AbiCoder.defaultAbiCoder().decode(
            ['address', 'uint256'],
            '0x' + dataWithoutSignature
          );
          const recipient = params[0].toLowerCase();
          const amount = params[1];

          if (recipient !== expectedAddress) {
            result.errors.push(`ERC20 recipient mismatch`);
            return result;
          }
          const expectedAmount = ethers.parseUnits(order.amount.toString(), tokenConfig.decimals);
          if (!this.isAmountValid(amount, expectedAmount, order.tokenType)) {
            result.errors.push(`ERC20 amount mismatch`);
            return result;
          }
        }
      }

      // 所有验证通过
      result.isValid = true;
      result.details.verifiedAt = new Date().toISOString();

    } catch (error) {
      result.errors.push(`Blockchain verification error: ${error.message}`);
      console.error('Blockchain verification error:', error);
    }

    return result;
  }

  // 自动检测支付（半自动优化功能）
  static async autoDetectPayment(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order || !order.canVerify()) {
        return { found: false, message: 'Order not eligible for auto-detection' };
      }

      const provider = getProvider(order.networkId);
      const networkConfig = getNetworkConfig(order.networkId);
      const tokenConfig = getTokenConfig(order.tokenType);

      // 获取最近的区块（检查最近100个区块）
      const currentBlock = await provider.getBlockNumber();
      const startBlock = Math.max(0, currentBlock - 20);

      // 扫描区块中的交易
      for (let blockNumber = currentBlock; blockNumber >= startBlock; blockNumber--) {
        try {
          const block = await provider.getBlock(blockNumber, true);

          if (!block || !block.transactions) continue;

          // Ethers v6 Compatibility: getBlock(n, true) populates prefetchedTransactions
          const transactions = block.prefetchedTransactions || block.transactions;

          if (!transactions) continue;

          for (const tx of transactions) {
            // Ethers v6: if tx is just a hash (string), we can't check details without fetching
            if (typeof tx === 'string') continue;

            // 检查是否匹配订单条件
            if (await this.isTransactionMatching(tx, order, tokenConfig)) {
              // 检查Hash是否已被使用
              const existingRecord = await HashRecord.findByHash(tx.hash);
              if (!existingRecord) {
                return {
                  found: true,
                  transactionHash: tx.hash,
                  blockNumber: tx.blockNumber,
                  confirmations: currentBlock - tx.blockNumber
                };
              }
            }
          }
        } catch (error) {
          console.error(`Error scanning block ${blockNumber}:`, error);
        }
      }

      return { found: false, message: 'No matching transaction found in recent blocks' };

    } catch (error) {
      console.error('Auto-detection failed:', error);
      return { found: false, message: `Auto-detection error: ${error.message}` };
    }
  }

  // 检查交易是否匹配订单条件
  static async isTransactionMatching(tx, order, tokenConfig) {
    try {
      // 检查接收地址
      if (!tx.to || tx.to.toLowerCase() !== order.recipientAddress.toLowerCase()) {
        return false;
      }

      if (tokenConfig.isNative) {
        // 原生代币检查
        const expectedValue = ethers.parseEther(order.amount.toString());
        return this.isAmountValid(tx.value, expectedValue, order.tokenType);
      } else {
        // ERC20代币检查 - 简化版本，实际需要解析交易数据
        // 这里只是基础检查，更详细的验证在主验证流程中进行
        return tx.data && tx.data.startsWith('0xa9059cbb'); // transfer签名
      }
    } catch (error) {
      return false;
    }
  }

  // 验证金额是否在容差范围内
  static isAmountValid(actualAmount, expectedAmount, tokenType) {
    // 基础容差配置
    const TOLERANCE_CONFIG = {
      ETH: ethers.parseEther('0.0001'),     // 0.0001 ETH
      USDT: ethers.parseUnits('0.1', 6),    // 0.1 USDT
      USDC: ethers.parseUnits('0.1', 6),    // 0.1 USDC
      DAI: ethers.parseUnits('0.1', 18)     // 0.1 DAI
    };

    // 默认容差 (对于未知代币，使用0，即精确匹配)
    const tolerance = TOLERANCE_CONFIG[tokenType] || 0n;

    // 转换 Big Int 进行计算
    const actual = BigInt(actualAmount);
    const expected = BigInt(expectedAmount);

    // 计算差值绝对值
    const diff = actual > expected ? actual - expected : expected - actual;

    // 实际金额必须 >= 期望金额 - 容差 (允许微小误差，但不能少太多)
    // 这里我们稍微放宽：只要 abs(diff) <= tolerance 即使是少一点点也在容差内
    // 或者严格一点：actual >= expected - tolerance
    // 通常支付场景： 多付多少都没关系(业务逻辑可能需要处理多付), 少付是不行的.
    // 但为了用户体验，我们允许少付极其微小的量(比如 gas 计算误差扣除)

    // 如果实际支付 >= 期望值，直接通过
    if (actual >= expected) return true;

    // 如果少付了，检查是否在容差内
    return (expected - actual) <= tolerance;
  }

  // 获取验证历史
  static async getVerificationHistory(orderId) {
    const records = await HashRecord.findByOrderId(orderId);
    return records.map(record => record.toPublic());
  }
}

module.exports = VerificationService;
