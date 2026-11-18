# 第四组云端分工：开发前需求审计

2026-11-18 JST。子任务task_unit_api。先写审计并向主会话报告，再实施。

用户最新决定：跳过disk.query具体任务，记录待开发，继续通用后续和第四组。依据AGENT_MINIMAL_DESIGN.md的单用户/JSON参数/任务单元/最多两次执行、AGENT_BATCH_04_DESIGN.md与原V1.5持久化/领取/结果补传要求。已读既有Worker、SQL、测试及第三组runner，沿用CLAUDE、开发指南、FRAMEWORK_PREFERENCES和独立备忘录未找到记录。

设计基线SHA256：19D12406E3989B3CDE49D4A8C18933E44FB21D17F22277968EDBA75162A94DC2。

## 审计结果

| 要求 | 本分工落实 | 结果 |
| --- | --- | --- |
| 跳过具体磁盘查询 | 默认种子不新增任何业务类型，创建/领取disk.query明确拒绝，旧数据不删除 | 符合 |
| tasklist/tasks在D1，参数JSON | 保留原表；校验仅支持string/number/boolean/required和string pattern | 符合最简，无JSON Schema平台 |
| 每任务最多两次，第二次失败结束 | 结果报告严格核对连续尝试、终态、结果和固定错误 | 符合；不开发链式关系 |
| 领取防重复与先落盘补传 | 条件PENDING→RUNNING；同目标已RUNNING回false核对，不授权盲重跑 | 符合 |
| 结果落库一致，回执丢失可补传 | executions与tasks同一D1 batch；同内容终态重复报告ack，不同409 | 符合，无回执队列表 |
| 单用户，无大并发 | 复用D1条件SQL/事务，无锁服务、租约、轮询或消息平台 | 符合 |
| 子任务先审计、主会话审核 | 本文件先于代码；交主会话最多4轮审核 | 符合 |

## 原子性具体检查

采用每条execution的INSERT…SELECT…WHERE tasks.status='RUNNING'且目标匹配，最后条件UPDATE终态，全部放同一D1 batch。事务成功后回读完整任务及尝试记录核对，才返回ack。并发相同回执在已终态时不再写；不同回执409，不覆盖。execution_id若被其它任务占用，唯一约束使整批失败，tasks保持RUNNING；测试须覆盖回滚。

完整JSON用既有纯JS encodeJson确定性编码，避免对象字段顺序造成误冲突，拒绝非有限数字等不可完整表达值。固定失败文案与主会话约定为“任务执行失败”；UTC时间用Date.toISOString形式，尝试编号连续且第一次失败才允许第二次。

本轮沿用开发Bearer，仅按device_id核对归属，不冒充独立设备认证。新executions迁移只加表，不删除或重建tasks。mock定义仅临时测试数据库，产品初始化为空。不能把GET返回RUNNING当作执行许可，主会话同步器负责本机副本核对。

## 结论

未发现偏离、过度设计或需用户重新决定问题。原子回执方案与主会话已沟通一致，可以按约定实现。当前只是需求审计通过，未宣称实现或验收完成；主会话独占最终审核和README/DEVELOPMENT更新。
