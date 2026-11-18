CREATE TABLE task_submissions (
  submission_id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL
);

-- 历史任务及尚未接入此协议的创建入口保留 NULL。
ALTER TABLE tasks ADD COLUMN submission_id TEXT REFERENCES task_submissions(submission_id);
CREATE UNIQUE INDEX tasks_submission_id_unique ON tasks(submission_id);
