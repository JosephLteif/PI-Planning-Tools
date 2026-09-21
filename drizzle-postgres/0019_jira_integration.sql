CREATE TABLE IF NOT EXISTS jira_connections (
  id TEXT PRIMARY KEY NOT NULL,
  base_url TEXT NOT NULL,
  auth_mode TEXT NOT NULL,
  username TEXT,
  secret_ciphertext TEXT NOT NULL,
  board_id TEXT,
  board_name TEXT,
  field_mappings_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jira_issue_links (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  story_key TEXT NOT NULL,
  jira_issue_id TEXT NOT NULL,
  jira_key TEXT NOT NULL,
  jira_project_key TEXT,
  jira_updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  sync_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, story_key),
  UNIQUE (room_id, jira_issue_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jira_sprint_links (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  local_sprint_id TEXT NOT NULL,
  jira_sprint_id TEXT NOT NULL,
  board_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  sync_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, local_sprint_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jira_issue_links_key_idx ON jira_issue_links (room_id, jira_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jira_sprint_links_jira_idx ON jira_sprint_links (room_id, jira_sprint_id);
