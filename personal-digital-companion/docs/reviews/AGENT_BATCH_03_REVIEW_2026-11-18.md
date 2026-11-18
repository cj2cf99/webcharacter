# 第三组：单任务执行与重试复核

2026-11-18 JST。状态：本轮本地执行模块验收通过；云端领取/回传、桌面生命周期和实际整体验收未执行。

## 范围与依据

用户最新要求“主流程继续往下走，开始第三组”；范围见AGENT_BATCH_03_DESIGN.md，原始与后续确认见AGENT_MINIMAL_DESIGN.md。三项工作为本地执行记录、固定L1磁盘查询与两次上限、测试。不是完整M1闭环，不把后续接线暗中扩大为本组。

参考已读项目规则、V1.5 M1-04/05/06/08、全局框架偏好及独立备忘录缺失记录。Windows退出可中断的最新决定覆盖独立常驻旧约定。第二组子代理的最多4轮审核已独立首轮通过，本组是主会话直接开发，按原开发后最多三轮复核执行。

仓库HEAD：9ccdf3a147c302ca23092d9596d4958db28f6719；新文件未跟踪，本组仅新增agent/execution/和tests/execution.test.mjs及文档，不改既有桌面或动画。最终SHA256：

- execution/disk.mjs：81EC89BF7FC9C3FFCB4D42A4006E64182E1AB57E922004C6B1D01A1E36879B7D
- execution/runner.mjs：0DCAE7BFD88849A448EAC9B7C745655D2803AF1FAC7CA48B117967D38624DB36
- execution/schema.sql：CD3BA05232E5B58A2A4F221D2478C00EACD772553FE42EDB0C6D7B05A98EA139
- tests/execution.test.mjs：7F04D1CD4F607E87976D9DAD7C421D72494DA9F416FDCF9A74FAFFDA191571E7

## 实际命令与结果

工作目录G:/selftool/WebCharacter，Node v24.22.1。

1. `node --test personal-digital-companion/agent/tests/execution.test.mjs`：8/8通过，无跳过。
2. `node --test personal-digital-companion/agent/tests/*.test.mjs`：29/29通过，无跳过，含原11项、终端10项和本组8项。
3. Windows独立读数比较：PowerShell `[System.IO.DriveInfo]::new('C:\')`读取TotalSize/AvailableFreeSpace，再以Node导入queryDisk({drive:'C:'})，比较总量及可用量。实际totalMatchesSystem=true、availableDifferenceBytes=0。此为同机短时只读测量，不承诺磁盘被其它程序写入时两次读取仍逐字节一致。
4. Get-FileHash生成上述哈希。测试临时SQLite目录在结束时清理；无生产数据库写入。

E01：一次成功，任务/执行记录持久化，重复及重开后不重跑。
E02：首次失败后立即同ID同参数第二次成功，过程中任务保持RUNNING；原始异常标记不落入结果。
E03：两次失败终态FAILED，重开后不触发第三次。
E04：未知工具、错误目标/参数及同ID改内容被拒，未运行工具；风险等级固定L1。
E05：读取磁盘前另一SQLite连接能看到RUNNING和尝试记录；同任务在途不重复调用。
E06：模拟保存的未结束尝试，重开明确待核对、不盲目执行；明确首次失败只补剩余一次。此为中断记录模拟，不是实际精灵强杀实验。
E07：参数、平台、系统读取错误、整数容量边界通过，错误不泄露原始系统异常。
E08：本机真实C盘查询首次成功。

## 第一轮复核与停止

- Bug：检查任务校验、两个SQLite事务边界、首次失败与最终失败区分、最多2次、终态缓存和数据库写入失败路径。工具执行前持久化，工具结果保存失败不会被当成工具失败再次执行；未确定的中断状态不会重置次数。未发现残留问题。
- 需求偏移：符合单任务、JSON参数、固定目标及失败立即一次重试；没有任务先后/依赖或链式调度；本地副本不取代D1 tasklist/tasks。没有写工具或自动授权。
- 最简：Node内置SQLite/statfs，无Shell、额外依赖、网络服务、插件框架、百分比进度或重试退避。只保留必要本地副本及执行记录。

首轮无残留修正项，停止。不自动开始第四组或部署。

## 未完成与风险边界

- 云端任务创建后仍PENDING；未开发领取、结果回传、设备可撤销凭证与断网对账，本地成功不会自动修改D1。
- 执行器只能由可信宿主显式传入任务和本机ID，不直接接收网络请求，也不以模块调用代替授权认证。
- 未接入精灵进程；没有启动常驻服务或实际强杀恢复实验。结果未知的RUNNING尝试目前报告需核对，完整恢复策略留后续。
- 当前工具只读disk.query。Paylog/提醒等写入工具未开发；未来不能将立即重试变成重复写入，必须有幂等或回读核对。
- 无UI/浏览器/线上Access验收，无发布、Git提交或推送。
