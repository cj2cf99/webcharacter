-- 单次升级：已有任务无截止，不改其状态或活动记录。
ALTER TABLE tasks ADD COLUMN deadline_at TEXT;
