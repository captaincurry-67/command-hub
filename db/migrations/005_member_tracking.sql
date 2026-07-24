-- Two-signal Discord member tracking. Applied with:
--   npx wrangler d1 execute 5thmr-command-hub-db [--local|--remote] --file=db/migrations/005_member_tracking.sql

-- Flow: individual join/leave events (from the bot, exact timing). Replaces the
-- Google Sheet as the event store.
CREATE TABLE IF NOT EXISTS member_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_user_id TEXT,            -- member.user.id (stable), when available
  username TEXT,                   -- member.user.tag, for display / back-compat
  action TEXT NOT NULL,            -- 'join' | 'leave'
  occurred_at TEXT NOT NULL,       -- ISO timestamp, event time from the bot
  event_key TEXT UNIQUE,           -- idempotency key, dedupes retries
  source TEXT NOT NULL DEFAULT 'bot',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_member_events_time ON member_events(occurred_at);

-- Stock: periodic authoritative member-count anchors (humans incl. pending),
-- read hourly from Discord's REST API. Only the count is stored, not the list.
CREATE TABLE IF NOT EXISTS member_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at TEXT NOT NULL DEFAULT (datetime('now')),
  human_count INTEGER NOT NULL,    -- members where NOT user.bot (includes pending)
  raw_count INTEGER,               -- Discord's total incl. bots, for reference
  source TEXT NOT NULL DEFAULT 'cron'
);
CREATE INDEX IF NOT EXISTS idx_member_snapshots_time ON member_snapshots(taken_at);
