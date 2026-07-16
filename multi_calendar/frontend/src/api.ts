// Skardi API client — the frontend's ONLY backend.
// Reads are pipeline executions (POST /{name}/execute); resync drives the
// jobs API (POST /jobs/{name}/run + GET /jobs/runs/{run_id}).

import type {
  IntegrationStatusRow,
  Meeting,
  SkardiBatchResponse,
  Source,
  SyncRequestRow,
  SyncStatusRow,
} from './types'

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

// ── Integrations (credential setup) ─────────────────────────────────────────
// Credentials are stored in the local skardi-served SQLite; the sync agent
// (agent/agent.mjs — interim stand-in for skardi open-connector jobs) reads
// them, exchanges OAuth codes, and validates Feishu apps.

export function integrationStatus(): Promise<IntegrationStatusRow[]> {
  return execute<IntegrationStatusRow>('integration_status', {})
}

export async function saveIntegration(
  source: Source,
  status: 'pending_exchange',
  config: Record<string, string>,
): Promise<void> {
  await execute('save_integration', { source })
  await execute('insert_integration', {
    source,
    status,
    config_json: JSON.stringify(config),
    error: '',
    updated_at: new Date().toISOString(),
  })
}

// ── Resync work queue ───────────────────────────────────────────────────────
// The frontend enqueues per-source sync requests; the agent executes them.
// When skardi's calendar source packs land, these two calls become
// POST /jobs/sync_*_meetings/run + GET /jobs/runs/:id with no UI change.

export async function requestSync(
  syncId: string,
  source: Source,
  fromTs: string,
  toTs: string,
): Promise<void> {
  await execute('request_sync', {
    sync_id: syncId,
    source,
    from_ts: fromTs,
    to_ts: toTs,
    requested_at: new Date().toISOString(),
  })
}

export function getSyncRequests(syncId: string): Promise<SyncRequestRow[]> {
  return execute<SyncRequestRow>('get_sync_requests', { sync_id: syncId })
}
