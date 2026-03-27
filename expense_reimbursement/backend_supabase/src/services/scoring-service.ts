import { supabase } from '../db/supabase'
import type { ClaimContext, ScoreResult } from '../types'

// ── ScoringService ────────────────────────────────────────────────────────
// Both operations delegate to PostgreSQL functions via supabase.rpc().
//
// Compare with backend/src/services/scoring-service.ts (traditional):
//   Traditional: 3-4 separate DB calls (MySQL + MongoDB) + TypeScript formula.
//   Supabase:    1 RPC call → single CTE query in PostgreSQL.
//
// get_claim_context() → JOIN claims + vendors + policies in one query.
// score_claim()       → CTE fetches claim/vendor/policy/prior-count and
//                       applies the scoring formula entirely in SQL.

export class ScoringService {

  async getClaimContext(claimId: string): Promise<ClaimContext | null> {
    const { data, error } = await supabase.rpc('get_claim_context', {
      p_claim_id: claimId,
    })
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return null
    return data[0] as ClaimContext
  }

  async scoreClaim(claimId: string): Promise<ScoreResult | null> {
    const { data, error } = await supabase.rpc('score_claim', {
      p_claim_id: claimId,
    })
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return null
    return data[0] as ScoreResult
  }
}
