# 链任务非界面接口交接

2026-11-18，展示时间 Asia/Tokyo；存储时间 UTC。依据 AGENT_CHAIN_DESIGN.md 与本轮需求审计，不包含真实业务、部署或主站改动。

## 数据与迁移

现有 001–005 后，单次应用 `agent/migrations/006-chains.sql`。不能重复执行 ALTER，也不能用它清空旧库。新增 chains、chain_nodes、task_operations、archived_task_results，tasks 增加 chain_node_id、superseded_by_task_id、claim_request_id。测试初始化才用 PRAGMA 判断是否需要应用迁移。

稳定 node.current_task_id 指向当前轮。force/continue 创建新 task_id，保留旧 task、executions、归属和操作记录。旧 RUNNING 被替代后 CANCELLED；其迟到终态完整保存到 archived_task_results，不改变新轮。这样继续一轮仍最多两次执行，不重置旧尝试次数。

例如 A 已成功，B 等待 A。用户强制重做 A 后，尚未领取的 B 要等 A 新轮成功；已经领取的 B 可以完成。A 的旧终端迟到回报只归档。逻辑替代不代表远程杀掉旧线程，桌面还须执行物理 activeCount 上限。

## 接口

均沿用现有可信宿主 authorizer 或开发 Bearer。无新设备凭据。主站前缀由既有 mount 处理。

- `POST /api/chains`：`{name?,nodes:[{key,type,target_device_id,params,depends_on?,deadline_at?}]}`。1–5 节点，depends_on 引用本请求的 key；不接受缺失前置、自引用、循环。成功 201 返回完整组。
- `GET /api/chains?after=<chain_id>&device_id=<pc>`：20 条轻量列表，返回 `{chains:[{chain_id,name,status,created_at}],next_after}`。
- `GET /api/chains/:id?device_id=<pc>`：完整组及当前终端资格。
- `POST /api/tasks/:id/claim`：`{device_id,request_id}`。桌面必须先持久化 request_id；响应 `{task,claimed:true,claimReceipt:{request_id,task}}`。相同请求回放，不同请求不能重复领取 RUNNING。仅为旧调用兼容允许省略 request_id，此时不能获得网络重试幂等保证。
- `POST /api/chains/:id/nodes/:node/decision`：`{action:'force'|'continue'|'skip',expected_task_id,device_id,request_id,new_task_id?}`。force/continue 必须预存新 ID；skip 不接受新 ID。
- `POST /api/chains/:id/stop`：`{device_id,request_id}`。停止新领取，已有执行可结束。

决定回执为 `{acknowledged:true,operation,claimReceipt,chain}`。operation 含 request_id、action、old_task_id、new_task_id、from_device_id、to_device_id、created_at；UI 显示旧/新终端与 JST 时间。force/continue 返回领取回执，其余 claimReceipt=null。

完整组为 `{chain_id,name,status,created_at,held_count,nodes,history,blocked_reasons}`。每个 node 含 node_id、key、depends_on（node_id/null）、current_task、skipped、eligibility、reasons。后两项均以 claim/force/continue/skip 为键；eligibility 为 boolean，reasons 为 `{code,message}[]`。无可领取时显示全链及原因，不能自动 force。

任务详情增加 `chain:null|{chain_id,node_id,current,current_task_id,stopped,skipped}`、claim_request_id、superseded_by_task_id、archived_report。`can_claim` 是当前领取资格，不代表身份认证。名额计算所有目标 PC 的 RUNNING，最多两个；PENDING 不占名额。前置检查遍历所有祖先。新领取同时检查停止、截止七天、暂停类型；既有已领取执行不重新套用前置门槛。

## 本地执行与中断

`sync.executeClaimed(claimReceipt)` 用于已明确领取的回执。调用方先持久化请求及回执、prepare 本地记录；sync 核对云端当前轮、目标、内容与 request_id，已有本地终态只补传，已有未知 RUNNING 不重跑。普通 syncTask 保留已持久 claim request_id 的旧恢复兼容路径；桌面发现清单不得自动调用它。

旧轮结果响应 `{acknowledged:true,archived:true,task,report}`；sync 比较完整 report 后接受，绝不拿旧结果推进新轮。

被替代旧轮的 recover 只允许 abandon 保存未知快照确认；redo 返回 OLD_ROUND，提示去当前链操作。用户随后明确确认：当前链节点中断后 abandon 等于跳过。因此同一事务保存 CANCELLED、未知快照及 skipped_task_id，不伪造成功或失败。后继仍须满足所有其他祖先条件；例如 A 重做中、B 已领取后中断并放弃，C 虽可越过 B，仍等待 A 新轮成功。被替代旧轮的 abandon 永远不修改当前节点或其跳过标记。redo 沿用原截止并检查祖先/名额，替换当前节点后为 PENDING，需显式领取。

## 验证边界

实际命令与结果见同批实施报告。仅隔离 SQLite、Worker fetch 和 mock handlers；未应用真实 D1，未启动实际桌宠或常驻 Worker，未验证 Access/生产/真实模型/业务任务。默认业务 handlers 与 seed 仍空，disk.query 保持暂停。
