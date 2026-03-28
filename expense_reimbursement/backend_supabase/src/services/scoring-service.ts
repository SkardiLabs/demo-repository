import { pool } from '../db/supabase'
import type { ClaimContext, ScoreResult } from '../types'

// ── ScoringService ────────────────────────────────────────────────────────
// Both operations call PostgreSQL functions defined in init_supabase.sql.
//
// get_claim_context() → 1 query: JOIN claims + vendors + policies
// score_claim()       → 1 query: CTE with scoring formula in SQL

export class ScoringService {

  async getClaimContext(claimId: string): Promise<ClaimContext | null> {
    const { rows } = await pool.query<ClaimContext>(
      `SELECT * FROM get_claim_context($1)`,
      [claimId],
    )
    return rows[0] ?? null
  }

  async scoreClaim(claimId: string): Promise<ScoreResult | null> {
    const { rows } = await pool.query<ScoreResult>(
      `SELECT * FROM score_claim($1)`,
      [claimId],
    )
    return rows[0] ?? null
  }
}
