import { query, execute } from '../db/mysql'
import type { Claim, ApprovalRecord, SubmitClaimInput, ApproveOrRejectInput } from '../types'

// ── ClaimsService ─────────────────────────────────────────────────────────
// All reads go through two base fetchers that return plain entity arrays.
// Filtering, sorting, and aggregation are done in TypeScript rather than SQL.
//
// This makes the contrast with Skardi explicit: every public method below
// that touches multiple rows is a manual reimplementation of something a
// single SQL expression handles declaratively in the YAML pipelines.

export class ClaimsService {

  // ── Base fetchers (SQL boundary — no filtering, sorting, or aggregation) ─

  private async fetchAllClaims(): Promise<Claim[]> {
    return query<Claim>(
      `SELECT claim_id, employee_id, amount, category, vendor_name,
              expense_date, description, receipt_url, status,
              anomaly_score, submitted_at
       FROM   claims`,
    )
  }

  private async fetchAllApprovalRecords(): Promise<ApprovalRecord[]> {
    return query<ApprovalRecord>(
      `SELECT record_id, claim_id, approver_id, decision,
              comment, approval_tier, decided_at
       FROM   approval_records`,
    )
  }

  // ── Read methods (in-memory processing) ──────────────────────────────────

  async listByStatus(status: string): Promise<Claim[]> {
    const all = await this.fetchAllClaims()
    return all
      .filter(c => c.status === status)
      .sort((a, b) => {
        // anomaly_score DESC (nulls last), submitted_at ASC
        const sa = a.anomaly_score ?? -1
        const sb = b.anomaly_score ?? -1
        if (sb !== sa) return sb - sa
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
      })
  }

  async listByEmployee(employeeId: string): Promise<Claim[]> {
    const all = await this.fetchAllClaims()
    return all
      .filter(c => c.employee_id === employeeId)
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
  }

  async getById(claimId: string): Promise<Claim | null> {
    const all = await this.fetchAllClaims()
    return all.find(c => c.claim_id === claimId) ?? null
  }

  // Used by ScoringService — counts prior claims from the same employee in
  // the same category, excluding the reference claim itself.
  async countPriorSameCategory(
    employeeId: string,
    category: string,
    excludeClaimId: string,
  ): Promise<number> {
    const all = await this.fetchAllClaims()
    return all.filter(
      c => c.employee_id === employeeId &&
           c.category    === category    &&
           c.claim_id    !== excludeClaimId,
    ).length
  }

  // ── Batch aggregations used by QueueEnrichmentService ──────────────────
  // Each method fetches all rows and aggregates in TypeScript.
  // Skardi collapses each of these into a single CTE inside enrich_queue.yaml.

  async getBudgetUsageByCategory(): Promise<Record<string, number>> {
    const [claims, records] = await Promise.all([
      this.fetchAllClaims(),
      this.fetchAllApprovalRecords(),
    ])
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const claimById = new Map(claims.map(c => [c.claim_id, c]))

    return records.reduce<Record<string, number>>((acc, ar) => {
      const claim = claimById.get(ar.claim_id)
      if (!claim || claim.status === 'REJECTED') return acc
      if (new Date(claim.submitted_at) < monthStart) return acc
      acc[claim.category] = (acc[claim.category] ?? 0) + claim.amount
      return acc
    }, {})
  }

  async getVendorRejectionRates(): Promise<Record<string, number>> {
    const [claims, records] = await Promise.all([
      this.fetchAllClaims(),
      this.fetchAllApprovalRecords(),
    ])

    const claimById = new Map(claims.map(c => [c.claim_id, c]))
    const stats = new Map<string, { total: number; rejected: number }>()

    for (const ar of records) {
      const claim = claimById.get(ar.claim_id)
      if (!claim) continue
      const s = stats.get(claim.vendor_name) ?? { total: 0, rejected: 0 }
      s.total++
      if (ar.decision === 'REJECT') s.rejected++
      stats.set(claim.vendor_name, s)
    }

    return Object.fromEntries(
      [...stats.entries()].map(([vendor, s]) => [
        vendor,
        Math.round((s.rejected / s.total) * 10000) / 10000,
      ]),
    )
  }

  async getEmployeeRiskRatios(): Promise<Record<string, number>> {
    const [claims, records] = await Promise.all([
      this.fetchAllClaims(),
      this.fetchAllApprovalRecords(),
    ])
    const claimById = new Map(claims.map(c => [c.claim_id, c]))
    const stats = new Map<string, { total: number; highRisk: number }>()

    for (const ar of records) {
      const claim = claimById.get(ar.claim_id)
      if (!claim) continue
      const s = stats.get(ar.approver_id) ?? { total: 0, highRisk: 0 }
      s.total++
      if ((claim.anomaly_score ?? 0) > 0.4) s.highRisk++
      stats.set(ar.approver_id, s)
    }

    return Object.fromEntries(
      [...stats.entries()].map(([id, s]) => [
        id,
        Math.round((s.highRisk / s.total) * 10000) / 10000,
      ]),
    )
  }

  // ── Write methods (SQL INSERT — no in-memory alternative) ────────────────

  async submit(input: SubmitClaimInput): Promise<void> {
    await execute(
      `INSERT INTO claims
         (claim_id, employee_id, amount, category, vendor_name,
          expense_date, description, receipt_url, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW())`,
      [
        input.claim_id,
        input.employee_id,
        input.amount,
        input.category,
        input.vendor_name,
        input.expense_date,
        input.description,
        input.receipt_url,
      ],
    )
  }

  async recordDecision(input: ApproveOrRejectInput): Promise<void> {
    await execute(
      `INSERT INTO approval_records
         (record_id, claim_id, approver_id, decision, comment, approval_tier, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        input.record_id,
        input.claim_id,
        input.approver_id,
        input.decision,
        input.comment,
        input.approval_tier,
      ],
    )
  }
}
