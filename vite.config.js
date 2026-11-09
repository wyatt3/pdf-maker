import 'dotenv/config'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiPort = Number(process.env.PORT) || 3000
const devPort = Number(process.env.VITE_PORT) || 5173

export default defineConfig({
  plugins: [vue()],
  server: {
    port: devPort,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true
      }
    }
  }
})
