import { supabase } from '../db/supabase'

// ── EnrichedClaim ─────────────────────────────────────────────────────────

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
// Calls the enrich_queue() PostgreSQL function via supabase.rpc().
//
// Compare with backend/src/services/queue-enrichment-service.ts:
//   Traditional:  4 MySQL round-trips
//               + K MongoDB calls (one per unique category in queue)
//               + N Lance KNN calls (one per claim in queue)
//               Total: 4 + K + N  separate network calls.
//
//   Supabase:   1 RPC call → single CTE query with pgvector LATERAL join.
//               PostgreSQL executes budget_usage, vendor_risk, employee_risk
//               CTEs AND the per-claim KNN in one query plan.
//               Total: 1 query.  query_count reported as 1.

export class QueueEnrichmentService {

  async enrichQueue(status: string): Promise<EnrichmentResult> {
    const t0 = Date.now()

    const { data, error } = await supabase.rpc('enrich_queue', {
      p_status: status,
    })

    if (error) throw new Error(error.message)

    return {
      data: (data ?? []) as EnrichedClaim[],
      query_count: 1,
      execution_time_ms: Date.now() - t0,
    }
  }
}
