-- Multi-Calendar demo — SQLite schema.
-- The meetings table is the local materialized store. Skardi jobs append
-- generation-stamped rows (sync_id) from the saas.* calendar tables; read
-- pipelines always serve one adopted generation.

-- Integration credentials, stored locally so grants persist across restarts.
-- google: {client_id, client_secret, auth_code?, redirect_uri?, refresh_token?}
-- feishu: {app_id, app_secret, calendar_id}
-- status: pending_exchange | connected | error
CREATE TABLE IF NOT EXISTS integrations (
  source      TEXT PRIMARY KEY,     -- 'google' | 'feishu'
  status      TEXT NOT NULL,
  config_json TEXT NOT NULL,
  error       TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);

-- Resync work queue: the frontend enqueues one row per source; the local
-- sync agent (stand-in for skardi's open-connector jobs) executes them.
-- status: pending | running | ok | failed
CREATE TABLE IF NOT EXISTS sync_requests (
  sync_id      TEXT NOT NULL,
  source       TEXT NOT NULL,
  status       TEXT NOT NULL,
  from_ts      TEXT NOT NULL,
  to_ts        TEXT NOT NULL,
  error        TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL,
  PRIMARY KEY (sync_id, source)
);

CREATE TABLE IF NOT EXISTS meetings (
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
  attendees_json TEXT,                 -- [{name, email, response}]
  meeting_url    TEXT,
  html_link      TEXT,
  PRIMARY KEY (sync_id, source, event_id)
);
