-- Dedicated Admin account support: officers.is_admin marks the special login
-- that may edit any rating for any week (bypasses the 30-day window and the
-- rank permission matrix). Normal accounts default to 0.
ALTER TABLE officers ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
