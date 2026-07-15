# Multi-Calendar Integration Demo

A read-only, local-first calendar app whose **entire backend is skardi** — no custom server
code at all. Skardi fetches the next two weeks of meetings from **Google Calendar** and
**Feishu Calendar** through an [Open Connector](https://github.com/oomol-lab/open-connector)
gateway, materializes them into a local **SQLite** store, and serves a Google-Calendar-style
week grid styled after [skardi.ai](https://skardi.ai).

## The Pitch

| | Typical calendar aggregator | This demo |
|---|---|---|
| Backend code | Node/Go service: OAuth flows, API clients, normalizers, REST endpoints | **0 lines** |
| Configuration | — | 1 context YAML + 2 job YAMLs + 5 pipeline YAMLs |
| Credential handling | Your problem | Open Connector gateway (local dashboard, persisted grants, auto token refresh) |
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

## Live Mode (real Google + Feishu)

Live mode needs two prerequisites that are **in flight in other repos**:

1. **skardi**: the Open Connector integration foundation and the `google_calendar` /
   `feishu_calendar` source packs
   ([SkardiLabs/skardi#151](https://github.com/SkardiLabs/skardi/pull/151) follow-ups),
   plus the jobs API in the published server image.
2. **open-connector**: calendar read actions on the `feishu_app_bot` provider
   (list calendars, list events over a time range). The `googlecalendar` provider already
   has what we need.

Once those land:

```bash
# 1. Start everything, including the gateway
OPEN_CONNECTOR_TOKEN=<runtime token> docker compose up -d

# 2. Enable the live YAMLs
#    - uncomment the `saas` block in ctx_calendar.yaml (set your Feishu calendar_id)
#    - uncomment the pipelines_live/ and jobs/ mounts in docker-compose.yml
docker compose restart skardi
```

### Connecting your accounts

Open the **Open Connector dashboard** at http://localhost:3000:

- **Google Calendar** — supply your own Google Cloud OAuth client (one-time paste of
  client ID/secret), then complete the OAuth consent. Scope: `calendar.readonly`.
- **Feishu Calendar** — create a Feishu app with the
  `calendar:calendar.event:read` scope family and paste its App ID / App Secret.
- Mint a **runtime token** for skardi and export it as `OPEN_CONNECTOR_TOKEN`.

Credentials persist in the gateway's Docker volume and refresh automatically — grant once,
resync forever. They never enter skardi, the frontend, or SQLite.

The app's first-run **Connections panel** (and the header chips) probe each source with a
1-row skardi query and deep-link to the dashboard until both show *Connected*. Then press
**Resync**.

### Demo script

1. Connect both providers in the dashboard; chips turn green.
2. Press **Resync** — two skardi jobs run in parallel (`POST /jobs/…/run`), the header
   shows per-source progress, and the grid fills.
3. Click a meeting → invitees, RSVP dots, **Join meeting**.
4. Kill your network. Reload the page. Everything still serves — the calendar reads only
   local SQLite. Only the Resync button needs the network back.

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
