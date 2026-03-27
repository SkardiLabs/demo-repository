import { supabase } from '../db/supabase'
import type { Policy } from '../types'

// ── PolicyService ─────────────────────────────────────────────────────────
// Reads from the `policies` table in Supabase PostgreSQL.
//
// Compare with backend/src/services/policy-service.ts (traditional):
//   Traditional: MongoDB client, separate connection, no SQL join support.
//   Supabase:    same Supabase client as claims — policies are a plain table,
//                JOIN-able with claims and vendors in a single SQL expression.

export class PolicyService {

  async getByCategory(category: string): Promise<Policy | null> {
    const { data, error } = await supabase
      .from('policies')
      .select('*')
      .eq('category', category)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data as Policy | null
  }
}
