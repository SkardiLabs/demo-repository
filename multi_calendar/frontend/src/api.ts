// Skardi API client — the frontend's ONLY backend.
// Reads are pipeline executions (POST /{name}/execute); resync drives the
// jobs API (POST /jobs/{name}/run + GET /jobs/runs/{run_id}).

import type { JobRun, Meeting, SkardiBatchResponse, Source, SyncStatusRow } from './types'

const BASE = '/api'

async function execute<T>(pipeline: string, params: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`${BASE}/${pipeline}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json: SkardiBatchResponse<T> = await res.json()
  if (!json.success) {
    throw new Error(json.error ?? 'Unknown API error')
  }
  return json.data
}

export function listMeetings(syncId: string): Promise<Meeting[]> {
  return execute<Meeting>('list_meetings', { sync_id: syncId })
}

export function syncStatus(): Promise<SyncStatusRow[]> {
  return execute<SyncStatusRow>('sync_status', {})
}

export async function pruneOldSyncs(keepA: string, keepB: string): Promise<void> {
  await execute('prune_old_syncs', { keep_a: keepA, keep_b: keepB })
}

/** Connection probe. In fixture mode the probe pipelines are not loaded, so
 * any failure (404, source-pack error) reads as "not connected". */
export async function probe(source: Source): Promise<boolean> {
  try {
    await execute(source === 'google' ? 'probe_google' : 'probe_feishu', {})
    return true
  } catch {
    return false
  }
}

export async function runJob(name: string, params: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/jobs/${name}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = await res.json()
  const runId = json.run_id ?? json.id
  if (!runId) throw new Error('Job submission returned no run_id')
  return String(runId)
}

export async function getJobRun(runId: string): Promise<JobRun> {
  const res = await fetch(`${BASE}/jobs/runs/${runId}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = await res.json()
  return { run_id: runId, status: String(json.status ?? 'unknown'), error: json.error ?? null }
}
