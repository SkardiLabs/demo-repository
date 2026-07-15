import type { IntegrationStatusRow } from '../types'

export const GOOGLE_REDIRECT_PATH = '/oauth/google'
export const FEISHU_REDIRECT_PATH = '/oauth/feishu'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const FEISHU_SCOPE = 'calendar:calendar:readonly offline_access'

// Public app IDs, from the shipped demo_credentials.json (or ../.env
// override) via Vite's env exposure. Secrets never match the envPrefix
// allowlist and stay with the sync agent.
const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
export const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID ?? ''
export const FEISHU_APP_ID = env.FEISHU_APP_ID ?? ''

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

export function feishuConsentUrl(): string {
  const redirect = `${window.location.origin}${FEISHU_REDIRECT_PATH}`
  const qs = new URLSearchParams({
    client_id: FEISHU_APP_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: FEISHU_SCOPE,
    state: 'feishu',
  })
  return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${qs}`
}

interface Props {
  rows: IntegrationStatusRow[]
  onClose?: () => void
}

function statusChip(row: IntegrationStatusRow | undefined) {
  if (!row) return <span className="conn-status">Not connected</span>
  if (row.status === 'connected') return <span className="conn-status conn-ok">Connected</span>
  if (row.status === 'pending_exchange')
    return <span className="conn-status conn-wait">Authorizing…</span>
  return <span className="conn-status conn-err" title={row.error}>Error: {row.error || 'unknown'}</span>
}

function ProviderRow({
  name,
  desc,
  row,
  appId,
  consentUrl,
}: {
  name: string
  desc: string
  row: IntegrationStatusRow | undefined
  appId: string
  consentUrl: () => string
}) {
  return (
    <div className="conn-row">
      <div>
        <div className="conn-name">{name}</div>
        <div className="conn-desc">{desc}</div>
      </div>
      {row?.status === 'connected' ? (
        statusChip(row)
      ) : appId ? (
        <div className="conn-action">
          {statusChip(row)}
          <button className="btn-resync" onClick={() => (window.location.href = consentUrl())}>
            Connect {name}
          </button>
        </div>
      ) : (
        <span className="conn-status conn-err">
          Demo app not registered yet — see "Shipping the demo apps" in the README
        </span>
      )}
    </div>
  )
}

export default function ConnectionsPanel({ rows, onClose }: Props) {
  const byy = Object.fromEntries(rows.map((r) => [r.source, r]))

  return (
    <div className="connections-panel">
      {onClose && (
        <button className="popover-close panel-close" onClick={onClose} aria-label="Close">×</button>
      )}
      <span className="skardi-mark big">◆</span>
      <h2>Connect your calendars</h2>
      <p className="panel-sub">
        Sign in and approve read-only calendar access — that's it. Grants are stored locally and
        refreshed automatically on every resync; nothing leaves your machine except the calendar
        API calls themselves.
      </p>

      <ProviderRow
        name="Google Calendar"
        desc="Authorize on Google's consent page"
        row={byy['google']}
        appId={GOOGLE_CLIENT_ID}
        consentUrl={googleConsentUrl}
      />
      <ProviderRow
        name="Feishu Calendar"
        desc="Authorize on Feishu's consent page"
        row={byy['feishu']}
        appId={FEISHU_APP_ID}
        consentUrl={feishuConsentUrl}
      />

      <p className="panel-hint">
        Requires the sync agent: <code>node agent/agent.mjs</code>. Fixture mode instead?{' '}
        <code>bash seed/seed.sh</code>.
      </p>
    </div>
  )
}
