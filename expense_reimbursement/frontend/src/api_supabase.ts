// Supabase backend REST client.
// Calls the Express backend at backend_supabase/ (default port 8083) via
// the /supa proxy defined in vite.config.ts.
//
// The backend delegates all complex queries to PostgreSQL functions via
// supabase.rpc(), so every operation here maps to at most 1 DB round-trip.
//
// Contrast:
//   Traditional: GET/POST /rest/*  → Express + mysql2 + mongodb (N+1 queries)
//   Supabase:    GET/POST /supa/*  → Express + @supabase/supabase-js (1 query)
//   Skardi:      POST /api/*       → Skardi federated SQL pipelines (1 query)

import type {
  PendingClaim,
  ClaimContext,
  ScoreResult,
  SimilarClaim,
  EnrichedQueueResult,
} from './types'

const BASE = '/supa'

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

// GET /supa/claims?status=X
export async function listPendingApprovals(status: string): Promise<PendingClaim[]> {
  return get<PendingClaim[]>(`/claims?status=${encodeURIComponent(status)}`)
}

// GET /supa/claims?employee_id=X
export async function listMyClaims(employeeId: string): Promise<PendingClaim[]> {
  return get<PendingClaim[]>(`/claims?employee_id=${encodeURIComponent(employeeId)}`)
}

// GET /supa/claims/:id  (1 PostgreSQL JOIN: claims + vendors + policies)
export async function getClaimContext(claimId: string): Promise<ClaimContext> {
  return get<ClaimContext>(`/claims/${encodeURIComponent(claimId)}`)
}

// GET /supa/claims/:id/score  (1 PostgreSQL CTE query)
export async function scoreClaim(claimId: string): Promise<ScoreResult> {
  return get<ScoreResult>(`/claims/${encodeURIComponent(claimId)}/score`)
}

// GET /supa/claims/:id/similar  (1 pgvector KNN query)
export async function findSimilarClaims(referenceClaimId: string): Promise<SimilarClaim[]> {
  return get<SimilarClaim[]>(`/claims/${encodeURIComponent(referenceClaimId)}/similar`)
}

// GET /supa/queue?status=X
// query_count is always 1 — single PostgreSQL CTE + pgvector LATERAL query.
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

// POST /supa/claims
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

// POST /supa/approvals
export async function approveOrRejectClaim(input: ApproveOrRejectInput): Promise<void> {
  await post('/approvals', input)
}
