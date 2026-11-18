# 第六组：实施与自动测试交接

2026-11-18 JST。子任务task_unit_api。状态：限定范围实现和自动测试完成，待主会话独立审核；未启动或部署。

## 审计、边界与依据

开发前已写AGENT_BATCH_06_REQUIREMENTS_AUDIT_2026-11-18.md，包含第五组交付时6个关键文件实际SHA256；向主会话报告审计通过后才修改代码。第五组历史审核报告、README与DEVELOPMENT均未修改。

现行设计AGENT_BATCH_06_DESIGN.md的SHA256：933BDD2EFDC3CB765BDA47D621EB7927FFF2684A0E98210231987B6DE0351C23。用户最终规则为可选截止、截止后7天不可新领取、日本时间；未采用“截止立即禁止”或“删除截止字段”。

## 三项实现

1. tasks/actions.mjs新增cancel分支，账户Bearer、空JSON、不要求设备；条件PENDING→CANCELLED，重复取消返回成功，RUNNING和其他终态409，不写活动或执行记录。
2. 004-task-deadline.sql只加nullable列。tasks/deadline.mjs严格验证日历和显式时区，统一UTC；worker创建/详情与devices/task-list摘要接入deadline_at和派生can_claim。claim的UPDATE直接包含截止宽限条件，RUNNING核对不受影响。
3. tests/task-lifecycle.test.mjs新增8项；SQLite测试初始化仅缺列时应用正式004；TASK_LIFECYCLE_HANDOFF.md说明JST输入/展示、接口语义和单次迁移命令。

原003活动表不改；devices概况active_count不改语义；没有过期服务、查询写库、自动EXPIRED、UI、运行中强停、链式、新业务、依赖或凭据系统。

## 实际测试与结果

仓库根实际执行：

```powershell
node --test personal-digital-companion/agent/tests/*.test.mjs
node --test personal-digital-companion/agent/tests/task-lifecycle.test.mjs
```

接线后原52/52通过；新文件8/8通过；最终全套60/60通过，无失败、跳过或取消。

- C01：PENDING及cloud任务取消、重复取消、参数历史保留、无设备活动；鉴权/格式/方法/未知任务以及RUNNING/终态拒绝。
- C02：取消先到、领取先到、并发及预查询后状态变化，不能两者均成功。
- D01：省略/null、显式JST/+09:00、Z、其他明确偏移一致规范UTC；闰日和小数秒；无时区、无效日/月/时分秒/偏移等拒绝，无新增记录。
- D02：Node内置固定Date时钟验证截止当时、7天前1ms、恰好7天、之后；SQL/详情/列表can_claim一致，查询快照不变；预查询后deadline列被改到不可领取也被原子UPDATE拒绝。
- D03：RUNNING跨过7天仍可核对/进度/结果/同回执补传，execution不重复。
- D04：复用真实sync+runner及mock，取消或宽限已满不调用handler，未设截止的其他任务正常完成。
- R01：真实SQLite从001至003含旧任务升级004，deadline为NULL；直接重复004明确失败，测试重复初始化检查列后保留全部数据。

测试全部隔离SQLite/临时本机副本，未执行真实业务或读取真实磁盘。固定时钟用Node内置测试API，无sleep或时区猜测。

## 交付文件SHA256

- agent/worker.mjs：9EC0552002EC205514BF278BCDB280AFCF8A44ED6001FCD3F4EED31075CCE485
- agent/tasks/actions.mjs：38388E868F00909B483937E719A0B2F5FA3583EB248FE27A3804D22E7019F69E
- agent/tasks/deadline.mjs：4387C17AFCEBC8B50B8AC53CA9B97539FCCA71ACC8FB45C0A718323E8528DBEB
- agent/devices/task-list.mjs：E3E24C7C95B675617FD2309A743642A93AF49871D4D45517C4D6D5114B8CE65A
- agent/migrations/004-task-deadline.sql：9696CDCBB5C3877FB74E7503B927CC6E05BF968F0956F1500A8A51BD72F8DB93
- agent/tests/sqlite-d1.mjs：74D5CB9226AA774D763ACD75C0EF90E12F735D068AC2B9B5622E9D0E6F2F8BD2
- agent/tests/task-lifecycle.test.mjs：E3558DE2D472A2F63B91933EFB3405C375330E468A1A8A5AD8530E8538BC01A8

## 未验证与主审核交接

未在实际Wrangler D1运行004，未启动HTTP Worker或桌面，未做UI/JST控件/生产验证。未修改真实数据、安装依赖、Git提交推送或部署。准确单次本地初始化命令在交接文档；不能把计划写成已执行。

已通知主会话全套60项通过及代码可审核。主会话按最多4轮bug/需求偏移/最简审核，无残留即停止；4轮仍有问题主会话接手最多2轮。此报告不预先代替主会话最终结论，不自动推进第七组。
