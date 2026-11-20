-- 与 tasklist-hu-shi.sql 一起加载。三类胡适登记复用现有定义。
INSERT INTO tasklist (type, name, description, executor, parameter_spec_json, procedure, report_spec)
VALUES
  ('records.create', '新增随手记', '在已有分类下登记随手记', 'cloud',
   '{"body":{"type":"string","required":true,"pattern":"^(?=[\\s\\S]*\\S)[\\s\\S]{1,4000}$"},"category_id":{"type":"string","required":true,"pattern":"^\\S+$"}}',
   '使用已有分类，保留正文内的链接。', '返回随手记记录 ID。'),
  ('reminders.create', '登记提醒', '创建一条单次提醒', 'cloud',
   '{"title":{"type":"string","required":true,"pattern":"^(?=[\\s\\S]*\\S)[\\s\\S]{1,300}$"},"content":{"type":"string","pattern":"^[\\s\\S]{0,30000}$"},"deadline":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"level":{"type":"string","pattern":"^(高|中|低)$"}}',
   '保留提醒内容和东京日期。', '返回提醒编号。'),
  ('diaries.create', '登记日记', '创建主站日记', 'cloud',
   '{"title":{"type":"string","required":true,"pattern":"^(?=[\\s\\S]*\\S)[\\s\\S]{1,300}$"},"content":{"type":"string","required":true,"pattern":"^(?=[\\s\\S]*\\S)[\\s\\S]{1,100000}$"}}',
   '保留用户叙述与反思。', '返回主站日记编号。'),
  ('planner.hours.record', '登记长期计划实际投入', '给东京当天选定的计划任务登记实际投入小时数', 'cloud',
   '{"reminderId":{"type":"number","required":true,"min":1},"dispatchId":{"type":"string","required":true,"pattern":"^\\S+$"},"today":{"type":"string","required":true,"pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"version":{"type":"string","required":true,"pattern":"^[a-f0-9]{64}$"},"actualHours":{"type":"number","required":true,"min":0,"max":24}}',
   '从今日任务取提醒编号、派发编号、东京日期及版本，确认投入小时数后提交。', '返回主站派发编号、实际小时数及登记时间。')
ON CONFLICT(type) DO NOTHING;
