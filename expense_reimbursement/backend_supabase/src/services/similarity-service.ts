import { pool } from '../db/supabase'
import type { SimilarClaim } from '../types'

// ── SimilarityService ─────────────────────────────────────────────────────
// Calls find_similar_claims() PostgreSQL function (pgvector <=> cosine distance).
// Traditional backend: brute-force in-memory loop over hardcoded vectors.

export class SimilarityService {

  async findSimilar(claimId: string, k = 4): Promise<SimilarClaim[]> {
    const { rows } = await pool.query<SimilarClaim>(
      `SELECT * FROM find_similar_claims($1, $2)`,
      [claimId, k],
    )
    return rows
  }
}
