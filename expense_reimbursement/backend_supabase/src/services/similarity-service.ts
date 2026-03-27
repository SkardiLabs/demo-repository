import { supabase } from '../db/supabase'
import type { SimilarClaim } from '../types'

// ── SimilarityService ─────────────────────────────────────────────────────
// Delegates to the find_similar_claims() PostgreSQL function which uses the
// pgvector cosine distance operator (<=>).
//
// Compare with backend/src/services/similarity-service.ts (traditional):
//   Traditional: brute-force in-memory cosine loop over 12 hardcoded vectors.
//   Supabase:    pgvector KNN via SQL — HNSW index makes this sub-linear at
//                scale; same result for the demo corpus.

export class SimilarityService {

  async findSimilar(claimId: string, k = 4): Promise<SimilarClaim[]> {
    const { data, error } = await supabase.rpc('find_similar_claims', {
      p_claim_id: claimId,
      p_k:        k,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as SimilarClaim[]
  }
}
