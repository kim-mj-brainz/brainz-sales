import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 추후 백엔드 연동 시 server.proxy 로 /api 프록시 설정
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
