-- 5th Marine Regiment Command Hub — D1 schema
-- Applied once with: npx wrangler d1 execute 5thmr-command-hub-db --file=db/schema.sql [--local]

CREATE TABLE IF NOT EXISTS officers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('regimental_command','battalion_command','company_command')),
  must_reset_password INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_name TEXT,
  current_position_id TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One weekly activity rating per officer. '0'..'5' or 'LOA'. Editable for the week + 30 days
-- after it ends; an is_admin account may edit any week.
CREATE TABLE IF NOT EXISTS activity_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL REFERENCES officers(id),
  week_start TEXT NOT NULL,
  rating TEXT NOT NULL,
  rated_by INTEGER NOT NULL REFERENCES officers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(officer_id, week_start)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- Single-row table: the whole roster tree as one JSON blob (same shape data/chain-of-command.json used to be)
CREATE TABLE IF NOT EXISTS hierarchy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES officers(id)
);

-- Departments roster: single-row JSON blob keyed by department name, values are
-- arrays of { name, rank }. Viewable by all officers, editable by Regimental Command.
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES officers(id)
);

CREATE TABLE IF NOT EXISTS hierarchy_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  changed_by INTEGER REFERENCES officers(id),
  change_summary TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Two-signal Discord member tracking (migration 005). member_events = flow (join/leave
-- events from the bot); member_snapshots = stock (hourly authoritative member-count anchors).
CREATE TABLE IF NOT EXISTS member_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_key TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'bot',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS member_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at TEXT NOT NULL DEFAULT (datetime('now')),
  human_count INTEGER NOT NULL,
  raw_count INTEGER,
  source TEXT NOT NULL DEFAULT 'cron'
);

-- Locked-in monthly forecasts (migration 006), first-writer-wins per target_month.
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_month TEXT UNIQUE,
  forecast_net INTEGER NOT NULL,
  made_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Current-member directory (migration 007): present members' joined_at, refreshed
-- ~daily by the cron, so retention can count people still in the server (tenure).
CREATE TABLE IF NOT EXISTS member_directory (
  discord_user_id TEXT PRIMARY KEY,
  username        TEXT,
  joined_at       TEXT,
  last_seen_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_officer ON sessions(officer_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_officer ON password_resets(officer_id);
CREATE INDEX IF NOT EXISTS idx_ratings_officer ON activity_ratings(officer_id);
CREATE INDEX IF NOT EXISTS idx_officers_current_position ON officers(current_position_id);
CREATE INDEX IF NOT EXISTS idx_member_events_time ON member_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_member_snapshots_time ON member_snapshots(taken_at);
CREATE INDEX IF NOT EXISTS idx_member_directory_seen ON member_directory(last_seen_at);
