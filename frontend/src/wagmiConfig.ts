import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'viem/chains'
import { metaMask } from '@wagmi/connectors'

const projectId = 'your-walletconnect-project-id' // 如果需要WalletConnect

export const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    metaMask(),
  ],
  transports: {
    [mainnet.id]: http('https://eth-mainnet.g.alchemy.com/v2/p5pg-XYUuOssmlPiTHwES'),
    [sepolia.id]: http('https://eth-sepolia.g.alchemy.com/v2/p5pg-XYUuOssmlPiTHwES'),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
