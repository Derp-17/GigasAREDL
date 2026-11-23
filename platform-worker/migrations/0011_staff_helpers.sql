-- Add helper as a staff role while preserving existing assignments.
PRAGMA foreign_keys=OFF;
CREATE TABLE moderator_roles_new (
 user_id TEXT PRIMARY KEY,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','moderator','helper')),
 granted_by TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO moderator_roles_new(user_id,role,granted_by,created_at)
 SELECT user_id,role,granted_by,created_at FROM moderator_roles;
DROP TABLE moderator_roles;
ALTER TABLE moderator_roles_new RENAME TO moderator_roles;
PRAGMA foreign_keys=ON;
