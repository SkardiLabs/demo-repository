# Multi-Calendar Integration Demo

A read-only, local-first calendar app whose **entire backend is skardi** — no custom server
code at all. Skardi fetches the next two weeks of meetings from **Google Calendar** and
**Feishu Calendar** through an [Open Connector](https://github.com/oomol-lab/open-connector)
gateway, materializes them into a local **SQLite** store, and serves a Google-Calendar-style
week grid styled after [skardi.ai](https://skardi.ai).

## The Pitch

| | Typical calendar aggregator | This demo |
|---|---|---|
| Backend code | Node/Go service: OAuth flows, API clients, normalizers, REST endpoints | **0 lines** (one ~300-line local sync agent, deleted once skardi's open-connector jobs land) |
| Configuration | — | 1 context YAML + 14 pipeline/job YAMLs |
| Credential handling | Your problem | Stored locally via skardi pipelines; OAuth exchange + token refresh by the sync agent |
| Serving | Live API fan-out on every page load | Local SQLite after sync — **works offline** |

The network is touched only when you press **Resync**. Each resync writes a new
generation of rows stamped with a `sync_id`; the frontend adopts a generation only when
**both** sources synced successfully, so a mid-sync failure never blanks your calendar —
the previous generation keeps serving.

```
                    React frontend (Vite :5174)
                          │  read pipelines + resync trigger (skardi REST)
                          ▼
                  Skardi server (:8081)
                    │                │
     stable catalog tables      SQLite (calendar.db)
     saas.google_cal.events     └── meetings  ← serves ALL reads
     saas.feishu_cal.events
                    │
                    ▼
          Open Connector gateway (:3000, Docker)
            owns Google OAuth + Feishu app creds
```

## Quick Start (fixture mode — no credentials needed)

Prerequisites: Docker, Node.js 18+, `sqlite3` (preinstalled on macOS).

```bash
cd multi_calendar

# 1. Seed the local store with two generations of demo meetings
bash seed/seed.sh

# 2. Start skardi (serves the pipelines against SQLite)
docker compose up -d skardi

# 3. Start the frontend
cd frontend && npm install && npm run dev
```

Open **http://localhost:5174**. You'll see the seeded meetings in the week grid —
overlapping events share width, all-day events sit under the day header, and clicking an
event shows organizer, invitees with RSVP status, and a **Join meeting** link. The
connection chips show *Not connected* (expected — there are no live connectors in fixture
mode) and Resync is disabled.

Run the frontend tests with `npm test` (window math, overlap layout, sync state machine).

> Note: re-running `seed.sh` against a live server is fine, but if you delete
> `data/calendar.db` and recreate it, restart skardi (`docker restart calendar_skardi`) —
> it holds a handle to the old file.

## Real Calendars — the Interim Sync Agent

Real Google + Feishu events work **today** via a small local sync agent
(`agent/agent.mjs`, Node 18+, zero dependencies). It is a deliberate stand-in for
skardi's upcoming open-connector jobs: all state — credentials, the resync work queue,
and the meetings themselves — lives in the skardi-served SQLite, and the agent talks to
skardi exclusively through pipelines. When the `google_calendar`/`feishu_calendar` source
packs land ([SkardiLabs/skardi#151](https://github.com/SkardiLabs/skardi/pull/151)
follow-ups), the agent gets deleted and the `jobs/` YAMLs take over with no UI change.

```bash
# In addition to the Quick Start services:
node agent/agent.mjs
```

### One-time operator setup (`.env`)

Provider **app** credentials are operator config, not something end users ever see:

```bash
cp .env.example .env   # then fill in
```

- **Google** — create an OAuth client in Google Cloud Console (type *Web application*)
  with redirect URI `http://localhost:5174/oauth/google`, enable the Calendar API, and
  set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Feishu** — create a custom app with the calendar read scope family
  (`calendar:calendar:readonly`) and set `FEISHU_APP_ID` / `FEISHU_APP_SECRET`
  (`FEISHU_CALENDAR_ID` optional; primary auto-detected).

Restart the frontend dev server and the agent after editing `.env`.

### Connecting your accounts (in the app UI)

End users just click. The first-run **Connections panel** (also reachable anytime by
clicking the Google/Feishu chips in the header) has two buttons:

- **Connect Google Calendar** — redirects to Google's standard consent page; approve
  read-only access and you're back in the app. The agent (which holds the client secret)
  exchanges the code for a refresh token within seconds — only the refresh token is
  stored locally.
- **Connect Feishu** — one click; the agent validates the demo's Feishu app credential
  and auto-detects the primary calendar.

Grants persist across restarts (`data/calendar.db`) and tokens refresh automatically on
every resync — connect once, resync forever.

> **Security note:** this is a local demo. The Google refresh token is stored in
> plaintext in the local SQLite file; app secrets live in the uncommitted `.env`.
> Nothing goes further than your machine and the provider APIs. Prefer a throwaway
> OAuth client, and don't commit `data/` or `.env`.

### Resync flow

Pressing **Resync** enqueues one row per connected source into `sync_requests` (via a
skardi pipeline), and the agent — polling through skardi — fetches the two-week window
from each provider API and appends generation-stamped rows into `meetings`. The frontend
polls the queue, adopts the generation only when every connected source succeeded, and
prunes old generations. Sources that aren't connected are skipped.

### Demo script

1. Connect one or both providers in the Connections panel; chips turn green.
2. Press **Resync** — the header shows per-source progress and the grid fills with your
   real meetings.
3. Click a meeting → invitees, RSVP dots, **Join meeting**.
4. Kill your network. Reload the page. Everything still serves — the calendar reads only
   local SQLite. Only the Resync button needs the network back.

## Future: Skardi-Native Live Mode

The end-state replaces the agent with skardi's own open-connector integration. It needs:

1. **skardi**: the Open Connector foundation + `google_calendar`/`feishu_calendar` source
   packs, and the jobs API in the published server image.
2. **open-connector**: calendar read actions on the `feishu_app_bot` provider (the
   `googlecalendar` provider already has what we need).

Then: uncomment the `saas` block in `ctx_calendar.yaml` and the `pipelines_live/` +
`jobs/` mounts in `docker-compose.yml`, start the gateway
(`OPEN_CONNECTOR_TOKEN=… docker compose up -d`), connect providers in the Open Connector
dashboard (http://localhost:3000), and delete `agent/`.

## How It Works

- **`ctx_calendar.yaml`** — one read-write SQLite source (`meetings`) plus the Open
  Connector gateway binding (`saas.google_cal.events`, `saas.feishu_cal.events`).
- **`jobs/sync_*_meetings.yaml`** — `SELECT … FROM saas.<binding>.events WHERE start_at
  >= {from_ts} AND start_at < {to_ts}` appended into `meetings`, stamped with the
  caller's `{sync_id}`. The time-range predicate pushes down to the provider APIs.
- **`pipelines/`** — `list_meetings` (serve one generation), `sync_status` (generation
  counts for the header + adoption rule), `prune_old_syncs` (keep current + fallback).
- **`pipelines_live/`** — `probe_google` / `probe_feishu` connection probes (live mode).
- **Resync semantics** — frontend generates `sync_id` (UTC ISO), runs both jobs, polls to
  terminal state, and adopts the generation only on double success; on partial failure it
  toasts the failing source and keeps the last complete generation.

## Adding Outlook Later

One more Open Connector binding in `ctx_calendar.yaml`, one more job YAML, and a third
chip color. No schema change — that's the point.
