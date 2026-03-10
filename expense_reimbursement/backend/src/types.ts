// ── Domain types shared across all services ───────────────────────────────

export interface Claim {
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
}

export interface Vendor {
  vendor_id: string
  vendor_name: string
  is_approved: number
  avg_invoice_amount: number | null
  category: string | null
}

export interface Policy {
  category: string
  per_claim_limit: number
  monthly_limit: number
  requires_receipt: boolean
  notes: string | null
}

export interface ClaimContext extends Claim {
  vendor_is_approved: number
  vendor_avg_invoice: number | null
  policy_per_claim_limit: number
  policy_monthly_limit: number
  policy_requires_receipt: boolean
}

export interface ScoreResult {
  claim_id: string
  employee_id: string
  amount: number
  category: string
  vendor_name: string
  expense_date: string
  is_approved_vendor: number
  vendor_avg_amount: number
  policy_limit: number
  prior_claims_same_category: number
  anomaly_score: number
  routing_decision: 'ELEVATED_REVIEW' | 'STANDARD_REVIEW'
}

export interface SimilarClaim {
  claim_id: string
  similarity_distance: number
}

export interface ApprovalRecord {
  record_id: string
  claim_id: string
  approver_id: string
  decision: 'APPROVE' | 'REJECT'
  comment: string
  approval_tier: 'L1' | 'AUDITOR' | 'FINANCE'
  decided_at: string
}

export interface SubmitClaimInput {
  claim_id: string
  employee_id: string
  amount: number
  category: string
  vendor_name: string
  expense_date: string
  description: string
  receipt_url: string
}

export interface ApproveOrRejectInput {
  record_id: string
  claim_id: string
  approver_id: string
  decision: 'APPROVE' | 'REJECT'
  comment: string
  approval_tier: 'L1' | 'AUDITOR' | 'FINANCE'
}
