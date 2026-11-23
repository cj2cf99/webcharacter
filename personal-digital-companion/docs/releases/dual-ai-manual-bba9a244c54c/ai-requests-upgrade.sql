-- 发布留痕。正式版首次打开旧 AI 询问池时由桌面程序自动执行。
-- 仅当 execution_ms、task_key 和 ai_task_execution 均不存在时适用。
BEGIN;
ALTER TABLE ai_requests ADD COLUMN execution_ms REAL NOT NULL DEFAULT 0;
ALTER TABLE ai_requests ADD COLUMN task_key TEXT;
COMMIT;
CREATE INDEX IF NOT EXISTS ai_task_execution ON ai_requests(task_key);
