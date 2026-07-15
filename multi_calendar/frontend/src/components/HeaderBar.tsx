import { relativeAgo } from '../time'
import type { SyncState } from '../syncMachine'
import type { Source } from '../types'

export interface ConnectionStates {
  google: boolean | null // null = probing
  feishu: boolean | null
}

interface Props {
  week: 0 | 1
  onWeek: (w: 0 | 1) => void
  connections: ConnectionStates
  lastSync: { syncId: string | null; counts: Record<string, number> }
  syncState: SyncState
  onResync: () => void
}

function Chip({ source, state }: { source: Source; state: boolean | null }) {
  const label = source === 'google' ? 'Google' : 'Feishu'
  const cls = state === null ? 'chip-probing' : state ? 'chip-on' : 'chip-off'
  return (
    <span className={`conn-chip ${cls}`} title={state ? `${label} connected` : `${label} not connected`}>
      <span className="chip-dot" /> {label}
    </span>
  )
}

export default function HeaderBar({ week, onWeek, connections, lastSync, syncState, onResync }: Props) {
  const syncing = syncState.phase === 'syncing'
  const canResync = !syncing && (connections.google === true || connections.feishu === true)
  const isFixtureSync = lastSync.syncId?.startsWith('fixture-')

  return (
    <header className="headerbar">
      <div className="header-left">
        <span className="skardi-mark">◆</span>
        <h1 className="app-title">Multi-Calendar</h1>
      </div>

      <div className="header-center">
        <button className="week-arrow" onClick={() => onWeek(0)} disabled={week === 0} aria-label="Previous week">
          ‹
        </button>
        <div className="week-toggle">
          <button className={week === 0 ? 'week-btn week-active' : 'week-btn'} onClick={() => onWeek(0)}>
            This week
          </button>
          <button className={week === 1 ? 'week-btn week-active' : 'week-btn'} onClick={() => onWeek(1)}>
            Next week
          </button>
        </div>
        <button className="week-arrow" onClick={() => onWeek(1)} disabled={week === 1} aria-label="Next week">
          ›
        </button>
      </div>

      <div className="header-right">
        <Chip source="google" state={connections.google} />
        <Chip source="feishu" state={connections.feishu} />
        {lastSync.syncId && (
          <span className="last-sync">
            {isFixtureSync ? 'fixture data' : `synced ${relativeAgo(lastSync.syncId)}`}
            {' · '}G {lastSync.counts.google ?? 0} · F {lastSync.counts.feishu ?? 0}
          </span>
        )}
        <button className="btn-resync" onClick={onResync} disabled={!canResync}>
          {syncing ? (
            <>
              <span className="spinner" />
              {syncState.jobs.google === 'pending' && syncState.jobs.feishu === 'pending'
                ? 'Syncing…'
                : syncState.jobs.google === 'pending'
                  ? 'Google…'
                  : 'Feishu…'}
            </>
          ) : (
            'Resync'
          )}
        </button>
      </div>
    </header>
  )
}
