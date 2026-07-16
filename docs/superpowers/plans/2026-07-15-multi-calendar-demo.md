# Multi-Calendar Integration Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `multi_calendar/` demo — a read-only, local-first two-week calendar app served entirely by skardi (SQLite-materialized meetings from Google/Feishu via Open Connector), with a React week-grid frontend styled after skardi.ai.

**Architecture:** Skardi jobs append generation-stamped (`sync_id`) meeting rows from `saas.*.events` stable tables into a local SQLite `meetings` table; read pipelines serve the frontend; the frontend orchestrates resync via skardi's jobs REST API. Fixture seed data makes everything demoable today, before the skardi source packs exist.

**Tech Stack:** Skardi server (docker image `ghcr.io/skardilabs/skardi/skardi-server:latest`), SQLite, YAML pipelines/jobs, React 18 + Vite 5 + TypeScript, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-15-multi-calendar-demo-design.md`. Demo quality — favor simplicity; no production hardening beyond what the spec names.
- Read-only app: no create/edit affordances anywhere.
- Window: today 00:00 local → +14 days. Week toggle: This week / Next week.
- Skardi theme: canvas `#060b14`, panel `#0a1220`, text `#e6eef9`, accent `#2ee89a`, grid lines `rgba(255,255,255,0.06)`, Inter font. Google source tint `#4285f4`, Feishu teal `#14b8a6`.
- Frontend calls skardi only: `POST /api/{pipeline}/execute` (Vite proxy → `:8081`), `POST /api/jobs/{name}/run`, `GET /api/jobs/runs/{run_id}`.
- Pipeline response envelope: `{ success: boolean, data: T[], error?: string }` (match expense demo's `api_skardi.ts`).
- Fixture mode is the default run mode; saas-dependent YAMLs live in `pipelines_live/` + `jobs/` and load only in live mode.
- All timestamps stored UTC ISO-8601; frontend renders in local timezone.

---

### Task 1: Skardi backend — context, pipelines, jobs, seed, docker-compose

**Files:**
- Create: `multi_calendar/ctx_calendar.yaml`
- Create: `multi_calendar/pipelines/list_meetings.yaml`, `pipelines/sync_status.yaml`, `pipelines/prune_old_syncs.yaml`
- Create: `multi_calendar/pipelines_live/probe_google.yaml`, `pipelines_live/probe_feishu.yaml`
- Create: `multi_calendar/jobs/sync_google_meetings.yaml`, `jobs/sync_feishu_meetings.yaml`
- Create: `multi_calendar/seed/init_sqlite.sql`, `seed/seed_fixtures.sql`, `seed/seed.sh`
- Create: `multi_calendar/docker-compose.yml`
- Create: `multi_calendar/data/.gitkeep` (db file is gitignored)

**Interfaces:**
- Produces pipelines: `list_meetings(sync_id) → meeting rows`, `sync_status() → {sync_id, source, cnt}` rows, `prune_old_syncs(keep_a, keep_b)`, `probe_google()`, `probe_feishu()`.
- Produces jobs: `sync_google_meetings(sync_id, from_ts, to_ts)`, `sync_feishu_meetings(...)`.
- Meeting row columns exactly as the spec's SQLite schema.

- [ ] **Step 1: SQLite schema + fixtures.** `init_sqlite.sql` creates `meetings` per spec. `seed_fixtures.sql` inserts two generations (`fixture-001`, `fixture-002`), both sources, using SQLite relative dates (`datetime('now', '+1 day', 'start of day', '+10 hours')`) so fixtures always land in the current window; include overlapping events, an all-day event, events with `meeting_url` (Meet + Feishu VC links), attendees JSON with mixed responses, and one cancelled event. `seed.sh` runs both via `sqlite3 data/calendar.db`.
- [ ] **Step 2: Verify seed.** Run `bash seed/seed.sh && sqlite3 data/calendar.db "SELECT sync_id, source, count(*) FROM meetings GROUP BY 1,2"` — expect 4 rows (2 generations × 2 sources).
- [ ] **Step 3: Context YAML.** `ctx_calendar.yaml`: read-write sqlite source `calendar` at `multi_calendar/data/calendar.db` (mirror expense ctx structure). Append a commented `open_connector` gateway block (source `saas`, bindings `google_cal`/`feishu_cal` per spec) labeled "enable when skardi source packs land".
- [ ] **Step 4: Read pipelines.** `list_meetings`: `SELECT source, event_id, title, description, start_at, end_at, is_all_day, status, organizer, attendees_json, meeting_url, html_link FROM meetings WHERE sync_id = {sync_id} AND status != 'cancelled' ORDER BY start_at`. `sync_status`: `SELECT sync_id, source, COUNT(*) AS cnt FROM meetings GROUP BY sync_id, source ORDER BY sync_id DESC`. `prune_old_syncs`: `DELETE FROM meetings WHERE sync_id NOT IN ({keep_a}, {keep_b})`.
- [ ] **Step 5: Live-mode YAMLs.** Probes: `SELECT event_id FROM saas.google_cal.events LIMIT 1` (resp. `feishu_cal`). Jobs exactly as the spec's `sync_google_meetings.yaml` example (append mode, `timeout_ms: 120000`), Feishu variant tagged `'feishu'`.
- [ ] **Step 6: docker-compose.** Services: `open-connector` (`ghcr.io/oomol-lab/open-connector:latest`, port 3000, named volume for its credential store) and `skardi` (`ghcr.io/skardilabs/skardi/skardi-server:latest`, port 8081, mounts `./data`, `./ctx_calendar.yaml`, `./pipelines`; `OPEN_CONNECTOR_TOKEN` env passthrough). Comment the live-mode mounts (`pipelines_live/`, `jobs/`).
- [ ] **Step 7: Commit** `feat(multi_calendar): skardi context, pipelines, jobs, seed, compose`.

### Task 2: Frontend scaffold + API client + types

**Files:**
- Create: `multi_calendar/frontend/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx` (shell), `src/types.ts`, `src/api.ts`, `src/style.css` (theme tokens)

**Interfaces:**
- Produces `types.ts`: `Meeting { source: 'google'|'feishu'; event_id: string; title: string|null; description: string|null; start_at: string; end_at: string; is_all_day: number; status: string|null; organizer: string|null; attendees_json: string|null; meeting_url: string|null; html_link: string|null }`, `Attendee { name?: string; email?: string; response?: 'accepted'|'declined'|'pending'|string }`, `SyncStatusRow { sync_id: string; source: string; cnt: number }`, `JobRun { run_id: string; status: string; error?: string|null }`.
- Produces `api.ts`: `listMeetings(syncId): Promise<Meeting[]>`, `syncStatus(): Promise<SyncStatusRow[]>`, `pruneOldSyncs(keepA, keepB): Promise<void>`, `probe(source): Promise<boolean>`, `runJob(name, params): Promise<string>` (returns run_id), `getJobRun(runId): Promise<JobRun>`.

- [ ] **Step 1:** Copy expense frontend's toolchain (React 18.3, Vite 5.4, TS 5.4) + add `vitest` devDependency and `"test": "vitest run"`. Vite proxy `/api` → `http://localhost:8081` with rewrite, port 5174 (avoid clashing with expense demo).
- [ ] **Step 2:** `api.ts` — `execute<T>(pipeline, params)` helper identical in shape to expense `api_skardi.ts`; jobs helpers hit `/api/jobs/...`. `probe()` returns `false` on any error (404 in fixture mode = Not connected).
- [ ] **Step 3:** `style.css` theme tokens as CSS variables from Global Constraints; Inter via Google Fonts link in `index.html`; body background with the skardi radial green glow.
- [ ] **Step 4:** Verify `npm install && npm run build` passes with the shell App. Commit `feat(multi_calendar): frontend scaffold, skardi API client, theme`.

### Task 3: Core logic modules with tests (time, overlap layout, sync machine)

**Files:**
- Create: `src/time.ts`, `src/layout.ts`, `src/syncMachine.ts`
- Test: `src/time.test.ts`, `src/layout.test.ts`, `src/syncMachine.test.ts`

**Interfaces:**
- `time.ts`: `windowRange(now: Date): { fromTs: string; toTs: string }` (local midnight → +14d, UTC ISO); `weekDays(now: Date, week: 0|1): Date[]` (7 local dates, week 0 starts today's date — the window is rolling, not Monday-aligned); `minutesIntoDay(iso: string): number`; `newSyncId(now: Date): string` (UTC ISO).
- `layout.ts`: `layoutDay(events: Meeting[]): PositionedEvent[]` where `PositionedEvent = { m: Meeting; top: number; height: number; col: number; cols: number }` (top/height in minutes; overlapping cluster shares width via column assignment, Google-Calendar style).
- `syncMachine.ts`: pure reducer `syncReducer(state: SyncState, ev: SyncEvent): SyncState` with states `idle | syncing | success | partial_failure | failure`; events `START`, `JOB_DONE {source, ok, error?}`; `syncing` tracks per-source status; terminal state computed when both sources reported. Exposes `adoptedSyncId` logic: on app load pick newest `sync_id` present for **both** sources from `SyncStatusRow[]` (else newest of any) via `pickAdoptedSyncId(rows): string|null`.

- [ ] **Step 1:** Write failing Vitest tests: window is 14 days and starts at local midnight; `weekDays(_, 1)` starts 7 days later; layout gives two fully-overlapping events `cols=2` distinct `col`, non-overlapping events `cols=1`, chain-overlap clusters share max width; reducer paths: both ok → `success` + adopt new id; one fail → `partial_failure` + keep old id; both fail → `failure`; `pickAdoptedSyncId` prefers both-source generations.
- [ ] **Step 2:** Run `npm test` — expect failures (modules missing).
- [ ] **Step 3:** Implement the three modules minimally.
- [ ] **Step 4:** `npm test` green. Commit `feat(multi_calendar): time window, overlap layout, sync state machine`.

### Task 4: Week grid UI

**Files:**
- Create: `src/components/WeekGrid.tsx`, `src/components/EventCard.tsx`, `src/components/EventPopover.tsx`
- Modify: `src/style.css`, `src/App.tsx`

**Interfaces:**
- `WeekGrid({ days: Date[]; meetings: Meeting[]; onSelect(m: Meeting, anchor: DOMRect): void })` — CSS grid: time gutter + 7 columns; hour rows 0–24 rendered, auto-scrolled to 07:00; sticky day header (weekday + date number, today highlighted w/ green glow); all-day band under header; red current-time line on today; absolute-positioned `EventCard`s from `layoutDay` per day.
- `EventCard({ p: PositionedEvent; onSelect })` — source-tinted card (google blue / feishu teal + glyph G/F), title + time, camera icon when `meeting_url`.
- `EventPopover({ m: Meeting; anchor: DOMRect; onClose })` — title, local time range, source badge, organizer, attendee list with response dots (accepted green / declined red / pending gray), description, "Join meeting" button (`meeting_url`), "Open in Google Calendar/Feishu" link (`html_link`). Closes on outside click / Esc. Read-only.

- [ ] **Step 1:** Implement components + styles; wire into `App.tsx` with fixture meetings fetched via `listMeetings` (temporary hardcoded `sync_id` until Task 5 wires adoption). Swipe: horizontal wheel/touch on the grid triggers week toggle.
- [ ] **Step 2:** Manual verify against seeded skardi (`docker compose up skardi`, seed, `npm run dev`): events render at correct times, overlap splits width, popover shows invitees + Join button, all-day band renders.
- [ ] **Step 3:** `npm run build && npm test` green. Commit `feat(multi_calendar): week grid, event cards, popover`.

### Task 5: Header, resync flow, connections panel, UI states

**Files:**
- Create: `src/components/HeaderBar.tsx`, `src/components/ConnectionsPanel.tsx`, `src/components/Toast.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `HeaderBar({ week, onWeek, connections: {google: boolean|null, feishu: boolean|null}, lastSync: {syncId: string|null, counts: Record<string, number>}, syncState, onResync })` — skardi mark + "Multi-Calendar", ‹ This week / Next week ›, source chips (● connected green / ○ not / … probing), "last synced X ago · Google N · Feishu M", green Resync button with spinner + per-source progress while syncing.
- `ConnectionsPanel({ connections, onConnect(source) })` — first-run screen; Connect buttons open open-connector dashboard `http://localhost:3000` in a new tab; "Fix in open-connector dashboard" link on failed probes.
- App flow: on load → probes (parallel) + `syncStatus()` → `pickAdoptedSyncId` → `listMeetings`. Resync per spec: `newSyncId`, run both jobs in parallel with `{sync_id, from_ts, to_ts}`, poll runs every 1.5s until terminal, reduce through `syncMachine`; on `success` adopt + `pruneOldSyncs(new, previous)` + refetch; on `partial_failure`/`failure` toast per-source error, keep old data. Resync disabled when neither source connected.
- States: first-run (no sync rows AND no connection) → ConnectionsPanel; connected-never-synced → empty grid + "Resync now" prompt; empty window → "No meetings in the next two weeks 🎉"; skardi unreachable → full-page reconnect banner with `docker compose up` hint.

- [ ] **Step 1:** Implement components + App wiring + toasts.
- [ ] **Step 2:** Manual verify in fixture mode: probes fail → chips Not connected, resync disabled, calendar still serves fixtures with header counts; kill skardi → reconnect banner.
- [ ] **Step 3:** `npm run build && npm test` green. Commit `feat(multi_calendar): header, resync orchestration, connections panel`.

### Task 6: README + repo integration + final verify

**Files:**
- Create: `multi_calendar/README.md`
- Modify: root `README.md` (mention the new demo), `.gitignore` (`multi_calendar/data/*.db`)

- [ ] **Step 1:** README per spec: what it shows ("1 context YAML + 2 job YAMLs + 5 pipeline YAMLs, zero backend code"), fixture-mode quickstart (compose up skardi → seed → npm dev), live-mode setup (Google OAuth client walkthrough w/ scopes `calendar.readonly`; Feishu app w/ `calendar:calendar.event:read`; open-connector dashboard flow; enabling `pipelines_live/` + `jobs/` mounts), resync semantics, prerequisites-in-other-repos note (skardi PR #151 packs, open-connector Feishu actions), demo script incl. kill-network test.
- [ ] **Step 2:** Full pass: `npm test`, `npm run build`, fresh `seed.sh`, fixture-mode smoke. Commit `docs(multi_calendar): README + repo integration`, push branch, PR #5 updates automatically.

## Self-Review Notes

- Spec coverage: architecture/dirs (T1), connection UX (T5), contract YAMLs (T1), data model + resync semantics (T1/T3/T5), frontend layout/theme (T2/T4), error handling states (T5), testing (T3 + manual scripts), README (T6). Live e2e is manual/credentialed and blocked on other repos — documented, not implemented.
- Fixture-mode-first is the build order unblock; saas-dependent YAML isolated in `pipelines_live/`+`jobs/` so fixture-mode skardi startup never references unregistered `saas` tables.
- Type/name consistency: `sync_id`/`PositionedEvent`/`pickAdoptedSyncId` used consistently across tasks.
