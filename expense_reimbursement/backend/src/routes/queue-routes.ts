import { Router } from 'express'
import type { QueueEnrichmentService } from '../services/queue-enrichment-service'
import * as res from '../response'

// ── GET /queue?status=X ───────────────────────────────────────────────────
// Returns enriched claims with query_count and execution_time_ms so the
// frontend can show the round-trip cost next to Skardi's single-query time.

export function queueRouter(enrichment: QueueEnrichmentService): Router {
  const router = Router()

  router.get('/', async (req, resp) => {
    try {
      const { status } = req.query as Record<string, string | undefined>
      if (!status) return res.badRequest(resp, 'Provide ?status=...')
      const result = await enrichment.enrichQueue(status)
      return res.ok(resp, result)
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  return router
}
