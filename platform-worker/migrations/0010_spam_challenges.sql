-- Independent spam list: difficulty determines rank; CPS is a separate statistic.
CREATE TABLE IF NOT EXISTS spam_challenges (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 creator TEXT NOT NULL DEFAULT '',
 verifier TEXT NOT NULL DEFAULT '',
 gd_level_id TEXT NOT NULL DEFAULT '',
 video_url TEXT NOT NULL DEFAULT '',
 position INTEGER NOT NULL UNIQUE CHECK(position > 0),
 cps REAL NOT NULL CHECK(cps > 0 AND cps <= 100),
 duration_seconds REAL CHECK(duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 3600)),
 notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS spam_submissions (
 id TEXT PRIMARY KEY,
 challenge_id TEXT NOT NULL REFERENCES spam_challenges(id),
 user_id TEXT NOT NULL,
 evidence_url TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 review_note TEXT NOT NULL DEFAULT '',
 reviewed_by TEXT,
 submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_spam_submissions_user ON spam_submissions(user_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_spam_submissions_status ON spam_submissions(status, submitted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spam_approved_unique ON spam_submissions(user_id,challenge_id) WHERE status='approved';
