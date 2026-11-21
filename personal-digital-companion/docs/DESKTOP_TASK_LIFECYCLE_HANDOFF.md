# 第七组桌面任务生命周期交接

## 绯月任务窗口

原话及范围见 [需求变更](REQUIREMENT_CHANGES.md#绯月任务窗口)。查阅全局 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`、根与子项目 `docs/DEVELOPMENT.md`、[任务分派](TASK_DISPATCH_HANDOFF.md)、[任务链设计](AGENT_CHAIN_DESIGN.md) 和 [模板设计](TASK_TEMPLATE_PREVIEW.md) 的备忘录索引。全局和项目文档索引未发现独立的开发设计备忘录。采用原有 Electron 月印窗口及已认证任务接口，按需读取云端结果和后页，时间统一显示 JST。

- 本机页通过执行器在途集合读取 SQLite 中正在执行的任务名称、尝试次数和开始时间。中断和补传沿用已有入口。
- 云端页单独显示本机相关未结束任务以及账户可见的未结束任务链，保留既有手动接取、任务链详情和原回执核对。单条任务的展示范围与本次「任一电脑」和本机的上下文一致。已完成和已停止的任务链不显示。
- 复核核对了原本的自动领取资格、回执复用、两项手动接取的名额，以及两页的筛选和可读性。修正了首屏分页位置、同一按钮重复发送及首轮预览截到加载状态的问题。复验覆盖两个目标实际领取、其他终端隔离、两条真实线程同时运行与中断记录区分，以及隔离 Electron 中的切换、分页、错误提示和主题布局。云端结构和客户端配置无变更。

### 最简审核后的云端清单

按已确认的两页范围，复用设备任务列表的目标和权限，在现有接口增加可选 `scope=standalone`。使用已有 `chain_node_id`，查询在分页前排除链节点。任务链沿用摘要和详情的两次按需读取，独立任务不会触发额外的详情查询。自动轮询、接取、停止、结果和原回执按既有流程处理。

旧版 Worker 明确拒绝新参数时，桌面沿用旧版清单并说明可能包含链节点。主站或旧客户端沿用原来未带筛选参数的返回。完整去重需要更新提供绯月接口的 `subscriptions-api`。数据库迁移、数据回填和配置变更均无。

复核通过 46 项任务回归及 `tools/test-panel-titlebar-electron.mjs`。覆盖链节点分页去重、原清单和自动接取兼容、旧 Worker 降级提示及回执条件显示。验证使用临时数据库和隔离桌面窗口。

以下为原任务生命周期交接历史。

最新变更：本轮增加显式领取和每终端2名额；中断重做也检查名额与链前置，旧轮被强制替代后不允许通过恢复接口重新接管当前轮。托盘增加“主动接取与任务链”，具体见 CHAIN_API_HANDOFF.md。下文无上限/无链说明仅为第七组历史。

2026-11-18 JST。仅非界面任务逻辑及必要的系统dialog接线；角色页面、样式、工作动画均未改。当前业务处理表为空，disk.query仍暂停。真实Windows系统提示框效果待用户验收。

## 三项已实现行为

1. `desktop/main.mjs`原有startDesktop入口直接进入`shell.mjs`，后者创建`task-lifecycle.mjs`。复用原profile，加载`device-identity.json`及`tasks.sqlite`。完成未确认的任务只补传；未知中断只告知，不启动执行。旧库缺名称时回退type，补建metadata后可记录uploaded，避免每次启动重复补传。
2. 托盘退出与角色窗口close统一走before-quit。有执行/同步在途时默认取消退出，连续退出请求合并。取消保持原任务、托盘及监听；确认后停止线程、保留原记录再实际退出。隐藏仍只隐藏。确认期间的新任务入口被阻止，已领取后等待执行及首次失败后的下一次尝试等待确认结果。系统强杀/注销等无法保证提示，启动恢复仍有效。
3. 中断框包含名称、JSON参数、最后尝试及JST时间，提供稍后/放弃/重做；重做再次说明可能重复效果。托盘“中断任务与补传”可重新打开。已保存的决定可重传；已确认的重做新ID保留，稍后可选择“继续执行”。回执丢失后重启不会自动重复执行新任务。已知完成结果不能走中断重做。

例：登记任务第1次执行中退出，原attempt保持RUNNING。选择放弃后D1原任务为CANCELLED，恢复记录明确结果未知；不伪造失败。选择重做创建新ID、原参数、原截止时间；新任务独立最多2次，旧记录不清零、不删除。

## 调用与配置边界

可信主进程通过`startDesktop()`返回的`shell.tasks.runTask(taskId)`显式执行任务，不增加调度或轮询。`retryPending()`用于重新补传及展示中断决定。`handler-registry.mjs`是生产静态清单，当前为空。测试使用独立mock模块，配置文件和网络输入不能设置handler路径。

仅handler.execute在线程；SQLite和重试决定在主线程。普通handler异常按既有规则立即重试一次。确认退出、worker异常或无结果退出都视为INTERRUPTED，保留未知结果，不进行业务重试。线程结束不等同撤销已经发生的外部操作。

默认profile为`personal-digital-companion/output/desktop-profile`，已由子项目`.gitignore`的`/output/`覆盖。可手动准备`task-config.json`，仅包含`base_url`（HTTPS源或本机HTTP源）与`api_token`（既有开发Bearer）；没有配置时不访问网络、不生成凭据。此文件只在主进程读取，不能放源码、日志、renderer或提交仓库。当前未创建真实配置/令牌。保留原来的renderer外联禁用策略。

单次请求5秒超时覆盖HTTP头及完整响应体；关闭时取消请求。失败保留结果/决定待同步。无配置仍可读取本地未知记录和保存用户决定，不能宣称D1已处理。

## 恢复API与存储

`POST /api/tasks/:task_id/recover`沿用账户Bearer。请求精确字段：

- `device_id`：原PC目标。
- `decision`：`abandon`或`redo`。
- `replacement_task_id`：放弃为null；重做为客户端先持久保存的新ID。
- `snapshot`：原task_id、type、target_device_id、params、RUNNING状态、attempt_count、result、error、executions。尝试必须连续且符合“首次失败/最后一次结果未知”的语义；已完成/两次失败不接受。

响应含`acknowledged:true`、`recovery`、原`task`及可空`replacement`。重复同决定/同快照返回原记录；不同决定/内容冲突409，不创建第二份新任务。客户端核对原任务、快照、新ID、参数、目标与继承截止后才标记确认。

D1新增`005-task-recoveries.sql`，保存原始未知快照，不改变仅保存最终结果的executions约束。一次batch写可选新PENDING、恢复决定及旧RUNNING→CANCELLED。任何SQL失败整体回滚。GET原任务返回recovery，区分“用户放弃/重做、结果未知”。本地另存local_task_metadata与local_recoveries，原任务及attempt保持原样。

重做首次提交时已满deadline+7天会被拒绝，原D1任务不变；不得清空/延长截止。服务器明确拒绝后撤去尚未确认的本地决定，允许用户稍后处理或放弃。已成功提交但回执丢失的同决定优先核对原记录，不因后来跨过截止重复创建或撤销。

## 初始化与验证边界

只在隔离SQLite适配器中应用过迁移。以下本地Wrangler命令尚未执行；必须先有001至004，其中004仍只能应用一次。

工作目录：`G:\selftool\WebCharacter\personal-digital-companion\agent`

```powershell
wrangler d1 execute DB --local --file migrations/005-task-recoveries.sql --persist-to .local/state
```

实际测试命令及结果见本组实施报告。未启动桌宠或HTTP Worker，没有真实D1、生产访问、安装、部署或Git同步；未宣称Windows视觉验收完成。默认无业务handler，测试使用mock，不代表Paylog、提醒或磁盘业务已接入。
