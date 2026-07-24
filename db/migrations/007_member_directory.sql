-- Current-member directory, for tenure/retention. Applied with:
--   npx wrangler d1 execute 5thmr-command-hub-db [--local|--remote] --file=db/migrations/007_member_directory.sql
--
-- The hourly cron already fetches the full guild member list (for the count anchor)
-- but discarded it. We now also keep each present member's joined_at here so retention
-- can account for people who are STILL in the server (censored tenure) instead of only
-- those who already left. Refreshed ~daily by the cron (staleness-gated). "Present now"
-- = rows whose last_seen_at equals the newest sync (MAX(last_seen_at)).
CREATE TABLE IF NOT EXISTS member_directory (
  discord_user_id TEXT PRIMARY KEY,   -- member.user.id (stable)
  username        TEXT,               -- member.user.tag, for reference
  joined_at       TEXT,               -- ISO, Discord member.joined_at (current continuous membership)
  last_seen_at    TEXT NOT NULL       -- ISO, timestamp of the sync run that last saw this member
);
CREATE INDEX IF NOT EXISTS idx_member_directory_seen ON member_directory(last_seen_at);
