import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')
  return {
  plugins: [react()],
  envDir: __dirname,
  envPrefix: 'VITE_',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8080', changeOrigin: true },
    },
  },
  }
})
