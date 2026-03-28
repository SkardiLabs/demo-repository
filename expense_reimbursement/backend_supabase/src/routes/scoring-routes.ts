import { Router } from 'express'
import type { ScoringService } from '../services/scoring-service'
import * as res from '../response'

// ── /claims/:id/score ─────────────────────────────────────────────────────
// GET /claims/:id/score → score_claim PostgreSQL function (1 CTE query)
//
// Contrast with traditional backend: 4 DB calls (claim, vendor, policy,
// prior-claim count) + TypeScript formula.
// Supabase: 1 RPC call, logic runs inside PostgreSQL.

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
