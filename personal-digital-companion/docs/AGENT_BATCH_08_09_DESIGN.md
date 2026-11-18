# 第八、九组：主站AI扩展准备与PC任务获取

后续变更：用户已授权本轮链式任务，自动领取撤回，定期读取只刷新清单；显式领取且每终端最多2个已领取未结束任务。最新依据见 AGENT_CHAIN_DESIGN.md，下文相反说明保留为历史。

2026-11-18 JST。用户原话：“验证任务用花园管理登记和随手记登记新纪录的任务管理模板就行……第十组时验证，现在不用做。先处理第8，9组即可。ai模型就用cloudflare的，现有的restapi接口看看能不能直接用来当作本地ai代理接口”。用户确认是“主站现有Cloudflare AI接口”，随后明确“按照准备扩展接口的前提来处理”。本轮开发准备，不操作主站生产/实际业务，不恢复disk.query。

## 来源和变更

原M1-01/07用户入口与单Provider、M1-05/06真实任务闭环。最新决定：具体任务模板和业务验证移到第十组，磁盘不恢复；本轮只通用AI命令接口和任务获取通路。独立账户/设备凭据平台、专门心跳、链式/加密不恢复。

已查根CLAUDE、开发指南、项目最小设计/第七组设计/待办、全局FRAMEWORK_PREFERENCES及主站AGENTS。独立全局/项目备忘录沿用索引检索缺失记录。已读主站authorizeMarket/expenses identity及LanguageStudy共享AI源；AI六核心文件与主站副本哈希一致。主站/api/ai-check/cloudflare仅固定探测，/api/language/turn为语言格式，不能直接接代理；可复用createEnvAiClient(env,{textProvider:'cloudflare'}).generate纯JS契约。默认textProvider省略会自动多供应商fallback，禁止省略。

当前固定模型来自源catalog：@cf/google/gemma-4-26b-a4b-it，绑定clouflareai。浏览器现有Access签名/owner allow-list校验不能用开发API_TOKEN替代。不读取/复用浏览器Cookie或Access会话，不改主站鉴权。

查阅官方Workers AI binding与模型协议：https://developers.cloudflare.com/workers-ai/configuration/bindings/ 、https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/ 。无需新增SDK/依赖，不调用真实模型或业务API；本轮测试用注入夹具。

## 三个细任务

1. 第八组：扩展AI命令接口及主站登录/共享AI的接入适配。
2. 第九组：可领取任务数据与桌面定期获取，复用已有执行/回传。
3. 两组隔离测试、接口交接、需求偏离与最简复核。

## 第八组最小设计

增加POST /api/assistant/message，接收用户/助手文字历史（不接受客户端system、模型、工具代码/URL），最多20条、总计受限，最后为user；可选目标PC。D1读取tasklist中未暂停类型及devices，服务端构造固定system说明。tasklist名称/流程和历史作为数据，不能覆盖服务端规则。一次固定Cloudflare调用，不自动fallback或重试，不执行模型建议。

响应是reply文字及proposal/null。proposal仅type、target_device_id、params（可选deadline_at遵守JST显式偏移和原截止规则）；必须匹配真实tasklist参数和PC目标，未知/非法输出拒绝，不自动写tasks。缺参数让模型用reply询问，不用猜测默认值。普通对话可返回proposal:null。不新增聊天数据库/会话平台；调用方带有限历史。

用户明确确认提案后通过现有POST /api/tasks提交，创建仍经过相同服务端参数/设备校验。提供非UI client适配message/confirm，确认不由模型触发；同一确认在途合并，失败不伪造提交成功，不自动重试。不做新聊天页面，不宣称已有真实登录界面完成。

代码复用：业务Worker支持可信依赖注入的authorizer/AI client，不依赖请求中的“已登录”字段。主站接入工厂接收实际authorizeMarket与createEnvAiClient，固定textProvider:'cloudflare'，校验返回provider；认证先于DB与AI，浏览器写请求须同源。缺依赖失败关闭。保留默认本地Bearer模式供本地隔离测试。主站挂载/api/companion/*的接线候选放本子项目，使用单独COMPANION_DB以免与主站业务表混淆；不修改主站本轮代码/绑定。桌面机器访问主站的Access配置及真实登录联调明确留第十组，不伪造已有授权可直连。

可提供极薄binding适配供独立Worker本地/未来绑定同一Cloudflare能力，不复制整套多模型框架；主站接线优先用既有共享client。任何新绑定仅列准备项，不部署不自动请求远程AI。

例：“给homepc登记一条随手记”只有将来tasklist登记了该类型才可形成提案；当前默认空tasklist只对话/说明未接入，不伪造业务可用。确认前D1 tasks不增加。

## 第九组最小设计

新增GET /api/devices/:id/pending?after=...，认证后仅返回该PC当前可新领取的task_id/type列表。数据库过滤PENDING、截止未满7天、非暂停disk、executor=pc。每页50条按task_id稳定升序，next_after采用第50条ID；不因前页任务被领取导致offset跳漏。只读不刷新活动，不是心跳/在线判断。

桌面有云端配置才启动一个定时获取循环，默认15秒；立即检查一次，下一轮在本轮取完页面后再计时，禁止重叠扫描。先使用已有PUT devices接口登记固定PC身份/hostname，不新建别的身份。扫描仅对生产静态handlers中支持的类型调用已有runTask；未支持类型保持PENDING，不错误领取或失败。默认handlers仍为空，花园/随手记以后实现。

runTask不被长任务占满扫描循环；不同任务可同时处理，同ID在途跳过。只从pending接口自动获取新任务；中断RUNNING仍由用户决定，不能被自动循环重新执行。已完成补传沿用启动及显式重试入口，不自动扩大为新恢复平台。

确认退出期间不启动新任务，取消退出恢复正常；确认退出/stop取消定时器和在途请求，隐藏仍允许任务工作。取任务失败保留记录，下一轮正常再取，不增加指数退避/队列/新状态；不吞掉执行中断，应通过已有中断提示入口告知。测试可注入短周期或调度器，无真实常驻服务。

例：给homepc的A已执行中，B新到仍能被发现；给其他PC的任务不会取到。跨页领取不会漏掉后页。模型坏输出不产生任何任务。

## 验收与边界

- AI：认证先行，固定Cloudflare无fallback，受限消息/只服务端system，来自D1真实类型与参数，缺参数/普通回复、坏JSON/未知类型/伪设备/模型错误均不写tasks；确认才提交，重复在途确认一次；主站注入依赖缺失/伪登录/跨域写拒绝。
- 获取：无截止/边界/其他设备/已取消/暂停/无handler不执行；超过50条稳定翻页、前页被领取后后页不漏；同ID在途不重复、长任务不阻塞新任务；无配置不取、退出停止、取消确认恢复、隐藏继续。
- 原72项回归及受影响桌面脚本；全部隔离SQLite/模拟模型/真实本地线程，不访问线上受控页面或模型，不写花园/随手记记录。

子代理先审计后实现；主会话最多4轮复核，无残留即停，4轮仍有问题接手最多2轮仍不通过汇报。主站真实集成/部署、机器Access通行、UI/真实模型、业务模板验证均未完成，留第十组明确安排；不能把接口准备冒充生产已用。
