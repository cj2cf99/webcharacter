# 第五组修订：随任务更新记录与设备任务列表

2026-11-18 JST。现行依据：用户“先删除第一项需求，并留下删除需求的记录。2，3我没意见，你需要重新设计和派发任务”。原文及删除来源见REQUIREMENT_CHANGES.md；旧AGENT_BATCH_05_DESIGN.md全部停止，不再沿用设备凭据/撤销/心跳/在线判定方案。

## 参考与工作边界

已查阅CLAUDE、开发指南、前四组设计/实现、AGENT_BACKLOG、全局FRAMEWORK_PREFERENCES；全局及项目独立备忘录缺失记录不变。沿用单用户、同账户多终端、最简组件、展示东京时间的约定。用户最新决定优先于V1.5旧独立凭据/专门心跳设想。

用户已批准保留两项功能；拆为最多三个细任务，不扩展业务：

1. 复用领取/结果接口记录任务最后更新时间，增加显式进度更新接口。
2. 提供设备列表上的任务概况和每个设备的多个任务列表；按需读取，不构建界面。
3. 测试、交接与审核：子代理先审计需求再开发；主会话最多4轮检查bug/偏移/最简，无问题即通过；4轮仍有问题则主会话接手最多2轮仍未解决报告。

不做：接收任务开关、单任务数量限制、专门心跳、在线/离线推断、独立凭据签发/撤销、加密、自动轮询、角色UI、具体业务任务或链式流程。明文开发凭据仍使用既有环境配置/忽略文件，不新增凭据系统，不写源码或日志。旧未接线加密草稿不导入。

## 设计意图示例

homepc已领任务A，又有任务B：概况显示2个未结束任务，列表同时保留A和B，不因为“当前任务”覆盖其中一个。

A上报“已读取输入”后，列表显示A的RUNNING和该说明、服务端接收时间。A结束后仍可在列表查看COMPLETED/FAILED；设备最后更新时间随成功领取、有效进度或结果回传变化。若几小时无更新，只展示最后时间，不标记离线、不改任务为失败。

## 最小存储

新增003-task-activity.sql，只建task_activity表：task_id主键/外键REFERENCES tasks、updated_at TEXT NOT NULL（UTC ISO）、event TEXT CHECK claim/progress/result、progress_message TEXT NULL。每任务只一行最新快照，不保存进度历史、不建立设备状态表。

设备最后任务更新时间由其任务关联task_activity的MAX(updated_at)计算，不重复存设备last_seen，不建current_task_id。tasklist/tasks仍在D1，原表不重建。旧数据无activity时updated_at/progress_message为null，不伪造历史更新。

本表用途是展示，不参与执行许可、重试次数、任务排队或取消规则。迁移可重复执行CREATE TABLE IF NOT EXISTS，测试数据库初始化加入003；不得调用旧凭据003设计（停止时尚未实现该迁移）。

## 接口与更新规则

保持已有开发Bearer入口，不增加其他登录或授权机制。

- POST /api/tasks/:id/claim：原规则不变；成功领取及同目标RUNNING的有效再次核对时，用服务端时间写activity event=claim，progress_message=NULL。领取与活动更新同一D1 batch，拒绝请求不更新。
- POST /api/tasks/:id/result：原校验/重复确认不变；有效结果保存与activity event=result、progress_message=NULL同一batch。终态同内容补传成功也更新接收时间，不能复制执行记录；冲突/无效请求不更新。
- 新增POST /api/tasks/:id/progress：只接受{device_id,message}，目标必须匹配已有PC，任务必须RUNNING，message去首尾空白后1..200 Unicode字符且无控制字符。客户端不传时间、不传百分比/状态/次数。成功只更新activity event=progress及message，不改tasks.status/attempt_count、不制造execution。返回{task_id,updated_at,progress_message}；错误用现有400/401/404/409/405风格，内部错误不泄漏。
- GET /api/tasks/:id：附加activity:{updated_at,event,progress_message}或null，原任务/执行记录字段不变。
- GET /api/devices：每项附task_summary:{active_count,last_task_update}。active_count是该设备PENDING+RUNNING总数，无数量限制；无任务0/null。只读，不刷新更新时间。
- 新增GET /api/devices/:id/tasks?offset=0：返回{device, tasks, next_offset}，tasks每条含task_id,type,name,status,attempt_count,created_at,updated_at,progress_message；包括该设备全部状态的任务。排序未结束任务优先，再按COALESCE(activity.updated_at,tasks.created_at)倒序、task_id固定顺序；每次最多50条，以第51条判断next_offset，无更多为null。不提供复杂搜索/分页框架；offset非负安全整数，无未知query字段。设备不存在404。

列表只返回摘要，params/结果/完整execution通过既有任务详情接口按需加载。设备概况不加载全部任务。此为长历史延后加载最小措施，不因分页限制可接收/执行任务数量。设备改名展示最新alias/ID，不改变任务归属。

只在有效任务写请求接收时更新时间。GET任务/设备、终端认领、设备改名不伪装成执行端更新；不把云端“创建任务”误记为设备上报。取消/过期暂无活动写入接口，本轮不扩展。

## 进度接线边界

本轮提供显式progress API，不新增定时发送器。现有syncTask的claim/result自然触发更新；具体任务未来若有阶段说明，可通过宿主已认证request显式POST进度。本轮不改handlers接口、不启用任何具体任务。回传失败沿用本地结果保留和补传；文本进度本轮不建设可靠消息队列。

## 测试大纲与验收标准

- R01：迁移不改旧任务；多任务、设备改名后归属与列表正确；无任务/无activity为空，所有原45项继续通过。
- R02：成功claim/进度/result分别更新时间；重复有效回执不重复executions；GET/改名/认领不刷新；UTC存储，交接明确JST展示。
- R03：进度校验拒绝非法device、错误目标、未领取/已终态、空/超长/控制字符/额外字段/客户端时间，status/次数/DB快照不变。
- R04：设备有多个PENDING/RUNNING同时列出，不出现接受开关或任务数限制；完成任务保留可查看，不被误判为在线/离线。
- R05：active_count和MAX更新时间正确；列表分页无静态数据遗漏、50条和next_offset正确，web设备无执行任务时为空；未知设备/offset/方法/认证检查。
- R06：claim/result与activity事务一致；注入activity写失败时原状态/执行记录回滚，无假成功；进度条件写入避免已结束任务被晚到消息覆盖。
- R07：本轮无心跳/credential/online/accept_tasks接口或有效依赖，无旧加密草稿导入，无新业务种子/UI/链式/轮询；实际HTTP/D1运行及界面仍如实标未验收。

## 分工与交付

子代理拥有agent/tasks/actions.mjs、worker.mjs、devices/api.mjs必要接线，可新增tasks/activity.mjs或devices/task-list.mjs（保持少量函数），003-task-activity.sql、测试适配及新tests/task-activity.test.mjs。先写AGENT_BATCH_05_REVISED_REQUIREMENTS_AUDIT_2026-11-18.md，再开发，完成写分工实施报告及TASK_OVERVIEW_HANDOFF.md。主会话负责需求删除记录、设计、总开发指南/README与独立审核。未获授权启动常驻Worker、改生产库、部署或Git同步。
