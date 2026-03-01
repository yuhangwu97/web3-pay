import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, base, arbitrum, polygon } from 'viem/chains'
import { metaMask } from '@wagmi/connectors'

const projectId = 'your-walletconnect-project-id' // 如果需要WalletConnect

export const config = createConfig({
  chains: [mainnet, sepolia, base, arbitrum, polygon],
  connectors: [
    metaMask(),
  ],
  transports: {
    [mainnet.id]: http('https://eth-mainnet.g.alchemy.com/v2/p5pg-XYUuOssmlPiTHwES'),
    [sepolia.id]: http('https://eth-sepolia.g.alchemy.com/v2/p5pg-XYUuOssmlPiTHwES'),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [polygon.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
