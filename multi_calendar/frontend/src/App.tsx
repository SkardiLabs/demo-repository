import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { getJobRun, listMeetings, probe, pruneOldSyncs, runJob, syncStatus } from './api'
import { initialSyncState, pickAdoptedSyncId, syncReducer } from './syncMachine'
import { newSyncId, weekDays, windowRange } from './time'
import type { Meeting, Source, SyncStatusRow } from './types'
import ConnectionsPanel from './components/ConnectionsPanel'
import EventPopover from './components/EventPopover'
import HeaderBar, { type ConnectionStates } from './components/HeaderBar'
import Toasts, { type ToastMsg } from './components/Toast'
import WeekGrid from './components/WeekGrid'

const POLL_MS = 1500
const JOB_BY_SOURCE: Record<Source, string> = {
  google: 'sync_google_meetings',
  feishu: 'sync_feishu_meetings',
}
const TERMINAL_OK = new Set(['succeeded', 'success', 'completed'])
const TERMINAL_FAIL = new Set(['failed', 'error', 'cancelled', 'timeout'])

type Screen = 'loading' | 'offline' | 'connections' | 'calendar'

function countsFor(rows: SyncStatusRow[], syncId: string | null): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of rows) if (r.sync_id === syncId) counts[r.source] = r.cnt
  return counts
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [week, setWeek] = useState<0 | 1>(0)
  const [connections, setConnections] = useState<ConnectionStates>({ google: null, feishu: null })
  const [adoptedSyncId, setAdoptedSyncId] = useState<string | null>(null)
  const [statusRows, setStatusRows] = useState<SyncStatusRow[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selected, setSelected] = useState<{ m: Meeting; anchor: DOMRect } | null>(null)
  const [syncState, dispatch] = useReducer(syncReducer, initialSyncState)
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const toastSeq = useRef(0)
  const prevAdopted = useRef<string | null>(null)

  const toast = useCallback((kind: ToastMsg['kind'], text: string) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts, { id, kind, text }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 6000)
  }, [])

  const loadAdopted = useCallback(async (): Promise<string | null> => {
    const rows = await syncStatus()
    setStatusRows(rows)
    const adopted = pickAdoptedSyncId(rows)
    setAdoptedSyncId(adopted)
    setMeetings(adopted ? await listMeetings(adopted) : [])
    return adopted
  }, [])

  // Initial load: probes + adopted generation in parallel.
  useEffect(() => {
    ;(async () => {
      const [google, feishu, adopted] = await Promise.all([
        probe('google'),
        probe('feishu'),
        loadAdopted().catch((e) => {
          throw e // sync_status failing = skardi unreachable
        }),
      ])
      setConnections({ google, feishu })
      setScreen(adopted || google || feishu ? 'calendar' : 'connections')
    })().catch(() => setScreen('offline'))
  }, [loadAdopted])

  // Poll one source's job to a terminal state.
  const awaitJob = useCallback(
    async (source: Source, params: Record<string, unknown>) => {
      try {
        const runId = await runJob(JOB_BY_SOURCE[source], params)
        for (;;) {
          await new Promise((r) => setTimeout(r, POLL_MS))
          const run = await getJobRun(runId)
          const s = run.status.toLowerCase()
          if (TERMINAL_OK.has(s)) return dispatch({ type: 'JOB_DONE', source, ok: true })
          if (TERMINAL_FAIL.has(s))
            return dispatch({ type: 'JOB_DONE', source, ok: false, error: run.error ?? run.status })
        }
      } catch (e) {
        dispatch({ type: 'JOB_DONE', source, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
    [dispatch],
  )

  const onResync = useCallback(() => {
    const syncId = newSyncId(new Date())
    const { fromTs, toTs } = windowRange(new Date())
    prevAdopted.current = adoptedSyncId
    dispatch({ type: 'START', syncId })
    const params = { sync_id: syncId, from_ts: fromTs, to_ts: toTs }
    void awaitJob('google', params)
    void awaitJob('feishu', params)
  }, [adoptedSyncId, awaitJob])

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
      const failed = (['google', 'feishu'] as Source[]).filter((s) => syncState.jobs[s] === 'failed')
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
    return <ConnectionsPanel connections={connections} />
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
      {selected && (
        <EventPopover m={selected.m} anchor={selected.anchor} onClose={() => setSelected(null)} />
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
    </>
  )
}
