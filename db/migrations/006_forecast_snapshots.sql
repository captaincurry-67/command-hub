-- Locked-in monthly net-growth forecasts, for honest forecast-vs-actual comparison.
-- First-writer-wins per target_month (UNIQUE + INSERT OR IGNORE from the hourly cron):
-- the forecast we made ahead of time is preserved and never overwritten once set.
--   npx wrangler d1 execute 5thmr-command-hub-db [--local|--remote] --file=db/migrations/006_forecast_snapshots.sql
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_month TEXT UNIQUE,        -- 'YYYY-MM' the forecast is FOR
  forecast_net INTEGER NOT NULL,   -- predicted net member change for that month
  made_at TEXT NOT NULL DEFAULT (datetime('now'))
);
