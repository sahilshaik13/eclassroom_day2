import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { createAppQueryClient } from '@/lib/queryClient'
import { setRealtimeQueryClient } from '@/lib/realtime'

const queryClient = createAppQueryClient()

// Set QueryClient for real-time module
setRealtimeQueryClient(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
