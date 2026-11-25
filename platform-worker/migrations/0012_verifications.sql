CREATE TABLE IF NOT EXISTS verification_submissions (
id TEXT PRIMARY KEY,user_id TEXT NOT NULL,list_type TEXT NOT NULL CHECK(list_type IN ('main','spam')),
name TEXT NOT NULL,creator TEXT NOT NULL,verifier TEXT NOT NULL,gd_level_id TEXT NOT NULL,video_url TEXT NOT NULL,
suggested_position INTEGER,cps REAL,duration_seconds REAL,notes TEXT NOT NULL DEFAULT '',
status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
review_note TEXT NOT NULL DEFAULT '',reviewed_by TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON verification_submissions(status,list_type);
CREATE INDEX IF NOT EXISTS idx_verifications_user ON verification_submissions(user_id);
