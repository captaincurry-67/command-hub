-- Departments roster: single-row JSON blob, same pattern as the hierarchy table.
-- Applied with: npx wrangler d1 execute 5thmr-command-hub-db [--local|--remote] --file=db/migrations/004_departments.sql
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES officers(id)
);
