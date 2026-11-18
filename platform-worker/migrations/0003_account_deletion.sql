-- Account deletion recovery queue. Apply after 0002_support_tickets.sql.
CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','auth_deleted','completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_deletion_jobs_status ON account_deletion_jobs(status,created_at);
