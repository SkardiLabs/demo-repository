// Traditional REST API client.
// Each function calls a purpose-specific REST endpoint on the TypeScript
// microservice backend (backend/src/index.ts, default port 8082).
//
// Contrast with api_skardi.ts:
//   - Skardi:      POST /api/{pipeline}/execute for every operation
//   - Traditional: GET/POST /rest/claims, /rest/claims/:id, etc.
//
// The shape of returned data is the same TypeScript interfaces (types.ts) so
// the React components work unchanged regardless of which backend is active.

import type {
  PendingClaim,
  ClaimContext,
  ScoreResult,
  SimilarClaim,
  EnrichedQueueResult,
} from './types'

const BASE = '/rest'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// GET /rest/claims?status=X
export async function listPendingApprovals(status: string): Promise<PendingClaim[]> {
  return get<PendingClaim[]>(`/claims?status=${encodeURIComponent(status)}`)
}

// GET /rest/claims?employee_id=X
export async function listMyClaims(employeeId: string): Promise<PendingClaim[]> {
  return get<PendingClaim[]>(`/claims?employee_id=${encodeURIComponent(employeeId)}`)
}

// GET /rest/claims/:id  (context assembled from 3 DB calls server-side)
export async function getClaimContext(claimId: string): Promise<ClaimContext> {
  return get<ClaimContext>(`/claims/${encodeURIComponent(claimId)}`)
}

// GET /rest/claims/:id/score  (scored via 4 DB calls + JS formula server-side)
export async function scoreClaim(claimId: string): Promise<ScoreResult> {
  return get<ScoreResult>(`/claims/${encodeURIComponent(claimId)}/score`)
}

// GET /rest/claims/:id/similar  (cosine similarity in-memory)
export async function findSimilarClaims(referenceClaimId: string): Promise<SimilarClaim[]> {
  return get<SimilarClaim[]>(`/claims/${encodeURIComponent(referenceClaimId)}/similar`)
}

// GET /rest/queue?status=X
// Returns query_count and execution_time_ms for comparison with Skardi.
// Internally: 4 relational queries + K MongoDB calls + N KNN lookups.
export async function getEnrichedQueue(status: string): Promise<EnrichedQueueResult> {
  return get<EnrichedQueueResult>(`/queue?status=${encodeURIComponent(status)}`)
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

// POST /rest/claims
export async function submitClaim(input: SubmitClaimInput): Promise<void> {
  await post('/claims', input)
}

export interface ApproveOrRejectInput {
  claim_id: string
  approver_id: string
  decision: 'APPROVE' | 'REJECT'
  comment: string
  approval_tier: 'L1' | 'AUDITOR' | 'FINANCE'
}

// POST /rest/approvals
export async function approveOrRejectClaim(input: ApproveOrRejectInput): Promise<void> {
  await post('/approvals', input)
}
