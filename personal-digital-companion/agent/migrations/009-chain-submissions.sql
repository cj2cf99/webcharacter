-- 带提交号的链以该 UUID 为主键。只保存规范化请求的摘要，用于识别重放。
-- 已存在和未传提交号的任务链保留 NULL。
ALTER TABLE chains ADD COLUMN submission_fingerprint TEXT;
