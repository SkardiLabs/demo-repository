import { supabase } from '../db/supabase'
import type { Claim, SubmitClaimInput, ApproveOrRejectInput } from '../types'

// ── ClaimsService ─────────────────────────────────────────────────────────
// Uses the Supabase query builder for CRUD on the claims and
// approval_records tables. Compare with backend/src/services/claims-service.ts:
//
//   Traditional: fetches ALL rows into memory, then filters/sorts in
//                TypeScript across 2-3 DB calls per method.
//
//   Supabase:    pushes every filter, sort, and aggregation down into
//                PostgreSQL via the query builder. One query per method.

export class ClaimsService {

  async listByStatus(status: string): Promise<Claim[]> {
    const { data, error } = await supabase
      .from('claims')
      .select('*')
      .eq('status', status)
      .order('anomaly_score', { ascending: false, nullsFirst: false })
      .order('submitted_at', { ascending: true })

    if (error) throw new Error(error.message)
    return (data ?? []) as Claim[]
  }

  async listByEmployee(employeeId: string): Promise<Claim[]> {
    const { data, error } = await supabase
      .from('claims')
      .select('*')
      .eq('employee_id', employeeId)
      .order('submitted_at', { ascending: false })

    if (error) throw new Error(error.message)
    return (data ?? []) as Claim[]
  }

  async submit(input: SubmitClaimInput): Promise<void> {
    const { error } = await supabase.from('claims').insert({
      claim_id:    input.claim_id,
      employee_id: input.employee_id,
      amount:      input.amount,
      category:    input.category,
      vendor_name: input.vendor_name,
      expense_date: input.expense_date,
      description: input.description,
      receipt_url: input.receipt_url,
      status:      'SUBMITTED',
    })
    if (error) throw new Error(error.message)
  }

  async recordDecision(input: ApproveOrRejectInput): Promise<void> {
    const { error } = await supabase.from('approval_records').insert({
      record_id:     input.record_id,
      claim_id:      input.claim_id,
      approver_id:   input.approver_id,
      decision:      input.decision,
      comment:       input.comment,
      approval_tier: input.approval_tier,
    })
    if (error) throw new Error(error.message)
  }
}
