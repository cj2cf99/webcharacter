# 链式任务接口交接

最新需求及验收依据：AGENT_CHAIN_DESIGN.md。所有接口继承现有认证；固定单用户，不把设备标识当密钥。主站候选前缀 /api/companion，独立 Worker /api。当前未部署。

## 创建与查看

`POST /api/chains`：`{name?,nodes:[{key,type,target_device_id,params,depends_on?,deadline_at?}]}`。1–5个节点；depends_on引用同组key，不填为独立。params为任务类型约束的JSON对象。

`GET /api/chains?device_id=<pc>&after=<chain_id>`：`{chains:[{chain_id,name,status,created_at}],next_after}`。

`GET /api/chains/:id?device_id=<pc>`：完整链含held_count、nodes、history、blocked_reasons。每node含node_id/key/depends_on/current_task/skipped/eligibility/reasons；eligibility按claim、force、continue、skip分别返回布尔值，reasons提供code/message。任务含definition和target_device，显示alias优先，无alias显示原标识。未结束但无可领取节点应明确提示，并展开全链，不只显示空列表。

## 显式操作

- `POST /api/tasks/:id/claim`：`{device_id,request_id}`。成功返回`{task,claimed:true,claimReceipt:{request_id,task}}`。
- `POST /api/chains/:chain/nodes/:node/decision`：`{action:'force'|'continue'|'skip',expected_task_id,device_id,request_id,new_task_id?}`。force/continue必须预生成new_task_id；返回`{acknowledged:true,operation,claimReceipt,chain}`，skip的claimReceipt为空。
- `POST /api/chains/:id/stop`：`{device_id,request_id}`；停止新领取，不中断已执行任务。

request_id及new_task_id须在请求前本地保存，回执丢失重用原值，不能另建新轮。桌面chain-client.mjs保存在忽略的profile/chain-requests.json，明确点击“重试原操作”后核对，不自动领取。取得claimReceipt先prepare保存本地任务，再executeClaimed；旧RUNNING无原回执/本地记录不能默认为可恢复执行。

## 显示与旧结果

operation包括action、old_task_id/new_task_id、from_device_id/to_device_id、created_at；显示转换为Asia/Tokyo。force后旧终端可能仍物理执行，备注不能宣称已远程停止。当前节点只认current_task_id；旧结果回传`{acknowledged:true,archived:true,task,report}`只保存历史，不推进新轮。

本线现有托盘“主动接取与任务链”是原生对话框验收入口，未制作管理网页。界面应继续展示领取终端、状态、失败后的继续/停止/跳过和强制接取确认。正式handlers仍为空；业务模板验证另行安排。
