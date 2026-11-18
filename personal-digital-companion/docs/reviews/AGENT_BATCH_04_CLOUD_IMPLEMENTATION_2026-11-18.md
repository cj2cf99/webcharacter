# 第四组云端分工：实施与交接

2026-11-18 JST。子任务task_unit_api。状态：本分工实现及本地自动测试完成，待主会话最终审核；未启动常驻或操作生产。

## 需求审计与范围

开发前已完成AGENT_BATCH_04_REQUIREMENTS_AUDIT_2026-11-18.md并向主会话报告通过，之后才写代码。依据AGENT_BATCH_04_DESIGN.md与用户“跳过具体磁盘查询、继续第四组”的最新决定；单用户、任务单元、最多两次执行、无链式关系不变。

本分工包含通用创建参数校验、领取与最终回执、D1执行记录迁移、空业务种子及相关自动测试。主会话另行实现runner/sync，不在本报告宣称其验收结论。

## 变更与接口

- agent/worker.mjs：创建任务改为读取tasklist的string/number/boolean、required及string pattern；未知参数拒绝，坏配置明确TYPE_CONFIGURATION_ERROR；GET任务附完整executions。
- agent/tasks/parameters.mjs：小型参数校验函数，无动态脚本/JSON Schema框架。
- agent/tasks/actions.mjs：POST /api/tasks/:id/claim接收{device_id}，返回{task,claimed}；PENDING条件更新一次，已RUNNING返回false供核对，不能作为重跑许可。
- POST /api/tasks/:id/result接收设计6字段，严格核对1/2次尝试、连续编号/时间、首次失败才有第二次、终态及结果一致、固定失败文案。成功回{acknowledged:true,task}，同终态同回执只ack；不同回执409。
- agent/migrations/002-executions.sql：只新增executions表和必要主键/外键/唯一及次数约束，不删除/重建旧任务。
- agent/seeds/tasklist.sql：仅保留说明，无默认业务种子；旧disk.query数据不删。disk.query不出现在可选类型列表，创建/领取409，历史任务GET保留。
- tests/sqlite-d1.mjs：执行正式002迁移；D1 batch薄适配用SQLite BEGIN IMMEDIATE/COMMIT/ROLLBACK真实事务。
- tests/fixtures.mjs：测试专用seedMockTask，原tasks/devices/terminals测试改用mock.echo，不再依赖产品disk种子。
- tests/task-actions.test.mjs：新增7项，覆盖B01–B04云端验收。

结果存储采用条件INSERT尝试记录及条件UPDATE终态，同一D1 batch提交；最后完整回读和规范JSON比较才ack。使用主会话提供的纯JS execution/json.mjs，不重复开发序列化框架。D1 batch事务及失败整批回滚依据[Cloudflare D1 Database官方文档](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。

## 实际验证

仓库根执行：

```powershell
node --test personal-digital-companion/agent/tests/tasks.test.mjs personal-digital-companion/agent/tests/devices.test.mjs personal-digital-companion/agent/tests/terminals.test.mjs personal-digital-companion/agent/tests/task-actions.test.mjs
```

28/28通过：原21项迁移到测试mock后继续通过，新增7项通过。

- 默认空tasklist；模拟旧disk种子时列表隐藏、创建领取拒绝、旧记录/历史查询保留。
- 同任务同时两次领取仅一次claimed=true；非法目标/状态/认证不改任务。
- 首次成功、第二次成功、两次失败均原子保存；同回执并发补传不重复尝试；不同回执并发一份成功、一份409。
- 无效字段、次数、顺序、时间、任务ID、结果/错误不一致及非有限JSON拒绝，不落尝试记录。
- 注入第二条execution写入失败，前一条也回滚且tasks仍RUNNING；跨任务execution_id冲突同样整批回滚。
- JSON对象字段顺序不同但内容相同不误判冲突。
- 小型参数类型/必填/正则/未知参数/坏定义校验通过。

这些测试使用真实Worker fetch入口及隔离SQLite，不是预设SQL响应的stub。测试未运行磁盘查询或其他业务工具；未修改已有.local/state或生产数据。

## 主会话首轮发现与修正

主会话指出保留在旧D1中的disk.query仍会被GET tasklist返回，虽然创建/领取拒绝，但可选清单与暂停决定不一致。已按最简方式在类型列表SQL过滤该type，同时保留D1记录及历史任务。新增B01旧种子断言并随28项测试通过。未增加enabled配置框架。最终轮次与结论由主会话记录，本报告不自行宣布通过其4轮审核。

## 产物SHA256

- worker.mjs：D0790303774DE2957771AC1F787D59FF3EA6B05F8DD7901E769C20BBA359EC87
- tasks/actions.mjs：4B73F4CFD10F4DAE23A5D546DDBE674E1609E0C22E7368CCADF532B89EB8E15F
- tasks/parameters.mjs：55E3D3D21B7738FF26B8C4044B335B3A24F9502FD5727F2BA29BE25C00900E1A
- migrations/002-executions.sql：C308E191108E47A480BEA77AFACBDF8E5EE4AEA63EB9F553C272C10849A7E252
- seeds/tasklist.sql：41F97D772E3F4B2F04215390F9B18C98BAF59FDB02F6BE45BEC37B1B6ADBFE88
- tests/task-actions.test.mjs：03CAAC031FA640635AF90F1D9F6772CB6BAE6C9BDDC0396062F4F5C668284922

## 限制与交接

本轮002迁移未应用到实际Wrangler本地D1或生产D1；真实HTTP Worker未启动。旧.local/state在后续明确启动前需要按主会话README应用002迁移，不能把SQLite测试说成实际D1新接口验收。

身份仍是开发Bearer+目标归属检查，不是独立可撤销设备认证；浏览器cookie不代替执行凭据。没有业务handlers默认初始化，没有链式/自动轮询/锁服务/租约/UI。README与DEVELOPMENT由主会话统一更新。未安装依赖、提交、推送或部署。
