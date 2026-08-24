import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// 추후 백엔드 연동 시 server.proxy 로 /api 프록시 설정
const localHttpsPfx = new URL('./.cert/brainz-sales-dev.pfx', import.meta.url)
const https = fs.existsSync(localHttpsPfx)
  ? { pfx: fs.readFileSync(localHttpsPfx), passphrase: 'brainz-sales' }
  : undefined

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/brainz-sales/',
  server: {
    port: 5173,
    https,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
