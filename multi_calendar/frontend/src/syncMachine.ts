// Resync state machine (pure reducer) + generation adoption rule.
// A generation is only ever adopted whole: on partial or total failure the
// frontend keeps serving the previously adopted sync_id.

import type { Source, SyncStatusRow } from './types'

export type JobStatus = 'pending' | 'ok' | 'failed'

export interface SyncState {
  phase: 'idle' | 'syncing' | 'success' | 'partial_failure' | 'failure'
  syncId: string | null
  jobs: Record<Source, JobStatus>
  errors: Partial<Record<Source, string>>
}

export type SyncEvent =
  | { type: 'START'; syncId: string }
  | { type: 'JOB_DONE'; source: Source; ok: boolean; error?: string }

export const initialSyncState: SyncState = {
  phase: 'idle',
  syncId: null,
  jobs: { google: 'pending', feishu: 'pending' },
  errors: {},
}

export function syncReducer(state: SyncState, ev: SyncEvent): SyncState {
  switch (ev.type) {
    case 'START':
      return {
        phase: 'syncing',
        syncId: ev.syncId,
        jobs: { google: 'pending', feishu: 'pending' },
        errors: {},
      }
    case 'JOB_DONE': {
      const jobs: Record<Source, JobStatus> = { ...state.jobs, [ev.source]: ev.ok ? 'ok' : 'failed' }
      const errors = ev.error ? { ...state.errors, [ev.source]: ev.error } : state.errors
      const settled = jobs.google !== 'pending' && jobs.feishu !== 'pending'
      if (!settled) return { ...state, jobs, errors }
      const okCount = Number(jobs.google === 'ok') + Number(jobs.feishu === 'ok')
      const phase = okCount === 2 ? 'success' : okCount === 1 ? 'partial_failure' : 'failure'
      return { ...state, jobs, errors, phase }
    }
  }
}

/** Newest sync_id present for BOTH sources; else newest of any; else null. */
export function pickAdoptedSyncId(rows: SyncStatusRow[]): string | null {
  if (rows.length === 0) return null
  const bySync = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!bySync.has(r.sync_id)) bySync.set(r.sync_id, new Set())
    bySync.get(r.sync_id)!.add(r.source)
  }
  const ids = [...bySync.keys()].sort().reverse()
  const complete = ids.find((id) => bySync.get(id)!.has('google') && bySync.get(id)!.has('feishu'))
  return complete ?? ids[0]
}
