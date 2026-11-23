-- ARCHIVE schema v5: history of the backups (specification §16.2, ARCHITECTURE.md §7.1).
--
-- A backup is a ZIP file wherever the user chose to save it; this table only remembers where and what, so that
-- the interface can list, verify and restore them. A backup that was moved or deleted is shown as missing.

CREATE TABLE backups (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 4096),
  created_at INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  schema_version INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  -- Counts of what it holds: {"documents":…,"notes":…,"workspaces":…,"tags":…,"relations":…,…}.
  contents_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(contents_json)),
  verified_at INTEGER,
  -- Outcome of the last verification: 'valid' or 'invalid'.
  verification TEXT CHECK (verification IS NULL OR verification IN ('valid', 'invalid')),
  UNIQUE (path)
);
CREATE INDEX backups_created_at ON backups (created_at);
