# 第六组：开发前需求审计与第五组边界

2026-11-18 JST。子任务task_unit_api。先记录审计与边界哈希并报告，再开发；不修改第五组历史审核记录。

## 原始依据与审计结论

用户明确继续第六组，现行AGENT_BATCH_06_DESIGN.md保留讨论中的最终决定：“加个限制，过期7天不可选”，日本时间。只实现未领取取消、可选截止的7天宽限及验证交接。原V1.5 M1-02/TASK-11为来源；最新决定覆盖“截止立即禁止”或“删除截止字段”的中间解释。

已读本轮详细设计、REQUIREMENT_CHANGES.md、第五组当前Worker/actions/activity/devices/list和测试适配，沿用已读CLAUDE、开发指南、全局FRAMEWORK_PREFERENCES及独立备忘录缺失记录。单用户最简，不建过期服务、定时器、链式或运行中强停。

| 要求 | 设计落实 | 审计 |
| --- | --- | --- |
| 未领取可以取消 | 账户Bearer下PENDING条件UPDATE，重复取消成功，其他状态409 | 符合；不需要PC身份或执行停止 |
| 可选截止且超过7天不可选 | nullable deadline_at规范为UTC，PENDING领取SQL直接检查7天阈值 | 符合；不是截止立即拒绝 |
| JST输入/展示 | 接口明确ISO时区，交接以+09:00输入、Asia/Tokyo展示 | 符合；不依赖主机时区 |
| RUNNING不受截止影响 | 已领取核对/进度/结果保持原流程 | 符合 |
| 历史可查与最简 | can_claim只派生、不查询写库，不批量改EXPIRED或隐藏记录 | 符合；active_count语义不变 |
| 正确取消/领取竞争 | 双方条件UPDATE，以真实数据库结果返回，不新增锁服务 | 符合 |

取消不属于设备上报，不更新task_activity。只新增004 nullable列；历史行NULL，不伪造截止。测试初始化须仅执行一次ALTER，不能为了重复测试把生产迁移改成不可靠多步流程。

未发现偏离、过度设计或需用户重新决定问题。可按设计开发；先向主会话报告通过，交付后主会话最多4轮独立审核。

## 开发前第五组交付文件SHA256

以下为第六组任何代码修改前实际读取值，作为第五/六组边界，不覆盖第五组报告：

- agent/worker.mjs：99320223B946FF01942459FA791FFF7E57C6065B6F74F7772CF0BA29FB0954B5
- agent/tasks/actions.mjs：EFA3FC881963F94DCFB45BE8C5FB6EDE9D00C505C73B53E81F7C701B288D6754
- agent/tasks/activity.mjs：8764A3E66BBD4C602E9760F826D17DA52D4FFE6B41F4DCFDA436B7D2FF72B721
- agent/devices/api.mjs：B9071B6513D9C15139454A5EA83B20EF02D13D772C5051FA4CE8EB798CF813C0
- agent/devices/task-list.mjs：A96CC2A455BCAD4F7913A30B36A3C25D49F0A29790D811C7B0A857E5A21108DA
- agent/tests/sqlite-d1.mjs：75930D4DBFC5A7A875BB770A9C8BD876E839554F3CCD356DD8C3925200DA7B10
