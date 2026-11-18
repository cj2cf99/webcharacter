-- 单用户任务单元；无用户、链式任务或调度表。
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  computer_name TEXT NOT NULL,
  alias TEXT COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasklist (
  type TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  executor TEXT NOT NULL CHECK (executor IN ('cloud', 'pc')),
  parameter_spec_json TEXT NOT NULL CHECK (json_valid(parameter_spec_json)),
  procedure TEXT NOT NULL,
  report_spec TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL REFERENCES tasklist(type),
  target_device_id TEXT REFERENCES devices(device_id),
  params_json TEXT NOT NULL CHECK (json_valid(params_json)),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempt_count) = 'integer' AND attempt_count BETWEEN 0 AND 2),
  created_at TEXT NOT NULL,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error TEXT
);
