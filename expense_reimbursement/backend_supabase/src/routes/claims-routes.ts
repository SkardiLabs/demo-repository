import { Router } from 'express'
import type { ClaimsService } from '../services/claims-service'
import type { ScoringService } from '../services/scoring-service'
import * as res from '../response'

// ── /claims ───────────────────────────────────────────────────────────────
// GET  /claims?status=X          → listByStatus
// GET  /claims?employee_id=X     → listByEmployee
// GET  /claims/:id               → get_claim_context (single PostgreSQL JOIN)
// POST /claims                   → submit

export function claimsRouter(claims: ClaimsService, scoring: ScoringService): Router {
  const router = Router()

  router.get('/', async (req, resp) => {
    try {
      const { status, employee_id } = req.query as Record<string, string | undefined>

      if (status) {
        const data = await claims.listByStatus(status)
        return res.ok(resp, data)
      }

      if (employee_id) {
        const data = await claims.listByEmployee(employee_id)
        return res.ok(resp, data)
      }

      return res.badRequest(resp, 'Provide ?status=... or ?employee_id=...')
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  router.get('/:id', async (req, resp) => {
    try {
      // ScoringService calls get_claim_context() — one PostgreSQL JOIN across
      // claims + vendors + policies, vs 3 sequential DB calls in traditional.
      const context = await scoring.getClaimContext(req.params.id)
      if (!context) return res.notFound(resp, `Claim ${req.params.id} not found`)
      return res.ok(resp, context)
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  router.post('/', async (req, resp) => {
    try {
      const { claim_id, employee_id, amount, category, vendor_name,
              expense_date, description, receipt_url } = req.body
      if (!claim_id || !employee_id || amount == null || !category ||
          !vendor_name || !expense_date) {
        return res.badRequest(resp, 'Missing required fields')
      }
      await claims.submit({ claim_id, employee_id, amount, category,
                            vendor_name, expense_date, description, receipt_url })
      return res.created(resp, { claim_id })
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  return router
}
