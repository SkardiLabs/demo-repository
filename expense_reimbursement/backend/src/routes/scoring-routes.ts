import { Router } from 'express'
import type { ScoringService } from '../services/scoring-service'
import * as res from '../response'

// ── /claims/:id/score ────────────────────────────────────────────────────
// GET /claims/:id/score → score_claim
//
// The ScoringService orchestrates 4 separate DB calls and applies the scoring
// formula in TypeScript. Contrast with score_claim.yaml in Skardi where the
// entire computation — including the CTE, the CASE WHEN scoring logic, and the
// cross-store joins — runs as a single SQL query.

export function scoringRouter(scoring: ScoringService): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, resp) => {
    try {
      const result = await scoring.scoreClaim(req.params.id)
      if (!result) return res.notFound(resp, `Claim ${req.params.id} not found`)
      return res.ok(resp, result)
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  return router
}
