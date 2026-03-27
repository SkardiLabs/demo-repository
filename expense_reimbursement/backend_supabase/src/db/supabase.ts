// ── Supabase client singleton ─────────────────────────────────────────────
// Replaces db/mysql.ts + db/mongo.ts from the traditional backend.
// One client, one connection string — all tables and RPC functions are
// accessible via the Supabase PostgREST API.
//
// Local development (Supabase CLI):
//   supabase start
//   → URL:      http://localhost:54321
//   → anon key: printed by `supabase start` (also in supabase/.env)
//
// Cloud:
//   Set SUPABASE_URL and SUPABASE_ANON_KEY from your Supabase project settings.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.SUPABASE_URL      ?? 'http://localhost:54321'
const supabaseKey  = process.env.SUPABASE_ANON_KEY ?? 'your-local-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)
