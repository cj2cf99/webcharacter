# 第九组任务获取交接

最新变更：自动领取已被用户撤回。poller只刷新清单；托盘“主动接取与任务链”显式选择后领取，每PC合计最多2个已领取未结束任务。链式操作与回执协议见 CHAIN_API_HANDOFF.md。下文自动执行描述仅为历史。

2026-11-18 JST。本轮只准备通用通路，花园管理登记/随手记登记模板与真实业务验证留第十组，不恢复磁盘。

## API

GET /api/devices/:pcId/pending?after=cursor，沿用已认证Worker入口。返回`{tasks:[{task_id,type}],next_after:string|null}`，一次最多50条。首次省略after，后续使用上页next_after；稳定task_id升序，不用会被领取动作改变的offset。只返回本机PC、PENDING、未超过截止后7天、非暂停disk.query且executor=pc的任务。无截止可领取；满7天排除。只读不产生任务活动/心跳，不推断在线状态。

主站候选挂载后路径为/api/companion/devices/:pcId/pending。本轮未实际挂载主站。

## 桌面

shell启动调用tasks.startPolling()。有配置时用原固定PC ID与hostname登记/更新，然后立即取一次，扫描完成后每15秒取下一次；一个计时器，不重叠扫描。不同任务通过已有runTask启动，长任务不阻塞下一页/下一轮；同任务在途不重复启动。无已安装handler的任务保留PENDING，不误报失败。

中断RUNNING不在自动清单，已有recovery中的replacement ID也排除，保留第七组“继续执行”入口。确认退出期间阻止新执行，取消确认立即恢复检查，确认退出停止计时器并取消请求；隐藏只是隐藏，不停止任务。网络失败不改任务状态，下一普通周期再获取，不新建队列/重放平台。

原请求工厂支持可选`task-config.json`字段`api_prefix`：默认`/api`用于子项目独立Worker；主站扩展候选使用`/api/companion`。base_url仍为根源地址，不含token/query。此项只映射路径，不代表取得主站Access机器身份。当前桌面开发Bearer不能替代主站登录，正式机器通行及同源调用策略留第十组。

## 例子与验证

homepc在执行A，云端新任务B仍会被取到；给另一PC的任务不取。105条待领取任务，前50条领取后仍能读取余下55条，不会因为offset变化漏掉。没有配置时不发请求。

P01–P07隔离测试覆盖筛选/边界/认证、105条翻页、长任务/同ID去重、退出/断网、真实线程执行回传、重做继续选择、前缀映射。最终联合89项通过，三项桌面回归通过。无真实模型调用、业务写入、线上数据库操作、部署或服务启动。默认正式handler清单仍为空，不能说花园/随手记已能执行。
