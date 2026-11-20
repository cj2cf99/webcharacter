CREATE TABLE daily_logs (
  owner_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, log_date)
);
