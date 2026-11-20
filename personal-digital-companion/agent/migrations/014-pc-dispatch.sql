-- all 面向任意一台 PC。目标外键在领取成功时填入，原派发范围保留用于提交号重放。
ALTER TABLE tasks ADD COLUMN dispatch_all INTEGER NOT NULL DEFAULT 0 CHECK(dispatch_all IN (0,1));
