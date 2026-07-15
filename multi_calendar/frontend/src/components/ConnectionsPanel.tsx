import type { IntegrationStatusRow } from '../types'

export const GOOGLE_REDIRECT_PATH = '/oauth/google'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

// Injected at build time from multi_calendar/.env (operator config).
// Only the client ID reaches the browser; the secret stays with the agent.
declare const __GOOGLE_CLIENT_ID__: string
export const GOOGLE_CLIENT_ID = __GOOGLE_CLIENT_ID__

export function googleConsentUrl(): string {
  const redirect = `${window.location.origin}${GOOGLE_REDIRECT_PATH}`
  const qs = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`
}

interface Props {
  rows: IntegrationStatusRow[]
  onConnectFeishu: () => void
  onClose?: () => void
}

function statusChip(row: IntegrationStatusRow | undefined) {
  if (!row) return <span className="conn-status">Not connected</span>
  if (row.status === 'connected') return <span className="conn-status conn-ok">Connected</span>
  if (row.status === 'pending_exchange')
    return <span className="conn-status conn-wait">Authorizing…</span>
  return <span className="conn-status conn-err" title={row.error}>Error: {row.error || 'unknown'}</span>
}

export default function ConnectionsPanel({ rows, onConnectFeishu, onClose }: Props) {
  const byy = Object.fromEntries(rows.map((r) => [r.source, r]))

  return (
    <div className="connections-panel">
      {onClose && (
        <button className="popover-close panel-close" onClick={onClose} aria-label="Close">×</button>
      )}
      <span className="skardi-mark big">◆</span>
      <h2>Connect your calendars</h2>
      <p className="panel-sub">
        Authorize once — grants are stored locally and refreshed automatically on every resync.
        Nothing leaves your machine except the calendar API calls themselves.
      </p>

      <div className="conn-row">
        <div>
          <div className="conn-name">Google Calendar</div>
          <div className="conn-desc">Sign in and approve read-only access on Google's consent page</div>
        </div>
        {byy['google']?.status === 'connected' ? (
          statusChip(byy['google'])
        ) : GOOGLE_CLIENT_ID ? (
          <div className="conn-action">
            {statusChip(byy['google'])}
            <button className="btn-resync" onClick={() => (window.location.href = googleConsentUrl())}>
              Connect Google Calendar
            </button>
          </div>
        ) : (
          <span className="conn-status conn-err">
            Operator setup needed: set GOOGLE_CLIENT_ID in multi_calendar/.env (see README)
          </span>
        )}
      </div>

      <div className="conn-row">
        <div>
          <div className="conn-name">Feishu Calendar</div>
          <div className="conn-desc">Uses the demo's Feishu app credential — one click, no sign-in</div>
        </div>
        {byy['feishu']?.status === 'connected' ? (
          statusChip(byy['feishu'])
        ) : (
          <div className="conn-action">
            {statusChip(byy['feishu'])}
            <button className="btn-resync" onClick={onConnectFeishu}>
              Connect Feishu
            </button>
          </div>
        )}
      </div>

      <p className="panel-hint">
        Requires the sync agent: <code>node agent/agent.mjs</code>. Fixture mode instead?{' '}
        <code>bash seed/seed.sh</code>.
      </p>
    </div>
  )
}
