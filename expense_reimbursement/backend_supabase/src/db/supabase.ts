// ── PostgreSQL connection pool ────────────────────────────────────────────
// Uses node-postgres (pg) to connect directly to the pgvector/pg16 container.
// All services query via this shared pool.
//
// For a hosted Supabase project, set POSTGRES_URL to your project's
// "Direct connection" string from Settings → Database.
//
// Default: local pgvector container started by docker-compose (port 54322).

import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL
    ?? 'postgresql://postgres:postgres@localhost:54322/expense_db',
  max: 10,
})

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message)
})
