-- 最终回执保存的执行尝试；不迁移或删除既有任务。
CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  attempt_no INTEGER NOT NULL CHECK (typeof(attempt_no) = 'integer' AND attempt_no IN (1, 2)),
  status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error TEXT,
  UNIQUE (task_id, attempt_no)
);
