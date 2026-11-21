# 个人精灵任务API与本地执行

2026-11-20 任务派发更新。空闲桌面每 15 分钟扫描并自动接取一项目标为本机或 `all` 的任务。运动登记由抢领成功的电脑发起，业务端生成记录时间和回执。详见 [任务获取交接](../docs/TASK_DISPATCH_HANDOFF.md)。

每日日志使用 `POST /api/daily-logs` 生成、`GET /api/daily-logs` 按日期读取。接口契约、关键词查询预留、本地命令和配置见[每日日志 API](../docs/DAILY_LOG_API.md)。

2026-11-18 截图问答接口与云端完成：`POST /api/assistant/screen-question`（主站候选`/api/companion/assistant/screen-question`）。传question及一张PNG/JPEG Base64；固定返回`{ok:true,answer}`或`{ok:false,error:{code,message,retryable}}`。只调用Cloudflare视觉能力，不读写D1/生成task。11项专项、全套119项通过，第2轮复核通过。字段、限额、错误表、认证、配置和PowerShell示例统一见 [SCREEN_QA_API.md](../docs/SCREEN_QA_API.md)。精灵端暂缓；无真实截图/模型/部署。现有wrangler.jsonc未开启远程AI binding，缺视觉能力返回503 AI_NOT_CONFIGURED。

2026-11-18 链式增量：已实现最多5节点、显式领取、所有任务共用每终端2名额、全部祖先依赖、失败继续/停止/跳过、强制换终端新轮及旧结果归档。poller只读，不自动领取。用户确认当前中断节点“放弃”即跳过，已实现并经第2轮复核通过；主会话独立108项测试与三桌面回归通过。见 [设计](../docs/AGENT_CHAIN_DESIGN.md)、[接口](../docs/AGENT_CHAIN_API_HANDOFF.md)、[主复核](../docs/reviews/AGENT_CHAIN_MAIN_REVIEW_2026-11-18.md)。下方各组相反范围是历史。截图问答仅整理需求，尚未开发。

第八九组扩展准备完成：`POST /api/assistant/message`仅产生Cloudflare文字/任务提案，显式确认后才创建；主站候选挂载`/api/companion/*`复用主站authorizer与共享AI并使用COMPANION_DB。PC待领取清单与桌面轮询已接线（现按 15 分钟间隔，仅空闲时查询），复用原执行/回传；默认正式handlers仍为空。89项Agent测试、三项桌面回归通过，联合第3轮复核通过。[设计](../docs/AGENT_BATCH_08_09_DESIGN.md) / [任务获取交接](../docs/TASK_DISPATCH_HANDOFF.md) / [主审核](../docs/reviews/AGENT_BATCH_08_09_MAIN_REVIEW_2026-11-18.md)。主站真实集成、机器Access、真实AI及花园/随手记模板验证留第十组，未部署。

第七组完成桌面生命周期接线：复用身份/SQLite、执行中退出二次确认、中断任务放弃/重做/稍后，原记录保留；已完成只补传。主会话第2轮复核通过，72/72 Agent测试及三项桌面回归通过。[设计](../docs/AGENT_BATCH_07_DESIGN.md) / [主审核](../docs/reviews/AGENT_BATCH_07_MAIN_REVIEW_2026-11-18.md)。真实Windows弹框效果未验收，未启动服务或部署。

第六组已完成：未领取任务取消、可选截止后7天禁止新领取；详情/设备任务摘要增加deadline_at与can_claim。60/60隔离测试通过，主会话第1轮审核通过。日本时间输入/展示，内部UTC；本组无UI。[设计](../docs/AGENT_BATCH_06_DESIGN.md) / [主审核](../docs/reviews/AGENT_BATCH_06_MAIN_REVIEW_2026-11-18.md)。以下各组说明为各自验收记录。

第五组修订已完成：任务操作更新活动记录、进度接口、设备概况和每页50条多任务摘要；当时52/52测试通过，主会话第1轮审核通过。见[接口交接](../docs/TASK_OVERVIEW_HANDOFF.md)及[审核](../docs/reviews/AGENT_BATCH_05_REVISED_MAIN_REVIEW_2026-11-18.md)。003-task-activity.sql仅在隔离SQLite验证，启动前也须本地应用，未操作生产D1。以下第四组结果为历史基线。

单用户、原生ES Modules，D1保存tasklist、tasks、devices、最终执行记录executions、task_activity及中断决定task_recoveries。支持终端登记/认领、任务创建/查询、领取/结果回传、本地执行与断线后核对补传。磁盘查询暂停，代码保留不接入；默认没有业务类型种子或处理函数。链式任务、具体业务、正式认证仍待后续处理；桌面生命周期已接线，实机效果未验收。

设计与验收：[第一组](../docs/AGENT_BATCH_01_DESIGN.md)、[第二组](../docs/AGENT_BATCH_02_DESIGN.md)。实际结果：[第一组复核](../docs/reviews/AGENT_BATCH_01_REVIEW_2026-11-18.md)。

## 自动测试

工作目录 `G:\selftool\WebCharacter\personal-digital-companion\agent`：

```powershell
node --test tests/*.test.mjs
```

测试使用Node24内置SQLite执行正式SQL，并通过真实Worker fetch入口与本地执行模块验证；第四组只使用临时mock任务，不再运行磁盘查询。最终45/45通过，第二轮审核通过，见[第四组复核报告](../docs/reviews/AGENT_BATCH_04_REVIEW_2026-11-18.md)。测试不等同于实际Worker HTTP、手机浏览器或桌面生命周期验收。

## 本地Worker准备与启动

仅截图问答路由无需初始化D1表，但仍需认证及视觉能力；当前自动测试使用mock模型，无需账号。下面D1步骤针对既有任务接口。常驻服务仍须用户明确启动指令，真实模型调用尚未验证。

已安装Wrangler 4.153.0，未新增依赖。`wrangler.jsonc`只含本地占位数据库ID，不可用作正式部署配置。以下均为本地操作，禁止替换为`--remote`。日志和数据库状态写入被忽略的`.local/`。

本地初始化命令（001曾执行成功；002至006仅在隔离SQLite测试验证，启动前需补执行）：

```powershell
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.local/wrangler-logs'
$env:WRANGLER_SEND_METRICS = 'false'
wrangler d1 execute DB --local --file migrations/001-task-units.sql --persist-to .local/state
wrangler d1 execute DB --local --file migrations/002-executions.sql --persist-to .local/state
wrangler d1 execute DB --local --file migrations/003-task-activity.sql --persist-to .local/state
```

重复执行不清空数据；002只新增executions表。seeds/tasklist.sql现在仅为说明，不写业务类型；不要把测试fixture导入正式数据库。先前本地D1中的disk.query历史定义不删除，但当前列表隐藏、创建/领取拒绝，不影响历史任务查询。

第六组004是单次ALTER，不可重复执行。先检查本地结构，缺少deadline_at列时才执行升级命令；当前既有.local尚未应用004：

```powershell
wrangler d1 execute DB --local --command "PRAGMA table_info(tasks)" --persist-to .local/state
# 仅在上述结构缺少deadline_at时执行下一行
wrangler d1 execute DB --local --file migrations/004-task-deadline.sql --persist-to .local/state
```

完成004后，第七组新增恢复记录表（尚未应用真实本地D1）：

```powershell
wrangler d1 execute DB --local --file migrations/005-task-recoveries.sql --persist-to .local/state
```

完成001–005后，006新增链表与tasks列，只能执行一次；先用上面的PRAGMA检查chain_node_id不存在，若已存在不要重复执行。此迁移尚未应用真实本地或生产D1：

```powershell
wrangler d1 execute DB --local --file migrations/006-chains.sql --persist-to .local/state
```

完成 006 后，007 新增任务提交号表与 `tasks.submission_id`；检查列未存在后执行一次。旧记录的提交号为空。

```powershell
wrangler d1 execute DB --local --file migrations/007-task-submissions.sql --persist-to .local/state
```

首次启动前创建本机开发令牌（仅写被忽略的`.dev.vars`，不显示令牌；文件已存在则停止，不覆盖）：

```powershell
node -e "require('fs').writeFileSync('.dev.vars','API_TOKEN='+require('crypto').randomBytes(32).toString('hex')+'\n',{flag:'wx'})"
```

收到用户明确启动指令后执行：

```powershell
wrangler dev --local --ip 127.0.0.1 --port 8795 --persist-to .local/state
```

端口8795仅为计划值，尚未启动，也未确认可用。启动后需核对日志及实际API，再提供实际HTTP URL。所有`/api`接口需`Authorization: Bearer <本机开发令牌>`；不能把令牌放URL或源码，也不将其注入浏览器页面。这是开发API认证，不是已完成Cloudflare Access、桌面设备凭证或生产认证。

## API

| 方法与路径 | 数据 |
| --- | --- |
| GET /api/tasklist | 返回tasklist数组，参数定义/执行流程/报告说明来自D1 |
| POST /api/assistant/message | `{messages:[{role:'user或assistant',content}],target_device_id?}`；最多20条，返回reply/proposal，不写tasks |
| POST /api/assistant/message（候补） | `{work:{purpose,...}}`。`review` 接收 `content` 和 `count`，`image-plan` 接收 `slots` 和可选 `feedback`，`reminder-command` 接收 `content`。返回 `work`、`ai` 或错误，无任务写入。 |
| GET /api/assistant/recording-plan | 返回 `catalog`、`categories`、`categoriesAvailable`。读取登记模板和分类，无正文、无模型调用。 |
| POST /api/assistant/recording-plan | 云端登记候补，兼容 `{text}`，新版另可带 `submittedAt`（JST 日期计算的毫秒时刻）和 `reviewFeedback`。返回 `chain`、`pending`、`ai`，无业务写入。 |
| GET /api/devices/:id/pending?after=cursor | 每页50条可新领取的task_id/type与next_after；不写活动记录 |
| PUT /api/devices/:id | `{ "computer_name": "DESKTOP-EXAMPLE" }`；ID来自devices/identity.mjs的固定pc-UUID |
| GET /api/devices | 返回设备清单及未标注ID/已标注通用名 |
| PATCH /api/devices/:id | `{ "alias": "homepc" }`；空白清除，重复返回409 |
| POST /api/task-submissions | 为当前账户签发一次性提交号，返回 `{submission_id}`，提交号无有效期 |
| POST /api/tasks | `{submission_id,type,target_device_id,params,deadline_at?}`；首次创建 201，同号同内容返回原任务 200，同号不同内容 409。[完整协议](../docs/TASK_SUBMISSION.md) |
| POST /api/tasks/:id/execute | `{}`；共用的「我也是胡适」三类云端任务执行入口，使用任务保存的参数。[模板、接线与回执](../docs/HU_SHI_TASK_API.md) |
| GET /api/tasks/:id | 返回任务参数、状态、次数、结果、关联类型说明和设备名 |
| POST /api/tasks/:id/claim | `{device_id}`；目标匹配才领取，claimed:false表示已在RUNNING，需要本地核对 |
| POST /api/tasks/:id/result | `{device_id,status,attempt_count,result,error,executions}`；同内容重复确认，不覆盖冲突终态 |
| POST /api/tasks/:id/cancel | `{}`；仅取消未领取任务，重复取消成功，RUNNING不能取消 |
| POST /api/tasks/:id/recover | `{device_id,decision,replacement_task_id,snapshot}`；专用中断决定，原子保留未知快照和可选重做任务，非普通取消接口 |
| POST /api/tasks/:id/progress | `{device_id,message}`；仅RUNNING可更新，说明1至200字符 |
| GET /api/devices/:id/tasks?offset=0 | 每页50条摘要及next_offset，包含deadline_at/can_claim，历史不隐藏 |
| GET /api/terminal | 返回当前cookie关联终端或registration_required=true；不创建记录 |
| POST /api/terminal/register | `{ "accepted":true, "browser_label":"手机浏览器" }`；接受后才创建web-ID，标签可省略 |
| POST /api/terminal/claim | `{ "device_id":"已有pc或web-ID" }`；关联原记录，不改名或创建新记录 |

云端创建响应为201、PENDING、attempt_count=0、result=null。创建不自动执行；状态/结果/次数不能由创建请求指定。任务类型参数说明支持string/number/boolean、required、字符串pattern这一小部分，不是任意JSON Schema或数据库脚本。

创建可另传deadline_at，例如`2026-11-18T18:00:00+09:00`，存为UTC；省略/null无期限。该例到11月25日18:00 JST起禁止新领取，之前仍允许。can_claim是新领取资格，不代替认证/设备归属。超过宽限仍保留PENDING与历史，返回can_claim=false；已运行任务正常继续。所有界面日期输入/展示应使用Asia/Tokyo，不跟随浏览器时区，本线未实现UI。

## 本地通用执行与第四组同步

最新设计：[第四组](../docs/AGENT_BATCH_04_DESIGN.md)；暂停清单：[待办](../docs/AGENT_BACKLOG.md)。第三组磁盘设计和实测属于历史，暂停不删除这些证据。

`execution/runner.mjs`导出`createTaskExecutor({databasePath,deviceId,handlers})`。数据库父目录由宿主准备，deviceId来自Windows固定身份模块。返回`prepare(task)`、`execute(task)`、`getTask(id)`、`close()`。handlers是宿主代码中的普通映射，每项必须静态声明risk:'L1'、validate(params)、execute(params)，默认空；校验抛异常表示无效，执行返回可完整表达的JSON。没有远程加载、自动安装或数据库说明执行。

组合调用示例（宿主须先配置已授权类型处理函数和已认证请求函数，以下不包含任何具体业务实现）：

```js
import { createTaskExecutor } from './execution/runner.mjs';
import { createTaskSync } from './execution/sync.mjs';
const executor = createTaskExecutor({ databasePath, deviceId, handlers });
const sync = createTaskSync({ executor, deviceId, request: authenticatedRequest });
try {
  const receipt = await sync.syncTask(taskId);
  // 收到ack才表示云端已确认；请求失败时本地记录仍保留。
} finally {
  executor.close();
}
```

本机SQLite的local_tasks/executions是执行副本，不取代D1中的任务类型和任务表。开始前落盘，每次执行有独立execution_id，首次失败立即再试一次；第二次失败结束。再次提交同任务ID不能改内容；已结束任务返回原结果，不执行第三次。中断留下未结束尝试时报告待核对，不盲目重跑。没有链式先后关系或自动恢复平台。

syncTask只显式处理传入的一个任务ID，不轮询、不决定任务先后。领取前prepare落盘，执行结果先落盘再上报；网络失败后再次调用可补传相同结果。云端RUNNING且本地无记录、未结束执行、内容/终态冲突均停止待核对，不盲重跑；补传不增加执行次数。没有上传队列或新的等待状态机。

执行故障仅保存固定“任务执行失败”，不保留原始异常。非法JSON结果也按失败处理；最多两次。disk.mjs仅保留源码，活动runner不导入，disk.query显式暂停。mock任务只在测试中注入，没有生产可执行的示例业务。

数据库时间UTC；展示方使用Asia/Tokyo。设备ID不是秘密、不能充当认证凭据。Paylog和提醒未实现，也未初始化成支持类型。任务类型目前通过SQL维护，不提供流程编辑器。

## 网页终端非界面接线

`terminals/client.mjs`导出`createTerminalClient(request)`，由宿主在登录完成后提供已认证同源请求函数；适配本身不读取或保存开发API_TOKEN。当前开发Bearer不能直接放入浏览器，真实宿主认证接线尚未实现。

`check()`返回registration或ready；用户明确接受时调用`accept()`；拒绝时调用`decline()`只读设备清单并返回management；选中确认后调用`claim(id)`返回ready。出错抛回宿主，不自动登记或跳成功；同一动作连点复用在途请求。详见[接口与页面交接](../docs/TERMINAL_REGISTRATION_HANDOFF.md)。

终端cookie仅保存非秘密ID，HttpOnly/SameSite=Lax/Path=/，HTTPS加Secure。清除cookie不删除D1记录，之后可重新认领。web-ID可改名，但不能通过PUT设备接口绕过接受门槛，也不能成为PC任务的执行目标。认领PC只恢复网页关联，不授予PC执行凭据。

## 验证与限制

- 最新Node/SQLite及线程测试89项通过，第八九组联合第3轮复核通过；原29项及磁盘实测属于第三组暂停前的历史。
- 先前Wrangler本地D1执行001建表/旧种子成功；002至005尚未应用到既有.local数据库，必须按上方初始化及单次升级说明准备。
- 沙箱内Wrangler本地查询曾因fetch failed失败；经过仅本地初始化命令的自动审批后成功，无生产访问或部署。
- 未启动常驻Worker、未进行HTTP端口/真实网络中断或Access线上验收。桌面启动/退出已接线并经事件mock和真实线程验证，Windows弹框实机效果未验收；不冒充实际云端部署验证。
- 未部署、提交或推送。正式部署前需独立发布审核记录和本次用户许可。

使用D1的绑定与本地命令依据：[Cloudflare D1本地开发](https://developers.cloudflare.com/d1/best-practices/local-development/)、[D1入门与绑定参数](https://developers.cloudflare.com/d1/get-started/)。
