import { describe, expect, it } from 'vitest'
import { initialSyncState, pickAdoptedSyncId, syncReducer, type SyncState } from './syncMachine'
import type { SyncStatusRow } from './types'

function run(events: Parameters<typeof syncReducer>[1][]): SyncState {
  return events.reduce(syncReducer, initialSyncState)
}

describe('syncReducer', () => {
  it('starts idle', () => {
    expect(initialSyncState.phase).toBe('idle')
  })

  it('START moves to syncing with both sources pending', () => {
    const s = run([{ type: 'START', syncId: 's1' }])
    expect(s.phase).toBe('syncing')
    expect(s.syncId).toBe('s1')
    expect(s.jobs.google).toBe('pending')
    expect(s.jobs.feishu).toBe('pending')
  })

  it('both jobs ok → success', () => {
    const s = run([
      { type: 'START', syncId: 's1' },
      { type: 'JOB_DONE', source: 'google', ok: true },
      { type: 'JOB_DONE', source: 'feishu', ok: true },
    ])
    expect(s.phase).toBe('success')
  })

  it('one failure → partial_failure with the error retained', () => {
    const s = run([
      { type: 'START', syncId: 's1' },
      { type: 'JOB_DONE', source: 'google', ok: true },
      { type: 'JOB_DONE', source: 'feishu', ok: false, error: 'rate limited' },
    ])
    expect(s.phase).toBe('partial_failure')
    expect(s.errors.feishu).toBe('rate limited')
  })

  it('both fail → failure', () => {
    const s = run([
      { type: 'START', syncId: 's1' },
      { type: 'JOB_DONE', source: 'google', ok: false, error: 'gateway down' },
      { type: 'JOB_DONE', source: 'feishu', ok: false, error: 'gateway down' },
    ])
    expect(s.phase).toBe('failure')
  })

  it('stays syncing until both sources report', () => {
    const s = run([
      { type: 'START', syncId: 's1' },
      { type: 'JOB_DONE', source: 'google', ok: true },
    ])
    expect(s.phase).toBe('syncing')
  })
})

describe('pickAdoptedSyncId', () => {
  const rows = (pairs: [string, string, number][]): SyncStatusRow[] =>
    pairs.map(([sync_id, source, cnt]) => ({ sync_id, source, cnt }))

  it('prefers the newest generation present for BOTH sources', () => {
    const adopted = pickAdoptedSyncId(
      rows([
        ['s3', 'google', 5], // s3 only has google → not adoptable
        ['s2', 'google', 4],
        ['s2', 'feishu', 3],
        ['s1', 'google', 4],
        ['s1', 'feishu', 2],
      ]),
    )
    expect(adopted).toBe('s2')
  })

  it('falls back to the newest single-source generation when no generation has both', () => {
    expect(pickAdoptedSyncId(rows([['s2', 'google', 1], ['s1', 'google', 3]]))).toBe('s2')
  })

  it('returns null when the store is empty', () => {
    expect(pickAdoptedSyncId([])).toBeNull()
  })
})
