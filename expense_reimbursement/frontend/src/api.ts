// API dispatcher — select backend via VITE_API_BACKEND env var.
//
//   VITE_API_BACKEND=skardi      (default) → api_skardi.ts
//     All calls go to the Skardi server (port 8081) as pipeline executions.
//     Each operation is a single POST that triggers a federated SQL query.
//
//   VITE_API_BACKEND=traditional           → api_old_style.ts
//     All calls go to the TypeScript microservice backend (port 8082) via
//     conventional REST endpoints. Each operation may require multiple DB
//     round-trips server-side (ClaimsService + VendorService + PolicyService).
//
// Usage:
//   VITE_API_BACKEND=traditional npm run dev
//   VITE_API_BACKEND=skardi      npm run dev   # (or just: npm run dev)

import * as skardi from './api_skardi'
import * as traditional from './api_old_style'

const impl = import.meta.env.VITE_API_BACKEND === 'traditional' ? traditional : skardi

export const listPendingApprovals = impl.listPendingApprovals
export const listMyClaims = impl.listMyClaims
export const getClaimContext = impl.getClaimContext
export const scoreClaim = impl.scoreClaim
export const findSimilarClaims = impl.findSimilarClaims
export const submitClaim = impl.submitClaim
export const approveOrRejectClaim = impl.approveOrRejectClaim
export const getEnrichedQueue = impl.getEnrichedQueue

export type { SubmitClaimInput, ApproveOrRejectInput } from './api_skardi'
