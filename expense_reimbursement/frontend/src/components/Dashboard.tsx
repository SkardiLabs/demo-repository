import { useEffect, useState, useCallback } from 'react'
import { getEnrichedQueue } from '../api'
import type { EnrichedClaim, EnrichedQueueResult, Role } from '../types'
import { AnomalyBadge, scoreLevel } from './AnomalyBadge'

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function pct(ratio: number) {
  return `${(ratio * 100).toFixed(0)}%`
}

// Mini horizontal bar — width is 0–100% of the track
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="mini-bar-track">
      <div className="mini-bar-fill" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

// Compact stat used inside each enriched row
function EnrichStat({
  label,
  value,
  bar,
  barMax,
  barColor,
  highlight,
}: {
  label: string
  value: string
  bar?: boolean
  barMax?: number
  barColor?: string
  highlight?: boolean
}) {
  return (
    <div className="enrich-stat">
      <span className="enrich-label">{label}</span>
      <span className="enrich-value" style={highlight ? { color: '#f87171' } : undefined}>
        {value}
      </span>
      {bar && barMax !== undefined && barColor && (
        <MiniBar value={parseFloat(value)} max={barMax} color={barColor} />
      )}
    </div>
  )
}

// Query stats banner — the central comparison element
function QueryStatsBanner({ result }: { result: EnrichedQueueResult }) {
  const isTraditional = import.meta.env.VITE_API_BACKEND === 'traditional'
  const n = result.data.length

  return (
    <div className="query-stats-banner">
      <span className="query-stats-icon">
        {isTraditional ? (
          // stack icon — multiple layers
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        ) : (
          // lightning bolt — single fast query
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        )}
      </span>

      {isTraditional ? (
        <span className="query-stats-text">
          <strong className="query-stats-count">{result.query_count} queries</strong>
          <span className="query-stats-detail">
            &nbsp;(1 claims · 3 aggregations · {[...new Set(result.data.map(c => c.category))].length} policy lookups · {n} KNN)
          </span>
        </span>
      ) : (
        <span className="query-stats-text">
          <strong className="query-stats-count">1 federated query</strong>
          <span className="query-stats-detail">
            &nbsp;(3 CTEs + LEFT JOIN MongoDB)
          </span>
        </span>
      )}

      <span className="query-stats-time">{result.execution_time_ms}ms</span>
    </div>
  )
}

interface Props {
  role: Role
  onSelectClaim: (claimId: string) => void
}

export function Dashboard({ role, onSelectClaim }: Props) {
  const [result, setResult] = useState<EnrichedQueueResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!role.queue) return
    setLoading(true)
    setError(null)
    try {
      setResult(await getEnrichedQueue(role.queue))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [role.queue])

  useEffect(() => { load() }, [load])

  if (!role.queue) return null

  const claims: EnrichedClaim[] = result?.data ?? []

  return (
    <div className="dashboard single">
      <div className="queue-panel" style={{ borderRight: 'none' }}>
        <div className="queue-header">
          <span className="queue-title">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: role.color, display: 'inline-block' }} />
            {role.queue.replace('_', ' ')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="queue-count">{loading ? '…' : claims.length}</span>
            <button className="refresh-btn" onClick={load} title="Refresh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Query stats banner — shows cost of loading this queue */}
        {!loading && result && <QueryStatsBanner result={result} />}

        <div className="queue-scroll">
          {loading && <div className="queue-empty"><div className="spinner" /></div>}
          {!loading && error && (
            <div className="queue-empty" style={{ color: '#f87171' }}>
              <span>Failed to load</span>
              <button className="btn-ghost" onClick={load} style={{ fontSize: 12 }}>Retry</button>
            </div>
          )}
          {!loading && !error && claims.length === 0 && (
            <div className="queue-empty">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1" ry="1"/></svg>
              <span>No claims in this queue</span>
            </div>
          )}
          {!loading && !error && claims.map(claim => (
            <EnrichedClaimRow
              key={claim.claim_id}
              claim={claim}
              onClick={() => onSelectClaim(claim.claim_id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function EnrichedClaimRow({ claim, onClick }: { claim: EnrichedClaim; onClick: () => void }) {
  const headroomPct = claim.budget_headroom / claim.policy_monthly_limit
  const headroomColor = headroomPct > 0.5 ? '#22c55e' : headroomPct > 0.2 ? '#f59e0b' : '#ef4444'
  const isDuplicate = claim.nearest_duplicate_distance !== null && claim.nearest_duplicate_distance < 0.08
  const level = scoreLevel(claim.anomaly_score)

  return (
    <div className="claim-row enriched-row" onClick={onClick}>
      <div className="claim-row-body">
        {/* Row 1: ID + amount + anomaly */}
        <div className="claim-row-top">
          <span className="claim-id">{claim.claim_id}</span>
          <span className="claim-amount">{fmt(claim.amount)}</span>
        </div>

        {/* Row 2: meta */}
        <div className="claim-row-meta">
          <span>{claim.employee_id}</span>
          <span className="meta-sep">·</span>
          <span>{claim.category}</span>
          <span className="meta-sep">·</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
            {claim.vendor_name}
          </span>
          <span className="meta-sep">·</span>
          <span>{fmtDate(claim.submitted_at)}</span>
        </div>

        {/* Row 3: enrichment stats */}
        <div className="enrich-row">
          <EnrichStat
            label="Budget left"
            value={fmt(claim.budget_headroom)}
            bar
            barMax={claim.policy_monthly_limit}
            barColor={headroomColor}
            highlight={headroomPct < 0.2}
          />
          <EnrichStat
            label="Vendor rej."
            value={pct(claim.vendor_rejection_rate)}
            bar
            barMax={1}
            barColor={claim.vendor_rejection_rate > 0.3 ? '#ef4444' : '#94a3b8'}
            highlight={claim.vendor_rejection_rate > 0.3}
          />
          <EnrichStat
            label="Emp. risk"
            value={pct(claim.employee_risk_ratio)}
            bar
            barMax={1}
            barColor={claim.employee_risk_ratio > 0.3 ? '#f59e0b' : '#94a3b8'}
            highlight={claim.employee_risk_ratio > 0.3}
          />

          {/* Duplicate indicator (traditional backend only) */}
          {claim.nearest_duplicate_distance !== null ? (
            isDuplicate ? (
              <span className="dup-badge triggered">
                DUP {claim.nearest_duplicate_id} · d={claim.nearest_duplicate_distance.toFixed(3)}
              </span>
            ) : (
              <span className="dup-badge clean">No dup</span>
            )
          ) : (
            <span className="dup-badge skipped" title="Lance KNN runs on claim open">
              KNN on open
            </span>
          )}
        </div>
      </div>

      {/* Anomaly badge stays on the right */}
      <AnomalyBadge score={claim.anomaly_score} />
    </div>
  )
}
