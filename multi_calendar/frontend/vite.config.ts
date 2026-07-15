import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Read the shared multi_calendar/.env (operator-provided provider apps) so the
// frontend knows the Google client_id for the consent redirect. Only the ID is
// exposed — the client secret stays with the sync agent.
function sharedEnv(key: string): string {
  try {
    const text = readFileSync(resolve(__dirname, '../.env'), 'utf8')
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? sharedEnv('GOOGLE_CLIENT_ID')),
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
