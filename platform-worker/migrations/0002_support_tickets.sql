-- Run in Cloudflare D1 Console before deploying support routes.
CREATE TABLE IF NOT EXISTS support_tickets (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('bug','appeal','account','general','deletion')),
 subject TEXT NOT NULL,
 message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
 staff_reply TEXT NOT NULL DEFAULT '',
 assigned_staff TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_tickets(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status,created_at);
