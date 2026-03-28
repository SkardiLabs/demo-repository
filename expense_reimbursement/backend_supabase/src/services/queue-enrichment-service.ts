import { pool } from '../db/supabase'

export interface EnrichedClaim {
  claim_id: string
  employee_id: string
  amount: number
  category: string
  vendor_name: string
  expense_date: string
  description: string | null
  receipt_url: string | null
  status: string
  anomaly_score: number | null
  submitted_at: string
  budget_headroom: number
  vendor_rejection_rate: number
  employee_risk_ratio: number
  policy_monthly_limit: number
  nearest_duplicate_id: string | null
  nearest_duplicate_distance: number | null
}

export interface EnrichmentResult {
  data: EnrichedClaim[]
  query_count: number
  execution_time_ms: number
}

// ── QueueEnrichmentService ────────────────────────────────────────────────
// Calls the enrich_queue() PostgreSQL function: a single CTE query with
// pgvector LATERAL join that computes budget usage, vendor risk, employee
// risk, policy limits, AND nearest-duplicate KNN — all in one query plan.
//
// query_count: 1  (vs 4+K+N in the traditional backend)

export class QueueEnrichmentService {

  async enrichQueue(status: string): Promise<EnrichmentResult> {
    const t0 = Date.now()
    const { rows } = await pool.query<EnrichedClaim>(
      `SELECT * FROM enrich_queue($1)`,
      [status],
    )
    return {
      data: rows,
      query_count: 1,
      execution_time_ms: Date.now() - t0,
    }
  }
}
