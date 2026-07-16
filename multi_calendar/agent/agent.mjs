#!/usr/bin/env node
// Multi-Calendar sync agent — the ONLY component that talks to Google/Feishu.
//
// This is an interim stand-in for skardi's open-connector jobs (SkardiLabs/
// skardi#151 follow-ups). All state lives in skardi-served SQLite: the agent
// polls for work through skardi pipelines and writes results back the same
// way. When the google_calendar/feishu_calendar source packs land, delete
// this file and uncomment the jobs/ + saas bindings instead.
//
// Usage:  node agent/agent.mjs        (Node 18+, no dependencies)

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKARDI = process.env.SKARDI_URL || 'http://localhost:8081'
const POLL_MS = 2000

// Provider app credentials: the demo ships registered demo apps in
// demo_credentials.json (publisher registers once, users provide nothing);
// a local .env overrides for development. Precedence: env > .env > shipped.
const HERE = dirname(fileURLToPath(import.meta.url))
function loadCredentials() {
  try {
    const shipped = JSON.parse(readFileSync(resolve(HERE, '../demo_credentials.json'), 'utf8'))
    for (const [k, v] of Object.entries(shipped)) {
      if (typeof v === 'string' && v && !(k in process.env)) process.env[k] = v
    }
  } catch {
    /* no shipped credentials */
  }
  try {
    for (const line of readFileSync(resolve(HERE, '../.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && m[2].trim()) process.env[m[1]] = m[2].trim()
    }
  } catch {
    /* no .env */
  }
}
loadCredentials()

const ENV = {
  google: () => {
    const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env
    if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing — copy multi_calendar/.env.example to .env and fill it in')
    return { client_id: id, client_secret: secret }
  },
  feishu: () => {
    const { FEISHU_APP_ID: id, FEISHU_APP_SECRET: secret } = process.env
    if (!id || !secret) throw new Error('FEISHU_APP_ID / FEISHU_APP_SECRET missing — copy multi_calendar/.env.example to .env and fill it in')
    return { app_id: id, app_secret: secret, calendar_id: process.env.FEISHU_CALENDAR_ID || '' }
  },
}

// ── Skardi pipeline client ──────────────────────────────────────────────────

async function exec(pipeline, params = {}) {
  const res = await fetch(`${SKARDI}/${pipeline}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`${pipeline}: HTTP ${res.status} ${await res.text()}`)
  const json = await res.json()
  if (!json.success) throw new Error(`${pipeline}: ${json.error}`)
  return json.data
}

async function saveIntegration(source, status, config, error = '') {
  await exec('save_integration', { source })
  await exec('insert_integration', {
    source,
    status,
    config_json: JSON.stringify(config),
    error,
    updated_at: new Date().toISOString(),
  })
}

// ── Google Calendar ─────────────────────────────────────────────────────────

async function googleToken(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Google token: ${json.error_description ?? json.error ?? res.status}`)
  return json
}

async function exchangeGoogleCode(config) {
  const creds = ENV.google()
  const tok = await googleToken({
    ...creds,
    code: config.auth_code,
    redirect_uri: config.redirect_uri,
    grant_type: 'authorization_code',
  })
  if (!tok.refresh_token) {
    throw new Error('Google returned no refresh_token — remove the app grant at myaccount.google.com/permissions and reconnect')
  }
  // Only the refresh token is persisted; the client secret stays in .env.
  return { refresh_token: tok.refresh_token }
}

const GOOGLE_RSVP = { accepted: 'accepted', declined: 'declined' }

async function fetchGoogleEvents(config, fromTs, toTs) {
  const { access_token } = await googleToken({
    ...ENV.google(),
    refresh_token: config.refresh_token,
    grant_type: 'refresh_token',
  })
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.search = new URLSearchParams({
    timeMin: fromTs,
    timeMax: toTs,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  }).toString()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } })
  const json = await res.json()
  if (!res.ok) throw new Error(`Google events: ${json.error?.message ?? res.status}`)

  return (json.items ?? []).map((ev) => {
    const allDay = Boolean(ev.start?.date)
    const toIso = (t) => (t?.dateTime ? new Date(t.dateTime).toISOString() : localMidnightIso(t?.date))
    const video =
      ev.hangoutLink ??
      ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
      ''
    return {
      event_id: ev.id,
      title: ev.summary ?? '',
      description: ev.description ?? '',
      start_at: toIso(ev.start),
      end_at: toIso(ev.end),
      is_all_day: allDay ? 1 : 0,
      status: ev.status ?? 'confirmed',
      organizer: ev.organizer?.displayName ?? ev.organizer?.email ?? '',
      attendees_json: JSON.stringify(
        (ev.attendees ?? []).map((a) => ({
          name: a.displayName ?? a.email,
          email: a.email,
          response: GOOGLE_RSVP[a.responseStatus] ?? 'pending',
        })),
      ),
      meeting_url: video,
      html_link: ev.htmlLink ?? '',
    }
  })
}

// ── Feishu Calendar ─────────────────────────────────────────────────────────

const FEISHU = 'https://open.feishu.cn/open-apis'
const FEISHU_RSVP = { accept: 'accepted', decline: 'declined' }

async function feishuApi(path, opts = {}, token) {
  const res = await fetch(`${FEISHU}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  })
  const json = await res.json()
  if (json.code !== 0) throw new Error(`Feishu ${path}: ${json.msg} (code ${json.code})`)
  return json
}

// User OAuth (authen v2) — mirrors the Google flow: the user consents on
// Feishu's page and the demo reads THEIR calendars via user_access_token.
// Feishu rotates refresh tokens on every use, so callers must persist the
// returned refresh_token.
async function feishuOAuthToken(body) {
  const creds = ENV.feishu()
  const res = await fetch(`${FEISHU}/authen/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: creds.app_id, client_secret: creds.app_secret, ...body }),
  })
  const json = await res.json()
  if (!res.ok || json.error || (json.code !== undefined && json.code !== 0)) {
    throw new Error(`Feishu oauth: ${json.error_description ?? json.msg ?? json.error ?? res.status}`)
  }
  if (!json.access_token) throw new Error('Feishu oauth: no access_token in response')
  return json
}

async function exchangeFeishuCode(config) {
  const tok = await feishuOAuthToken({
    grant_type: 'authorization_code',
    code: config.auth_code,
    redirect_uri: config.redirect_uri,
  })
  if (!tok.refresh_token) throw new Error('Feishu returned no refresh_token — ensure the offline_access scope is enabled for the app')
  return { refresh_token: tok.refresh_token }
}

async function feishuUserToken(config) {
  const tok = await feishuOAuthToken({ grant_type: 'refresh_token', refresh_token: config.refresh_token })
  // Persist the rotated refresh token immediately — the old one is now dead.
  if (tok.refresh_token && tok.refresh_token !== config.refresh_token) {
    config.refresh_token = tok.refresh_token
    await saveIntegration('feishu', 'connected', { refresh_token: tok.refresh_token })
  }
  return tok.access_token
}

async function feishuCalendarId(config, token) {
  if (config.calendar_id) return config.calendar_id
  if (ENV.feishu().calendar_id) return ENV.feishu().calendar_id
  const json = await feishuApi('/calendar/v4/calendars?page_size=50', {}, token)
  const cals = json.data?.calendar_list ?? []
  const primary = cals.find((c) => c.type === 'primary') ?? cals[0]
  if (!primary) throw new Error('Feishu: no calendars visible for this user')
  return primary.calendar_id
}

async function fetchFeishuEvents(config, fromTs, toTs) {
  const token = await feishuUserToken(config)
  const calId = await feishuCalendarId(config, token)
  const items = []
  let pageToken = ''
  do {
    const qs = new URLSearchParams({
      start_time: String(Math.floor(new Date(fromTs).getTime() / 1000)),
      end_time: String(Math.floor(new Date(toTs).getTime() / 1000)),
      page_size: '500',
      ...(pageToken ? { page_token: pageToken } : {}),
    })
    const json = await feishuApi(`/calendar/v4/calendars/${encodeURIComponent(calId)}/events?${qs}`, {}, token)
    items.push(...(json.data?.items ?? []))
    pageToken = json.data?.has_more ? json.data?.page_token : ''
  } while (pageToken)

  const rows = []
  for (const ev of items) {
    const allDay = Boolean(ev.start_time?.date)
    const toIso = (t) =>
      t?.timestamp ? new Date(Number(t.timestamp) * 1000).toISOString() : localMidnightIso(t?.date)
    // Attendees are a separate endpoint; best-effort, never fatal.
    let attendees = []
    try {
      const aj = await feishuApi(
        `/calendar/v4/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ev.event_id)}/attendees?page_size=100`,
        {},
        token,
      )
      attendees = (aj.data?.items ?? []).map((a) => ({
        name: a.display_name || a.chat_id || a.user_id || 'Unknown',
        response: FEISHU_RSVP[a.rsvp_status] ?? 'pending',
      }))
    } catch {
      /* attendee visibility depends on app scopes — skip */
    }
    rows.push({
      event_id: ev.event_id,
      title: ev.summary ?? '',
      description: ev.description ?? '',
      start_at: toIso(ev.start_time),
      end_at: toIso(ev.end_time),
      is_all_day: allDay ? 1 : 0,
      status: ev.status === 'cancelled' ? 'cancelled' : 'confirmed',
      organizer: ev.organizer?.display_name ?? '',
      attendees_json: JSON.stringify(attendees),
      meeting_url: ev.vchat?.meeting_url ?? '',
      html_link: ev.app_link ?? '',
    })
  }
  return rows
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function localMidnightIso(dateStr) {
  // 'YYYY-MM-DD' all-day boundary → local midnight, stored as UTC ISO.
  if (!dateStr) return new Date(0).toISOString()
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toISOString()
}

const FETCHERS = { google: fetchGoogleEvents, feishu: fetchFeishuEvents }

// ── Work loops ──────────────────────────────────────────────────────────────

async function processIntegrations() {
  const rows = await exec('get_integrations')
  for (const row of rows) {
    if (row.status !== 'pending_exchange') continue
    const config = JSON.parse(row.config_json)
    try {
      if (row.source === 'google') {
        const stored = await exchangeGoogleCode(config)
        await saveIntegration('google', 'connected', stored)
        console.log('[agent] google: OAuth code exchanged, refresh token stored')
      } else if (row.source === 'feishu') {
        const stored = await exchangeFeishuCode(config)
        await saveIntegration('feishu', 'connected', stored)
        console.log('[agent] feishu: OAuth code exchanged, refresh token stored')
      }
    } catch (e) {
      await saveIntegration(row.source, 'error', config, String(e.message ?? e))
      console.error(`[agent] ${row.source}: ${e.message ?? e}`)
    }
  }
}

async function processSyncRequests() {
  const pending = await exec('pending_sync_requests')
  if (pending.length === 0) return
  const integrations = Object.fromEntries((await exec('get_integrations')).map((r) => [r.source, r]))

  for (const req of pending) {
    const mark = (status, error = '') =>
      exec('update_sync_request', { sync_id: req.sync_id, source: req.source, status, error })
    const integration = integrations[req.source]
    if (!integration || integration.status !== 'connected') {
      await mark('failed', `${req.source} is not connected`)
      continue
    }
    await mark('running')
    try {
      const config = JSON.parse(integration.config_json)
      const events = await FETCHERS[req.source](config, req.from_ts, req.to_ts)
      for (const ev of events) {
        await exec('insert_meeting', { sync_id: req.sync_id, source: req.source, ...ev })
      }
      await mark('ok')
      console.log(`[agent] ${req.source}: synced ${events.length} events into generation ${req.sync_id}`)
    } catch (e) {
      await mark('failed', String(e.message ?? e))
      console.error(`[agent] ${req.source} sync failed: ${e.message ?? e}`)
    }
  }
}

console.log(`[agent] multi-calendar sync agent → skardi at ${SKARDI} (interim stand-in for skardi open-connector jobs)`)
for (;;) {
  try {
    await processIntegrations()
    await processSyncRequests()
  } catch (e) {
    console.error(`[agent] skardi unreachable? ${e.message ?? e}`)
  }
  await new Promise((r) => setTimeout(r, POLL_MS))
}
