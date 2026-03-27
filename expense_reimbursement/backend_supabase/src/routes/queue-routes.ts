import { Router } from 'express'
import type { QueueEnrichmentService } from '../services/queue-enrichment-service'
import * as res from '../response'

// ── GET /queue?status=X ───────────────────────────────────────────────────
// Returns enriched claims with query_count and execution_time_ms for
// direct comparison with the traditional and Skardi backends.
//
// query_count here is always 1 — the enrich_queue() PostgreSQL function
// collapses all CTEs and pgvector LATERAL joins into a single query plan.

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
