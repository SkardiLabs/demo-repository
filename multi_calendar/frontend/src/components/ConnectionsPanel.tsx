import { useState } from 'react'
import type { IntegrationStatusRow } from '../types'

export const GOOGLE_REDIRECT_PATH = '/oauth/google'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/** Stashes client creds across the OAuth redirect round-trip. */
export const GOOGLE_CREDS_KEY = 'mc_google_creds'

export function googleConsentUrl(clientId: string): string {
  const redirect = `${window.location.origin}${GOOGLE_REDIRECT_PATH}`
  const qs = new URLSearchParams({
    client_id: clientId,
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
  onSaveFeishu: (appId: string, appSecret: string, calendarId: string) => void
  onClose?: () => void
}

function statusChip(row: IntegrationStatusRow | undefined) {
  if (!row) return <span className="conn-status">Not connected</span>
  if (row.status === 'connected') return <span className="conn-status conn-ok">Connected</span>
  if (row.status === 'pending_exchange')
    return <span className="conn-status conn-wait">Waiting for sync agent…</span>
  return <span className="conn-status conn-err" title={row.error}>Error: {row.error || 'unknown'}</span>
}

export default function ConnectionsPanel({ rows, onSaveFeishu, onClose }: Props) {
  const byy = Object.fromEntries(rows.map((r) => [r.source, r]))
  const [gClientId, setGClientId] = useState('')
  const [gClientSecret, setGClientSecret] = useState('')
  const [fAppId, setFAppId] = useState('')
  const [fAppSecret, setFAppSecret] = useState('')
  const [fCalendarId, setFCalendarId] = useState('')

  const startGoogleOAuth = () => {
    localStorage.setItem(
      GOOGLE_CREDS_KEY,
      JSON.stringify({ client_id: gClientId.trim(), client_secret: gClientSecret.trim() }),
    )
    window.location.href = googleConsentUrl(gClientId.trim())
  }

  return (
    <div className="connections-panel">
      {onClose && (
        <button className="popover-close panel-close" onClick={onClose} aria-label="Close">×</button>
      )}
      <span className="skardi-mark big">◆</span>
      <h2>Connect your calendars</h2>
      <p className="panel-sub">
        Credentials are stored in the <strong>local</strong> SQLite store via skardi and used only
        by the local sync agent (<code>node agent/agent.mjs</code>) — nothing leaves your machine
        except the calendar API calls themselves. Connect once; resync anytime.
      </p>

      <div className="conn-card">
        <div className="conn-card-head">
          <span className="conn-name">Google Calendar</span>
          {statusChip(byy['google'])}
        </div>
        {byy['google']?.status !== 'connected' && (
          <>
            <p className="conn-desc">
              Create an OAuth client (type <em>Web application</em>) in Google Cloud Console with
              redirect URI <code>{window.location.origin}{GOOGLE_REDIRECT_PATH}</code>, then paste
              it here and authorize.
            </p>
            <input
              placeholder="Client ID"
              value={gClientId}
              onChange={(e) => setGClientId(e.target.value)}
            />
            <input
              placeholder="Client secret"
              type="password"
              value={gClientSecret}
              onChange={(e) => setGClientSecret(e.target.value)}
            />
            <button
              className="btn-resync"
              disabled={!gClientId.trim() || !gClientSecret.trim()}
              onClick={startGoogleOAuth}
            >
              Authorize with Google
            </button>
          </>
        )}
      </div>

      <div className="conn-card">
        <div className="conn-card-head">
          <span className="conn-name">Feishu Calendar</span>
          {statusChip(byy['feishu'])}
        </div>
        {byy['feishu']?.status !== 'connected' && (
          <>
            <p className="conn-desc">
              Create a Feishu custom app with the <code>calendar:calendar:readonly</code> scope
              family, then paste its credentials. Calendar ID is optional — the primary visible
              calendar is used by default.
            </p>
            <input placeholder="App ID" value={fAppId} onChange={(e) => setFAppId(e.target.value)} />
            <input
              placeholder="App secret"
              type="password"
              value={fAppSecret}
              onChange={(e) => setFAppSecret(e.target.value)}
            />
            <input
              placeholder="Calendar ID (optional)"
              value={fCalendarId}
              onChange={(e) => setFCalendarId(e.target.value)}
            />
            <button
              className="btn-resync"
              disabled={!fAppId.trim() || !fAppSecret.trim()}
              onClick={() => onSaveFeishu(fAppId.trim(), fAppSecret.trim(), fCalendarId.trim())}
            >
              Save Feishu credentials
            </button>
          </>
        )}
      </div>

      <p className="panel-hint">
        The sync agent must be running for setup and resync:{' '}
        <code>node agent/agent.mjs</code>. Fixture mode instead? <code>bash seed/seed.sh</code>.
      </p>
    </div>
  )
}
