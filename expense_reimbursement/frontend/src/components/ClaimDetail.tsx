import { useEffect, useState } from 'react'
import { getClaimContext, scoreClaim, findSimilarClaims, approveOrRejectClaim } from '../api'
import type { ClaimContext, ScoreResult, SimilarClaim, Role } from '../types'
import { AnomalyBadge, scoreLevel } from './AnomalyBadge'

const LANCE_CLAIMS = new Set(['C001','C002','C003','C004','C005','C006','C007',
                               'C100','C101','C102','C103','C104'])

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function fmtDate(ts: string) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Score Card ────────────────────────────────────────────────────────────────

interface ScoreCardProps {
  claimId: string
  existingScore: number | null
}

function ScoreCard({ claimId, existingScore }: ScoreCardProps) {
  const [score, setScore] = useState<ScoreResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    scoreClaim(claimId)
      .then(setScore)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [claimId])

  const displayScore = score?.anomaly_score ?? existingScore
  const level = scoreLevel(displayScore)

  const factors = score ? [
    { label: 'Unapproved vendor', delta: score.is_approved_vendor === 0 ? 0.25 : 0, triggered: score.is_approved_vendor === 0 },
    { label: `Amount > 2× vendor avg (${score.vendor_avg_amount > 0 ? fmt(score.vendor_avg_amount) : 'N/A'})`, delta: score.vendor_avg_amount > 0 && score.amount > score.vendor_avg_amount * 2 ? 0.30 : 0, triggered: score.vendor_avg_amount > 0 && score.amount > score.vendor_avg_amount * 2 },
    { label: `High claim frequency (${score.prior_claims_same_category} prior)`, delta: score.prior_claims_same_category > 10 ? 0.20 : 0, triggered: score.prior_claims_same_category > 10 },
    { label: `Exceeds policy limit (${fmt(score.policy_limit)})`, delta: score.amount > score.policy_limit ? 0.25 : 0, triggered: score.amount > score.policy_limit },
  ] : []

  return (
    <div className="card">
      <div className="card-title">
        <span className="card-title-icon">⚡</span>
        Anomaly Score
        <span className="card-source-tag">MySQL + MongoDB</span>
      </div>
      {loading && <div className="loading-row"><div className="spinner" />Scoring…</div>}
      {error && <div className="result-banner error" style={{ fontSize: 12 }}>{error}</div>}
      {!loading && (
        <>
          <div className="score-meter">
            <div className="score-value-row">
              <span className={`score-number ${level}`}>{displayScore !== null ? displayScore.toFixed(2) : '—'}</span>
              {score && (
                <span className={`routing-badge ${score.routing_decision === 'ELEVATED_REVIEW' ? 'elevated' : 'standard'}`}>
                  {score.routing_decision === 'ELEVATED_REVIEW' ? '⬆ Elevated' : '✓ Standard'}
                </span>
              )}
            </div>
            <div className="score-track">
              <div className={`score-fill ${level}`} style={{ width: `${(displayScore ?? 0) * 100}%` }} />
            </div>
          </div>
          {score && factors.length > 0 && (
            <>
              <hr className="section-divider" />
              <div className="card-title" style={{ marginBottom: 8 }}>Scoring Factors</div>
              <div className="factors-list">
                {factors.map((f, i) => (
                  <div key={i} className={`factor-row ${f.triggered ? 'triggered' : 'clean'}`}>
                    <span className="factor-label">{f.label}</span>
                    <span className={`factor-delta ${f.delta > 0 ? 'pos' : 'zero'}`}>
                      {f.delta > 0 ? `+${f.delta.toFixed(2)}` : '0.00'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {score && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
              Policy limit: {fmt(score.policy_limit)} · Vendor avg: {score.vendor_avg_amount > 0 ? fmt(score.vendor_avg_amount) : 'N/A'}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Similar Claims Card ───────────────────────────────────────────────────────

interface SimilarClaimsCardProps {
  claimId: string
  onSelectClaim: (id: string) => void
}

function SimilarClaimsCard({ claimId, onSelectClaim }: SimilarClaimsCardProps) {
  const [similar, setSimilar] = useState<SimilarClaim[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasEmbedding = LANCE_CLAIMS.has(claimId)

  useEffect(() => {
    if (!hasEmbedding) return
    setLoading(true)
    findSimilarClaims(claimId)
      .then(setSimilar)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [claimId, hasEmbedding])

  return (
    <div className="card">
      <div className="card-title">
        <span className="card-title-icon">🔍</span>
        Similar Claims
        <span className="card-source-tag">Lance KNN</span>
      </div>
      {!hasEmbedding && <div style={{ color: 'var(--text3)', fontSize: 12 }}>No embedding for this claim.</div>}
      {hasEmbedding && loading && <div className="loading-row"><div className="spinner" />Searching vectors…</div>}
      {hasEmbedding && error && <div className="result-banner error" style={{ fontSize: 12 }}>{error}</div>}
      {hasEmbedding && !loading && !error && similar.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12 }}>No similar claims found.</div>}
      {hasEmbedding && !loading && !error && similar.length > 0 && (
        <div className="similar-list">
          {similar.map(s => (
            <div key={s.claim_id} className="similar-row" onClick={() => onSelectClaim(s.claim_id)}>
              <span className="similar-claim-id">{s.claim_id}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.similarity_distance < 0.08 && <span className="similar-dup-flag">⚠ dup?</span>}
                <span className="similar-dist">dist {s.similarity_distance.toFixed(4)}</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>distance &lt; 0.08 = strong duplicate candidate</div>
        </div>
      )}
    </div>
  )
}

// ── Approve Card ──────────────────────────────────────────────────────────────

interface ApproveCardProps {
  claimId: string
  role: Role
  onDecisionRecorded: () => void
}

function ApproveCard({ claimId, role, onDecisionRecorded }: ApproveCardProps) {
  const [approverId, setApproverId] = useState(role.approverId ?? '')
  const [tier, setTier] = useState<'L1' | 'AUDITOR' | 'FINANCE'>(role.approvalTier ?? 'L1')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // sync if role changes
  useEffect(() => {
    setApproverId(role.approverId ?? '')
    setTier(role.approvalTier ?? 'L1')
  }, [role])

  if (!role.approvalTier) {
    return (
      <div className="action-card">
        <div className="card-title" style={{ marginBottom: 0 }}>
          <span className="card-title-icon">✍️</span>
          Record Decision
        </div>
        <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 10 }}>
          Switch to a supervisor, auditor, or finance role to record a decision.
        </p>
      </div>
    )
  }

  const submit = async (decision: 'APPROVE' | 'REJECT') => {
    setLoading(true)
    setResult(null)
    try {
      await approveOrRejectClaim({ claim_id: claimId, approver_id: approverId, decision, comment, approval_tier: tier })
      setResult({ ok: true, msg: `Decision recorded: ${decision} by ${approverId} (${tier})` })
      onDecisionRecorded()
    } catch (e) {
      setResult({ ok: false, msg: String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="action-card">
      <div className="card-title" style={{ marginBottom: 12 }}>
        <span className="card-title-icon">✍️</span>
        Record Decision
        <span className="card-source-tag">MySQL INSERT</span>
      </div>
      <div className="action-form">
        <div className="action-row">
          <div className="form-group">
            <label>Approver ID</label>
            <input value={approverId} onChange={e => setApproverId(e.target.value)} placeholder="e.g. MGR001" />
          </div>
          <div className="form-group">
            <label>Tier</label>
            {/* Lock tier to the role's tier */}
            <input value={tier} readOnly style={{ opacity: 0.7, cursor: 'default' }} />
          </div>
        </div>
        <div className="form-group">
          <label>Comment</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional review notes…" rows={2} />
        </div>
        {result && <div className={`result-banner ${result.ok ? 'success' : 'error'}`}>{result.msg}</div>}
        <div className="action-row">
          <button className="btn-approve" onClick={() => submit('APPROVE')} disabled={loading || !approverId}>
            {loading ? <span className="spinner" /> : '✓ Approve'}
          </button>
          <button className="btn-reject" onClick={() => submit('REJECT')} disabled={loading || !approverId}>
            {loading ? <span className="spinner" /> : '✗ Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ClaimDetail ──────────────────────────────────────────────────────────

interface Props {
  claimId: string
  role: Role
  onBack: () => void
  onSelectClaim: (id: string) => void
}

export function ClaimDetail({ claimId, role, onBack, onSelectClaim }: Props) {
  const [ctx, setCtx] = useState<ClaimContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getClaimContext(claimId)
      .then(setCtx)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [claimId, refreshKey])

  const statusClass = ctx?.status ?? 'default'

  return (
    <div className="detail-view">
      <div className="detail-topbar">
        <button className="btn-icon" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        {ctx && (
          <>
            <span className="detail-title"><span className="claim-id-lg">{ctx.claim_id}</span></span>
            <span className={`status-badge ${statusClass}`}>{ctx.status}</span>
            <AnomalyBadge score={ctx.anomaly_score} />
          </>
        )}
        {loading && <div className="spinner" />}
      </div>

      {error && <div style={{ padding: 20 }}><div className="result-banner error">{error}</div></div>}

      {ctx && (
        <div className="detail-body">
          {/* Left: claim + policy info */}
          <div className="detail-left">
            <div className="card">
              <div className="card-title">
                <span className="card-title-icon">📄</span>
                Claim Details
                <span className="card-source-tag">MySQL — claims</span>
              </div>
              <div className="info-grid">
                <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="info-label">Amount</span>
                  <span className="info-value amount">{fmt(ctx.amount)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Employee</span>
                  <span className="info-value mono">{ctx.employee_id}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Expense Date</span>
                  <span className="info-value">{fmtDate(ctx.expense_date)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Category</span>
                  <span className="info-value">{ctx.category}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Submitted</span>
                  <span className="info-value">{fmtDate(ctx.submitted_at)}</span>
                </div>
                <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="info-label">Vendor</span>
                  <span className="info-value">
                    {ctx.vendor_name}&nbsp;
                    {ctx.vendor_is_approved
                      ? <span className="vendor-approved">✓ approved</span>
                      : <span className="vendor-unapproved">⚠ not in registry</span>}
                  </span>
                </div>
                {ctx.description && (
                  <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="info-label">Description</span>
                    <span className="info-value">{ctx.description}</span>
                  </div>
                )}
                {ctx.receipt_url && (
                  <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="info-label">Receipt</span>
                    <span className="info-value" style={{ fontSize: 12, wordBreak: 'break-all', color: '#93c5fd' }}>{ctx.receipt_url}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span className="card-title-icon">📋</span>
                Policy Rules
                <span className="card-source-tag">MongoDB — policies</span>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Per-Claim Limit</span>
                  <span className="info-value" style={{ color: ctx.amount > ctx.policy_per_claim_limit ? '#f87171' : 'inherit' }}>
                    {fmt(ctx.policy_per_claim_limit)}{ctx.amount > ctx.policy_per_claim_limit && ' ⚠'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Monthly Limit</span>
                  <span className="info-value">{fmt(ctx.policy_monthly_limit)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Receipt Required</span>
                  <span className="info-value">
                    {ctx.policy_requires_receipt ? <span style={{ color: '#f87171' }}>Yes</span> : <span style={{ color: '#86efac' }}>No</span>}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Vendor Avg Invoice</span>
                  <span className="info-value">{ctx.vendor_avg_invoice !== null ? fmt(ctx.vendor_avg_invoice) : '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: score, similar, approve */}
          <div className="detail-right">
            <ScoreCard claimId={claimId} existingScore={ctx.anomaly_score} />
            <SimilarClaimsCard claimId={claimId} onSelectClaim={onSelectClaim} />
            <ApproveCard claimId={claimId} role={role} onDecisionRecorded={() => setRefreshKey(k => k + 1)} />
          </div>
        </div>
      )}
    </div>
  )
}
