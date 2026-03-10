import { Router } from 'express'
import type { ClaimsService } from '../services/claims-service'
import * as res from '../response'

// ── /approvals ────────────────────────────────────────────────────────────
// POST /approvals → approve_or_reject_claim

export function approvalsRouter(claims: ClaimsService): Router {
  const router = Router()

  router.post('/', async (req, resp) => {
    try {
      const { claim_id, approver_id, decision, comment, approval_tier } = req.body
      if (!claim_id || !approver_id || !decision || !approval_tier) {
        return res.badRequest(resp, 'Missing required fields')
      }
      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        return res.badRequest(resp, 'decision must be APPROVE or REJECT')
      }

      const record_id = `R${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      await claims.recordDecision({ record_id, claim_id, approver_id, decision,
                                    comment: comment ?? '', approval_tier })
      return res.created(resp, { record_id })
    } catch (err) {
      return res.serverError(resp, err)
    }
  })

  return router
}
