const { ethers } = require('ethers');

// 网络配置
const NETWORKS = {
  ETHEREUM: {
    id: 1,
    name: 'Ethereum',
    rpcUrls: [
      process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth'
    ],
    requiredConfirmations: 3,
    nativeCurrency: 'ETH'
  },
  BASE: {
    id: 8453,
    name: 'Base',
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base.publicnode.com'
    ],
    requiredConfirmations: 1,
    nativeCurrency: 'ETH'
  },
  ARBITRUM: {
    id: 42161,
    name: 'Arbitrum',
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://rpc.ankr.com/arbitrum'
    ],
    requiredConfirmations: 1,
    nativeCurrency: 'ETH'
  },
  SEPOLIA: {
    id: 11155111,
    name: 'Sepolia',
    rpcUrls: [
      process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
      'https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID',
      'https://ethereum-sepolia.publicnode.com'
    ],
    requiredConfirmations: 1,
    nativeCurrency: 'ETH'
  }
};

// 代币配置
const TOKENS = {
  ETH: {
    symbol: 'ETH',
    decimals: 18,
    isNative: true
  },
  USDT: {
    symbol: 'USDT',
    decimals: 6,
    contractAddress: process.env.USDT_CONTRACT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    isNative: false
  },
  USDC: {
    symbol: 'USDC',
    decimals: 6,
    contractAddress: '0xA0b86a33E6441c86Cd40B2C6E1240F93b0c8c6c7',
    isNative: false
  }
};

// 创建提供者实例池
const providers = new Map();

const getProvider = (networkId) => {
  const network = Object.values(NETWORKS).find(n => n.id === networkId);
  if (!network) {
    throw new Error(`Unsupported network: ${networkId}`);
  }

  if (!providers.has(networkId)) {
    // 使用第一个RPC URL，失败时自动切换
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    providers.set(networkId, provider);
  }

  return providers.get(networkId);
};

// 获取网络配置
const getNetworkConfig = (networkId) => {
  return Object.values(NETWORKS).find(n => n.id === networkId);
};

// 获取代币配置
const getTokenConfig = (tokenSymbol) => {
  return TOKENS[tokenSymbol.toUpperCase()];
};

// 默认网络
const defaultChainId = parseInt(process.env.DEFAULT_CHAIN_ID || '8453');
const DEFAULT_NETWORK = Object.values(NETWORKS).find(n => n.id === defaultChainId) || NETWORKS.BASE;
const DEFAULT_TOKEN = TOKENS.ETH;

module.exports = {
  NETWORKS,
  TOKENS,
  getProvider,
  getNetworkConfig,
  getTokenConfig,
  DEFAULT_NETWORK,
  DEFAULT_TOKEN
};
