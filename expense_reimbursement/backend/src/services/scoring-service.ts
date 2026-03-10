import type { ClaimsService } from './claims-service'
import type { VendorService } from './vendor-service'
import type { PolicyService } from './policy-service'
import type { ClaimContext, ScoreResult } from '../types'

// ── ScoringService ────────────────────────────────────────────────────────
// Orchestrates three data sources to build claim context and compute anomaly
// scores. This is the main contrast with Skardi:
//
//   Skardi:      a single federated SQL query in a YAML pipeline file does
//                the cross-store JOIN in one round-trip.
//
//   Traditional: we make 3–4 separate DB calls here and merge them in
//                application code. More network round-trips, more glue code,
//                but each service stays independently deployable.
//
// Scoring formula (mirrors score_claim.yaml):
//   +0.25  vendor not in approved registry
//   +0.30  claim amount > 2× vendor's typical invoice amount
//   +0.20  employee has > 10 prior claims in same category
//   +0.25  claim amount exceeds policy per-claim limit
//   >= 0.40 → ELEVATED_REVIEW, otherwise STANDARD_REVIEW

export class ScoringService {
  constructor(
    private claims: ClaimsService,
    private vendors: VendorService,
    private policies: PolicyService,
  ) {}

  async getClaimContext(claimId: string): Promise<ClaimContext | null> {
    // Round-trip 1: fetch claim from ClaimsService (MySQL)
    const claim = await this.claims.getById(claimId)
    if (!claim) return null

    // Round-trip 2: fetch vendor from VendorService (MySQL)
    const vendor = await this.vendors.getByName(claim.vendor_name)

    // Round-trip 3: fetch policy from PolicyService (MongoDB)
    const policy = await this.policies.getByCategory(claim.category)

    return {
      ...claim,
      vendor_is_approved: vendor?.is_approved ?? 0,
      vendor_avg_invoice: vendor?.avg_invoice_amount ?? null,
      policy_per_claim_limit: policy?.per_claim_limit ?? 1000.0,
      policy_monthly_limit: policy?.monthly_limit ?? 5000.0,
      policy_requires_receipt: policy?.requires_receipt ?? false,
    }
  }

  async scoreClaim(claimId: string): Promise<ScoreResult | null> {
    // Round-trip 1: claim
    const claim = await this.claims.getById(claimId)
    if (!claim) return null

    // Round-trip 2: vendor
    const vendor = await this.vendors.getByName(claim.vendor_name)

    // Round-trip 3: policy
    const policy = await this.policies.getByCategory(claim.category)

    // Round-trip 4: prior claim count (ClaimsService, MySQL)
    const priorCount = await this.claims.countPriorSameCategory(
      claim.employee_id,
      claim.category,
      claimId,
    )

    const isApprovedVendor = vendor?.is_approved ?? 0
    const vendorAvgAmount = vendor?.avg_invoice_amount ?? 0
    const policyLimit = policy?.per_claim_limit ?? 1000.0

    let score = 0
    if (isApprovedVendor === 0) score += 0.25
    if (vendorAvgAmount > 0 && claim.amount > vendorAvgAmount * 2) score += 0.30
    if (priorCount > 10) score += 0.20
    if (claim.amount > policyLimit) score += 0.25

    const anomalyScore = Math.round(score * 10000) / 10000
    const routingDecision: 'ELEVATED_REVIEW' | 'STANDARD_REVIEW' =
      anomalyScore >= 0.40 ? 'ELEVATED_REVIEW' : 'STANDARD_REVIEW'

    return {
      claim_id: claim.claim_id,
      employee_id: claim.employee_id,
      amount: claim.amount,
      category: claim.category,
      vendor_name: claim.vendor_name,
      expense_date: claim.expense_date,
      is_approved_vendor: isApprovedVendor,
      vendor_avg_amount: vendorAvgAmount,
      policy_limit: policyLimit,
      prior_claims_same_category: priorCount,
      anomaly_score: anomalyScore,
      routing_decision: routingDecision,
    }
  }
}
