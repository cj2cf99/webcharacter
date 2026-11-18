-- 每个任务仅保留最后一次有效任务操作快照，不是心跳或进度历史。
CREATE TABLE IF NOT EXISTS task_activity (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(task_id),
  updated_at TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('claim', 'progress', 'result')),
  progress_message TEXT
);
