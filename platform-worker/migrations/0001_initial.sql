-- Gigas Challenge List application data.
-- Authentication identities are supplied by the auth layer; user_id values
-- below are opaque IDs from that provider and deliberately do not assume a
-- specific auth schema yet.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS moderator_roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'moderator')),
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS levels (
  id TEXT PRIMARY KEY,
  external_aredl_id TEXT UNIQUE,
  gd_level_id TEXT,
  name TEXT NOT NULL,
  creator TEXT NOT NULL DEFAULT '',
  verifier TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  verifier_video_url TEXT,
  thumbnail_url TEXT,
  position INTEGER,
  points REAL,
  list_status TEXT NOT NULL DEFAULT 'active'
    CHECK (list_status IN ('active', 'extended', 'legacy', 'unlisted')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('aredl', 'manual', 'import')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_levels_position ON levels(position);
CREATE INDEX IF NOT EXISTS idx_levels_status_position ON levels(list_status, position);
CREATE INDEX IF NOT EXISTS idx_levels_name ON levels(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS record_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  evidence_url TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'needs_changes')),
  reviewed_by TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_status_date
  ON record_submissions(status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_submissions_user
  ON record_submissions(user_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_submissions_level
  ON record_submissions(level_id, status);

CREATE TABLE IF NOT EXISTS accepted_records (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES record_submissions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  evidence_url TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_records_user ON accepted_records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_level ON accepted_records(level_id);
CREATE INDEX IF NOT EXISTS idx_records_user_level ON accepted_records(user_id, level_id);

CREATE TABLE IF NOT EXISTS moderation_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_target
  ON moderation_audit_log(target_type, target_id, created_at);
