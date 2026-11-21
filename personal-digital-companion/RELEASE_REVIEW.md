# 发布审核记录

## 2026-11-20 JST　鱼与熊掌资源登记与桌面精灵首次升级

本记录的发布目标为Windows 本地绯月桌宠。

### 需求与验收

用户要求绯月用关键词「资源」识别鱼与熊掌登记。普通执行和指定 PC 执行共用业务接口。确认卡展示标题、正文、分类、网址；明确确认后才创建。标题回答「这是什么」并简述原文能支持的用途，「打算用它做什么」保留用户完整原文。默认分类「其他」。抽取原文第一个 HTTP(S) 网址，Markdown 使用其实际目标，保留片段。待补标题时继续询问。相同操作的重试只能产生一个资源，原有手工登记应继续工作。

### 来源、逐项变更与复核范围

资源子项目位于 G:/selftool/.release-resource-source-20261120，a834975 → 7ec0e72。src/api.js 允许绯月的受信任写入回调复用资源创建，integration/main-tests/resources-host.test.mjs 覆盖重放、不同正文冲突及详情。主站主基线 1e61e15，API 基线 7c8e8f3，桌宠基线 003862c（已安装桌宠来源分支 codex/workspace-checkpoint-20261120）。从四份隔离工作树发布。用 git diff 对照对应基线；资源源仓另用 git diff a834975..7ec0e72。主站资源指纹随 API 变更同步。
- 桌宠的 agent/assistant 负责识别、补项与原文抽取；agent/host 负责业务字段与回执；seeds 和 pc-types 增加普通及 PC 类型。desktop 路由、确认展示和服务器任务指令处理新类型。交互技能 1.8、服务器任务技能 1.5 与新增资源登记技能 1.0 共同发布。tools/release-preview.mjs 使用隔离账户和内存库。AGENTS.md 与开发指南保存长期登记归属及历史功能清单。
- API 将上述规划、参数适配、PC 类型和种子集成进 src/companion/agent。主站接入 /api/resources，复用现有资源表、分类校验与共同回执。旧版本没有此任务与技能。
- 各项目本次精确文件清单见下文。测试/业务 SQL、花园准备材料、审核记录属于本次留痕。其他工作区中的问答模型、新图片流程等并行改动未作为本次发布源码；已在本机开发的能力仅作为花园历史补登记载。

### 数据、配置与兼容性

生产业务仅 feiyue-companion.tasklist 两行新增，无表结构修改、历史回填、密钥或绑定变更，无费用配置改动。stockanalysis 已有业务表 rl_resources，本次部署本身不会录入示例网址。业务 SQL 及花园模板在主站 database/changes/feiyue-resource-task-20261120。生产只读核对了七个 tasklist 字段及目标两行均不存在。花园现修订 98，项目 #16 下同名功能、匹配的种子与改善均为零。

### 花园归属与待确认内容

已确认新建「网页角色组件 → 绯月（桌面精灵）」为桌宠升级归属；成功时一条发布、一条明细，0.0 → 1.0。综合本次鱼与熊掌能力与下列既有功能清单；种子、改善和旧 #58 历史无需调整。新增功能名称与归属已确认；以下补登明细与生产发布许可待本次确认。下列内容保存在实际花园 SQL 模板中。
- 桌宠显示与动作：托盘和角色菜单、显示与隐藏、移动与归位、工作状态、窗口左右攀爬和上沿坐卧、全屏避让、动画与声音设置。
- 问绯月：点头打开气泡、文字和 Windows 听写输入、本地模型与技能分流、公开搜索、截图与图片问答、回答详情和失败记录。
- 登记与核对：吃喝、运动、一键事件、随手记、日记、提醒登记；本地工作区另已实现独立确认窗、逐项补缺、同字段批量填写和按任务选择最多三张图片。
- 提醒与天气：当天首次启动提醒、到期事项检查、三地天气与预警、无变化时抑制重复天气提示、未读菜单及未读／全部／已读筛选、一键已读。
- 轮询与启动：任务、到期事项和天气分别启停，间隔 10–300 分钟、允许推延 0–100 次，到限入队去重；检查历史与下次时间；Windows 登录后延迟一分钟自启动、提醒延迟生效。
- 任务及生图：今日任务、投入工时、指定或空闲 PC 领取、串行任务链、中断恢复与补传、基于本地 ComfyUI 的文字生图和图片任务。
- 复盘与维护：东京日期归档对话和图片、任务结果复盘、待确认与任务通信日志、云端连接和供应商测试、菜单与界面资源热更新、受控重启。

### 实际验证

- 鱼与熊掌来源 npm test 14/14；API npm test 34/34，Wrangler deploy --dry-run 通过；主站 npm test 842/842 和 npm run check 通过。
- 桌宠 node tools/build-desktop.mjs，设置 COMPANION_HU_SHI_MAIN_SOURCE 为本次主站目录后 node --test agent/tests/*.test.mjs 218/218，零跳过；node tools/test-desktop-shell.mjs、python -B tools/test-skills.py（4 项）与隐藏 Electron tools/test-panel-titlebar-electron.mjs 通过。
- 本次候选的双 Worker 内存验收 node tools/release-preview.mjs 通过。以模拟 AI、真实处理器和真实业务 SQL 返回七种登记回执，资源正文、标题、默认分类与 URL 均回读匹配。测试包括并发重放与冲突、先确认后写入。
- Python sqlite3 隔离演练确认两仓种子行值完全相同、任务 SQL 重放拒绝、花园成功与失败版本及重复写入保护。Wrangler 控制面只读核对两边当前流量。用户线上效果待用户截图确认；未使用真实模型或向线上登记测试资源。尚未执行生产备份、生产 SQL、部署和发布后 Git 推送。第三方独立审核未执行。

### 本地 Worker 验收准备

在下面的桌宠候选目录使用 PowerShell 运行。已用相同初始化完成自动验收。--serve 会使用回环地址 8788 和临时内存库；两个 Worker 内部使用本地服务绑定与模拟供应商，无需生产凭据。交互验收待用户通知启动。

```powershell
Set-Location 'G:/selftool/.release-resource-desktop-20261120/personal-digital-companion'
$env:FEIYUE_MAIN_DIR='G:/cloudflare/.release-resource-task-20261120/myapp'
$env:FEIYUE_API_DIR='G:/selftool/.release-resource-api-20261120/api-worker'
node tools/release-preview.mjs --serve
```

### 部署、健康检查与恢复

获得许可后对两个 D1 按写入阶段分别执行当前加密全备、独立分支推送、远端取回恢复并比对；先提交业务精确 SQL，写入前复核旧值及备份有效性。先只写入业务两行，后检其全部字段及其他表。然后从上述候选依次部署 myapp 和 subscriptions-api（API 使用 scripts/deploy.mjs 注入公开来源与 Access 受众，保留已有 vars）。读取版本及流量、比较绑定和线上基线。本机沿用现有资料、确认窗口与桌宠重启流程；若正在执行任务，按现有重启保护处理。实际登记与页面观感由用户在 Access 受控服务自行核对。
发布结果明确后生成花园最终精确 SQL 并先提交。校验备份与实时修订，生产只执行一次，回读新增功能、发布、明细、说明、版本和修订，核对四张表的变更及其余表。失败登记为发布中并记实际原因、版本维持 0.0。基线发生变化时重新核对，禁止覆盖。业务恢复优先回退 Worker，旧模板保留兼容；确需移除时仅在不存在引用并复核备份后定向补偿。既有用户资源不能随版本回退删除。部署前主站控制面回退版本 0f7433fd-365a-42b8-a902-0641b85e535e，API 为 9e495571-a120-4071-9cdf-8b81d8d2d7ee。桌宠按隔离基线恢复本次改动，保留本机资料与其他并行改动。
Git 按项目独立提交并非强制推送，读回远端 SHA。发布后在此补记 JST 时间、版本、备份、SQL 提交和核验回执。审核重点为确认前零写入、原文与 URL 匹配、重试去重、云端与 PC 相同字段映射、花园首次升级及历史清单的区别。

### 本项目文件

- AGENTS.md
- agent/assistant/registration-plan.mjs
- agent/assistant/resource-registration.mjs
- agent/host/main-site-task-adapter.mjs
- agent/host/registration-data.mjs
- agent/seeds/tasklist-pc.sql
- agent/seeds/tasklist-registration.sql
- agent/tasks/pc-types.mjs
- agent/tests/registration-flow.test.mjs
- desktop/conversation-routing.mjs
- desktop/inquiry-input.mjs
- desktop/interaction-skills.mjs
- desktop/registration-ui.mjs
- desktop/screen-question-host.mjs
- desktop/server-task-command.mjs
- docs/DEVELOPMENT.md
- docs/REQUIREMENT_CHANGES.md
- skills/feiyue-interaction/latest.json
- skills/feiyue-interaction/source/routes.json
- skills/feiyue-interaction/versions/feiyue-interaction-v1-8/SKILL.md
- skills/feiyue-interaction/versions/feiyue-interaction-v1-8/routes.json
- skills/resource-registration/latest.json
- skills/resource-registration/source/SKILL.md
- skills/resource-registration/source/local-ai.json
- skills/resource-registration/versions/resource-registration-v1-0/SKILL.md
- skills/resource-registration/versions/resource-registration-v1-0/local-ai.json
- skills/server-pc-task/latest.json
- skills/server-pc-task/source/SKILL.md
- skills/server-pc-task/versions/server-pc-task-v1-5/SKILL.md
- tools/release-preview.mjs

用户已在审核资料完成后明确确认生产部署及七组历史能力补登。2026-11-20 JST。

### 实际发布与登记回执（2026-11-20 JST）

主站 myapp 于 17:51:55 发布 f092fdde-d279-4d00-b406-011c47ca79cc，subscriptions-api 于 17:52:21 发布 35604e0d-1ac5-4742-b8a2-692ddfd80652。两者均读回 100% 流量，分别 42 和 13 项绑定与上一版本逐项一致。桌宠本机目录重新构建，实际安装路径的专项确认到提交用例通过。用户按 Esc 停止了电脑操作，运行中桌宠是否已重新加载待确认。受控应用的线上观感待用户截图确认。
任务库备份 26638f0 独立远端恢复 16/16，业务 SQL 提交 425f071。生产仅增加 resources.create 和 pc.resources.create 两个模板。花园备份 78fceaa 独立远端恢复 117/117，精确 SQL 提交 c502840。两个库写入前重新导出比对、分别执行一次、写后全部表与预演逐表相符，完整性正常、外键违规 0。网页角色组件 #16 下新功能 #61「绯月（桌面精灵）」首次升级 0.0 → 1.0，发布 #50、明细 #120、修订 98 → 99。明细包含本次升级与七组既有桌宠能力。旧 #58 保留原历史。
部署代码与精确 SQL 已推送并通过 git ls-remote 回读：主站 c502840、API 11546e8、桌宠 a1bd956、资源来源 7ec0e72。桌宠位于原 codex/workspace-checkpoint-20261120 分支，其余位于 main。加密备份在独立 db-snapshots/production。完整机器回执在主站 database/changes/feiyue-resource-task-20261120/execution-receipt.json。
## 2026-11-20 JST · 绯月任务管理桌宠候选

目标为 WebCharacter 桌宠本机源码及正式来源分支 `codex/workspace-checkpoint-20261120`。基线 `b27cf586b0c0f22532f3f242f02aee7504ade2c6`。在独立发布副本查看 `git diff b27cf58 -- personal-digital-companion` 与未跟踪路径。使用任务工作区开发提交 `e7ce9f6` 至 `c28b2b5`，加双页签、去重和原地展开补丁。主站和 API 候选审核记录在各发布根目录。

`desktop/task-inbox*`、`task-lifecycle.mjs`、`shell.mjs`、`menu-layout.json`、`source-updates.mjs` 及 `agent/execution/runner.mjs` 增加双页签、云端名称及单链按需展开，保留原接取、确认及重试。终端绑定使用 `agent/devices/identity.mjs`，读取本地绑定文件，沿用受控重启并留存旧绑定。网页及服务端来源为 `web/chains.*`、`web/icons/anim/feiyue.svg` 及 `agent` 内任务管理代码。现有任务库和本地资料无迁移，配置与凭据无调整。桌宠素材与本机资料不进入上传范围。

`node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs`、56 项任务专项测试、`tools/test-panel-titlebar-electron.mjs` 和隔离 `tools/test-terminal-restore-electron.mjs` 通过。双 Worker 与真实 Chrome 通过。现有运行中的桌宠需通过自己的受控重启才加载本机已同步的任务界面。线上页面由用户截图验证。用户要求发布，具体 Cloudflare 部署与花园清单待确认，第三方审核未执行。发布后只同步本次源码与验证文档并核对远端，不改其他工作区。

2026-11-20 JST，用户已确认本次具体花园清单，并明确批准按以上范围先发布 subscriptions-api、再发布 myapp。审批完成后继续按记录复核实际生产配置、流量及发布候选。
已核实配套 API 52764a67-521e-4a7a-850d-f915ef295da7 和主站 36ba580f-3427-488d-a628-dc58d3cb58e9 承载 100% 流量。桌宠源码与构建验收已完成，运行实例待本机从「设置与维护」重启加载。Git 同步回执另补。
本次发布源码提交 118c90e9dd1555a6ecc121da39d206fe134d07b1 已普通推送并由 git ls-remote 验证 origin/codex/workspace-checkpoint-20261120。本条为发布后 Git 回执。


## 2026-11-20 JST · 绯月手记生产发布候选

本节为本次待发布记录。下列验证结果来自三个最新发布基线的独立工作树。旧发布的批准与成功回执保留其原适用范围。

### 原始需求与验收

绯月以妻子兼助理的身份，在空闲时用本机 Qwen3.5 4B 记录双方对话、任务、天气和评价。每天两次，七天内补漏，优先昨日，单篇最多 5000 字，按事实追加，旧正文保留。当天成功查阅且没有素材时生成“无所事事的一天”。检索只查索引字段，打开才读正文。悬念的已问与已解分别保存。近两个东京自然日的消费与悬念共用两小时的一个名额，已问对象排除，超时继续，主动结束保留原句。网页只读并可从念叨返回具体消费或悬念。验收含重传去重、来源读取失败、改期账目回链、两个主题与移动端。

### 目标、来源与对照

生产主站 myapp 基线 b8ca7ab，API Worker subscriptions-api 基线 17e6f6e，Windows 桌宠来源分支 codex/workspace-checkpoint-20261120 基线 9b1ddae。需求和业务实现来自 WebCharacter/personal-digital-companion，桌宠候选的 docs/FEIYUE_PERSONALITY_MEMORY.md 与 docs/reviews/FEIYUE_MEMORY_FOUR_ROUND_AUDIT_2026-11-20.md 可复查。用 git diff <本项目基线> -- <本项目目录> 比对已跟踪改动，提交前另查 git ls-files --others --exclude-standard。详细范围列在下方。现有任务管理及现有 PC 功能继续使用各自已发布基线。

### 数据、配置与影响

feiyue-companion（COMPANION_DB）新增 companion_diary、companion_nags，两个显式索引 companion_nag_time、companion_single_pending；无种子、无回填。首次启用后由桌宠正常轮询逐步写入。桌宠本机 profile 新建人格记忆 SQLite，保存工作状态、草稿和备份。主站用户自己的 diaries 表无迁移。stockanalysis 的本次写入范围仅为发布结果明确后的花园登记。沿用既有绑定、Access 和本机模型，无新增凭据、变量或外部供应商。单主人身份值在生产为 secret_text，控制面仅核对到配置存在及 COMPANION_ENABLED=true。若配置了多个主人，页面拒绝展示，线上效果待用户自行确认。

主站 database/changes/feiyue-handbook-20261120 含 PREPARED 清单、精确业务 SQL、前后检及花园模板。生产已只读核对四个目标对象均不存在；手记两张表尚未创建。此前个人日记结构修复的本地 / 主库备份不能代替本次业务库备份。

### 分项验证

- 桌宠候选带主站源码运行 node --test agent/tests/*.test.mjs，238/238，手记专项 13/13。原开发工作区还有并行 DeepSeek 截断回复变更，该契约未进入此次候选，未修改供应商处理。桌宠构建、壳和 Electron 标题栏回归通过；真实 Qwen3.5-4B Vulkan 在临时 profile 生成日记通过。
- 主站 npm.cmd test 843/843、npm.cmd run check 通过。API npm.cmd test 34/34、npm.cmd run deploy:dry-run -- --keep-vars 通过，API 预构建使用测试用受众值。实际部署使用原有受众配置。
- node tools/personality-memory-preview.mjs --visual 使用隔离 D1 和合成账目，在桌面、手机和两套主题验证两类回链。双 Worker 验证使用实际主站和 API 入口、本地测试身份和命名 RPC，读回列表与正文、拒绝网页写入、保留任务管理页，脚本为桌宠 tools/test-handbook-release.mjs。运行时 FEIYUE_MAIN_DIR、FEIYUE_API_DIR 分别指向候选 myapp、api-worker。
- SQLite 演练了严格业务 DDL、花园成功与失败模板、修订不匹配与重放。生产结构同步通过，花园修订 100、功能 #61 当前 2.0，当前无手记改善或发布。业务 SQL 和花园均未在生产执行。

### 上线、验证和恢复

1. 用户确认本次范围后，复核远端及生产流量；本次读回 myapp 36ba580f-3427-488d-a628-dc58d3cb58e9、subscriptions-api 52764a67-521e-4a7a-850d-f915ef295da7 均为 100%。范围发生变化时停止并复核。
2. 先为 feiyue-companion 做完整加密备份，在专用备份分支独立提交推送，从远端新克隆恢复并逐表核验。提交业务 SQL，核对当前库与备份，然后按 01、02、04 执行一次 D1 导入和后检，旧业务表逐表核对。任一门禁失败即停止。
3. 先发布 myapp 的消费 RPC 和只读页面，再发布 subscriptions-api 的手记 API，随后在 Windows 桌宠沿用现有 profile 和 4B 模型，按已有在途任务保护流程切换，禁止覆盖开发中的并行改动。中间窗口主站手记页可能暂时无法读取。实际部署保留现有变量和绑定，两端均核对控制面版本与流量。确认 PC 加载新版后验证调度和待补传状态。受控线上页面只由用户打开、提供截图，代理不使用登录会话代验。
4. 花园 #16 / #61 的更新清单按修订 100 准备。成功时新增一项已完成改善、一条发布和明细，2.0 → 3.0，种子无变化。失败时在既有明细 #121 记录一次“发布中”及实际情况，不记成功或升级。根据实际结果生成精确 SQL，先提交。核对 stockanalysis 当时有效的完整加密快照、独立推送和远端恢复，确认基线仍匹配后仅登记一次，逐表后检。
5. 异常时停止后续阶段，按实际影响回退桌宠及两个 Worker 至上述稳定基线，保留已追加的私人记忆。恢复数据需重新核对新增记录与有效备份。发布结束后各项目补记真实时间、版本、结果、快照及 Git 提交，普通推送并逐一读回目标远端 SHA。

### 本地 Worker 与审批状态

本地验收目录为桌宠候选 personal-digital-companion。设置 FEIYUE_MAIN_DIR 指向主站候选后，运行 node tools/personality-memory-preview.mjs --serve，自动准备隔离库和示例资料，端口 8796。自动化回归已结束，交互验收服务待用户明确启动。线上效果待用户截图确认。第三方独立审核未执行。旧花园清单曾获准，版本基线已变化；新清单和本次生产部署许可待确认。

### 本项目变更

桌宠新增人格记忆库、4B 后台推理、闲时日记与念叨、七日回补和两类回链。用户前台工作可抢占模型。保持上次发布的普通对话模型；工作区的批量附图登记、额外普通对话换档和供应商调整均不在包内。

- RELEASE_REVIEW.md
- agent/assistant/personality-memory.mjs
- agent/host/memory-expenses.mjs
- agent/host/memory-page.mjs
- agent/host/memory-reader.mjs
- agent/host/memory-route.mjs
- agent/host/subscriptions.mjs
- agent/integration/personality-api.patch
- agent/integration/personality-main.patch
- agent/migrations/016-personality-memory.sql
- agent/tests/personality-memory.test.mjs
- agent/worker.mjs
- desktop/balanced-local-model.mjs
- desktop/local-model-process.mjs
- desktop/local-model.mjs
- desktop/menu-layout.json
- desktop/personality-diary.mjs
- desktop/personality-nags.mjs
- desktop/poll-scheduler.mjs
- desktop/poll-settings-ui.mjs
- desktop/reminder-checks.mjs
- desktop/screen-question-host.mjs
- desktop/screen-question-preload.cjs
- desktop/screen-question-ui.mjs
- desktop/screen-question.css
- desktop/shell.mjs
- docs/DEVELOPMENT.md
- docs/FEIYUE_PERSONALITY_MEMORY.md
- docs/reviews/FEIYUE_MEMORY_FOUR_ROUND_AUDIT_2026-11-20.md
- docs/reviews/FEIYUE_MEMORY_GARDEN_PLAN.md
- docs/reviews/FEIYUE_MEMORY_IMPLEMENTATION_2026-11-20.md
- docs/reviews/FEIYUE_MEMORY_REQUIREMENTS_REVIEW_2026-11-20.md
- docs/reviews/FEIYUE_MEMORY_REQUIREMENTS_REVIEW_2026-11-20_2.md
- docs/reviews/FEIYUE_MEMORY_REQUIREMENTS_REVIEW_2026-11-20_3.md
- prototype/memory/assets/shell/theme.js
- prototype/memory/assets/styles/shell.css
- prototype/memory/assets/styles/theme.css
- prototype/memory/index.html
- prototype/memory/memory.css
- prototype/memory/memory.js
- prototype/memory/reader.js
- tools/personality-memory-preview.mjs
- tools/test-handbook-release.mjs
- tools/test-personality-model-electron.mjs
- tools/test-personality-reader-electron.mjs


业务 SQL 及两份花园模板已在主站隔离工作树独立提交 cfc3f23（本地）。执行前仍需比对文件、提交摘要和实时基线。以下是已准备好的交互验收命令，使用示例数据，收到启动指令后运行。

```powershell
Set-Location 'G:/selftool/WebCharacter/work/feiyue-handbook-release/desktop/personal-digital-companion'
$env:FEIYUE_MAIN_DIR='G:/selftool/WebCharacter/work/feiyue-handbook-release/main/myapp'
node tools/personality-memory-preview.mjs --serve
```

用户已明确确认上述生产发布范围及花园 2.0 → 3.0 清单。重新核对远端三项目基线、两个 Worker 的 100% 流量与主站结构通过。加密快照目的地正在单独确认，业务 DDL、发布和花园登记尚未执行。

已获本次生产发布、花园 2.0 → 3.0 清单及指定 GitHub 备份分支授权。feiyue-companion 加密备份 22d399a592629c826da8da31b8f9f67109bdd41d 已从远端恢复，逐表 16/16，完整性正常，外键违规 0。精确 SQL 02-schema.sql 提交 cfc3f236dea0486eb95971d262f84818424da681。核验时间 2026-11-20T13:49:46.588Z。

已获本次生产发布、花园 2.0 → 3.0 清单及指定 GitHub 备份分支授权。stockanalysis 加密备份 9d6382989eb1294e4c1afde967def570e93059ee 已从远端恢复，逐表 117/117，完整性正常，外键违规 0。精确 SQL garden-final.sql 提交 f6b31a307ddcc206a18cc95f2ea0190fe0116088。核验时间 2026-11-20T13:58:31.763Z。

## 绯月手记生产发布实绩（2026-11-20，东京时间）

- 2026-11-20 22:54:07 JST 主站 myapp 56eb91b6-cd19-4442-a593-f79eafe18644 接管 100% 流量，42 项绑定核对一致。2026-11-20 22:54:36 JST subscriptions-api 511fc3ab-3b06-4c8c-b174-894158f49406 接管 100% 流量，13 项绑定核对一致。使用 npm.cmd run deploy -- --keep-vars 发布，以 wrangler deployments list 和 versions view 复核。

- 业务库已运行 01 前检、02 严格 DDL 和 04 后检。新增 2 张空表、2 个命名索引。首次导入后的 Wrangler 进度提示使本地 JSON 解析失败，通过只读后检和离线全量比对确认成功，DDL 仅执行一次。18 张表结构与数据全部符合预期，完整性正常、外键违规 0。两个库的备份已独立推送，完整恢复分别为 16/16、117/117。

- 2026-11-20 22:56:30 JST Windows 已启动 4da755d，并排安装于 G:/selftool/.release-feiyue-handbook-desktop-20261120，连接原有资料、运行库和模型。原桌面快捷方式及已有的登录启动入口均已切换。实机登记日记 720 分钟、念叨 120 分钟、补评价 60 分钟。2026-11-20 22:59:33 JST 只读核对待补传日记 0、念叨 0。原开发工作树的并行编辑已保留。

- 花园已按确认清单登记一次。项目 #16、功能 #61，版本 2.0 → 3.0，发布 #52，明细 #122，已完成改善 #62。修订 100 → 101，种子变更 0。2026-11-20 22:59:08 JST 全库 117 张表与离线预期一致，完整性正常、外键违规 0。

- 用户已确认生产部署、花园清单及两个数据库备份目的地。线上界面待用户截图确认。独立第三方审核未执行。本节记录本次实际结果；早前准备状态按时间保留。

生产发布回执及相关源码已普通推送并于 2026-11-20 23:01:35 JST 独立读回核对。主站 main 对应 f0ad5b8dbd58928ac98379759083b84ad8925f85，API main 对应 f4807572a826728a5f1f9ae655e18f61d4cf8fa2，桌宠 codex/workspace-checkpoint-20261120 对应 eda318060bb90bed44f53688672510819b1211db。本次同步附记仅追加 Git 核验信息。

## 2026-11-21 JST · Aggressive 9B 登记关键词、直连和异常尾串修复候选

需求与原始场景：先保留 Qwen3.5 4B 时代的技能，Aggressive 9B 使用调试后的技能。普通模式以登记／记录的请求语义分流，直连只聊天。正式回合 06:05:37 的 operation 是文字问答，Aggressive 9B 本地完成耗时 7572 毫秒、云端 0 毫秒。用户要求提前登记早餐，旧版漏掉提前二字，回复声称记在小本本且末尾有十六个重复的右花括号和星号片段。验收要求同一句在普通模式进入待确认登记，直连输出纯文本对话，食物分享默认聊天；保留正常标点、代码和 Markdown。
开发库 WebCharacter 3b55903、正式目录 .release-feiyue-handbook-desktop-20261120/personal-digital-companion 的 Git 39fd098 加实际在用工作树。原文件和两棵树所有旧技能已按存档 manifest 逐项解包验证 338 个文件。备份 G:/chat/2026-11-20/wo-z/outputs/绯月-Qwen3.5-4B-技能与关键词基线.zip，SHA-256 08423a3e400ba0f0845ccc25de1a291958446e8e9aa26bb5140981e97bdb4c74。以实际正式目录为底，只将与本次有关的开发差异合入候选 G:/chat/2026-11-20/wo-z/work/9b-skills-release。manifest.json 列明 22 个文件的逐项旧值及新值，用 git diff --no-index 或文件摘要核对。
分流入口 conversation-routing、interaction-skills 与宿主/界面 screen-question-host、screen-question-ui（含打包副本）更新：明确的委托、别名及专门入口走既有流程；普通生活分享、引用、否定避免误登记。裸关键词澄清对象。直连优先，使用独立的本地纯文字分支，关闭后恢复普通分流。更新交互总控、角色聊天和登记技能的源码及版本；正式候选的三版本依次为 2.2、1.3、1.4。原技能版本保留。local-model-process 和新增 chat-output 模块按聊天输出处理符号循环和无业务回执的典型完成语句，调整采样；直连系统提示仍只有原先一句。细节与边界见 agent/tests/chat-registration-boundary.test.mjs。开发树的 unified-conversation.test.mjs 同步更新旧的隐式运动登记预期。业务库、模式权重、线上接口、数据迁移、历史回填及云端配置无变化。
实际验证：node --test agent/tests/unified-conversation.test.mjs agent/tests/screen-question-host.test.mjs agent/tests/balanced-local-model.test.mjs 18/18；新增专项 3/3 在开发树与正式基线候选均通过；python -B tools/test-skills.py 6/6。开发树 Electron 七面板检查、候选隔离 Electron 直连开关及模式和截图禁用验证通过。实际 Vulkan 9B 候选三组输入：原始早餐请求为 registration/task；去掉委托词的同餐分享为 question/chat；原始早餐输入在直连为 direct/chat。隔离面板验证准确的待核对字段和无实际业务写入，真实旧回复通过尾串回放。真实模型输出有随机性，直连仍可能自行发挥角色细节。历史对话未修改，也未提交真实早餐。
发布目标为现有 Windows 正式桌宠。安装前重新复核进程、资料目录、快捷方式、自启项和 manifest 旧值；备份运行文件、技能源码与指针。正式安装仅在本次获准后按清单替换并走受控重启，保留原资料。重启后核对新 PID、路径、摘要、实际对话入口和候选的同句三路验证。失败时恢复备份及旧 skill 指针，撤回本批新增且摘要仍匹配的文件后受控重启。本次仅开发与候选验证完成。正式安装、用户对正式版效果确认及第三方独立审核均未执行；本次部署授权及花园登记意愿待定，尚未提交或推送 Git。

## 2026-11-21 JST · 9B 关键词和回复修复正式安装结果

用户指示「安装，本次不登记花园」。06:23:25 JST 完成本机安装，旧进程 27924 正常退出，新进程 16344 从原目录和原资料启动，v3 服务已就绪。候选 22 项 SHA-256 全部读回相符。原文件和新增文件清单备份在 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion/output/skills-9b-before-aa4be2d7331245cbb44d4acc2fbb09f0。

正式目录运行 node --test agent/tests/chat-registration-boundary.test.mjs，3/3 通过。隔离 Electron 使用正式页面核实直连开关和关闭后恢复普通模式。正式 Vulkan Aggressive 9B 的三次真实推理分别得到普通早餐登记 task、早餐分享 chat、直连同一登记原句 chat。三次均无截图中的重复尾串。直连可能用角色扮演文字描述“写在纸上”，实际不会调用登记。面板登记路径用隔离接口验收，未写入真实早餐。花园登记按本次指示跳过。无业务迁移、云端部署或远端推送。

在独立本地 Git 分支 codex/feiyue-9b-skill-routing-20261121 保存本批次的实际旧值、发布文件及审核结果。模型权重、用户内容、资料目录、令牌和备份包未加入 Git。

## 2026-11-21 JST · 修复正式版手记在篇首摘要阶段报 LOCAL_AI_INFERENCE_FAILED（本机候选）

用户看到手记未完成弹窗，要求定位问题。验收以正式模型重放同一类资料，能返回完整摘要和标签，并在隔离服务完整写入、读回且重跑不重复为准。06:27:15 JST 正式日志报 diary-writing 推理失败，之前多次同技能调用已完成。正式资料的只读 SQLite 快照离线回放定位在 summary,tags：正文和私语生成成功，输入 165 个字符，旧版自由长度字段生成到 420 token 预算附近仍未闭合 JSON，解析失败；计量输出重分词为 416 token。未输出用户资料正文，未写入真实日记；临时资料副本已清理。
目标为 Windows 正式安装目录 G:\selftool\.release-feiyue-handbook-desktop-20261120\personal-digital-companion，仅改 desktop/personality-diary.mjs。来源 G:\selftool\WebCharacter\personal-digital-companion，开发基线 3b55903，安装基线 39fd098 加本机既有发布。复用开发版 think 已有的字段限制，按实际安装文件合入该一处变更。生成阶段把篇首 summary 限为 72 字符、tags 限为 36 字符，从而约束这一轮 JSON。比较命令 git diff --no-index 正式文件 候选文件。旧 SHA-256 7D6C87BB268BFA683E4C4F9095C5735576F2D2694586BFA04C3E582A1BA76050，新 F649B5EA3D43E5F936E92FEE3A9CBF2E044FD65695EDF9042F8721CE0F35081A。候选 G:\chat\2026-11-20\wo-z\work\diary-summary-release\desktop\personality-diary.mjs。
实测：Node 24 + 正式 Aggressive 9B Vulkan，work/probe-diary-failure.mjs old 用只读快照断网复现；fixed 同样本摘要和标签通过。integration 使用候选正式模块、真实 9B 和隔离 D1，四次推理完成评价、情绪、叙事和摘要，独立读回正文和篇首；再次运行核对行数、正文、摘要和 revision 相同。开发树 node --test agent/tests/personality-memory.test.mjs 为 20/20。以上未写用户正式日记。此次复现和候选实测后端为 Vulkan；CPU 本轮未复测。第三方独立审核未执行。业务迁移、已有数据回填、模型和配置变更、远端 Worker 发布均无。
本次本机安装及本次花园登记意愿待用户决定。获本次安装授权后，复核正在运行的正式进程、快捷方式与登录启动项、新旧文件摘要，备份单个原文件，受控重启并核实实际模块、进程和资料目录。以临时资料验收。原文件若变化先重新比对；需要回退时按备份摘要还原该模块并受控重启。当前生产数据、正式桌宠代码未改，候选未作 Git 提交或推送；结果待安装后补记。

## 2026-11-21 JST · 手记篇首修复本机安装与回读

用户批准本机安装并选择本次不登记花园。东京时间 2026-11-21T06:43:00.6370153+09:00 完成，原进程 16344 正常退出，新进程 23352 从原安装和资料目录运行。仅替换 desktop/personality-diary.mjs，原文件备份在 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion/output/diary-summary-before-cde5ac2e4d0a4cc89c57294b9312400a，前后 SHA-256 与审核清单相符。本机服务已就绪。
验收直接加载正式安装版代码及 Aggressive 9B Vulkan 权重。用只读数据库副本离线回放，原故障篇首 summary/tags 生成成功。使用隔离资料生成完整测试手记，独立读回正文、摘要、修订并比对；相同输入重跑后一篇、内容和修订均相同。真实手记未提交或改写。本次未登记花园，无数据库迁移、云端部署或远端推送。本地发布分支 codex/feiyue-diary-summary-fix-20261121。

## 2026-11-21 JST · 手记正文有内容而私语为空（待安装候选）

用户反馈上一版未通过。按既有手记需求，每条有效素材应写成段落，保留当时的评价与绯月私语，能保存、读回并对重复输入去重。用户尚未确认本次看到的具体提示。上一次修复篇首摘要截断；本次检查在正式安装版下一批尚未收录的部署素材上复现另一处中断。一次实际推理得到 173 字符正文、0 字符私语，通过模型推理检查，随后无法通过日记草稿字段检查。

目标为绯月 Windows 本机正式安装。来源为 G:/selftool/WebCharacter/personal-digital-companion 的 desktop/personality-diary.mjs。比较基准取实际安装文件 SHA256 F649B5EA3D43E5F936E92FEE3A9CBF2E044FD65695EDF9042F8721CE0F35081A。上次修复的发布提交 709c849eefe18d1bfc439864f3608c16a3482107，本次准备时安装仓库 HEAD 39fd098e40ebf7c2c82dd5a6f9944ae98055566e，以文件散列核实实际运行版本。
候选路径 G:/chat/2026-11-20/wo-z/work/diary-narration-release/desktop/personality-diary.mjs，SHA256 DB1AC778BCD53E5E9761364264FD9A459EE0F1CEADBB993B92D2EA51641AE95E。仅该文件需替换。用 git diff --no-index 比较正式文件与候选；核对只给 diary-writing 叙述阶段的生成语法增加限制：正文 1–120、私语 1–80、可选悬念 0–48 字符。以往允许空字符串并在推理后中断。本次在生成阶段约束长度并保留原有清洗和空值检查，避免用占位文案填补失败。重点审核其他输出结构、直连聊天与未产生悬念的情形。
数据库迁移、回填、配置、云端部署和协议变化均为无。当前隔离试验未修改正式手记。生成式模型仍可能有内容质量问题；片段回放不能替代所有七天正式素材或用户对文笔的验收。

已执行的检测（回放命令的目录为 G:/chat/2026-11-20/wo-z）
- node work/replay-next-diary-material.mjs，加载正式安装代码及 Aggressive 9B Vulkan，第一待写片段返回空私语，退出 1。
- node work/replay-next-diary-material.mjs --candidate，两条真实片段均得到有文字的私语。再以两条原始片段运行写日记入口到结束，独立读回隔离 D1 的来源摘记和私语，两条摘记、一篇正文；同一输入再次运行，修订和正文一致，退出 0。其余日期和来源在本测试中为空。
- node work/narration-shell-baseline.mjs candidate，正式安装基线加单文件候选，桌面壳测试通过。开发目录运行 node ../tools/test-desktop-shell.mjs 在手动写日记立即显示进度断言失败，移除本次约束的开发基线也在该断言失败；开发目录中其他变更未纳入候选。
- 使用 desktop/node_modules/electron/dist/electron.exe tools/test-panel-titlebar-electron.mjs 运行开发库窗口回归，七个面板通过，进程正常退出。

安装步骤：获准后重验快捷方式、登录启动项、运行实例及双端文件散列；备份原文件，替换单文件，以应用自己的重启流程等候在途任务。核对安装进程、资料目录及 GET /infoguide，再加载实际安装代码以隔离资料重放原片段、验证独立回读与重复运行。若验收失败，使用备份恢复相同基线并受控重启；已保存的用户手记保留。待核对实际用户看到的提示以及正式资料全轮完成情况。
本次安装和本次花园登记意愿均待用户决定。第三方独立审核未执行。候选待安装，未触发部署、登记、Git 提交或推送。

## 2026-11-21 JST · 手记私语修复安装回执

本机安装已获确认，本次不登记花园。2026-11-21T11:19:13.9868721+09:00 完成单文件备份和安装。旧进程 23352 正常退出，新进程 28952 从原安装目录启动，桌面快捷方式、登录启动项、实际资料目录及本机接口 /infoguide 核对通过。安装备份为 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion/output/diary-narration-before-239b08df7c604a9e9149cc6a23cec80b。

正式安装文件 SHA256 为 DB1AC778BCD53E5E9761364264FD9A459EE0F1CEADBB993B92D2EA51641AE95E。直接从安装路径加载 Aggressive 9B Vulkan，以两条真实故障相关素材执行 node work/replay-next-diary-material.mjs --installed。两段都有带文字的私语，隔离库独立读回两条来源摘记及一篇正文，重复运行正文和修订号一致。正式安装版的 tools/test-desktop-shell.mjs 通过。正式用户资料的七天全轮与文笔验收仍待实用确认。无数据库迁移、云端部署或花园登记。Git 仅本地留存。
