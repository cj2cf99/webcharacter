-- 仅加载到隔离的模拟数据库。默认种子不启用未接通的业务任务。
INSERT INTO tasklist (type, name, description, executor, parameter_spec_json, procedure, report_spec)
VALUES
  ('records.create', '新增随手记', '在主站已有分类下创建一条随手记', 'cloud',
   '{"body":{"type":"string","required":true,"pattern":"^(?=[\\s\\S]*\\S)[\\s\\S]{1,4000}$"},"category_id":{"type":"string","required":true,"pattern":"^\\S+$"},"photos":{"type":"string_array","max_items":20,"pattern":"^https://\\S+$"}}',
   '核对正文和主分类；获确认后由云端调用主站随手记登记接口。当前仅模拟。',
   '返回随手记记录 ID；失败保留错误及尝试记录。'),
  ('reminders.create', '登记提醒', '在主站创建一条单次提醒', 'cloud',
   '{"title":{"type":"string","required":true,"pattern":"^(?=[\\s\\S]*\\S)[\\s\\S]{1,300}$"},"content":{"type":"string","pattern":"^[\\s\\S]{0,30000}$"},"deadline":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"level":{"type":"string","pattern":"^(高|中|低)$"}}',
   '核对标题、正文、日本日期和等级；获确认后由云端调用主站提醒接口。当前仅模拟。',
   '返回提醒编号；登记成功即完成本任务，不等待提醒时间。')
ON CONFLICT(type) DO NOTHING;
