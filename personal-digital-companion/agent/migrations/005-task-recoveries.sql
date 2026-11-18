-- 中断执行原始快照与用户决定；不伪造最终执行结果。
CREATE TABLE IF NOT EXISTS task_recoveries (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(task_id),
  decision TEXT NOT NULL CHECK(decision IN ('abandon','redo')),
  replacement_task_id TEXT UNIQUE REFERENCES tasks(task_id),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  decided_at TEXT NOT NULL,
  CHECK((decision='abandon' AND replacement_task_id IS NULL) OR (decision='redo' AND replacement_task_id IS NOT NULL))
);
