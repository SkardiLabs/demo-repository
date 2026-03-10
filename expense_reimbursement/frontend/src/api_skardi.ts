// Skardi-style API client.
// All operations are expressed as pipeline executions: POST /{name}/execute.
// The server resolves each pipeline to a federated SQL query that can span
// MySQL, MongoDB, and Lance in a single round-trip.

import type {
  SkardiBatchResponse,
  PendingClaim,
  ClaimContext,
  ScoreResult,
  SimilarClaim,
  ApprovalRecord,
  EnrichedClaim,
  EnrichedQueueResult,
} from './types'

const BASE = '/api'

async function execute<T>(
  pipeline: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
): Promise<SkardiBatchResponse<T>> {
  const res = await fetch(`${BASE}/${pipeline}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json: SkardiBatchResponse<T> = await res.json()
  if (!json.success) {
    throw new Error(json.error ?? 'Unknown API error')
  }
  return json
}

export async function listPendingApprovals(status: string): Promise<PendingClaim[]> {
  const r = await execute<PendingClaim>('list_pending_approvals', { status })
  return r.data
}

export async function listMyClaims(employeeId: string): Promise<PendingClaim[]> {
  const r = await execute<PendingClaim>('list_my_claims', { employee_id: employeeId })
  return r.data
}

export async function getClaimContext(claimId: string): Promise<ClaimContext> {
  const r = await execute<ClaimContext>('get_claim_context', { claim_id: claimId })
  if (r.data.length === 0) throw new Error(`Claim ${claimId} not found`)
  return r.data[0]
}

export async function scoreClaim(claimId: string): Promise<ScoreResult> {
  const r = await execute<ScoreResult>('score_claim', { claim_id: claimId })
  if (r.data.length === 0) throw new Error(`No score result for ${claimId}`)
  return r.data[0]
}

export async function findSimilarClaims(referenceClaimId: string): Promise<SimilarClaim[]> {
  const r = await execute<SimilarClaim>('find_similar_claims', {
    reference_claim_id: referenceClaimId,
  })
  return r.data
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

export async function submitClaim(input: SubmitClaimInput): Promise<void> {
  await execute<ApprovalRecord>('submit_claim', input)
}

// One federated SQL query: 3 MySQL CTEs + LEFT JOIN MongoDB policies.
// nearest_duplicate_distance is null — Lance KNN runs separately on claim open.
export async function getEnrichedQueue(status: string): Promise<EnrichedQueueResult> {
  const r = await execute<EnrichedClaim>('enrich_queue', { status })
  return {
    data: r.data.map(c => ({
      ...c,
      nearest_duplicate_distance: null,
      nearest_duplicate_id: null,
    })),
    query_count: 1,
    execution_time_ms: r.execution_time_ms,
  }
}

export interface ApproveOrRejectInput {
  claim_id: string
  approver_id: string
  decision: 'APPROVE' | 'REJECT'
  comment: string
  approval_tier: 'L1' | 'AUDITOR' | 'FINANCE'
}

export async function approveOrRejectClaim(input: ApproveOrRejectInput): Promise<void> {
  const record_id = `R${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  await execute<ApprovalRecord>('approve_or_reject_claim', { ...input, record_id })
}
