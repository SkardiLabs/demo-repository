import { pool } from '../db/supabase'
import type { Claim, SubmitClaimInput, ApproveOrRejectInput } from '../types'

export class ClaimsService {

  async listByStatus(status: string): Promise<Claim[]> {
    const { rows } = await pool.query<Claim>(
      `SELECT * FROM claims
       WHERE  status = $1
       ORDER  BY anomaly_score DESC NULLS LAST, submitted_at ASC`,
      [status],
    )
    return rows
  }

  async listByEmployee(employeeId: string): Promise<Claim[]> {
    const { rows } = await pool.query<Claim>(
      `SELECT * FROM claims
       WHERE  employee_id = $1
       ORDER  BY submitted_at DESC`,
      [employeeId],
    )
    return rows
  }

  async submit(input: SubmitClaimInput): Promise<void> {
    await pool.query(
      `INSERT INTO claims
         (claim_id, employee_id, amount, category, vendor_name,
          expense_date, description, receipt_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SUBMITTED')`,
      [input.claim_id, input.employee_id, input.amount, input.category,
       input.vendor_name, input.expense_date, input.description, input.receipt_url],
    )
  }

  async recordDecision(input: ApproveOrRejectInput): Promise<void> {
    await pool.query(
      `INSERT INTO approval_records
         (record_id, claim_id, approver_id, decision, comment, approval_tier)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.record_id, input.claim_id, input.approver_id,
       input.decision, input.comment, input.approval_tier],
    )
  }
}
