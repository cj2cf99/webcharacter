CREATE TABLE IF NOT EXISTS companion_diary (
  owner TEXT NOT NULL, day TEXT NOT NULL, part INTEGER NOT NULL,
  revision INTEGER NOT NULL, body TEXT NOT NULL, summary TEXT NOT NULL,
  tags TEXT NOT NULL, mood TEXT NOT NULL, weather TEXT NOT NULL,
  threads TEXT NOT NULL DEFAULT '[]', batches TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY(owner,day,part)
);
CREATE TABLE IF NOT EXISTS companion_nags (
  owner TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
  created_at TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL,
  title TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, mood TEXT NOT NULL,
  payload TEXT NOT NULL, PRIMARY KEY(owner,id), UNIQUE(owner,source,source_id)
);
CREATE INDEX IF NOT EXISTS companion_nag_time ON companion_nags(owner,created_at DESC,id);
CREATE UNIQUE INDEX IF NOT EXISTS companion_single_pending ON companion_nags(owner) WHERE status IN ('提问中','等待回应','意外中断');
