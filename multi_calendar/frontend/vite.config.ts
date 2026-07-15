import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Shipped demo app credentials (publisher-registered) act as defaults; a
// local ../.env overrides them via Vite's envDir. Only the two public IDs
// are exposed to the browser (envPrefix) — client secrets never match.
try {
  const shipped = JSON.parse(readFileSync(resolve(__dirname, '../demo_credentials.json'), 'utf8'))
  for (const key of ['GOOGLE_CLIENT_ID', 'FEISHU_APP_ID']) {
    if (!process.env[key] && typeof shipped[key] === 'string' && shipped[key]) {
      process.env[key] = shipped[key]
    }
  }
} catch {
  /* no shipped credentials */
}

export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '..'),
  envPrefix: ['VITE_', 'GOOGLE_CLIENT_ID', 'FEISHU_APP_ID'],
  server: {
    port: 5174,
    proxy: {
      // /api/* → Skardi server. Pipelines execute at /{name}/execute —
      // skardi is the only backend.
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
