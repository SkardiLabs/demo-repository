import type { ClaimsService } from './claims-service'
import type { PolicyService } from './policy-service'
import type { SimilarityService } from './similarity-service'
import type { Claim } from '../types'

// ── EnrichedClaim ─────────────────────────────────────────────────────────

export interface EnrichedClaim extends Claim {
  budget_headroom: number
  vendor_rejection_rate: number
  employee_risk_ratio: number
  policy_monthly_limit: number
  nearest_duplicate_distance: number | null
  nearest_duplicate_id: string | null
}

export interface EnrichmentResult {
  data: EnrichedClaim[]
  query_count: number
  execution_time_ms: number
}

// ── QueueEnrichmentService ────────────────────────────────────────────────
// Assembles the same enriched queue view that enrich_queue.yaml produces in
// one SQL statement. The difference is explicit here: every bullet below is a
// separate network round-trip that cannot be collapsed without a query planner.
//
//  Round-trip 1 — ClaimsService.listByStatus()             MySQL SELECT
//  Round-trips 2-4 (parallel) ─────────────────────────────────────────────
//    Round-trip 2 — ClaimsService.getBudgetUsageByCategory()  MySQL GROUP BY
//    Round-trip 3 — ClaimsService.getVendorRejectionRates()   MySQL JOIN+agg
//    Round-trip 4 — ClaimsService.getEmployeeRiskRatios()     MySQL GROUP BY
//  Round-trips 5…5+K (parallel) ───────────────────────────────────────────
//    PolicyService.getByCategory() × unique categories in queue  MongoDB
//  Round-trips 5+K…5+K+N ──────────────────────────────────────────────────
//    SimilarityService.findSimilar() × N claims in queue
//    (KNN query vector differs per claim — cannot batch)
//
// Total: 4 + K_unique_categories + N_claims   vs   1 in Skardi.

export class QueueEnrichmentService {
  constructor(
    private claims: ClaimsService,
    private policies: PolicyService,
    private similarity: SimilarityService,
  ) {}

  async enrichQueue(status: string): Promise<EnrichmentResult> {
    const t0 = Date.now()
    let queryCount = 0

    // ── Round-trip 1 ──────────────────────────────────────────────────────
    const baseClaims = await this.claims.listByStatus(status)
    queryCount++

    if (baseClaims.length === 0) {
      return { data: [], query_count: queryCount, execution_time_ms: Date.now() - t0 }
    }

    // ── Round-trips 2-4 (parallel, but still 3 separate DB calls) ─────────
    const [budgetUsage, vendorRates, employeeRisk] = await Promise.all([
      this.claims.getBudgetUsageByCategory(),
      this.claims.getVendorRejectionRates(),
      this.claims.getEmployeeRiskRatios(),
    ])
    queryCount += 3

    // ── Round-trips 5…5+K: policies (MongoDB, one call per unique category) ─
    // Unlike Skardi's LEFT JOIN policies, MongoDB has no SQL join — we must
    // call getByCategory() separately for each distinct category.
    const categories = [...new Set(baseClaims.map(c => c.category))]
    const policyResults = await Promise.all(
      categories.map(cat => this.policies.getByCategory(cat)),
    )
    queryCount += categories.length
    const policyMap = new Map(
      policyResults.filter(Boolean).map(p => [p!.category, p!]),
    )

    // ── Round-trips 5+K…5+K+N: per-claim KNN ────────────────────────────
    // Each claim needs its own query vector for KNN — fundamentally not
    // batchable. In a real distributed system this is N HTTP calls to the
    // similarity microservice.
    const data: EnrichedClaim[] = baseClaims.map(claim => {
      const similar = this.similarity.findSimilar(claim.claim_id, 1)
      queryCount++

      const policy = policyMap.get(claim.category)
      const monthlyLimit = policy?.monthly_limit ?? 5000.0
      const spent = budgetUsage[claim.category] ?? 0

      return {
        ...claim,
        budget_headroom: Math.round((monthlyLimit - spent) * 100) / 100,
        vendor_rejection_rate: vendorRates[claim.vendor_name] ?? 0,
        employee_risk_ratio: employeeRisk[claim.employee_id] ?? 0,
        policy_monthly_limit: monthlyLimit,
        nearest_duplicate_distance: similar[0]?.similarity_distance ?? null,
        nearest_duplicate_id: similar[0]?.claim_id ?? null,
      }
    })

    return {
      data,
      query_count: queryCount,
      execution_time_ms: Date.now() - t0,
    }
  }
}
