-- Multi-Calendar demo — SQLite schema.
-- The meetings table is the local materialized store. Skardi jobs append
-- generation-stamped rows (sync_id) from the saas.* calendar tables; read
-- pipelines always serve one adopted generation.

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
