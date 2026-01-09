const ethers = require('ethers');
const crypto = require('crypto');

// Web3 支付服务 - 处理区块链交易验证和合约调用
class Web3PaymentService {
  constructor() {
    // 使用Alchemy API Key（更稳定可靠）
    this.mainnetRpcUrl = process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/p5pg-XYUuOssmlPiTHwES';
    this.sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/p5pg-XYUuOssmlPiTHwES';
    this.contractAddress = process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
    this.privateKey = process.env.WALLET_PRIVATE_KEY; // 用于合约调用的私钥

    // 默认使用主网provider
    this.provider = new ethers.JsonRpcProvider(this.mainnetRpcUrl);

    // 初始化钱包（如果有私钥）
    if (this.privateKey) {
      this.wallet = new ethers.Wallet(this.privateKey, this.provider);
    }
  }

  /**
   * 根据链ID获取对应的RPC URL
   * @param {number} chainId - 区块链ID
   * @returns {string} RPC URL
   */
  getRpcUrl(chainId) {
    switch (chainId) {
      case 1:
        return this.mainnetRpcUrl;
      case 11155111:
        return this.sepoliaRpcUrl;
      default:
        // 默认使用主网
        return this.mainnetRpcUrl;
    }
  }

  /**
   * 根据链ID获取对应的provider
   * @param {number} chainId - 区块链ID
   * @returns {ethers.JsonRpcProvider} provider实例
   */
  getProvider(chainId) {
    const rpcUrl = this.getRpcUrl(chainId);
    return new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * 生成 EIP-681 支付链接
   * @param {string} toAddress - 收款地址
   * @param {string} amount - 金额
   * @param {string} chainId - 链ID (1=mainnet, 5=goerli, etc.)
   * @param {string} token - 代币类型 ('ETH' 或 'USDT')
   * @param {string} tokenAddress - ERC20代币合约地址（USDT时需要）
   * @returns {string} EIP-681 格式的支付链接
   */
  generatePaymentLink(toAddress, amount, chainId = '1', token = 'ETH', tokenAddress = null) {
    let payUri;

    if (token === 'ETH') {
      // ETH 支付格式: ethereum:0x123...@1?value=10000000000000000
      const amountInWei = ethers.parseEther(amount);
      payUri = `ethereum:${toAddress}@${chainId}?value=${amountInWei.toString()}`;
    } else if (token === 'USDT' && tokenAddress) {
      // USDT (ERC20) 支付格式: ethereum:0xTokenAddress@1/transfer?address=0xRecipient&uint256=1000000
      // 注意：USDT使用6位小数，所以1000000 = 1 USDT
      const amountInUnits = ethers.parseUnits(amount, 6); // USDT是6位小数
      payUri = `ethereum:${tokenAddress}@${chainId}/transfer?address=${toAddress}&uint256=${amountInUnits.toString()}`;
    } else {
      throw new Error(`不支持的代币类型: ${token}`);
    }

    return payUri;
  }

  /**
   * 验证交易 hash（增强版，包含防欺诈和确认检查）
   * @param {string} txHash - 交易哈希
   * @param {string} expectedTo - 期望的收款地址
   * @param {string} expectedAmount - 期望的金额
   * @param {string} token - 代币类型 ('ETH' 或 'USDT')
   * @param {string} tokenAddress - ERC20代币合约地址（USDT时需要）
   * @param {number} minConfirmations - 最少确认数（默认3）
   * @returns {Promise<Object>} 验证结果
   */
  async verifyTransaction(txHash, expectedTo, expectedAmount, token = 'ETH', tokenAddress = null, minConfirmations = 3, chainId = 1) {
    try {
      console.log(`🔍 开始验证交易: ${txHash}`);
      console.log(`📋 期望收款地址: ${expectedTo}`);
      console.log(`💰 期望金额: ${expectedAmount} ${token}`);
      console.log(`🛡️ 最少确认数: ${minConfirmations}`);
      console.log(`🌐 区块链网络: ${chainId === 1 ? 'Ethereum' : chainId === 11155111 ? 'Sepolia' : 'Unknown'}`);

      // 获取对应网络的provider
      const provider = this.getProvider(chainId);

      // 1. 检查Hash是否已被使用（防欺诈）
      const isHashUsed = await this.checkHashUsed(txHash);
      if (isHashUsed) {
        return {
          success: false,
          error: '该交易哈希已被使用过，请使用新的交易',
          code: 'HASH_ALREADY_USED'
        };
      }

      // 2. 获取交易详情
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        return {
          success: false,
          error: '交易不存在，请稍后再试',
          code: 'TX_NOT_FOUND'
        };
      }

      console.log(`✅ 交易存在 - From: ${tx.from}, To: ${tx.to}, Value: ${ethers.formatEther(tx.value)} ETH`);

      // 3. 获取交易收据并检查状态
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return {
          success: false,
          error: '交易收据不存在，交易可能尚未被打包',
          code: 'RECEIPT_NOT_FOUND'
        };
      }

      if (receipt.status !== 1) {
        return {
          success: false,
          error: '交易执行失败',
          code: 'TX_FAILED'
        };
      }

      // 4. 检查确认数（防止软分叉回滚）
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      console.log(`📦 区块信息 - 交易区块: ${receipt.blockNumber}, 当前区块: ${currentBlock}, 确认数: ${confirmations}`);

      if (confirmations < minConfirmations) {
        return {
          success: false,
          error: `确认数不足。当前: ${confirmations}, 需要: ${minConfirmations}。请等待约 ${(minConfirmations - confirmations) * 12} 秒`,
          code: 'INSUFFICIENT_CONFIRMATIONS',
          currentConfirmations: confirmations,
          requiredConfirmations: minConfirmations
        };
      }

      let isCorrectTo = false;
      let isCorrectAmount = false;
      let actualAmount = '0';

      if (token === 'ETH') {
        // 5a. ETH 验证逻辑
        const actualTo = tx.to?.toLowerCase();
        const expectedToLower = expectedTo.toLowerCase();
        isCorrectTo = actualTo === expectedToLower;

        if (!isCorrectTo) {
          console.log(`❌ 地址不匹配 - 实际: ${actualTo}, 期望: ${expectedToLower}`);
          return {
            success: false,
            error: `收款地址不正确。期望: ${expectedTo}, 实际: ${tx.to}`,
            code: 'WRONG_ADDRESS'
          };
        }

        // 验证金额
        actualAmount = ethers.formatEther(tx.value);
        isCorrectAmount = actualAmount === expectedAmount;

        if (!isCorrectAmount) {
          console.log(`❌ 金额不匹配 - 实际: ${actualAmount} ETH, 期望: ${expectedAmount} ETH`);
          return {
            success: false,
            error: `支付金额不正确。期望: ${expectedAmount} ETH, 实际: ${actualAmount} ETH`,
            code: 'WRONG_AMOUNT'
          };
        }

      } else if (token === 'USDT' && tokenAddress) {
        // 5b. USDT (ERC20) 验证逻辑
        // 检查是否是调用代币合约的交易
        const actualTo = tx.to?.toLowerCase();
        const expectedTokenAddress = tokenAddress.toLowerCase();
        isCorrectTo = actualTo === expectedTokenAddress;

        if (!isCorrectTo) {
          console.log(`❌ 代币合约地址不匹配 - 实际: ${actualTo}, 期望: ${expectedTokenAddress}`);
          return {
            success: false,
            error: `代币合约地址不正确。期望: ${tokenAddress}, 实际: ${tx.to}`,
            code: 'WRONG_TOKEN_CONTRACT'
          };
        }

        // 解析 ERC20 transfer 调用
        if (!tx.data || tx.data === '0x') {
          return {
            success: false,
            error: '这不是一个有效的ERC20转账交易',
            code: 'INVALID_ERC20_TX'
          };
        }

        try {
          // ERC20 transfer 函数签名: transfer(address,uint256)
          const iface = new ethers.Interface(['function transfer(address,uint256)']);
          const decoded = iface.decodeFunctionData('transfer', tx.data);

          const recipient = decoded[0].toLowerCase();
          const amount = decoded[1];

          const expectedRecipient = expectedTo.toLowerCase();
          const expectedAmountUnits = ethers.parseUnits(expectedAmount, 6); // USDT 6位小数

          isCorrectTo = recipient === expectedRecipient;
          isCorrectAmount = amount.toString() === expectedAmountUnits.toString();

          actualAmount = ethers.formatUnits(amount, 6);

          if (!isCorrectTo) {
            return {
              success: false,
              error: `USDT接收地址不正确。期望: ${expectedTo}, 实际: 0x${recipient}`,
              code: 'WRONG_USDT_RECIPIENT'
            };
          }

          if (!isCorrectAmount) {
            return {
              success: false,
              error: `USDT支付金额不正确。期望: ${expectedAmount} USDT, 实际: ${actualAmount} USDT`,
              code: 'WRONG_USDT_AMOUNT'
            };
          }

        } catch (decodeError) {
          console.error('解析ERC20交易数据失败:', decodeError);
          return {
            success: false,
            error: '无法解析ERC20转账数据，请确认这是有效的USDT转账',
            code: 'ERC20_DECODE_ERROR'
          };
        }

      } else {
        return {
          success: false,
          error: `不支持的代币类型: ${token}`,
          code: 'UNSUPPORTED_TOKEN'
        };
      }

      // 6. 记录使用的Hash（防重复使用）
      await this.markHashUsed(txHash, tx.from, expectedTo, actualAmount, token);

      console.log(`✅ 交易验证成功 - 确认数: ${confirmations}, 金额: ${actualAmount} ${token}`);

      return {
        success: true,
        transaction: {
          hash: txHash,
          from: tx.from,
          to: tx.to,
          value: actualAmount,
          token: token,
          blockNumber: receipt.blockNumber,
          confirmations: confirmations,
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: tx.gasPrice?.toString() || tx.maxFeePerGas?.toString() || '0',
          timestamp: Date.now()
        }
      };

    } catch (error) {
      console.error('验证交易时出错:', error);
      return {
        success: false,
        error: error.message || '验证交易失败',
        code: 'VERIFICATION_ERROR'
      };
    }
  }

  /**
   * 检查交易哈希是否已被使用（防欺诈）
   * @param {string} txHash - 交易哈希
   * @returns {Promise<boolean>} 是否已被使用
   */
  async checkHashUsed(txHash) {
    // 这里应该查询数据库检查Hash是否已被使用
    // 由于我们没有直接的数据库访问，这里返回false（表示未使用）
    // 在实际实现中，应该有数据库表存储已使用的交易哈希
    console.log(`🔍 检查Hash是否已使用: ${txHash}`);
    return false; // 临时实现
  }

  /**
   * 标记交易哈希为已使用
   * @param {string} txHash - 交易哈希
   * @param {string} from - 发送者地址
   * @param {string} to - 接收者地址
   * @param {string} amount - 金额
   * @param {string} token - 代币类型
   */
  async markHashUsed(txHash, from, to, amount, token) {
    // 这里应该将Hash存储到数据库中
    // 在实际实现中，应该有数据库表记录已处理的交易
    console.log(`✅ 标记Hash为已使用: ${txHash} (${amount} ${token})`);
  }

  /**
   * 调用合约激活用户服务
   * @param {string} userAddress - 用户地址
   * @param {string} orderId - 订单ID
   * @param {number} serviceDuration - 服务时长（天）
   * @returns {Promise<Object>} 合约调用结果
   */
  async activateUserService(userAddress, orderId, serviceDuration = 30) {
    try {
      if (!this.wallet) {
        throw new Error('未配置钱包私钥，无法调用合约');
      }

      console.log(`🔄 开始激活用户服务 - 用户: ${userAddress}, 订单: ${orderId}`);

      // 这里需要根据你的实际合约 ABI 和函数签名
      // 示例合约调用（需要根据你的合约修改）

      // 假设合约有 activateUser 函数
      const contractAbi = [
        "function activateUser(address user, string memory orderId, uint256 duration) external"
      ];

      const contract = new ethers.Contract(this.contractAddress, contractAbi, this.wallet);

      // 估算 gas
      const estimatedGas = await contract.activateUser.estimateGas(userAddress, orderId, serviceDuration);
      console.log(`⛽ 预估 Gas: ${estimatedGas.toString()}`);

      // 发送交易
      const tx = await contract.activateUser(userAddress, orderId, serviceDuration, {
        gasLimit: estimatedGas * 2n // 增加 100% buffer
      });

      console.log(`📤 合约调用交易已发送: ${tx.hash}`);

      // 等待交易确认
      const receipt = await tx.wait();
      console.log(`✅ 合约调用成功 - 区块: ${receipt.blockNumber}, Gas 使用: ${receipt.gasUsed.toString()}`);

      return {
        success: true,
        transaction: {
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status
        }
      };

    } catch (error) {
      console.error('激活用户服务失败:', error);
      return {
        success: false,
        error: error.message || '合约调用失败',
        code: 'CONTRACT_ERROR'
      };
    }
  }

  /**
   * 自动检测地址的最新交易（半自动优化）
   * @param {string} address - 收款地址
   * @param {string} expectedAmount - 期望金额
   * @param {string} token - 代币类型
   * @param {number} lookbackBlocks - 回溯区块数（默认10个区块）
   * @returns {Promise<Object|null>} 找到的匹配交易或null
   */
  async autoDetectPayment(address, expectedAmount, token = 'ETH', lookbackBlocks = 10, chainId = 1) {
    try {
      console.log(`🔍 开始自动检测 ${address} 的支付交易...`);
      console.log(`💰 期望金额: ${expectedAmount} ${token}`);

      const provider = this.getProvider(chainId);
      const currentBlock = await provider.getBlockNumber();
      const startBlock = currentBlock - lookbackBlocks;

      console.log(`📦 扫描区块范围: ${startBlock} - ${currentBlock}`);

      // 获取地址的交易历史（注意：这在公共RPC上可能有限制）
      // 在实际应用中，可能需要使用专门的索引服务如Covalent或The Graph

      // 临时实现：检查最近的几笔交易
      // 注意：这个实现是简化的，生产环境中应该使用更可靠的方法

      const transactions = [];

      // 这里应该使用更可靠的方法获取地址交易历史
      // 由于公共RPC限制，我们这里返回null表示未找到
      // 在生产环境中，可以：
      // 1. 使用付费的RPC服务（如Alchemy, Infura的付费计划）
      // 2. 使用区块链浏览器API（如Etherscan）
      // 3. 使用索引服务（如Covalent, Moralis）

      console.log(`⚠️ 自动检测功能需要配置专业的区块链数据服务`);
      console.log(`💡 建议使用: Alchemy, Infura Premium, 或 Etherscan API`);

      return null; // 临时返回null

    } catch (error) {
      console.error('自动检测支付失败:', error);
      return null;
    }
  }

  /**
   * 获取当前 gas 价格
   * @returns {Promise<Object>} Gas 价格信息
   */
  async getGasPrice(chainId = 1) {
    try {
      const provider = this.getProvider(chainId);
      const gasPrice = await provider.getFeeData();

      return {
        gasPrice: ethers.formatUnits(gasPrice.gasPrice, 'gwei'),
        maxFeePerGas: gasPrice.maxFeePerGas ? ethers.formatUnits(gasPrice.maxFeePerGas, 'gwei') : null,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? ethers.formatUnits(gasPrice.maxPriorityFeePerGas, 'gwei') : null
      };
    } catch (error) {
      console.error('获取 Gas 价格失败:', error);
      return null;
    }
  }

  /**
   * 检查钱包余额
   * @param {string} address - 钱包地址
   * @returns {Promise<string>} 余额（ETH）
   */
  async getBalance(address, chainId = 1) {
    try {
      const provider = this.getProvider(chainId);
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('获取余额失败:', error);
      return '0';
    }
  }
}

module.exports = new Web3PaymentService();
