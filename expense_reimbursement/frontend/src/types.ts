export interface SkardiBatchResponse<T> {
  success: boolean
  data: T[]
  rows: number
  execution_time_ms: number
  timestamp: string
  error?: string
}

export interface PendingClaim {
  claim_id: string
  employee_id: string
  amount: number
  category: string
  vendor_name: string
  status: string
  anomaly_score: number | null
  submitted_at: string
}

export interface ClaimContext {
  claim_id: string
  employee_id: string
  amount: number
  category: string
  vendor_name: string
  expense_date: string
  description: string
  receipt_url: string
  status: string
  anomaly_score: number | null
  submitted_at: string
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
  count: number
}

export interface EnrichedClaim extends PendingClaim {
  budget_headroom: number
  vendor_rejection_rate: number
  employee_risk_ratio: number
  policy_monthly_limit: number
  /** null when using Skardi backend (Lance KNN runs on claim open, not queue load) */
  nearest_duplicate_distance: number | null
  nearest_duplicate_id: string | null
}

export interface EnrichedQueueResult {
  data: EnrichedClaim[]
  /** How many DB / service round-trips were required. Skardi = 1. Traditional = 4 + K + N. */
  query_count: number
  execution_time_ms: number
}

export type ApprovalStatus = 'PENDING_L1' | 'PENDING_AUDITOR' | 'PENDING_FINANCE' | 'PENDING_PAYMENT'

export type View = 'dashboard' | 'detail' | 'submit'

export type RoleId = 'employee' | 'l1' | 'auditor' | 'finance'

export interface Role {
  id: RoleId
  label: string
  description: string
  color: string
  /** Which queue status this role monitors, null if none */
  queue: string | null
  /** Default approver ID for decisions */
  approverId: string | null
  /** Approval tier this role uses */
  approvalTier: 'L1' | 'AUDITOR' | 'FINANCE' | null
  /** Can submit new claims */
  canSubmit: boolean
}
