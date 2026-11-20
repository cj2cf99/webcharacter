-- 与主站已有三个登记入口配套。准备好受信任的主站接线后加载。
WITH text_spec(value) AS (
  VALUES ('{"body":{"type":"string","required":true,"pattern":"^(?=[\\s\\S]*\\S)[\\s\\S]{1,4000}$"},"reflection":{"type":"string","pattern":"^[\\s\\S]{0,4000}$"},"tag_ids":{"type":"string_array","max_items":50,"pattern":"^.{1,80}$"},"photos":{"type":"string_array","max_items":20,"pattern":"^https://\\S+$"}}')
)
INSERT INTO tasklist (type, name, description, executor, parameter_spec_json, procedure, report_spec)
SELECT 'hu-shi.food.create', '登记吃喝', '我也是胡适 · 吃喝流水', 'cloud', value,
  '确认正文与可选感想、吃喝 Tag ID 和已上传图片，再通过主站吃喝接口登记，服务器生成时间。',
  '返回业务记录 ID 和登记时间。'
FROM text_spec
UNION ALL
SELECT 'hu-shi.exercise.create', '登记运动', '我也是胡适 · 运动流水', 'cloud', value,
  '确认正文与可选感想、运动 Tag ID 和已上传图片，再通过主站运动接口登记，服务器生成时间。',
  '返回业务记录 ID 和登记时间。'
FROM text_spec
UNION ALL
SELECT 'hu-shi.event.create', '登记撸管', '我也是胡适 · 只登记发生事件', 'cloud', '{}',
  '用户明确确认后提交空参数，由主站登记时间并执行十秒冷却。',
  '返回业务记录 ID 和登记时间。'
WHERE true
ON CONFLICT(type) DO NOTHING;
