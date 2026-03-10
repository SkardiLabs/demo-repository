import { Router } from 'express'
import type { SimilarityService } from '../services/similarity-service'
import * as res from '../response'

// ── /claims/:id/similar ──────────────────────────────────────────────────
// GET /claims/:id/similar → find_similar_claims
//
// SimilarityService performs brute-force cosine distance in memory.
// In Skardi, lance_knn() delegates to the Lance vector store which runs an
// optimised IVF-PQ index scan. For large corpora the difference is dramatic;
// for the demo corpus (12 vectors) both approaches are instant.

export function similarityRouter(similarity: SimilarityService): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, resp) => {
    try {
      const results = similarity.findSimilar(req.params.id)
      return res.ok(resp, results)
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  return router
}
