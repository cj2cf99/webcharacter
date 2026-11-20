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

## 2026-11-21 JST · 绯月七项更新发布前审核

### 原始要求、验收与授权

用户要求把已开发的七项更新自审一轮，通过后准备部署，并将 DeepSeek 截断回复兼容问题排除在本次发布之外。晚间夸奖由桌宠播放本地动画，云端仅返回当日完成判定。此次授权为审核和候选准备。生产发布、Windows 正式安装、本次花园登记意愿及具体清单仍待确认。第三方独立审核未执行。

| 更新 | 验收口径及实际候选 |
|---|---|
| 行动评价 | 正文为空跳过，读写和重试规则一致。历史有效行和来源关联保留。 |
| 手记三类来源 | 按东京日取用户日记、花园部署、Paylog。缺项隐藏，部分失败后可补。主站提供来源，API 验证桌宠身份，桌宠合并取材。 |
| 情绪转写 | 分段前先定基础情绪，按来源写正文，再作篇首。外部事实保留来源摘记。 |
| 手记技能 | 随桌宠安装 diary-writing 1.0、diary-audit 1.4 和交互总控 2.1，宿主继续负责保存和去重。 |
| 七天手记质问 | 一题可引多篇，唯一主篇，引用过的篇目互斥。文字答复可续办，稍后每小时最多一次提醒。最多再问两轮，忙时暂缓，按当时情绪收笔。 |
| 晚间夸奖 | 东京 21:00 后现有检查仅在当天多邻国和当天长期任务均有完成证据时给出标记。正式桌宠已有闲置判断、去重及本地影片。 |
| 随手记附图 | 仅确认的图片进入所属条目。正式图库接收、模板校验、记录保存及重试可回读，桌宠模板上限三张。 |

### 发布目标、差异与资料

准备目录为 G:/selftool/WebCharacter/work/feiyue-seven-20261121。Windows 实际应用在 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion，基线为应用 PID 25316 对应的安装树（Git 39fd098 加已安装修订）。源项目 G:/selftool/WebCharacter/personal-digital-companion。按 desktop-files.json 的 35 个路径逐项比较安装前/候选 SHA-256，含后台模块、技能及四个界面文件。发布时只覆盖该清单。保留原资料、安装入口、模型、动画和复盘首击修复。

主站 myapp 生产基线 91284919-deb2-4df8-a1e9-6bb53c7e87ff（100%）。候选 myapp/ 从 61abf89:myapp 及此前已发布的手记阅读页修复组装，沿用发布工作树静态资源字节。在子项目已有模块基础上接入手记来源、主篇阅读、完成标记，以及使用 recordsEnvironment 的图库上传与登记。API subscriptions-api 生产基线 b6234253-8956-47ca-8ae2-6f354d2d7c69（100%）。候选 api-worker/ 以 09c1caf:api-worker 的既有手记代码为基础，保留线上已加的 kvforapi 绑定及原有模型逻辑。小时骰代码未纳入。worker-files.json 列出主站 7 个、API 9 个路径及相对 Git 基线的摘要、最终 bundle 摘要，包含正向及回退 SQL。各份清单及实际候选共同构成差异范围。

### 数据、配置与恢复

仅业务库 feiyue-companion 的 tasklist 表中 records.create 这一行变更。当前 parameter_spec_json 定义正文、分类，新值增添选填 photos（HTTPS 数组，最多 3 张）。原模板及其他列不动，无建表、历史回填或现有照片搬迁。精确 SQL 在 api-worker/database/changes/feiyue-seven-20261121/，正向和回退均校验完整旧值。执行前再读基线，执行后逐字段回读；影响行数为零时停止核实。该修改属于业务库，按既有生产库规则完成结构核对、加密备份、异地留存/恢复验证及准确 SQL 的 Git 留痕后再执行。花园登记元数据的备份豁免不适用于此操作。生产备份、SQL 提交和执行均未进行。

生产配置新增 0，密钥新增 0。已核实图库 token 绑定存在，图库仓库和分支复用主站随手记的 recordsEnvironment。版本切换前复核两端现行绑定含 KV 目标、主站绑定和原变量。若数据旧值、生产流量或绑定有漂移，先重制候选。启动参数沿用原安装树。失败时先暂停新增提交，核实在途上传和登记回执；按影响恢复对应旧 Worker 和 Windows 单文件备份，确认待领取的带图任务已处理后才考虑执行守卫回退 SQL。回退不会自动删除已保存图片、旧记录、日记或回答，需另行核对在途结果。

### 本轮审查与已执行验证

- 子项目 node --test 的日记、质问、轮询、附图、提醒、登记八个专项共 69/69；python -B tools/test-skills.py 6/6。
- 主站候选 npm.cmd test 843/843，API 候选 node --test 34/34。初次主站打包无法读取既有依赖，归档换行也导致独立静态资源摘要不匹配。已按原发布目录逐字节保留静态资源及相关 SQL，复测通过。见 main-tests-verified.log、api-tests.log。
- 对两个候选执行 wrangler deploy --dry-run --outdir，均正常退出。见 dry-myapp-final.log 和 dry-api-worker.log。此命令未上传。
- Windows 候选在新 Electron 进程及临时资料执行 tools/test-panel-titlebar-electron.mjs 和 tools/test-screen-question-electron.mjs --diary-audit。七面板、气泡稍后、恢复、文字回答、追问与结束通过。
- 设置 FEIYUE_MAIN_DIR 为候选 myapp 后运行 node tools/personality-memory-preview.mjs --visual。本地 workerd/D1、两种屏宽及主题、手记三类来源、唯一主篇回链通过。用隔离夹具，不读取用户日记。
- node verify-cross.mjs 从桌宠上传函数，经 API 鉴权后的图片路由、候选主站图库处理及实际登记网关，写入本地内存记录表并读回 3 张图，验证重试去重、第四张拦截、旧模板恢复及候选技能。网络传输替身只接受图库上传请求，不向外发送图片。初次联测显式填图库配置，未覆盖生产的配置注入方式；复核后已改接共享 recordsEnvironment，并以仅提供模拟 token 的环境复测。
- 未进行生产照片上传、真实手记补写或晚间提醒，不代理登录 Access 页面。真实外观待用户截图。DeepSeek 既有失败已按用户决定排除，本次不作修复或上线承诺。

### 本地验收与后续操作

在 G:/selftool/WebCharacter/personal-digital-companion 中先将 PowerShell 的 FEIYUE_MAIN_DIR 环境变量设为 G:/selftool/WebCharacter/work/feiyue-seven-20261121/myapp，再运行 node tools/personality-memory-preview.mjs --serve。工具创建独立数据库和样例，端口 8796，入口 /companion/memory/。用户指定启动后再常驻，附图整链可在此次准备目录运行 node verify-cross.mjs。

正式切换需本次明确确认。先核对生产基线、变更包、备份与 SQL 的 Git 记录，再执行模板更新和回读。发布主站候选，保留既有变量，核验 100% 流量和绑定；再用 API 原发布脚本及原 WEBSITE_ORIGIN、ACCESS_AUD 发布并复核。最后核对 desktop-files.json 的旧摘要、备份清单文件，经桌宠正常退出或受控重启安装，复核新 PID、正式目录、资料目录、绑定和 API /infoguide。确认旧数据可读、无重复任务、首击复盘仍可见。线上 UI 由用户截图验证。收尾追加实际版本、JST 时间、备份与 Git 状态。若登记花园，按真实结果制单、另行核准编号和版本，先提交精确 SQL，再通过重启后的本机 API 一批登记并读回。当前无本次生产版本、无登记批次、无部署提交或推送。

### 七项候选最终 Windows 基线与回归（2026-11-21 JST）

封包期间，独立的复盘倒排与详情评价更新于 03:59:08 JST 安装，正式 PID 从 25316 变成 33608。本次最终基线采用该次安装后的文件。核对复盘更新的六文件清单后，用包含双方改动的子项目源码重做五处重叠文件，覆盖手记生成、质问宿主、详情窗口、界面源码与其打包副本。第六个文件是复盘测试，仅用于验收。两个发布范围的登记决定各自独立。

最终在同一候选树用临时资料运行 Electron 的 test-memory-electron.mjs --task-reports、test-screen-question-electron.mjs --diary-audit、test-panel-titlebar-electron.mjs 及 test-review-first-open-electron.mjs。复盘倒排和顶部评价、稍后续答及追问、七个面板、冷启动首次点击即显示复盘均通过。冷启动测试首次因精简候选缺少原有动画目录无法加载，随后在候选中引用安装版 assets，复测通过，动画未列入云端包。见准备目录下 rebased-*.log。已复核 desktop-files.json 的 35 个安装前与候选摘要、两端共 16 个候选文件及两个 Worker 包摘要，重跑 verify-cross.mjs 通过。以上均为发布前验证。
2026-11-21 JST 用户明确批准七项部署、正式桌宠安装及发布后通过绯月登记花园（含桌宠）。具体花园清单待确认。业务库快照 d4008cd 已从远端恢复通过 18/18，精确 SQL 889cba4 已执行并回读，records.create 一行新增可选 photos，最多三张。


### 2026-11-21 JST · 七项实际发布与绯月花园回执

用户明确批准本次生产发布、正式安装和花园登记，并在查看具体清单后确认了发布 #55、明细 #125 和版本 5.2 → 6.0。业务库 feiyue-companion 已按 SQL 提交 889cba4 更新 records.create 一行并独立回读。执行前整库密文已单独推送至 db-snapshots/production（d4008cd），远端重新克隆解密后通过 18/18 张表、完整性与外键检查。

主站 myapp 于 04:15:35 JST 切换 f610be27-3317-4638-9402-2e2d3263ddd6，100% 流量，42 个绑定一致。API subscriptions-api 于 04:16:22 切换 40242d1d-8094-4bee-a12f-135f0c29e8f6，100% 流量，14 个绑定一致。已发布 API 以 09c1caf 加生产 KV 为基线，单独保留精确发布分支 codex/feiyue-seven-production-20261121，API 的开发主分支继续保留原有小时骰源码。

Windows 旧 PID 33608 经原生窗口正常退出，安装前备份清单到准备目录 desktop-previous，安装后 04:18:04 JST 核验新 PID 23400、35 个文件、原资料目录、快捷方式、登录启动项和 /infoguide。使用临时资料从正式目录复验冷启动复盘和任务详情，候选气泡复测通过。保留桌宠本机动画文件。Access 线上页面效果待用户截图确认。

确认后的精确清单及 SQL 已提交 e27038c。重启后的绯月在 04:20:37 JST 接收唯一批次 feiyue-seven-20261121，04:23:58 核对步骤，04:24:03 回读结束，state=done、revision=106。花园将网页角色组件 #16 的绯月（桌面精灵）#61 从 5.2 升至 6.0，新增发布 #55 与明细 #125，收录七项桌宠及配套云端更新。机器回执位于主站 database/changes/feiyue-seven-20261121/release-receipt.json。
七项发布 Git 已普通推送并逐一回读相符。主站 main b1a2175，API 精确生产分支 codex/feiyue-seven-production-20261121 d8943ae，API main c3c170d，桌宠 codex/workspace-checkpoint-20261120 eff1759。此次同步附记只记录发布提交的远端核验结果。

## 2026-11-21 JST · 问绯月单回合图片卡

用户需求与验收：用户反馈“这个图片卡这里不走了，不合理，我这里只保留一个回合的对话”。连续生图只展示本轮任务；点击发送后立即移除旧卡；旧任务完成和晚到的缩略图均不能重新占用普通对话；重开辨认本轮图；历史图片仍可在复盘查看。

目标：Windows 正式绯月。本次准备时监听 8765 的主进程 PID 23400，Electron 加载本目录 desktop，参数 --feiyue-login。来源 G:/selftool/WebCharacter/personal-digital-companion，开发 Git HEAD 3b55903，安装树 Git HEAD 39fd098。基线采用安装目录实际文件字节。候选与逐文件安装前后 SHA-256 见 G:/selftool/WebCharacter/personal-digital-companion/output/bubble-turn-l9an2toc/manifest.json。可用 git diff --no-index 逐项比较本目录与该目录下 candidate 的同名文件，image-tasks.mjs 从安装现件只合入按编号读取的改动。

- desktop/screen-question-host.mjs 将提问、图像作业与最新一轮关联，仅请求本轮的缩略图。原先会在打开气泡时读取最近八个任务。按当天用户对话恢复，跳过另行发起的后台生图。
- desktop/image-tasks.mjs 支持精确读取一个任务，沿用现有归档及继续编辑原图行为。
- desktop/screen-question-ui.mjs 和 output/desktop-bundle/screen-question-ui.mjs 随回合切换即时清除旧卡，用请求序号防止旧异步回执覆盖新视图。
- desktop/conversation-history.mjs 在已有加密对话回执内保留可选图像任务标识。原格式仍可解码。tools/test-bubble-image-turn-electron.mjs 新增隔离回归。
- 生产数据库迁移、历史回填、配置和云端部署：无。本机历史任务及原图无需清理。旧加密回执缺少图像关联时仅显示已有文字。
- 已执行：开发树和安装候选分别运行 node --test agent/tests/screen-question-host.test.mjs agent/tests/server-image-task.test.mjs agent/tests/desktop-screen-question.test.mjs，均通过 25/25。首轮暴露无本轮图片时过早结束 IPC 的兼容问题，改为等待原队列恢复再返回结果并复测通过。候选用实际 Electron 各运行 tools/test-bubble-image-turn-electron.mjs 和 tools/test-panel-titlebar-electron.mjs，单回合、迟到回执、冷启动、归档可读及七面板通过。日志在清单同目录。测试使用临时资料和受控图像提交、等待替身。未发送真实生图任务。复核按原需求检查显示边界及原图留存，未发现剩余问题。
- 安装与恢复：获本次明确授权后复核运行目录和清单中的旧摘要，备份六项路径，等待绯月正常退出，再复制候选并核对新摘要。按原登录参数启动，核验新 PID、安装目录、原资料及 /infoguide，用临时数据从安装目录重跑单回合专项；开发与部署纪要补记实际时间和结果。异常时退出后按备份恢复原文件，仅撤下本次新加的测试，再用原参数启动。
- 用户安装确认、花园登记意愿：待本次答复。第三方审核：未执行。未部署、未提交或推送本次改动。


2026-11-21 04:37:10 JST 已按用户确认安装并重启，本次不登记花园。首次关闭请求未退出宿主，核对桌宠主窗口后重试并正常退出 PID 23400。备份见 output/bubble-turn-l9an2toc/before-6cd8266c，六项安装摘要与 manifest.json 相符。新 PID 16092 使用原安装及资料目录，监听 8765，/infoguide 可读。已核实桌面快捷方式及登录项指向正式安装树。从安装目录用临时资料运行 tools/test-bubble-image-turn-electron.mjs，通过双生图、重开、文字清卡、旧缩略图与作业晚到、冷启动及归档原图回读。详细日志在 output/bubble-turn-l9an2toc/installed-ui.log，实例回执在 installed.json。无生产 SQL 或云端部署，无花园批次。
