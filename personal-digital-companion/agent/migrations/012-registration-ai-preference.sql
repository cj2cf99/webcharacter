-- One active preferred provider per registration owner.
CREATE TABLE registration_ai_preference (
  owner_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
