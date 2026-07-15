import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  getSyncRequests,
  integrationStatus,
  listMeetings,
  pruneOldSyncs,
  requestSync,
  saveIntegration,
  syncStatus,
} from './api'
import { initialSyncState, pickAdoptedSyncId, syncReducer } from './syncMachine'
import { newSyncId, weekDays, windowRange } from './time'
import type { IntegrationStatusRow, Meeting, Source, SyncStatusRow } from './types'
import ConnectionsPanel, { GOOGLE_REDIRECT_PATH } from './components/ConnectionsPanel'
import EventPopover from './components/EventPopover'
import HeaderBar, { type ConnectionStates } from './components/HeaderBar'
import Toasts, { type ToastMsg } from './components/Toast'
import WeekGrid from './components/WeekGrid'

const POLL_MS = 1500
const SYNC_TIMEOUT_MS = 120_000
const SOURCES: Source[] = ['google', 'feishu']

type Screen = 'loading' | 'offline' | 'connections' | 'calendar'

function countsFor(rows: SyncStatusRow[], syncId: string | null): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of rows) if (r.sync_id === syncId) counts[r.source] = r.cnt
  return counts
}

function toConnections(rows: IntegrationStatusRow[]): ConnectionStates {
  const get = (s: Source): boolean | null => {
    const row = rows.find((r) => r.source === s)
    if (!row) return false
    return row.status === 'connected' ? true : row.status === 'pending_exchange' ? null : false
  }
  return { google: get('google'), feishu: get('feishu') }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [week, setWeek] = useState<0 | 1>(0)
  const [integrations, setIntegrations] = useState<IntegrationStatusRow[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [adoptedSyncId, setAdoptedSyncId] = useState<string | null>(null)
  const [statusRows, setStatusRows] = useState<SyncStatusRow[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selected, setSelected] = useState<{ m: Meeting; anchor: DOMRect } | null>(null)
  const [syncState, dispatch] = useReducer(syncReducer, initialSyncState)
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const toastSeq = useRef(0)
  const prevAdopted = useRef<string | null>(null)

  const connections = toConnections(integrations)

  const toast = useCallback((kind: ToastMsg['kind'], text: string) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts, { id, kind, text }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 7000)
  }, [])

  const refreshIntegrations = useCallback(async () => {
    const rows = await integrationStatus()
    setIntegrations(rows)
    return rows
  }, [])

  const loadAdopted = useCallback(async (): Promise<string | null> => {
    const rows = await syncStatus()
    setStatusRows(rows)
    const adopted = pickAdoptedSyncId(rows)
    setAdoptedSyncId(adopted)
    setMeetings(adopted ? await listMeetings(adopted) : [])
    return adopted
  }, [])

  // Google OAuth callback: stash the auth code into the integrations store,
  // then let the sync agent (which holds the client secret) exchange it.
  const handleOAuthCallback = useCallback(async () => {
    if (window.location.pathname !== GOOGLE_REDIRECT_PATH) return
    const code = new URLSearchParams(window.location.search).get('code')
    window.history.replaceState(null, '', '/')
    if (!code) {
      toast('error', 'Google authorization did not return a code — try connecting again.')
      return
    }
    await saveIntegration('google', 'pending_exchange', {
      auth_code: code,
      redirect_uri: `${window.location.origin}${GOOGLE_REDIRECT_PATH}`,
    })
    toast('info', 'Google authorized — finishing setup…')
  }, [toast])

  // Initial load.
  useEffect(() => {
    ;(async () => {
      await handleOAuthCallback().catch(() => {})
      // Only sync_status failing means skardi is unreachable; a hiccup on the
      // integrations table alone shouldn't brick the whole app.
      const [rows, adopted] = await Promise.all([
        refreshIntegrations().catch(() => [] as IntegrationStatusRow[]),
        loadAdopted(),
      ])
      const anyConnected = rows.some((r) => r.status === 'connected' || r.status === 'pending_exchange')
      setScreen(adopted || anyConnected ? 'calendar' : 'connections')
    })().catch(() => setScreen('offline'))
  }, [handleOAuthCallback, refreshIntegrations, loadAdopted])

  // While any integration is pending_exchange, poll until the agent settles it.
  useEffect(() => {
    if (!integrations.some((r) => r.status === 'pending_exchange')) return
    const t = setInterval(async () => {
      const rows = await refreshIntegrations().catch(() => null)
      if (!rows) return
      for (const r of rows) {
        if (r.status === 'connected' && integrations.find((o) => o.source === r.source)?.status === 'pending_exchange') {
          toast('success', `${r.source === 'google' ? 'Google' : 'Feishu'} connected`)
        }
        if (r.status === 'error' && integrations.find((o) => o.source === r.source)?.status === 'pending_exchange') {
          toast('error', `${r.source}: ${r.error}`)
        }
      }
    }, POLL_MS)
    return () => clearInterval(t)
  }, [integrations, refreshIntegrations, toast])

  const onConnectFeishu = useCallback(() => {
    ;(async () => {
      await saveIntegration('feishu', 'pending_exchange', {})
      await refreshIntegrations()
      toast('info', 'Connecting Feishu…')
    })().catch((e) => toast('error', `Connecting Feishu failed: ${e.message ?? e}`))
  }, [refreshIntegrations, toast])

  // Poll one source's queued sync request to a terminal state.
  const awaitSyncRequest = useCallback(
    async (syncId: string, source: Source) => {
      const deadline = Date.now() + SYNC_TIMEOUT_MS
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        if (Date.now() > deadline) {
          return dispatch({
            type: 'JOB_DONE',
            source,
            ok: false,
            error: 'timed out — is the sync agent running? (node agent/agent.mjs)',
          })
        }
        const rows = await getSyncRequests(syncId).catch(() => [])
        const row = rows.find((r) => r.source === source)
        if (!row) continue
        if (row.status === 'ok') return dispatch({ type: 'JOB_DONE', source, ok: true })
        if (row.status === 'failed')
          return dispatch({ type: 'JOB_DONE', source, ok: false, error: row.error || 'sync failed' })
      }
    },
    [dispatch],
  )

  const onResync = useCallback(() => {
    const syncId = newSyncId(new Date())
    const { fromTs, toTs } = windowRange(new Date())
    prevAdopted.current = adoptedSyncId
    dispatch({ type: 'START', syncId })
    for (const source of SOURCES) {
      if (connections[source] === true) {
        void requestSync(syncId, source, fromTs, toTs)
          .then(() => awaitSyncRequest(syncId, source))
          .catch((e) =>
            dispatch({ type: 'JOB_DONE', source, ok: false, error: e.message ?? String(e) }),
          )
      } else {
        // Not-connected sources legitimately contribute zero rows; treating
        // them as vacuously ok keeps "success = every connected source synced".
        dispatch({ type: 'JOB_DONE', source, ok: true })
      }
    }
  }, [adoptedSyncId, connections, awaitSyncRequest])

  // React to the sync machine reaching a terminal phase.
  useEffect(() => {
    if (syncState.phase === 'success' && syncState.syncId) {
      ;(async () => {
        setAdoptedSyncId(syncState.syncId)
        setMeetings(await listMeetings(syncState.syncId!))
        const rows = await syncStatus()
        setStatusRows(rows)
        if (prevAdopted.current && prevAdopted.current !== syncState.syncId) {
          await pruneOldSyncs(syncState.syncId!, prevAdopted.current).catch(() => {})
        }
        toast('success', 'Calendars synced')
      })().catch((e) => toast('error', `Post-sync refresh failed: ${e.message ?? e}`))
    } else if (syncState.phase === 'partial_failure' || syncState.phase === 'failure') {
      const failed = SOURCES.filter((s) => syncState.jobs[s] === 'failed')
      for (const s of failed) {
        toast('error', `${s === 'google' ? 'Google' : 'Feishu'} sync failed: ${syncState.errors[s] ?? 'unknown error'}`)
      }
      if (syncState.phase === 'partial_failure') {
        toast('info', 'Keeping the previous complete sync — a generation is only adopted whole.')
      }
    }
  }, [syncState, toast])

  if (screen === 'loading') {
    return <div className="fullpage">Loading…</div>
  }

  if (screen === 'offline') {
    return (
      <div className="fullpage">
        <div className="offline-banner">
          <h2>Skardi server unreachable</h2>
          <p>
            Start it from <code>multi_calendar/</code>:
          </p>
          <pre>docker compose up -d skardi{'\n'}bash seed/seed.sh</pre>
          <button className="btn-resync" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'connections') {
    return <ConnectionsPanel rows={integrations} onConnectFeishu={onConnectFeishu} />
  }

  return (
    <>
      <HeaderBar
        week={week}
        onWeek={setWeek}
        connections={connections}
        lastSync={{ syncId: adoptedSyncId, counts: countsFor(statusRows, adoptedSyncId) }}
        syncState={syncState}
        onResync={onResync}
        onOpenSettings={() => setShowSettings(true)}
      />
      {meetings.length === 0 ? (
        <div className="fullpage">
          {adoptedSyncId ? (
            <p className="empty-note">No meetings in the next two weeks 🎉</p>
          ) : (
            <div className="empty-note">
              <p>Connected, but nothing synced yet.</p>
              <button className="btn-resync" onClick={onResync}>
                Resync now
              </button>
            </div>
          )}
        </div>
      ) : (
        <WeekGrid
          days={weekDays(new Date(), week)}
          meetings={meetings}
          onSelect={(m, anchor) => setSelected({ m, anchor })}
          onSwipe={(dir) => setWeek(dir > 0 ? 1 : 0)}
        />
      )}
      {showSettings && (
        <div className="settings-overlay">
          <ConnectionsPanel
            rows={integrations}
            onConnectFeishu={onConnectFeishu}
            onClose={() => setShowSettings(false)}
          />
        </div>
      )}
      {selected && (
        <EventPopover m={selected.m} anchor={selected.anchor} onClose={() => setSelected(null)} />
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
    </>
  )
}
