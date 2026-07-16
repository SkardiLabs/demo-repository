# Multi-Calendar Integration Demo Design

**Status:** Approved design
**Date:** 2026-07-15

## Summary

A new demo under `multi_calendar/` showcasing skardi-server as the entire backend for a
read-only calendar app. Given user-granted access, skardi fetches the next two weeks of
meetings from Google Calendar and Feishu Calendar through an Open Connector gateway,
materializes them into a local SQLite store via skardi jobs, and serves them to a React
week-grid frontend via skardi pipelines — with zero custom backend code. A Resync button
re-materializes on demand. After a sync completes, the app runs entirely locally; the
network is touched only during resync. Outlook Calendar is a follow-up source, not part
of this build.

This spec covers two things:

1. The demo app in this repo, end to end.
2. The **contract** the demo requires from the skardi and open-connector repos (source-pack
   table schemas, bindings, filter pushdown), which drives separately planned prerequisite
   work in those repos.

## Prerequisites in other repos (contract consumers)

Tracked and planned separately; listed here because the demo cannot run live without them.
The demo is fully buildable and demoable against seeded fixture data before they land
(see Testing).

1. **open-connector** (`oomol-lab/open-connector`): the `feishu_app_bot` provider needs two
   read actions — list calendars, and list calendar events over a time range (Feishu
   `/calendar/v4/calendars/:calendar_id/events`, tenant-token auth,
   `calendar:calendar.event:read` scope family). The `googlecalendar` provider already has
   event actions; no upstream Google work.
2. **skardi** (`SkardiLabs/skardi`): the Open Connector integration foundation
   (approved design, PR #151) plus two source packs — `google_calendar` and
   `feishu_calendar` — each exposing an `events` stable table per the schema below. This
   pulls those packs forward from Phase 2 of the PR #151 rollout.

## Architecture

```
                    React frontend (Vite :5173)
                          │  read pipelines + resync trigger (skardi REST)
                          ▼
                  Skardi server (:8081)
                    │                │
     stable catalog tables      SQLite (calendar.db)
     saas.google_cal.events     └── meetings  ← materialized store,
     saas.feishu_cal.events          serves ALL frontend reads
                    │
                    ▼
          Open Connector gateway (:3000, Docker)
            owns Google OAuth + Feishu app creds
                    │
        Google Calendar API   Feishu Calendar API
        (network touched ONLY during resync)
```

Directory layout, mirroring `expense_reimbursement/`:

```
multi_calendar/
├── ctx_calendar.yaml        # skardi context: sqlite store + open_connector gateway bindings
├── pipelines/               # list_meetings, sync_status, prune_old_syncs, probes
├── jobs/                    # sync_google_meetings.yaml, sync_feishu_meetings.yaml
├── frontend/                # React + Vite week-grid calendar
├── docker-compose.yml       # open-connector gateway + volume for its credential store
├── seed/                    # init_sqlite.sql + fixture seed script
└── README.md
```

Key properties:

- **Zero custom backend code.** The frontend talks only to skardi's REST API: pipelines
  for reads, `POST /jobs/:name/run` + `GET /jobs/runs/:run_id` for resync.
- **Local-first.** All serving happens from `calendar.db`. Killing the network breaks
  nothing except the resync button.
- **Read-only.** No create/edit affordances anywhere; skardi's open-connector milestone-one
  read-only posture is preserved.
- **Outlook later** is one more binding + one more job; no schema change.

## Connection Setup UX

Credentials never enter skardi, the frontend, or SQLite. Open Connector's local Dashboard
owns credential configuration, OAuth flows, and token refresh, persisted in its own store
on a Docker volume so grants survive restarts and future resyncs need no re-auth.

The frontend provides a **Connections panel** (first-run screen plus header status chips):

- Each source shows **Connected / Not connected**, detected by a cheap status probe — a
  1-row skardi query against each `saas.*.events` table; failure means not connected or
  misconfigured.
- **Connect Google Calendar** / **Connect Feishu** buttons open the Open Connector
  Dashboard in a new tab, deep-linked to the provider page, where the user completes
  Google OAuth or enters Feishu app credentials.
- Once both are connected, the user hits Resync and the calendar fills.

Setup cost acknowledged in the README: the user supplies their own Google Cloud OAuth
client (one-time paste of client ID/secret into the Dashboard) and a self-built Feishu
app with calendar read scopes. The README walks through both.

## Skardi Contract

### Source-pack `events` tables

Both the `google_calendar` and `feishu_calendar` packs expose an `events` stable table
containing at least these columns (packs may expose more):

| Column | Arrow type | Notes |
|---|---|---|
| `event_id` | Utf8, not null | provider event ID |
| `calendar_id` | Utf8, not null | bound calendar |
| `title` | Utf8, nullable | summary |
| `description` | Utf8, nullable | |
| `start_at` | Timestamp(ms, UTC), not null | all-day events normalized to midnight |
| `end_at` | Timestamp(ms, UTC), not null | |
| `is_all_day` | Boolean, not null | |
| `status` | Utf8, nullable | confirmed / cancelled |
| `organizer` | Utf8, nullable | display name or email |
| `attendees_json` | Utf8 (JSON), nullable | `[{name, email, response}]`; JSON avoids List<Struct> friction in SQLite |
| `meeting_url` | Utf8, nullable | video link, extracted by the pack (Google `hangoutLink`/`conferenceData`; Feishu `vchat`) |
| `html_link` | Utf8, nullable | link to the event in the provider UI |

**Required filter pushdown:** `start_at >= X AND start_at < Y` translated to each
provider's server-side time-range parameters (Google `timeMin`/`timeMax`; Feishu
`start_time`/`end_time`). Without this, every sync would paginate entire calendar
history.

### Context binding

`ctx_calendar.yaml` declares:

- One `open_connector` gateway source named `saas` (runtime token via
  `OPEN_CONNECTOR_TOKEN` env), with two bindings:
  - `google_cal` — source pack `google_calendar`, resource `calendar_id: primary`.
  - `feishu_cal` — source pack `feishu_calendar`, resource: the user's Feishu calendar ID.
- One read-write `sqlite` source for `multi_calendar/data/calendar.db`.

## Data Model & Resync Flow

### SQLite `meetings` table

Created by `seed/init_sqlite.sql`:

```sql
CREATE TABLE meetings (
  sync_id        TEXT NOT NULL,        -- generation stamp (UTC ISO timestamp from frontend)
  source         TEXT NOT NULL,        -- 'google' | 'feishu'
  event_id       TEXT NOT NULL,
  title          TEXT,
  description    TEXT,
  start_at       TEXT NOT NULL,        -- UTC ISO-8601
  end_at         TEXT NOT NULL,
  is_all_day     INTEGER NOT NULL DEFAULT 0,
  status         TEXT,
  organizer      TEXT,
  attendees_json TEXT,
  meeting_url    TEXT,
  html_link      TEXT,
  PRIMARY KEY (sync_id, source, event_id)
);
```

### Materialization jobs (generation-stamped append)

Skardi jobs are append-only, so each resync writes a new generation identified by
`sync_id` rather than overwriting. Two jobs, one per source; e.g.
`jobs/sync_google_meetings.yaml`:

```yaml
kind: job
metadata:
  name: sync_google_meetings
spec:
  query: |
    SELECT {sync_id} AS sync_id, 'google' AS source,
           event_id, title, description, start_at, end_at,
           is_all_day, status, organizer, attendees_json,
           meeting_url, html_link
    FROM saas.google_cal.events
    WHERE start_at >= {from_ts} AND start_at < {to_ts}
  destination:
    table: meetings
    mode: append
  execution:
    timeout_ms: 120000
```

`sync_feishu_meetings.yaml` is identical with the Feishu binding and `'feishu'` source tag.

### Resync sequence (frontend-orchestrated, plain HTTP)

1. Generate `sync_id` = current UTC timestamp. Compute the window: today 00:00 local time
   through +14 days ("two weeks including today, moving forward").
2. `POST /jobs/sync_google_meetings/run` and `POST /jobs/sync_feishu_meetings/run` with
   `{sync_id, from_ts, to_ts}`, in parallel.
3. Poll `GET /jobs/runs/:run_id` until both runs finish; show per-source progress.
4. **Both succeeded** → the frontend adopts the new `sync_id` and passes it explicitly to
   `list_meetings`, then calls `prune_old_syncs`.
5. **Partial or total failure** → the frontend keeps the previously adopted `sync_id`
   (last known good, both sources present), shows a per-source error toast, and prunes
   nothing. A generation is only ever adopted whole.

### Pipelines

- `list_meetings(sync_id)` — `SELECT ... FROM meetings WHERE sync_id = {sync_id} ORDER BY
  start_at`. The frontend passes the adopted `sync_id` explicitly, which is what makes the
  partial-failure rule work.
- `sync_status()` — latest `sync_id` values with per-source row counts; on app load the
  frontend adopts the newest `sync_id` that has rows from both sources (or the newest of
  any kind if only one source has ever been connected). Drives the "last synced 2 min ago
  · Google 12 · Feishu 5" header.
- `prune_old_syncs(keep_sync_id)` — `DELETE FROM meetings WHERE sync_id NOT IN` the two
  most recent adopted generations (current + one fallback), via the read-write SQLite
  source.
- `probe_google()` / `probe_feishu()` — `SELECT 1 FROM saas.<binding>.events LIMIT 1`;
  success/failure is the Connections panel's status signal.

## Frontend

**Stack:** React 18 + Vite + TypeScript. No calendar library — the week grid is a CSS
grid, hand-rolled like the expense demo's frontend, which keeps the skardi styling clean.

**Visual language (from skardi.ai):** dark navy canvas `#060b14`, panel `#0a1220`, text
`#e6eef9`, Inter font, green accent `#2ee89a` with the site's subtle green radial glow,
grid lines `rgba(255,255,255,0.06)`.

**Layout — Google Calendar structure, skardi skin:**

- **Header bar:** skardi mark + "Multi-Calendar"; center: week toggle (`This week / Next
  week`, ‹ › arrows, swipe gesture on the grid); right: per-source connection chips,
  last-synced timestamp, and the **Resync** button (green accent; spinner with per-source
  progress while jobs run).
- **Week time-grid:** 7 day columns × hour rows, 7:00–22:00 visible by default and
  scrollable to the full day, sticky day header with date numbers, today's column
  highlighted with the green glow, red current-time line. All-day events render in a thin
  band under the day header.
- **Event cards:** absolutely positioned by start/end time; color-coded by source
  (Google = blue `#4285f4` tint, Feishu = teal tint, each with a small source glyph);
  overlapping events share column width Google Calendar-style. Cards show title + time,
  plus a video-camera icon when `meeting_url` exists.
- **Event popover** on click: title, time range, source badge, organizer, invitee list
  with response-status dots (accepted / declined / pending), description, a **Join
  meeting** button opening `meeting_url`, and an "Open in Google Calendar / Feishu" link
  via `html_link`. Strictly read-only.

**UI states:** first run → Connections panel; connected but never synced → empty grid
with a "Resync now" prompt; sync failure → toast with per-source detail, previous data
stays; legitimately empty window → "No meetings in the next two weeks 🎉".

## Error Handling

- **Connection probe fails** → source chip shows Not connected with a "Fix in
  open-connector dashboard" link; resync is disabled for that source only.
- **Job failure or timeout** (rate limit, expired grant, gateway down) → skardi's job-run
  error message surfaces in a toast; the previously adopted generation keeps serving.
  Jobs carry `execution.timeout_ms: 120000` so a hung sync cannot spin forever.
- **Both jobs fail** → nothing is adopted or pruned; the UI stays on the old `sync_id`.
- **Skardi server down** → full-page reconnect banner with the `docker compose` / server
  start hint.
- **Empty calendar** is an empty state, not an error.

## Testing

- **Frontend unit tests (Vitest):** event-overlap layout algorithm, timezone and all-day
  normalization, week-window computation, and the sync-state machine
  (idle → syncing → partial-failure → success).
- **Pipeline/job smoke test via fixtures:** a seed script inserts fixture rows into
  `meetings` — two generations, both sources, overlapping events, all-day events, and
  video-link events — so the whole frontend and read path are demoable **without any
  credentials and before the skardi source packs exist**. This is also the build-order
  unblock: this repo's work proceeds against fixtures while the skardi/open-connector
  prerequisites land.
- **Live end-to-end (manual, credentialed):** the README demo script — connect both
  providers, resync, verify the grid, kill the network, verify the app still serves.

## README / Demo Script

The README covers: prerequisites (Docker, Node 18+, a skardi build with open-connector
support); Google OAuth client and Feishu app setup walkthroughs with exact scope lists;
`docker compose up` for the gateway; SQLite seed; starting skardi with `--pipeline` and
the jobs directory; starting the frontend; and a "the pitch" section mirroring the
expense demo's comparison framing — the entire backend is 1 context YAML + 2 job YAMLs +
5 pipeline YAMLs, zero backend code.

## Non-goals

- Outlook Calendar (follow-up: one more binding + job).
- Any write path to the providers (event creation, RSVP).
- Multi-user support, auth on the frontend, or deployment beyond localhost.
- Recurring-event expansion logic in the demo — the packs return already-expanded
  instances (both provider APIs support single-instance expansion server-side).
- Building the skardi source packs or open-connector Feishu actions in this repo — this
  spec only fixes their contract.

## Addendum (2026-07-15): Interim Local Sync Agent

The skardi source packs and open-connector Feishu calendar actions do not exist yet, so
the demo acquires real events today through an interim local sync agent
(`multi_calendar/agent/agent.mjs`) — a deliberate stand-in for skardi's open-connector
jobs with the same generation semantics:

- New SQLite tables `integrations` (stored provider credentials + grant state) and
  `sync_requests` (resync work queue), both skardi-served with dedicated pipelines.
- The Connections panel collects credentials in-app: Google OAuth (client ID/secret →
  browser consent → agent exchanges the code for a refresh token) and Feishu app
  credentials (agent validates and auto-detects the primary calendar).
- Resync enqueues per-source rows into `sync_requests`; the agent fetches the two-week
  window from the provider APIs and appends generation-stamped rows via `insert_meeting`.
  The frontend polls the queue and keeps the both-or-nothing adoption rule (sources that
  are not connected count as vacuously successful).
- The agent talks to skardi exclusively through pipelines; deleting `agent/` and enabling
  the `saas` bindings + `jobs/` restores the original design unchanged.
