import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // /api/* → Skardi server (VITE_API_BACKEND=skardi, default)
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // /rest/* → Traditional TypeScript backend (VITE_API_BACKEND=traditional)
      '/rest': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rest/, ''),
      },
      // /supa/* → Supabase Express backend (VITE_API_BACKEND=supabase)
      '/supa': {
        target: 'http://localhost:8083',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supa/, ''),
      },
    },
  },
})
