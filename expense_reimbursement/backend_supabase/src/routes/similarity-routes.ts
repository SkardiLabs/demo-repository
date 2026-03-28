import { Router } from 'express'
import type { SimilarityService } from '../services/similarity-service'
import * as res from '../response'

// ── /claims/:id/similar ───────────────────────────────────────────────────
// GET /claims/:id/similar → find_similar_claims PostgreSQL function
//
// Uses pgvector cosine distance (<=>). For large corpora, pgvector's HNSW
// index makes this sub-linear. Traditional backend: brute-force in-memory loop.

export function similarityRouter(similarity: SimilarityService): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, resp) => {
    try {
      const results = await similarity.findSimilar(req.params.id)
      return res.ok(resp, results)
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  return router
}
