-- Fixture data for the Multi-Calendar demo (fixture mode — no credentials needed).
-- Dates are computed relative to 'now' so the events always land inside the
-- app's rolling two-week window. Two generations simulate a previous sync
-- (fixture-001) and the current one (fixture-002); the frontend adopts the
-- newest generation present for both sources.

DELETE FROM meetings WHERE sync_id IN ('fixture-001', 'fixture-002');

-- ── Generation fixture-001 (older, superseded) ─────────────────────────────
INSERT INTO meetings (sync_id, source, event_id, title, description, start_at, end_at, is_all_day, status, organizer, attendees_json, meeting_url, html_link) VALUES
('fixture-001', 'google', 'g-old-1', 'Weekly standup (stale copy)', NULL,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+10 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+10 hours', '+30 minutes', 'utc'),
  0, 'confirmed', 'Ada Lovelace',
  '[{"name":"Ada Lovelace","email":"ada@example.com","response":"accepted"}]',
  'https://meet.google.com/abc-defg-hij', 'https://calendar.google.com/event?eid=g-old-1'),
('fixture-001', 'feishu', 'f-old-1', 'Product review (stale copy)', NULL,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+2 days', '+14 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+2 days', '+15 hours', 'utc'),
  0, 'confirmed', 'Lin Hua', '[]', NULL, NULL);

-- ── Generation fixture-002 (current, adopted) ──────────────────────────────
INSERT INTO meetings (sync_id, source, event_id, title, description, start_at, end_at, is_all_day, status, organizer, attendees_json, meeting_url, html_link) VALUES
-- Today: overlapping pair (tests Google-Calendar-style width sharing)
('fixture-002', 'google', 'g-1', 'Weekly standup', 'Round-robin updates across the team.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+10 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+10 hours', '+30 minutes', 'utc'),
  0, 'confirmed', 'Ada Lovelace',
  '[{"name":"Ada Lovelace","email":"ada@example.com","response":"accepted"},{"name":"Grace Hopper","email":"grace@example.com","response":"accepted"},{"name":"Alan Turing","email":"alan@example.com","response":"pending"}]',
  'https://meet.google.com/abc-defg-hij', 'https://calendar.google.com/event?eid=g-1'),
('fixture-002', 'feishu', 'f-1', '客户同步会 Customer sync', 'Weekly customer account review.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+10 hours', '+15 minutes', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+11 hours', 'utc'),
  0, 'confirmed', 'Lin Hua',
  '[{"name":"Lin Hua","email":"lin@example.com","response":"accepted"},{"name":"Wei Chen","email":"wei@example.com","response":"declined"}]',
  'https://vc.feishu.cn/j/123456789', 'https://applink.feishu.cn/client/calendar/event/detail?event_id=f-1'),
-- Tomorrow: all-day event
('fixture-002', 'google', 'g-2', 'Company offsite', 'All hands offsite — see agenda doc.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+1 day', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+2 days', 'utc'),
  1, 'confirmed', 'People Ops',
  '[{"name":"Everyone","email":"all@example.com","response":"accepted"}]',
  NULL, 'https://calendar.google.com/event?eid=g-2'),
-- +2 days: Feishu with video link
('fixture-002', 'feishu', 'f-2', 'Sprint 产品评审 Product review', 'Demo of the multi-calendar integration.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+2 days', '+14 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+2 days', '+15 hours', 'utc'),
  0, 'confirmed', 'Lin Hua',
  '[{"name":"Lin Hua","email":"lin@example.com","response":"accepted"},{"name":"Boyang Chen","email":"boyang@skardi.ai","response":"accepted"}]',
  'https://vc.feishu.cn/j/987654321', 'https://applink.feishu.cn/client/calendar/event/detail?event_id=f-2'),
-- +3 days: 1:1
('fixture-002', 'google', 'g-3', '1:1 Boyang / Ada', NULL,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+3 days', '+9 hours', '+30 minutes', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+3 days', '+10 hours', '+30 minutes', 'utc'),
  0, 'confirmed', 'Boyang Chen',
  '[{"name":"Boyang Chen","email":"boyang@skardi.ai","response":"accepted"},{"name":"Ada Lovelace","email":"ada@example.com","response":"accepted"}]',
  'https://meet.google.com/xyz-uvwx-yz1', 'https://calendar.google.com/event?eid=g-3'),
-- +4 days: cancelled (must be filtered out by list_meetings)
('fixture-002', 'google', 'g-4', 'Vendor call (cancelled)', NULL,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+4 days', '+16 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+4 days', '+17 hours', 'utc'),
  0, 'cancelled', 'Ada Lovelace', '[]', NULL, NULL),
-- Next week (+8/+9/+11 days)
('fixture-002', 'feishu', 'f-3', 'Q3 规划 Planning', 'Quarter planning kickoff.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+8 days', '+11 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+8 days', '+12 hours', 'utc'),
  0, 'confirmed', 'Wei Chen',
  '[{"name":"Wei Chen","email":"wei@example.com","response":"accepted"},{"name":"Lin Hua","email":"lin@example.com","response":"pending"}]',
  'https://vc.feishu.cn/j/555666777', NULL),
('fixture-002', 'google', 'g-5', 'Design review — calendar demo', 'Walk through the skardi-styled week grid.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+9 days', '+15 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+9 days', '+16 hours', '+30 minutes', 'utc'),
  0, 'confirmed', 'Grace Hopper',
  '[{"name":"Grace Hopper","email":"grace@example.com","response":"accepted"},{"name":"Boyang Chen","email":"boyang@skardi.ai","response":"accepted"},{"name":"Alan Turing","email":"alan@example.com","response":"declined"}]',
  'https://meet.google.com/def-ghij-klm', 'https://calendar.google.com/event?eid=g-5'),
('fixture-002', 'feishu', 'f-4', '团队午餐 Team lunch', NULL,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+11 days', '+13 hours', 'utc'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'localtime', 'start of day', '+11 days', '+14 hours', 'utc'),
  0, 'confirmed', 'Lin Hua', '[]', NULL, NULL);
