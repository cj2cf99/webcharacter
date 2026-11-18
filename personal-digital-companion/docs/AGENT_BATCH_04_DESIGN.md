# 第四组：通用任务领取、结果回传与补传

2026-11-18 JST。用户最新原话：“先跳过2，这个是个具体任务”；随后“把跳过内容业绩下来，你继续后续内容和第四组”。这里跳过的是磁盘查询具体任务，不取消通用执行、首次失败立即一次重试、第二次失败结束和测试。原始需求依据见AGENT_MINIMAL_DESIGN.md及V1.5 M1-02/04/06。

## 跳过与偏离纠正

disk.query暂停，不再作为默认支持类型、初始化种子或本轮系统读数验收。现有execution/disk.mjs及历史验证保留，不导入活动执行器、不删除用户旧任务/类型记录。新建或领取旧disk.query任务本轮拒绝，不将暂停伪装为任务失败。重新启用须有用户后续决定。历史原11/21/29项通过是各时点证据，不作新默认行为承诺。

检查发现旧runner直接依赖disk.query；本轮先解除硬编码，不再把业务任务当成通用执行机制。使用宿主静态提供的handlers映射，每项必须有固定risk:'L1'、validate(params)、execute(params)；它是普通代码对象，不支持远程脚本、数据库说明执行、动态安装或插件平台。默认空映射；测试中的mock任务只在临时数据库和测试代码中提供，不作为产品功能初始化。

已查阅项目CLAUDE/开发指南、前三组设计、V1.5实施计划及框架偏好，独立全局/项目备忘录缺失记录继续有效。落实单用户低负载、原生Node/Worker、三个细任务、无具体业务与链式调度。用户此前子任务先审计/主会话最多4轮+接手2轮要求继续用于本组委派部分；不新建用户可见聊天。

已核对[Cloudflare D1 batch官方说明](https://developers.cloudflare.com/d1/worker-api/d1-database/)：有依赖的执行记录与任务终态在同一batch按顺序执行，失败整体回滚；不使用手工跨请求BEGIN/COMMIT或新增事务服务。

## 三个细任务与分工

1. 云端领取和最终结果接口（子代理）：D1条件更新PENDING→RUNNING；保存最多两次执行记录、终态与结果，重复回执不重复写。通用参数校验取自tasklist，空种子，不开放暂停类型。
2. 通用本机执行与手动单任务同步（主会话）：解耦磁盘处理器；显式syncTask(taskId)，领取前本地落盘，执行后先持久化再上报；网络失败后再次调用只核对/补传，不盲目重做。
3. 故障场景测试、回归与审核（双方）：临时真实SQLite+Worker fetch及故障注入，不运行具体业务任务、常驻服务或生产操作。

## 云端契约

既有任务创建/查询接口保留。读取D1 parameter_spec_json对params做最小字段校验：支持string/number/boolean，required可选；string支持已存在pattern。禁止未知字段、不扩JSON Schema平台；无效类型定义返回明确配置错误。不接受数据库脚本。disk.query创建/领取拒绝；种子SQL保留说明但不新增业务类型。执行宿主也必须存在匹配静态L1处理函数。

- POST /api/tasks/:id/claim，body仅{device_id}：设备必须为目标pc-ID且已登记。首次领取返回{task,claimed:true}；同目标已RUNNING返回{task,claimed:false}供核对，不表示允许重跑；终态/非PC目标/不匹配409或400；未知404。条件更新保证同任务只一次true，不引入锁服务/租约。
- POST /api/tasks/:id/result，body为{device_id,status,attempt_count,result,error,executions}。status只能COMPLETED或FAILED；attempt_count=1或2；FAILED必须2；executions是按attempt_no连续1..N的已结束执行，execution_id唯一、task_id与外层路径一致、status/结果/错误与终态符合，第一次失败才允许第二次，finished_at不早于started_at；时间UTC ISO。结果必须JSON可表达，错误只接受固定简短非空字符串或null。上报内容与本地副本一致。
- COMPLETED：最后一次COMPLETED、result与最后执行结果一致、error=null；FAILED：两次FAILED、result=null、error为最后错误。第一失败attempt的result为null；每个COMPLETED attempt error为null。
- 同终态同内容重传返回200 {acknowledged:true,task}，不新增/修改。已终态不同内容409，不覆盖。PENDING不能直接提交结果，错误目标拒绝。tasks更新与新增executions用D1 batch原子提交；数据库失败不返回ack。
- D1 migration 002-executions.sql新建executions表（execution_id主键、task_id外键、attempt_no、status、started_at、finished_at、result_json、error、UNIQUE(task_id,attempt_no)），不删旧数据或重建tasks。只有最终报告时补齐尝试记录；本组不做细粒度实时进度。

仍使用已存在单用户开发Bearer，不宣称已实现独立设备凭据；device_id是请求归属检查，不是认证因子。上线或真正接桌面前仍须设备可撤销认证。浏览器cookie不能作为执行凭据。

## 本机调用契约

runner新增prepare(task)用于保存/核对本机副本，不执行；execute仍最多两次。handlers由宿主代码配置且固定L1，不能从任务传入处理函数/风险级别。结果必须能JSON完整表达，失败保存统一“任务执行失败”等固定错误，不记录原始异常或秘密。

syncTask(taskId)通过注入的已认证request调用现有GET任务及上述两个POST；不持有/记录认证秘密，不提供新网络服务。算法：

1. GET云端任务，核对目标及本地副本。云端RUNNING但本地无记录时返回明确“执行状态待核对”，不新执行；云端终态与本地终态冲突时停止。
2. 云端PENDING时先prepare保存本地副本，再claim。领取响应丢失后，重试看到RUNNING且本地有尚未执行副本，可以再次核对领取并继续。没有成功领取确认不执行。
3. 本地未终态才execute；本地已有终态只提交结果。结果写到本地后上报；回传失败/回执丢失保留所有本地记录，下一次调用读云端并补传相同结果。收到ack前不清理，本轮ack后也不自动清理，不需要额外上传状态字段。

云端已经终态且本地无记录只返回云端结果，不新建本机执行；已有本地终态则提交原回执让云端做一致性核对。云端PENDING却本地已有执行记录属于冲突，停止、不自动回退或领取覆盖。取消/过期与不确定中断不强行当作失败重试。

例：测试任务A在本机成功，POST结果时断网；本地COMPLETED已经保存。再次syncTask(A)只上报同一个结果，不再次运行handler。若服务端已保存结果但响应丢失，同内容补传应得到ack。

## 验收大纲

- B01：默认无业务种子；disk.query不新建/领取/自动执行，旧记录不删除；mock仅测试。
- B02：真实SQL条件领取只有一次claimed=true；目标/状态/认证错误不改变数据。
- B03：结果与1/2次执行记录原子保存；不符合次数、顺序、终态、参数类型的报告拒绝；失败回滚。
- B04：同内容重复报告唯一且ack；不同终态/结果/尝试记录409，无覆盖。
- B05：通用runner通过模拟成功、一次失败再成功、两次失败、结果持久化/重开/未知执行状态检查；JSON参数/结果不丢失，类型/目标/风险约束有效。
- B06：完整mock创建→本地prepare→领取→执行→结果回传，首次成功与两次失败路径均正确，无真实业务调用。
- B07：领取响应丢失、结果请求断网、结果已存回执丢失后重开补传；handler调用数不多于预期，次数不重置。
- B08：云端RUNNING且本地无记录/未结束尝试、云端本地终态冲突等场景明确停止，不盲目重跑或覆盖。
- B09：终端登记/认领及设备命名继续通过；不引入UI、链式表、自动轮询、高并发平台、新依赖、生产写入或常驻启动。

本地D1迁移可准备但本轮先在隔离SQLite验证；真实HTTP/设备凭据/桌面生命周期及用户页面验收仍未执行，不说完整M1已完成。全部完成后记录实际测试和按规则复核，无残留即停，不自动进入第五组。
