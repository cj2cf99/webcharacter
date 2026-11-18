-- 本机执行副本；D1 tasks仍是云端任务权威源。
CREATE TABLE IF NOT EXISTS local_tasks (
  task_id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  target_device_id TEXT NOT NULL,
  params_json TEXT NOT NULL CHECK(json_valid(params_json)),
  status TEXT NOT NULL CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 2 AND typeof(attempt_count)='integer'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error TEXT
);
CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES local_tasks(task_id),
  attempt_no INTEGER NOT NULL CHECK(attempt_no IN (1,2)),
  status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETED','FAILED')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error TEXT,
  UNIQUE(task_id,attempt_no)
);
CREATE TABLE IF NOT EXISTS local_task_metadata (
  task_id TEXT PRIMARY KEY REFERENCES local_tasks(task_id),
  name TEXT NOT NULL,
  deadline_at TEXT,
  claim_request_id TEXT,
  uploaded INTEGER NOT NULL DEFAULT 0 CHECK(uploaded IN (0,1))
);
CREATE TABLE IF NOT EXISTS local_recoveries (
  task_id TEXT PRIMARY KEY REFERENCES local_tasks(task_id),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1))
);
