import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, base, bsc } from '@reown/appkit/networks'
import App from './App.jsx'
import './index.css'

window.onerror = (msg, src, line) => {
  document.body.innerHTML = `<div style="color:red;padding:20px;font-family:monospace;background:#08090D;min-height:100vh"><h2>ERROR</h2><p>${msg}</p><p>Line: ${line}</p></div>`
}

try {
  const projectId = '04e568dc66c4fca618b6353fd50a0455'
  const networks = [base, mainnet, bsc]
  const wagmiAdapter = new WagmiAdapter({ networks, projectId })
  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata: {
      name: 'XANDRSCAN',
      description: 'AI Token Risk Intelligence',
      url: 'https://xandrscan.vercel.app',
      icons: ['https://xandrscan.vercel.app/favicon.ico'],
    },
    features: { analytics: false, email: false, socials: false },
    themeMode: 'dark',
  })
  const queryClient = new QueryClient()
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    </StrictMode>
  )
} catch(e) {
  document.body.innerHTML = `<div style="color:red;padding:20px;font-family:monospace;background:#08090D;min-height:100vh"><h2>INIT ERROR</h2><p>${e.message}</p><pre>${e.stack}</pre></div>`
}
