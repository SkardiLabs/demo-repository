import { useState, useEffect } from 'react'
import { submitClaim, scoreClaim } from '../api'
import type { ScoreResult, Role } from '../types'

const CATEGORIES = [
  'Travel',
  'Meals & Entertainment',
  'Office Supplies',
  'Software & Subscriptions',
  'Training & Education',
]

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function genClaimId() {
  return `C${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

interface Props {
  role: Role  // reserved for future role-specific form constraints
  employeeId: string
  onEmployeeIdChange: (id: string) => void
  onSubmitted: () => void
  onViewClaim: (id: string) => void
}

export function SubmitForm({ role: _role, employeeId, onEmployeeIdChange, onSubmitted, onViewClaim }: Props) {
  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    claim_id: genClaimId(),
    amount: '',
    category: 'Travel',
    vendor_name: '',
    expense_date: today,
    description: '',
    receipt_url: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [submittedId, setSubmittedId] = useState<string | null>(null)

  const [scoring, setScoring] = useState(false)
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)

  // clear result when employee changes
  useEffect(() => {
    setSubmitResult(null)
    setSubmittedId(null)
    setScoreResult(null)
  }, [employeeId])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitResult(null)
    setScoreResult(null)
    setScoreError(null)
    try {
      await submitClaim({
        ...form,
        employee_id: employeeId,
        amount: parseFloat(form.amount),
      })
      setSubmittedId(form.claim_id)
      setSubmitResult({ ok: true, msg: `Claim ${form.claim_id} submitted successfully.` })
      setForm(f => ({ ...f, claim_id: genClaimId() }))
      onSubmitted()
    } catch (e) {
      setSubmitResult({ ok: false, msg: String(e) })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleScore() {
    if (!submittedId) return
    setScoring(true)
    setScoreError(null)
    try {
      setScoreResult(await scoreClaim(submittedId))
    } catch (e) {
      setScoreError(String(e))
    } finally {
      setScoring(false)
    }
  }

  const isValid = employeeId.trim() && form.amount && parseFloat(form.amount) > 0 && form.vendor_name && form.expense_date

  return (
    <div className="submit-panel">
      <div className="submit-panel-header">
        <span className="my-claims-title">New Claim</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>submit_claim</code> pipeline
        </span>
      </div>

      <div className="submit-panel-body">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-row">
            <div className="form-group">
              <label>Claim ID</label>
              <input value={form.claim_id} onChange={e => set('claim_id', e.target.value)} placeholder="C001" required />
            </div>
            <div className="form-group">
              <label>Employee ID</label>
              <input
                value={employeeId}
                onChange={e => onEmployeeIdChange(e.target.value)}
                placeholder="E001"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount (USD)</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" required />
            </div>
            <div className="form-group">
              <label>Expense Date</label>
              <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Vendor Name</label>
              <input value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} placeholder="e.g. Acme Office Supplies" required />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of the expense…" rows={2} />
          </div>

          <div className="form-group">
            <label>Receipt URL</label>
            <input value={form.receipt_url} onChange={e => set('receipt_url', e.target.value)} placeholder="https://receipts/…" />
          </div>

          {submitResult && (
            <div className={`result-banner ${submitResult.ok ? 'success' : 'error'}`}>{submitResult.msg}</div>
          )}

          <button type="submit" className="btn-primary" disabled={submitting || !isValid} style={{ padding: '9px', fontSize: 13 }}>
            {submitting ? <span className="spinner" style={{ margin: '0 auto' }} /> : 'Submit Claim'}
          </button>
        </form>

        {/* Post-submit score */}
        {submittedId && submitResult?.ok && (
          <>
            <hr className="submit-divider" style={{ margin: '14px 0' }} />
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
              Run anomaly scoring on <strong style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{submittedId}</strong>:
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={handleScore} disabled={scoring} style={{ fontSize: 12 }}>
                {scoring ? <><span className="spinner" style={{ display: 'inline-block' }} /> Scoring…</> : '⚡ Score'}
              </button>
              <button className="btn-ghost" onClick={() => onViewClaim(submittedId)} style={{ fontSize: 12 }}>
                Open Detail →
              </button>
            </div>
            {scoreError && <div className="result-banner error" style={{ marginTop: 8 }}>{scoreError}</div>}
            {scoreResult && (
              <div className="score-inline-result" style={{ marginTop: 10 }}>
                <div className="score-inline-row">
                  <span className="score-inline-label">Anomaly Score</span>
                  <strong style={{ color: scoreResult.anomaly_score >= 0.5 ? '#f87171' : scoreResult.anomaly_score >= 0.3 ? '#facc15' : '#4ade80' }}>
                    {scoreResult.anomaly_score.toFixed(2)}
                  </strong>
                </div>
                <div className="score-inline-row">
                  <span className="score-inline-label">Routing</span>
                  <strong style={{ color: scoreResult.routing_decision === 'ELEVATED_REVIEW' ? '#fdba74' : '#6ee7b7' }}>
                    {scoreResult.routing_decision === 'ELEVATED_REVIEW' ? '⬆ Elevated Review' : '✓ Standard Review'}
                  </strong>
                </div>
                <div className="score-inline-row">
                  <span className="score-inline-label">Policy Limit</span>
                  <span>{fmt(scoreResult.policy_limit)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
