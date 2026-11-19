-- 纯合成开发数据。日期固定，便于复现；双 Worker 预览会另按运行当日的 JST 生成提醒。
INSERT INTO reminders
  (seq,title,content,deadline,level,isPinned,isFinished,regDatetime,CloseDatetime,recurrence)
VALUES
  (1000,'开发样例 · 逾期','核对示例回执','2026-11-19T10:10:00+09:00','中',0,0,'2026-11-18T00:00:00Z','',NULL),
  (1001,'开发样例 · 循环','验证完成后生成下一期','2026-11-20','中',0,0,'2026-11-18T00:00:00Z','',
   '{"v":1,"mode":"interval","days":2}'),
  (1002,'开发样例 · 留空','验证不选择就保持原状态','2026-11-20','低',0,0,'2026-11-18T00:00:00Z','',NULL);

INSERT INTO diaries(seq,title,content,regDatetime)
VALUES (1000,'绯月助记-2026-11-20 09:00:00','这是一篇用于验证预览和回执的合成日记。❤️',1795132800000);

INSERT INTO ra_categories(id,name) VALUES ('fixture-resource','开发样例资源');
INSERT INTO ra_records(id,body,category_id,created_at)
VALUES ('fixture-note','示例资料链接 https://example.test/resource ❤️','fixture-resource',1795132800000);

INSERT INTO ra_hushi_records(id,kind,created_at,body,tag_ids,photos)
VALUES
  ('fixture-food','food',1795132800000,'示例午餐。❤️','[]','[]'),
  ('fixture-exercise','exercise',1795132800000,'示例散步。❤️','[]','[]'),
  ('fixture-event','event',1795132800000,NULL,NULL,NULL);
