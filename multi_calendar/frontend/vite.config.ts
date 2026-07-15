import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Resolve provider app IDs for the consent redirects. Precedence: process
// env > local ../.env > shipped ../demo_credentials.json. Only public IDs
// reach the browser — client secrets stay with the sync agent.
function sharedCredential(key: string): string {
  if (process.env[key]) return process.env[key]!
  try {
    const text = readFileSync(resolve(__dirname, '../.env'), 'utf8')
    const m = text.match(new RegExp(`^${key}=(.+)$`, 'm'))
    if (m?.[1]?.trim()) return m[1].trim()
  } catch {
    /* no .env */
  }
  try {
    const shipped = JSON.parse(readFileSync(resolve(__dirname, '../demo_credentials.json'), 'utf8'))
    if (typeof shipped[key] === 'string') return shipped[key]
  } catch {
    /* no shipped credentials */
  }
  return ''
}

export default defineConfig({
  plugins: [react()],
  define: {
    __GOOGLE_CLIENT_ID__: JSON.stringify(sharedCredential('GOOGLE_CLIENT_ID')),
    __FEISHU_APP_ID__: JSON.stringify(sharedCredential('FEISHU_APP_ID')),
  },
  server: {
    port: 5174,
    proxy: {
      // /api/* → Skardi server. Pipelines execute at /{name}/execute and
      // jobs at /jobs/{name}/run — skardi is the only backend.
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
