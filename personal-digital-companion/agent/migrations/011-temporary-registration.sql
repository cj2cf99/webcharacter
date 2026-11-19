-- 显式标记由自然语言登记入口创建的任务链。既有链继续走原领取路径。
ALTER TABLE chains ADD COLUMN temporary_registration INTEGER NOT NULL DEFAULT 0
  CHECK(typeof(temporary_registration) = 'integer' AND temporary_registration IN (0, 1));
