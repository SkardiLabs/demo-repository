import { useEffect, useState, useCallback } from 'react'
import { listMyClaims } from '../api'
import type { PendingClaim } from '../types'
import { AnomalyBadge } from './AnomalyBadge'

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_ORDER: Record<string, number> = {
  SUBMITTED: 0,
  PENDING_L1: 1,
  PENDING_AUDITOR: 2,
  PENDING_FINANCE: 3,
  PENDING_PAYMENT: 4,
  PAID: 5,
  REJECTED: 6,
}

interface Props {
  employeeId: string
  refreshKey: number
  onSelectClaim: (id: string) => void
}

export function MyClaims({ employeeId, refreshKey, onSelectClaim }: Props) {
  const [claims, setClaims] = useState<PendingClaim[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!employeeId.trim()) return
    setLoading(true)
    setError(null)
    try {
      setClaims(await listMyClaims(employeeId.trim()))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => { load() }, [load, refreshKey])

  const grouped = claims.reduce<Record<string, PendingClaim[]>>((acc, c) => {
    ;(acc[c.status] ??= []).push(c)
    return acc
  }, {})

  const statuses = Object.keys(grouped).sort(
    (a, b) => (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99),
  )

  return (
    <div className="my-claims-panel">
      <div className="my-claims-header">
        <span className="my-claims-title">My Claims</span>
        <span className="queue-count">{loading ? '…' : claims.length}</span>
        <button className="refresh-btn" onClick={load} title="Refresh" style={{ marginLeft: 2 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      <div className="my-claims-body">
        {!employeeId.trim() && (
          <div className="queue-empty" style={{ padding: '20px 0' }}>Enter your employee ID above to see your claims.</div>
        )}

        {employeeId.trim() && loading && (
          <div className="queue-empty" style={{ padding: '20px 0' }}><div className="spinner" /></div>
        )}

        {employeeId.trim() && !loading && error && (
          <div className="result-banner error">{error}</div>
        )}

        {employeeId.trim() && !loading && !error && claims.length === 0 && (
          <div className="queue-empty" style={{ padding: '20px 0' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1" ry="1"/></svg>
            No claims found for <strong>{employeeId}</strong>.
          </div>
        )}

        {statuses.map(status => (
          <div key={status} className="my-claims-group">
            <div className="my-claims-group-header">
              <span className={`status-badge ${status}`}>{status.replace(/_/g, ' ')}</span>
              <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{grouped[status].length}</span>
            </div>
            {grouped[status].map(claim => (
              <div className="claim-row" key={claim.claim_id} onClick={() => onSelectClaim(claim.claim_id)}>
                <div className="claim-row-body">
                  <div className="claim-row-top">
                    <span className="claim-id">{claim.claim_id}</span>
                    <span className="claim-amount">{fmt(claim.amount)}</span>
                  </div>
                  <div className="claim-row-meta">
                    <span>{claim.category}</span>
                    <span className="meta-sep">·</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{claim.vendor_name}</span>
                    <span className="meta-sep">·</span>
                    <span>{fmtDate(claim.submitted_at)}</span>
                  </div>
                </div>
                <AnomalyBadge score={claim.anomaly_score} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
