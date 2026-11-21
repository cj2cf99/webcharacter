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

## 本机桌宠合并发布 · 特殊菜单、动作节点与已确认桌面功能（2026-11-20 JST）

**原始要求及验收。** 用户在实际菜单中未见「特殊菜单」，要求将开发后已确认的本机功能及节点一起安装，此后每次本地更新均应执行实际安装、受控重启与入口核实。验收包括实体菜单能展开「看绯月写日记」、空闲时忽略周期触发她的手记、七个情境动作资源可加载、既有资料及登录入口仍指向同一安装版，确认登记和任务回执保留。

**目标与基线。** Windows 本机，项目目录 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。桌面快捷方式、登录启动项与 Electron 主进程命令行均已比对。实际文件基线为 39fd098e40ebf7c2c82dd5a6f9944ae98055566e；开发来源 G:/selftool/WebCharacter/personal-digital-companion，开发 HEAD 263ede0 加工作区改动，按文件内容逐项比较。发布前比对基线、候选和安装后的 SHA-256。与基线比较时保留以往手记上线的发布历史。REQUIREMENT_CHANGES.md 和 FEIYUE_PERSONALITY_MEMORY.md 位于 docs 下。

**行为与范围。**

- 菜单原无手动写作，新增托盘和角色右键「特殊菜单 → 看绯月写日记」。复用她的日记、草稿和回执；忙碌提示、重复点击合并、隐藏时显示。角色播放器纳入启动挥手、退出鞠躬、提醒举铃、写作沉思、晚间学习夸奖、聊天登记、第二个特殊待机。新增节点与强制退场回执，在角色资源库可预览。素材共七个，见 assets/desktop-media/actions 与 RESOURCE_MANIFEST.json。
- 本地对话依 GPU 负载和纠正语境选择模型、总时限 30 秒；写手记仍使用既有 4B 路径。聊天与服务器任务支持东京相对日期；提醒优先确认，独立登记窗支持统一填写、单条覆盖和最多三图。按现有技能发布记录更新 evidence-reading 1.2 和 record-submission 1.3。未确认的批量登记独立 HTML 原型未列入安装。
- 连接菜单增加 AI 轮询测试、当前模型标识与脱敏拒绝摘要。旧云端接口保留错误提示。配套登记计划、图片映射、任务模板及晚间检查的本地源码用于隔离 Worker 回归。服务端供应商策略、网页、生产 SQL、Cloudflare 部署均不在本机更新范围。实际线上多图写入、AI 探针及晚间双完成回执未实测。自动晚间夸奖要求服务器返回 dailyStudyComplete。
- 新增实际安装目录核对规则至 AGENTS.md、开发纪要。历史运行入口、现有资源登记和已发布的任务链权限沿用安装基线。资料、模型、凭据和快捷方式均无需复制。

**代码、测试和文档清单。** `desktop/menu-layout.json`、`desktop/shell.mjs`、`desktop/configured-renderer.mjs`、`desktop/preload.cjs`、`desktop/settings-store.mjs`、`desktop/reminder-checks.mjs`、`tools/test-desktop-shell.mjs`、`tools/test-context-actions-electron.mjs`、`tools/build-desktop.mjs`、`AGENTS.md`、`desktop/screen-question-host.mjs`、`desktop/README.md`、`docs/DEVELOPMENT.md`、`docs/FEIYUE_PERSONALITY_MEMORY.md`、`agent/host/refusal-response.mjs`、`agent/tests/balanced-local-model.test.mjs`、`agent/tests/calendar-date.test.mjs`、`desktop/balanced-local-model.mjs`、`desktop/calendar-date.mjs`、`desktop/chat-budget.mjs`、`agent/tests/registration-flow.test.mjs`、`desktop/inquiry-input.mjs`、`desktop/local-model-process.mjs`、`desktop/question-attachment.mjs`、`desktop/registration-flow.mjs`、`desktop/registration-review-host.mjs`、`desktop/registration-review-ui.mjs`、`desktop/registration-review.html`、`desktop/registration.css`、`desktop/reminder-command.mjs`、`desktop/screen-question-client.mjs`、`desktop/server-registration-plan.mjs`、`desktop/server-task-command.mjs`、`desktop/task-lifecycle.mjs`、`desktop/task-traffic-log.mjs`、`tools/test-memory-electron.mjs`、`tools/test-panel-titlebar-electron.mjs`、`tools/test-reminder-checks.mjs`、`tools/test-screen-question-electron.mjs`、`docs/REQUIREMENT_CHANGES.md`、`agent/assistant/registration-plan.mjs`、`agent/host/main-site-task-adapter.mjs`、`agent/host/reminder-review.mjs`、`agent/seeds/tasklist-registration.sql`、`agent/tests/reminder-review-history.test.mjs`、`desktop/conversation-ui.mjs`、`agent/tests/desktop-quit.test.mjs`。另包含上述技能 source、latest 和新版本快照，assets/desktop-media/RESOURCE_MANIFEST.json 与七个 WebM。output/desktop-bundle 中的对应页面、模块和 WebM 为可重建安装文件。目录级差异可复核本次提交与基线的 git diff --stat 和 git diff --name-status。

**数据与配置。** 生产数据库迁移、回填、线上配置变动均无；本机复用原 profile 和 SQLite。晚间动作沿用本机检查状态按东京日期去重。现有设置和历史技能版本保留。独立测试均使用临时 profile、合成资料和隔离数据库。安装不会实际发起写日记或业务登记。

**实际验证。** node tools/build-desktop.mjs、node tools/test-desktop-shell.mjs、node tools/test-pc-settings.mjs 通过；COMPANION_HU_SHI_MAIN_SOURCE 指向主站源后运行 node --test agent/tests/*.test.mjs tools/test-reminder-checks.mjs，251/251。隔离 Electron 运行 tools/test-panel-titlebar-electron.mjs、tools/test-context-actions-electron.mjs，通过标题栏、登记动作、两种随机待机、写作循环及完整退出。全量回归时给退出模拟器补齐显示器和退场回执；气泡端到端检查发现已处理状态被空列表刷新覆盖，已针对反馈保留处理回执，最终复跑结果另记。未用用户实际资料触发模型或测试线上写入。

**风险和恢复。** 旧主进程不认识新增菜单动作，需受控重启。安装按清单核对旧摘要、先备份再原子替换单文件；中断或不匹配停止，异常回退到更新前文件，按同一入口重启。安装基线可重建源和构建包；保留后续业务产生的资料和用户配置。回退前核对无在途任务。

**安装与后验。** 将本次本机文件装入上述目录，复读摘要，使用右键「设置与维护 → 重启绯月」等待任务落盘并重启。核实新进程 PID、启动时间和目标，检查实际菜单与节点。完成后补记版本、时间、结果与 Git 状态。

**授权及审核。** 用户要求仅本机更新并明确不作花园登记，随后扩大到已确认的本机功能及节点。发布范围与检测已整理；最终安装及进程核对待执行。第三方独立审核未执行。



## Windows 桌宠重新置顶、奶油联想云与本机任务补评（2026-11-20 JST）

用户要求再次显示时持续置顶，闲置转入自主工作时头顶出现卡通奶油云，展示工作与进度；特殊菜单立即遍历本机归档，只补缺失执行评价。用户确认暖白底深色字、计数或实际阶段、结束或中断收起，以及本次不登记花园。验收包括托盘反复显隐、云朵不挡角色操作、已评条目重复执行时不改写。

目标是本机 Windows Electron。桌面快捷方式、登录启动命令和实际主进程均定位至 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。安装 Git 基线 39fd098e40ebf7c2c82dd5a6f9944ae98055566e 加现有本机文件，来源为 G:/selftool/WebCharacter/personal-digital-companion，开发 HEAD 263ede0 加工作区变动。逐文件 git diff --no-index 核对改动，在安装来源之上叠加以下清单生成隔离候选。准备时记录文件前后 SHA-256，安装前重读。如任一摘要改变则重新核对。

变更和审核重点：
- desktop/shell.mjs、desktop/task-lifecycle.mjs、desktop/personality-nags.mjs。旧版再次显示仅调用 showInactive；新版在其后设置 pop-up-menu 层级并保留非激活状态。轮询、自动领取、执行、写作与念叨向已有桌宠窗口发送阶段，结束时清理；检查手动操作与自动任务的区分。
- desktop/index.html、desktop/style.css、desktop/configured-renderer.mjs、desktop/preload.cjs。透明窗口内新增已选奶油云，仅在工作时显示。核对计数与未定进度、减少动态效果、显示回放、点击穿透、头部避让。
- desktop/menu-layout.json、desktop/personality-diary.mjs、desktop/memory-archive.mjs。在特殊菜单增加「补写本机任务执行评价」，按日期枚举全量本机归档，沿用原记录散列和逐条事务。普通对话不进入手动扫描，日常自动检查保留原日期范围。
- 隔离回归更新 tools/test-context-actions-electron.mjs、tools/test-desktop-shell.mjs、agent/tests/desktop-quit.test.mjs、agent/tests/pending-poller.test.mjs。docs/REQUIREMENT_CHANGES.md、docs/DEVELOPMENT.md 追加需求及开发记录。交互候选在开发树 prototype/thought-cloud.html。运行包 output/desktop-bundle 的 index.html、style.css、configured-renderer.mjs 同步构建。
- 数据迁移、生产 SQL、回填脚本、配置和凭据变更均无。手动补评由用户点击时按条写入已有本机评价库；安装及验证使用合成数据，不触发用户真实任务。Windows 本机更新，无云端部署。
- 实际检测：安装基线候选运行 node tools/build-desktop.mjs、node tools/test-desktop-shell.mjs，通过。设置 COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp 后运行 node --test agent/tests/*.test.mjs tools/test-reminder-checks.mjs，251/251。开发树 Electron tools/test-context-actions-electron.mjs 与 tools/test-panel-titlebar-electron.mjs 通过。独立 Win32 检查首次显示及两次外部取消置顶后重新显示，三次均有 WS_EX_TOPMOST，未取得焦点。开发树另有未纳入候选的供应商契约测试差异，全量 251/252；相同契约在安装基线与最终候选均通过。
- 风险与恢复：主进程和 preload 需要重启。写入前备份清单中的原文件并核对摘要，若失败按清单恢复，保留用户资料与安装后的业务数据。控制重启走「设置与维护 → 重启绯月」，等待在途任务；后验核对应用路径、新进程、快捷方式及登录项、实际窗口置顶标记与特殊菜单。真实任务的联想云观感待用户在使用中确认。
- 用户已确认范围、视觉及免花园登记；本节为安装前审核材料。第三方审核未执行。安装、实际重启、发布后核验与 Git 同步状态待补记。


### 本次本机候选增补 · 手动「看绯月写日记」反馈修复

需求是菜单立即启动她自己的日记流程，用户反馈点击无效。本机只读核对得到 23:52:02 JST 的日记完成标记、8 篇本地缓存与 0 条待传草稿。这些数值不能确定某次点击新增了几段。旧安装版未展示成功回执，上一候选还过滤了手动写作进度。
- 在上一节相同的本机安装基线及范围上重新比较 desktop/shell.mjs、desktop/personality-diary.mjs、tools/test-desktop-shell.mjs、agent/tests/personality-memory.test.mjs、docs/DEVELOPMENT.md。修复点击即时显示阶段、同步完成段数、无需新增及暂停反馈。仍按原有互斥和去重约束；手动调用绕过定时周期。
- 验收用隔离资料点击真实菜单回调，核对写作启动、重复点击不重入、七日进度、离线草稿保留。模拟云端确认已同步段数，再次运行确认没有新内容。安装基线加本次候选运行 node tools/test-desktop-shell.mjs、设置 COMPANION_HU_SHI_MAIN_SOURCE 后运行 node --test agent/tests/*.test.mjs tools/test-reminder-checks.mjs（251/251），Electron tools/test-panel-titlebar-electron.mjs 通过。
- 数据库结构、业务回填、云端配置、迁移及生产部署变动均无。正式安装及真实菜单写作体验待核对。沿用上节逐文件 SHA-256、备份、受控重启和回退步骤。本节为安装前记录，待确认更新范围。第三方独立审核未执行；Git 提交及推送未执行。


## 2026-11-21 JST · 任务素材清洗为空导致漏写手记（本机修复候选）

需求与验收：有实际任务及对话时可补写事实，已存在的行动评价继续使用；界面说明已有数量和本轮上传结果。成功回执后标记覆盖，同批重试保持幂等。独立评价依需求只存本机，相关评价随日记段落提交。

目标为 Windows 正式桌宠。来源为 WebCharacter 开发树，逐文件与已安装版本比较，安装基线为 39fd098 加已安装补丁。下方 SHA-256 为实际核对时的安装文件和本次候选。其余功能沿用现有版本。

- desktop/personality-diary.mjs，安装基线 f4de04fa56b6b0b04265be9aac98853a0c6650bc40fbd2db8d127a3d7d049b7f，候选 c255f0b58471a365b766b8556099c0b0ce0c45567555eabc4cb6424762ed76eb。
- agent/tests/personality-memory.test.mjs，安装基线 941364320380899f197148233c5c4fc81ba644c9dbc2909d13ce97a7dfa92e0a，候选 139812480df80abb83d7fda877e3ce2350a49b56ad1759325ede94e215f58056。

桌面模块修正新、旧清洗空值的处理与菜单回执，测试覆盖已有评价、同一任务多次有效结果、重复回执、双方对话、服务端确认与连续运行去重。开发树 docs/DEVELOPMENT.md 补记问题。生产数据库迁移、配置、Cloudflare 发布均无。下一次写日记按既有 7 天范围从本机归档追加，保留旧段落及评价。潜在影响为补写首次需额外推理时间及篇幅。

已运行 node --test agent/tests/personality-memory.test.mjs（14/14）及 node tools/test-desktop-shell.mjs（通过）。真实新段落补传未执行，第三方独立审核未执行。本次安装及花园登记意愿待确认。获准后核对最新安装文件摘要、备份旧文件、按清单替换、受控重启桌宠。检查下一次写作的待传数、覆盖记录与服务端批次，只用聚合信息；用户线上效果待截图。异常时仅恢复本次安装文件，不覆盖用户资料或删除已入册历史。


## 本机自动领取任务完成汇报（2026-11-21 JST）

原始反馈为自动领取任务（例如仅生图）完成后无人明确汇报。验收为自动领取完成时用户看到明确结果，已归档生图能从回执查看，回传未取得确认时显示真实状态。复用桌宠消息框，用户关闭或查看图片不会阻塞任务轮询。既有任务不会被再次执行或补发历史通知。

目标为本机 Windows 安装树 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。已核对主进程、登录启动和桌面快捷方式。以安装 Git 39fd098 加本机现状为基线，来源为 G:/selftool/WebCharacter 开发树 263ede0 加清单内工作区变化，按 git diff --no-index 逐文件复核和 SHA-256 对比；在安装基线中仅叠加此次清单构建候选。
- desktop/task-lifecycle.mjs 在自动领取执行路径报告完成；原流程仅收起进度和处理最终失败。汇报区分上传确认与本机已有完成记录但回传异常，已跳过或归档的旧轮不报成功。
- desktop/shell.mjs、desktop/screen-question-host.mjs 复用图像记录中的本机成图打开方式。第三方重点核对按钮使用本地作业编号、图像归档完成、失败与未确认状态边界。
- agent/tests/server-image-task.test.mjs、agent/tests/pending-poller.test.mjs 验证自动任务、隔离图片归档与查看、成功/断线、重复轮询；docs/DEVELOPMENT.md 追加开发与部署准备纪要。
- 数据库迁移、生产回填、配置、权限、云端部署均无。生产生图及真实业务写入未执行。线上第三方独立审核未执行。
- 安装候选实测 node tools/build-desktop.mjs、node tools/test-desktop-shell.mjs 通过；设置 COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp 后运行 node --test agent/tests/*.test.mjs tools/test-reminder-checks.mjs，253/253 通过。隔离 Electron 运行 tools/test-panel-titlebar-electron.mjs 通过。现有真实归档 PNG 仅核对文件存在、签名与尺寸；新版弹窗在用户实际自动任务中的体验待确认。
- 安装前核对清单逐文件旧摘要，保留更新前副本，安装后重读并核对候选摘要，由应用自己的重启流程等待在途工作。随后核实新进程与安装入口。恢复时按清单还原文件并受控重启，保留运行资料。发布范围、花园登记及安装待本次确认，Git 提交和推送未执行。


## 2026-11-21 JST · 绯月手记列表空白、上传结果读回核验（发布候选）

用户看到主站日记列表、页码和日历均空白。验收要求为浏览器实际显示列表、点开正确篇次后正文及私语可见；桌宠仅在独立读回同日同篇的已写段落后清理草稿。线上截图已确认旧版问题。用户尚未确认本次发布及花园登记；第三方审核未执行。

主站目标为 myapp，候选位于 work/feiyue-handbook-release/main/myapp。基线为 Git 5fbefdaa2c6d28d181d455eac70bd9f57511205c，线上 Worker 为 56eb91b6-cd19-4442-a593-f79eafe18644。对比 src/features/companion/vendor/memory-reader.mjs 和 memory-page.mjs 与该提交，并核对它们分别等于来源 WebCharacter/personal-digital-companion/agent/host 下的同名文件。旧版序列化打包后的函数，浏览器未定义 __name，列表请求数为零。新版直接交付独立模块文本。来源工具 tools/personality-memory-preview.mjs 按生产保留函数名设置打包，tools/test-personality-reader-electron.mjs 在两种窗口大小真实点开日记，断言正文和私语。

Windows 目标为 .release-feiyue-handbook-desktop-20261120/personal-digital-companion，包含上次尚待安装的空清洗缓存修复，并加强桌宠桌面模块 desktop/personality-diary.mjs 的成功判定。提交后重新 GET 当天回执所指篇号，核对日、篇和完整段落；读回失败或缺段保留草稿及未覆盖状态，仍用原批次重试。清洗/补评保留本机状态，上传仍走已部署 API。覆盖 agent/tests/personality-memory.test.mjs 中旧空缓存、多次执行、相同提交回执但正文缺失等用例。

验证：旧主站执行 wrangler deploy --dry-run --outdir 后在独立脚本环境复现 ReferenceError: __name is not defined，首次列表请求未发出。新版同命令生成的读者脚本与浏览器验收脚本逐字一致。子项目 node tools/personality-memory-preview.mjs --visual 通过桌面、手机端列表和正文/私语及回链；发布工作树的 node tools/test-handbook-release.mjs 通过双 Worker 鉴权读路由；主站 npm.cmd test 843/843。桌宠 node --test agent/tests/personality-memory.test.mjs 15/15、node tools/test-desktop-shell.mjs 通过。线上页面新版及真实漏项补传尚未验证。

无业务数据库迁移、配置变更、历史正文改写或 API Worker 发布。正常使用时通过旧批次幂等追加漏项。风险为新旧浏览器缓存、网络读回短时不可用及本机历史首次补写耗时。恢复方式为恢复上述主站已发布版本及本机更新前文件，保留真实资料与重传草稿。获准后按已核对主站基线带 --keep-vars 发布并检查流量、绑定；桌宠先备份、核对摘要、更新文件并受控重启。生产页面由用户登录验收，并比对实际新增正文和来源，不将回包或行数代替页面验收。根据本次花园意愿处理登记并补记实际版本及 Git 同步。

本地隔离 Worker 可在来源桌宠目录设置 FEIYUE_MAIN_DIR 指向上述主站候选后运行 node tools/personality-memory-preview.mjs --serve，仅使用本机示例数据和隔离 D1，端口 8796。收到启动指令后可启动本地交互验收。

desktop/personality-diary.mjs 本机基线 f4de04fa56b6b0b04265be9aac98853a0c6650bc40fbd2db8d127a3d7d049b7f，本次候选 ead67ba129475358e31b8fcf578c132748c00c6d5acf1f5b80a6ba2648c673b6。

agent/tests/personality-memory.test.mjs 本机基线 941364320380899f197148233c5c4fc81ba644c9dbc2909d13ce97a7dfa92e0a，本次候选 351c037aa14177818d2ada5d29b9e58bcb50128245b279ed834926466b6d82bf。


2026-11-21 00:14:06 JST 本机发布完成。按用户明确指令安装自动任务汇报，六项文件摘要全部匹配。备份目录为开发树 personal-digital-companion/output/automatic-report-twnv0i81/preinstall-6dmi0lur。核对三条任务均完成且无待处理图像作业后，通过 Windows 正常关闭主窗口，等待应用完成退出处理，再按原参数启动。原 PID 14728 退出，00:13:46 JST 新主进程 PID 8908 加载正式安装目录，主窗口响应正常，桌面快捷方式与登录入口均匹配。安装后从正式目录运行 node --test agent/tests/server-image-task.test.mjs agent/tests/pending-poller.test.mjs，14/14 通过；真实新任务的弹窗待自然触发。本次仅本机更新，花园未登记，未提交或推送 Git。

用户确认更新线上旧版，并确认登记到项目 #16、功能 #61。成功时从 3.0 升至 4.0，新增已完成改善「绯月手记展示与任务补写核验」及一条发布明细，附记已安装的手动写日记和补评、联想云及自动任务汇报。失败时仅追加 #122 的实际失败情况。原改善 #62、种子均无变更。手记修复涉及主站 myapp 与本机桌宠。按 2026-11-21 修订的长期规则，花园登记免除整库快照、快照推送和远端恢复验证。仅核对目标数据，提交精确 SQL 后一次登记，并读回核验。

## 2026-11-21 JST · 本机花园 API 开发交付，待组装正式安装候选

本条记录开发结果。本次授权范围为开发，实际安装版的发布审核、部署确认及登记意愿尚待当次发布。开发仓库 HEAD 为 263ede038e4d，工作区另有既有修改。组装候选时须以快捷方式、启动项和进程共同指向的实际安装目录逐文件比较。

- 新增 desktop/garden-registration.mjs、garden-backend.mjs、local-task-pool.mjs、local-rest.mjs 与 tools/prepare-garden-registration.mjs。变更桌宠壳、任务生命周期、任务面板显示及其测试。准确清单由调用方先展示，确认后通过本机 REST 交付，先落盘再逐步执行，最终复核后保留一条任务及手记素材。旧任务库和云端接口继续使用现有格式。
- 本机资料目录将新增 local-batches.sqlite 和 local-api.token。生产数据库结构迁移、业务数据回填均无。本次开发仅操作隔离资料，未进行实际花园登记。七项专测、桌宠壳及七面板通过；启用主站源码的全量回归 261/262，既有 DeepSeek 兼容性失败见开发纪要。
- 实际安装时保留资料及队列，备份候选覆盖文件，准备实际待发布根目录的当次审核，取得本次授权后安装并受控重启。验证真实实例的说明、身份、端口和菜单，再按用户明确确认的清单给重启后的绯月提交一次。发布后补记实际版本、安装路径、重启结果、用户确认、批次编号、最终回读、全局条款切换及 Git 状态。若端口冲突或授权不可用，保留批次和用户资料；回退应用时保留数据库、令牌及 Git 登记包。
- 实际安装及第三方审核均待办；全局说明写入被自动审批暂缓至正式安装验收后。完整全局条款和恢复方式在 docs/LOCAL_GARDEN_API.md 。

2026-11-21 JST 开发候选四轮自测补记：修正已确认文本的 Windows 换行、基线读取中受控暂停、丢回执后新修订的确认续办。11 项专项、隔离桌宠壳和隐藏 Electron 七面板通过；全量 273/274，已有 DeepSeek 截断响应断言失败。详细场景与发布边界见 docs/DEVELOPMENT.md 的「绯月本机花园 API 四轮自测与合规检查」。实际安装版尚待发布验收。

### 本机花园 REST API v2 实际安装与验收

2026-11-21 02:12:37 JST，按用户本次“安装并重启，验收后给我看登记清单”完成 Windows 本机花园 REST API v2 更新。实际安装基线 Git 39fd098e40eb（独立工作树并含此前本机改动）；16 个审核文件全部核对 SHA-256，9 个原文件已备份至 G:/selftool/WebCharacter/personal-digital-companion/output/garden-local-install-1r6alefu/before 。旧进程 22068 正常退出；新进程 19548 使用原安装目录和资料目录，响应正常。127.0.0.1:8765/infoguide 返回 v2、6 条路由；未带令牌查询返回 401，认证只读列表成功且为空。测试候选的 11 项专项、桌宠壳及 Electron 七面板通过。正式环境只读验收，真实写入及用户界面目视反馈待后续。已同步 Codex/Claude 全局花园入口。

调用方完成 db:sync-schema（新增对象 0），核对花园修订 101，归属项目 #16 / 功能 #61。待确认清单 G:/selftool/WebCharacter/personal-digital-companion/output/garden-local-install-1r6alefu/reviewed-plan/registration.json ，摘要 74657155f82c5c6fdb9b8e03cae0af236f0c3fa16b6974637bb11592fe6cfe30，拟新增改善 #63、部署 #53 和明细 #123。预留批次 feiyue-local-garden-api-20261121。登记前值均为空；先建已完成改善，部署明细由现行模型算出 3.1 → 4.1。暂无入队或最终回执，待用户确认完整清单后再提交准确 SQL 至 Git、经本机 API 入队及核验。当前本次本机安装未提交或推送 Git；没有发布云端代码。

### 2026-11-21 JST · 花园 REST v3 正式安装、两轮复测与登记草案

按用户“安装并重启 v3，验收后给我看登记清单”执行。已复核候选清单全部 9 项 SHA-256。第一轮在候选目录运行 node --test agent/tests/garden-first-use.test.mjs，1/1 通过；第二轮 node --test agent/tests/local-rest-garden.test.mjs，11/11 通过，并执行 node tools/test-desktop-shell.mjs --garden-api，桌宠工作进度、完成汇报及单次归档通过。实际日志见 G:/selftool/WebCharacter/personal-digital-companion/output/garden-first-use-v3-6fe00aba 的 recheck-first-call.log、recheck-api.log、recheck-shell.log。

版本 v2 的本机队列为空。备份既有清单文件至同目录 pre-v3-backup，经正常关闭请求等待 PID 19548 退场退出后按清单安装。正式 v3 新 PID 27900，监听于 02:43:13 JST 启动，02:43:38 JST 验收完成。九项安装文件摘要匹配，正式应用目录与原资料目录、桌面快捷方式和登录项均已核对。根路径与 /infoguide 返回相同的 v3 说明及七条路由，实际制单工具和主项目路径正确；无令牌列表查询 401，有令牌只读查询 200。验收文件为同目录 v3-acceptance.json。两份纪要的本次安装后追加另行留痕。部署范围为本机 Windows，云端代码、生产数据迁移及配置变更均无。

按正式指引在主项目执行 npm.cmd run db:sync-schema，新增结构对象 0。用正式安装版只读 inspect 和 prepare 按花园修订 101 核对项目 #16、功能 #61，并准备 v3 草案 feiyue-garden-first-use-v3-20261121，完整文件在同目录 v3-reviewed-plan/registration.json。拟新增改善 #63、成功部署 #53 和明细 #123；当前功能 3.0，先确认改善再登记部署，明细版本为 3.1 → 4.1。确认摘要 a6525b674b77f1c2d4a523f2ff06d42d670da8de5e392de9fa619af1beaf0266。原 v2 草案尚未执行，两份草案用到相同预计编号，先登记任一份后须重生成并重新确认另一份。正式实例 GET 本批编号返回 404，尚未入队、无最终回读回执，待用户确认这份具体清单。安装文件及草案本轮未提交或推送 Git；准确登记包仅在具体清单确认并复核基线后提交。

### Git 子目录读取修正实际安装、首批入队与暂停

用户明确开始安装，只执行原四步，路径修正不另登记。2026-11-21 JST 从原 PID 7016 正常退出并启动 PID 4548，两个清单文件 SHA-256 符合审核，旧文件备份在 G:\selftool\WebCharacter\personal-digital-companion\output\garden-git-read-bb6cb91e\backup-cb767f2a。桌面快捷方式、登录项、8765 监听、原资料目录、v3 七路由、未鉴权 401 及正式安装代码读取 Git 的五个文件均已核对。原批次 feiyue-local-garden-v2-v3-20261121 的准确清单及四份 SQL 已在主仓库提交 9717e13f774f7266c13aec1f8e0dbe15c150c5e7，独立远端分支 codex/feiyue-local-garden-v2-v3-20261121 已核实同 SHA。本机补丁代码本轮未提交或推送。

提交前结构同步新增 0 对象，修订 101、六个前值及归属匹配。API 接受一次，HTTP 202；批次持久化后在第一步 checking 暂停，0/4，尚未发出花园写入。初次回执在 G:/selftool/WebCharacter/personal-digital-companion/output/garden-git-read-bb6cb91e/enqueue.json，暂停回执在 G:/selftool/WebCharacter/personal-digital-companion/output/garden-git-read-bb6cb91e/batch-receipt.json。使用正式 Electron 对比系统 Node 定位到 Wrangler 命令解析，须按原编号续办，保留这一条任务记录。

### 2026-11-21 JST · Wrangler 运行时修正与原批次最终回执

用户许可安装并续办，本修正不另登记。单文件备份 G:\selftool\WebCharacter\personal-digital-companion\output\garden-wrangler-node-b173a2a3\garden-backend-before-daa2f83a.mjs，原进程 4548 正常退出，新进程 2448 沿用原目录启动，安装摘要匹配，原暂停批次仍可读取。按原编号和摘要续办成功进入 applying。随后发现 Wrangler 文件导入返回成功但同时在 stdout 输出进度，旧解析器在每步把成功误判为暂停。每次只读确认对应数据库终值、归属及预期修订后，按原编号恢复，保留前步回执。四步分别在花园修订 102、103、104、105 核对成功。

2026-11-21 03:09:59 JST，feiyue-local-garden-v2-v3-20261121 整批完成。已单独核实六个线上终值、本机一条复盘、一条手记素材、临时 payload 已清理。最终回执 G:/selftool/WebCharacter/personal-digital-companion/output/garden-wrangler-node-b173a2a3/batch-receipt.json；独立核对 G:/selftool/WebCharacter/personal-digital-companion/output/garden-wrangler-node-b173a2a3/verification.json。改善 #63、#64；部署 #53、#54；明细 #123、#124。登记包 Git 提交 9717e13f774f7266c13aec1f8e0dbe15c150c5e7，对应独立远端分支已核对同 SHA。Windows 实际收到几次可见通知由系统通知设置决定；应用层多次发出暂停提示的原因已复现。两个本机修正均按用户决定不另外登记，运行时修正源码尚未提交或推送。

### 2026-11-21 JST · 成功回执解析修正实际安装验收

依照用户“安装并重启，本修正不另登记”，已核对并备份两个审核文件至 G:\selftool\WebCharacter\personal-digital-companion\output\garden-import-receipt-2e4493ea\backup-6ee3456b，PID 2448 经正常退出后由新 PID 7612 沿用正式应用和资料目录运行。2026-11-21 03:14:03 JST，安装摘要、8765 端口、v3 七条路由、鉴权、桌面快捷方式和登录项通过。真实 Electron 与 Wrangler 使用回环模拟服务，实际加载正式安装目录模块并成功解析夹带上传进度的导入回执。隔离回归 13/13，其中四步正常执行只产生一次完成通知，异常回执仍暂停。日志在 G:/selftool/WebCharacter/personal-digital-companion/output/garden-import-receipt-2e4493ea/regression.log 和 installed-probe.log。验收未重放生产登记，原四步批次在新进程仍为 done，修订回执依次为 102、103、104、105。其六项终值、一条复盘及一条手记素材已独立核验。原登记包 Git 提交 9717e13f774f7266c13aec1f8e0dbe15c150c5e7；本机成功回执修正源码本次未提交或推送，未另作花园登记，无云端应用部署。

### 2026-11-21 JST · 任务复盘倒排与详情评价正式安装验收

用户明确“安装并重启，本次不登记花园”。六个审核文件均以旧值核对并备份至 G:\selftool\WebCharacter\personal-digital-companion\output\review-order-69x6zdpc\backup-316db6e4，正常退出进程 25316，以原目录和资料启动新进程 33608。2026-11-21 03:59:08 JST 核实监听进程、桌面快捷方式、登录启动项及所有安装文件摘要。随后直接在正式安装目录用临时资料运行 Electron tools/test-memory-electron.mjs --task-reports，通过倒排、同一毫秒事件顺序、详情入口、顶部多条评价、早期素材摘要匹配、空评价隐藏、图像报告及返回。日志 G:/selftool/WebCharacter/personal-digital-companion/output/review-order-69x6zdpc/installed-ui.log。用户实际业务资料未用作测试。此次仅本机安装，按决定不生成花园批次，无云端部署；本次应用改动未提交或推送 Git。
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

### 此刻所想与长回复气泡 · 本地界面确认及安装基线核对（2026-11-21 JST）

2026-11-21 JST，用户在收到本地交互验收入口和实测结果后回复「可以」，本地界面方案已获认可。逐项手动操作结果未单独反馈。

开发与验收范围见 [此刻所想](docs/SCENE_CURIOSITY.md)。71 项相关回归、真实 Electron 窗口、本机识图及 ComfyUI 成图的验收结果沿用该记录。

本次只读核对正式安装实例，127.0.0.1:8765 监听 PID 与 infoguide 及安装命令行匹配。Windows 实例于 11:19:09 JST 启动。安装版已有本机模型路由，尚无开发版的 emotion-service、emotion-core、emotion-initiative、topic-memory 和 scene-curiosity 模块。候选依赖 emotion-service 的结构定义，桌宠接入使用当前情绪并修改主动决策的哲学偏好。独立发布须按安装版基线适配并复验；与完整人格更新合发须计入额外范围。

念叨同步涉及 informationManage/api-worker 的记忆接口，来源展示涉及 myapp 的手记阅读器。开发方案沿用既有表结构。最终候选、各目标差异、生产基线、恢复步骤与独立审核状态待正式发布审核时逐项核定。本条仅记录界面确认和范围核对，生产部署与本机安装许可待取得。

## 2026-11-21 JST · 菜单与弹窗统一整理（本机安装发布前审核）

### 原始要求与验收

用户要求整理桌宠菜单及其弹出窗口：风格统一、美观、查看方便、加载压力小；平时只看最新几条记录；节点动画设置窗口功能未定型，暂不改动。之后追加“其他界面呢”“菜单呢”“全部处理了再给我看”，并要求提交界面开发说明。用户已看过开发区预览（output/menu-qa/index.html），本次要求“准备安装审核”。

验收口径：
- 右键菜单（角色右键、托盘右键）以统一样式显示，原有动作、勾选和显示条件不变。
- 本地复盘、任务管理、今日任务、三地天气、轮询设定、随口登记、询问与确认、消息框、问绯月气泡共用一套令牌和组件，浅深色一致。
- 记录由新到旧并分页：对话、任务复盘每页 6 条；提醒检查、提醒每页 8 条；任务日志每页 12 条。
- 节点配置页 settings.html、sound-settings.html 不改动。

### 目标与基线

- **安装版**：G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。
- **入口核对**（2026-11-21 JST）：运行中主进程 PID 28952（11:19 启动）、桌面快捷方式「绯月桌宠.lnk」、登录启动项「绯月桌面精灵」均指向该目录，Electron 程序共用开发区 desktop/node_modules/electron。
- **安装树基线**：Git 39fd098，另有历次安装修订。
- **差异来源**：开发区 G:/selftool/WebCharacter/personal-digital-companion 还有大量尚未发布的改动（情绪服务、此刻所想、专题记忆、气泡「查看来源」「展开全文」等）。所以候选**不直接复制开发区文件**，而是以安装版文件为基线组装。组装脚本为 G:/selftool/WebCharacter/work/feiyue-ui-20261121/make-candidate.py。
  - 24 个整文件替换：逐个核对，安装版与本次改动前的内容一致（仅换行符不同），安装版与开发区之间的差异只有本次改动。
  - 4 个混合文件只打入本次改动块：shell.mjs、source-updates.mjs、screen-question.html、screen-question.css。逐行 diff 已核对没有夹带未发布功能。
  - 5 个新文件：menu-popup.mjs、menu.html、menu.css、menu-ui.mjs、menu-preload.cjs。
  - 统一 LF 换行。
- **候选与清单**：候选在 G:/selftool/WebCharacter/work/feiyue-ui-20261121/candidate/desktop。清单 desktop-files.json 共 33 项，含安装前与候选 SHA-256。
- **不在本次范围**：此刻所想（scene.*）只存在于开发区，安装版没有这个功能，本次不发布。说明文档、开发区测试改动不进入安装目录。

### 逐项文件与行为

- **菜单**：
  - menu-layout.json 调整结构：今日任务、三地天气、本地复盘提到第一层；「特殊菜单」改名「日记与评价」；条目新增 icon、tone 字段。
  - menu-layout.mjs 校验 icon、tone 字段，并把它们传给自绘菜单。
  - shell.mjs 新增 openMenu：在 Windows 上使用自绘菜单，打不开时退回原生菜单；暂停提示文字同步改为「日记与评价」。
  - main.mjs 传 htmlMenu:true。
  - 新增 menu-popup.mjs 及配套 menu.* 页面，source-updates.mjs 登记 menu.html。
- **面板**：
  - feiyue-surface.css 新增状态色令牌和 .fy-panel 组件。
  - conversation.*、task-inbox.*、reminder-review.*、weather.*、poll-settings.*、registration*.html、registration.css 改用这些组件。
- **气泡与消息框**：
  - screen-question.css：色板改为统一令牌的别名，按钮和发送样式统一，动效始终开启且只做透明度动画。
  - screen-question.html：两个工具按钮加图标。
  - message-box.css：入场动画改为只做透明度，始终开启。
- **分页**：
  - reminder-checks.mjs 的检查记录和提醒每页由 20 条改为 8 条。
  - task-traffic-log.mjs 的任务日志每页由 40 行改为 12 行。
  - conversation-ui.mjs 改用 ‹ › 翻页，对话和任务复盘只为当前页建 DOM。

### 数据与配置影响

无数据库结构变更，不迁移或改写用户资料，不新增配置或密钥。分页只改变读取条数，SQL 条件和排序不变。本机 REST、端口 8765、令牌、云端接口均不变。花园登记尚未决定，见最后一节。

### 实际验证（候选树，临时资料）

先把安装树复制到 G:/selftool/WebCharacter/work/feiyue-ui-20261121/tree（不含 output 和 .git），再覆盖候选文件，并执行 node tools/build-desktop.mjs。所有测试都在这个候选树里运行，没有读写用户资料。树内测试按菜单路径和分页条数作了同步调整：标题栏、问答、桌宠壳、提醒检查、日志分页、菜单指引；另加入两个菜单测试和截图工具。

- **Node 单元测试**：候选 255 项通过、9 项失败。未改动的安装树副本（G:/selftool/WebCharacter/work/feiyue-ui-20261121/baseline）跑出相同的 9 项失败，属既有问题，原因是安装树内测试与安装代码不同步。baseline 另有 desktop-quit 一项失败，是因为复制时没带 assets，不计入。
- **其余 Node 测试**：node tools/test-reminder-checks.mjs 通过；node tools/test-desktop-shell.mjs 通过，原生菜单路径、新菜单标签、日记入口和自启动勾选都已覆盖。
- **Electron 测试**：test-panel-titlebar、test-screen-question、test-message-box、test-menu-popup（展开、点击原动作、勾选、Esc，浅深色截图）、test-menu-shell（角色和托盘右键打开自绘菜单并执行原动作）全部通过。日志在 G:/selftool/WebCharacter/work/feiyue-ui-20261121/logs。
- **截图巡检**：浅色和深色都已完成，输出到 tree/output/menu-qa（不含此刻所想）。
- **开发区**：全量回归 313 项通过。开发区的 test-desktop-shell 在「手动写日记立即显示进度」失败，test-live-updates 在动画热替换失败，换回旧菜单后复测结果相同，与本次改动无关。

### 风险与恢复

- **自绘菜单失效**：如果菜单窗口打不开，会自动退回原生菜单；仍有问题可恢复 shell.mjs 和 main.mjs。
- **在途任务**：安装前须正常退出桌宠，并等待在途任务结束。复制文件时桌宠必须已停止，否则文件监听会热加载半套文件。
- **恢复步骤**：
  1. 桌宠正常退出。
  2. 用备份目录覆盖回 28 个原文件。
  3. 删除 5 个新文件。
  4. 从桌面快捷方式启动。
  5. 核对 PID、目录和菜单。

  启动时 bundle 会按源码自动重建，无需另行处理。

### 部署与发布后验证（待授权后执行）

1. 记录当前 PID，在桌宠空闲时用菜单「退出」或受控重启使其正常退出，确认进程结束。
2. 按 desktop-files.json 核对安装版 28 个文件的旧摘要，备份到 G:/selftool/WebCharacter/work/feiyue-ui-20261121/backup-<时间>。
3. 复制 33 个候选文件，逐项核对新摘要。
4. 从桌面快捷方式启动，核对新 PID、应用目录、资料目录、登录项及 127.0.0.1:8765/infoguide。
5. 在正式实例上核对：角色右键和托盘右键打开自绘菜单；今日任务、本地复盘可从第一层打开；复盘翻页正常；面板浅深色正常；节点配置页不变。外观以用户目视为准。
6. 在本文件和开发纪要追加实际时间、PID、摘要核对和备份路径。

### 用户确认与第三方审核

- 本审核由 Claude 在开发会话中准备，第三方独立审核未执行。
- 部署确认：待用户确认安装并重启正式桌宠。
- 花园登记意愿：待用户决定是否登记本次界面整理，登记时归属「网页角色组件 → 绯月（桌面精灵）」。
- Git：开发区和安装树的本次改动均未提交或推送。

### 2026-11-21 JST · 菜单与弹窗统一整理 · 正式安装验收

**授权**：用户明确指示“安装”，并要求花园登记交给绯月本机 REST 代办，规则以 infoguide 为准。

**安装前核对**：
- 8765 端口由 PID 28952 监听（11:19 启动）。命令行、应用目录、资料目录与 infoguide 的 instance 一致。
- 本机批次全部为 done。
- 28 个待替换文件的旧 SHA-256 与审核清单一致，已备份到 G:/selftool/WebCharacter/work/feiyue-ui-20261121/backup-125310。

**安装**：
- 对主窗口发送正常关闭请求，桌宠走自己的退出流程，PID 28952 退出，端口释放，安装目录下没有残留进程。
- 停机状态下复制 33 个候选文件，安装后的 SHA-256 全部与清单一致。

**启动验收**：
- 12:53:38 JST 从桌面快捷方式启动，新 PID 17472，4 秒后开始监听 8765。命令行仍指向原应用目录。
- /infoguide 为 v3，7 条路由，instance.profile 仍是原资料目录。未鉴权的批次查询返回 401。
- 启动时按新页面清单重建了 bundle：menu.html、menu.css、menu-ui.mjs、feiyue-surface.css、conversation-ui.mjs 与源码逐字节一致。
- 当天任务通信日志中，重启后没有菜单或热加载告警，本地模型在 vulkan 上就绪。

**待用户目视确认**：右键菜单和各面板在正式实例上的外观与交互（自动化无法驱动托盘右键）。

**花园登记**：
- 已按 infoguide 执行 db:sync-schema，新增 0 个对象；inspect 基线修订号为 115。
- 唯一匹配到项目 #16 网页角色组件、功能 #61 绯月（桌面精灵），当前版本 8.3，此前无本批记录。
- 草案批次 feiyue-ui-20261121，reviewHash 7d2350bd096c1829e55cf27067f7a7ed08874249b0155d1961faebfca4c7b5fd。
- 草案内容：新增改善 #69（done）；新增部署 #59 及明细 #130，版本 8.4 → 9.1。
- 草案留在调用方临时目录，尚未提交 Git，也未入队，等用户确认具体清单。

**Git**：安装改动未提交或推送。

### 2026-11-21 JST · feiyue-ui-20261121 花园登记已交给绯月

用户确认清单后执行。复核花园基线仍为修订 115。登记包 registration.json、step-001.sql、step-002.sql 原样提交到主站仓库本地 main：11edddd3a507b7055673857b50a458fbec2cc622，只含 database/changes/feiyue-ui-20261121。主站 main 本地比 origin/main 领先 12 个其他提交，本次未推送，留待用户决定。

13:00:09 JST 核对 8765 仍由 PID 17472 监听后 POST /v1/batches，HTTP 202 已持久入队。入队回执在 G:/selftool/WebCharacter/work/feiyue-ui-20261121/enqueue.json。按用户指示不再等待 done：最后一次查询时，第 1 步改善在修订 116 核对通过，第 2 步部署及明细在修订 117 核对通过，整批处于 verifying，finished 为空。最终回执请以 GET /v1/batches/feiyue-ui-20261121 为准。

## 2026-11-21 JST · 正式工作队列（本机安装发布前审核）

### 原始要求与验收

用户要求区分正式任务（不打断，可加入待处理队列，本地上限 20）和闲时自发工作（可打断），调用方不必等绯月完成即可入队，完成后的通信与结果确认由调用方解决，并更新 infoguide 说明。

用户在会话中的确认：
- 写日记、评价、各路轮询不算正式工作；用户的登记算；问答、生图不算。
- 云端派给本机的任务算，有空位就接，进入本地待处理逐个执行，不等空闲。
- 只改本地，服务器每台电脑最多 2 个已接取任务的规则不变。
- 接受设计中的两项建议：开始工作模式下照常执行；暂停的批次占名额。

需求与设计见 docs/FORMAL_WORK_QUEUE.md，三轮自审见 docs/reviews/FORMAL_QUEUE_DESIGN_REVIEW_2026-11-21.md。

验收口径：
- 正式工作合计最多 20 项，满员时接口返回 429；按到达顺序逐个执行，不被打断。
- 正式工作开工时，闲时整理暂停并在之后续做；问答、生图、轮询不阻挡正式工作。
- 任务轮询有空位就接，结果未知时不接。
- infoguide v4 提供排队信息（queue）、待回执清单（unacknowledged）与取回确认（ack）。
- 任务管理窗口显示「排队 #n」，思考云标出「正式」或「闲时」。

### 目标与基线

- 安装版为 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion，正在运行的是 12:53 菜单整理那次安装后的实例 PID 17472。
- 候选仍以安装版为基线组装（G:/selftool/WebCharacter/work/feiyue-queue-20261121/make-candidate.py），共 8 个文件：
  - 整文件替换：garden-guide.mjs、local-rest.mjs、task-lifecycle.mjs、task-inbox-ui.mjs、docs/LOCAL_GARDEN_API.md。逐行核对过，与安装版的差异只有本次改动。
  - 只打入本次改动：local-task-pool.mjs，排除了开发区里他人未发布的一行「绯月本机更新已核验」；shell.mjs，只含 5 处本次改动块。
  - 新增：docs/FORMAL_WORK_QUEUE.md。
- 清单为 desktop-files.json，含安装前与候选的 SHA-256。
- 开发区里他人的在制功能（绯月环球之旅、情绪、此刻所想等）不在本次范围。

### 数据与配置影响

- 本机 local-batches.sqlite 的 batches 表补一列 acknowledged（ALTER TABLE ADD COLUMN），历史批次一律填为已取回。
- 旧代码读这个库时会忽略新增列，回退不需要删列。
- 不改任务数据库结构、用户资料、云端接口和配置；令牌和端口不变。

### 实际验证（候选树，临时资料）

- **单元测试**：
  - 候选树 G:/selftool/WebCharacter/work/feiyue-queue-20261121/tree 是安装树副本加候选文件。树内测试按本次行为同步更新：本机接口测试换为开发区版本；生图汇报、失败恢复测试只含本次改动；轮询测试只打入本次的两处修改；桌宠壳测试按已安装菜单和本次标题更新。
  - 候选树 262 项通过、10 项失败。未改动的安装副本 baseline 为 257 项通过、12 项失败；候选树没有任何新增失败。其中 10 项两边相同，属于安装树内既有的测试与代码不同步；另 2 项只在 baseline 失败。
- **桌宠壳**：`tools/test-desktop-shell.mjs` 普通模式与 `--garden-api` 模式都通过。后者核对了入队回执的 queue（position 1、limit 20、used 1）、「正式 · 」思考云标题、完成汇报和归档。
- **Electron**：
  - test-panel-titlebar 通过，包括任务管理双页签、领取回执、七个面板。树内该测试按菜单整理那次发布同步了 menu.html 豁免和日志翻页。
  - test-menu-shell 通过。
  - 日志在 G:/selftool/WebCharacter/work/feiyue-queue-20261121/logs。
- **开发区**：全量回归 327 项通过。test-screen-question-electron 失败，断言的是他人在制的「绯月环球之旅」选项，与本次无关。

### 风险与恢复

- **执行顺序**：自动接取改为领取后即返回，执行在本机串行进行；两个已接取任务不再同时执行。
- **单个任务耗时**：一项正式工作执行很久时，后面的会持续排队。这是需求本意，任务管理里可以看到排队序号。
- **安装前提**：安装前确认本机没有在途批次和已接取未结束的任务。在途批次的状态和 SQL 会保留，新版启动后按原编号续办。
- **恢复步骤**：
  1. 正常退出桌宠。
  2. 用备份覆盖回 7 个原文件，删除新增的 docs/FORMAL_WORK_QUEUE.md。
  3. 从快捷方式启动。

  acknowledged 列可以留着。

### 部署与发布后验证（待授权后执行）

1. 确认实例和在途工作。
2. 核对 7 个文件的旧摘要并备份。
3. 让桌宠正常退出，复制 8 个文件，核对新摘要。
4. 从快捷方式启动，核对 PID、目录、资料目录。
5. 核对 /infoguide：v4、8 条路由、workStates 齐全。
6. 核对认证后 GET ?unacknowledged=1：历史批次不出现。
7. 按编号读回 feiyue-ui-20261121 的最终回执，补记到上一节。
8. 在开发纪要和本文件追加实际结果。

### 用户确认与第三方审核

- 本审核由 Claude 在开发会话中准备，第三方独立审核未执行。
- 部署确认：待用户确认。
- 花园登记：按用户此前的要求经绯月本机 REST 代办，安装验收后先展示清单，再取得确认。
- Git：开发区、安装树、主站仓库的本次改动均未提交。

### 2026-11-21 JST · 正式工作队列 · 正式安装验收

用户明确指示“Install and restart”。

**安装前**：
- 8765 端口已由 PID 35452 监听（13:25:52 启动）：另一会话在 13:25 前后安装了「autonomous idle audit」更新，并登记了 feiyue-idle-audit-20261121。
- 本次 8 个文件的旧 SHA-256 仍与审核清单一致：候选是在那次安装之后组装的，shell.mjs 等文件的基线已含对方的改动。
- 本机批次全部为 done，本机任务全部为 COMPLETED。
- 7 个原文件已备份到 G:/selftool/WebCharacter/work/feiyue-queue-20261121/backup-134247。

**安装**：正常关闭 PID 35452，确认端口释放、安装目录无残留进程后，复制 8 个文件，安装后摘要全部一致。

**启动验收**：
- 13:43:18 JST 从桌面快捷方式启动，新 PID 36344，命令行仍指向原应用目录。
- infoguide 为 v4，8 条路由，workStates 齐全，instance.profile 仍是原资料目录；未鉴权访问返回 401。
- GET ?unacknowledged=1 为空，说明历史批次补列后视为已取回。
- 启动后任务轮询立即执行完毕，本地模型在 vulkan 上就绪，日志无错误。

**上一批回执补记**：feiyue-ui-20261121 为 done。finished 2026-11-21T04:07:06.398Z（13:07:06 JST），两步分别在修订 116、117 核对通过，reviewHash 与提交 11edddd3a507b7055673857b50a458fbec2cc622 一致。最终回执保存在 G:/selftool/WebCharacter/work/feiyue-ui-20261121/batch-receipt-final.json。

**花园登记**：待展示清单并取得用户确认。

### 2026-11-21 JST · feiyue-formal-queue-20261121 已入队待回执

- **确认与基线**：用户确认清单（Confirm and submit）。复核时花园基线仍为修订 119。
- **登记包**：registration.json 与 step-001.sql、step-002.sql 原样提交到主站仓库本地 main：e04060d657fb8d5b43152d688299bd26bbd1af55，只含 database/changes/feiyue-formal-queue-20261121。未推送。
- **入队**：核对 8765 仍由 PID 36344 监听后 POST /v1/batches，返回 HTTP 202，回执 queue 为 {position:1, used:1, limit:20, running:null}。入队回执在 G:/selftool/WebCharacter/work/feiyue-queue-20261121/enqueue.json。
- **待回执**：按 v4 流程不等待 done。下次开工时 GET /v1/batches?unacknowledged=1，核对步骤、finished 和摘要后补记到这里，再 POST /v1/batches/feiyue-formal-queue-20261121/ack。

## 2026-11-21 JST · 自动手记质问五小时上限（本机发布前审核）

### 需求及验收

用户要求「如果有这个可能，那么强制5小时只能质疑一次，开始了就算，不管有没有生成实质性结果」，随后指定两轮自检通过后准备更新并提交对应代码。正式资料库只读记录显示，同一个 14:11:48 JST 到期的质问在 14:18:49、14:20:04、14:20:34 JST 实际启动。旧调度会把执行中返回推延的动作重新入队，每 15 秒检查能否重试，共享闲置时限到达时本轮停止。

五小时从每次自动行动开始滚动计算。未开工的忙碌等待可以排队。开工后的推延、失败、超时及无疑点都消耗本次机会。重启、关闭再启用及自动提前入队不突破上限。用户主动续答仍可从「待确认」进入，原来的引文、主篇和追问规则沿用。

### 目标、基线及文件

- 目标是 Windows 正式安装树 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。准备期间确认 Electron 主进程 16092 使用该树，Git 基线 `39fd098`，核对实际文件摘要。开发来源为 WebCharacter 本子项目，比较基线 `146191a2c799c584282c4f81e53a9661fd9af84a`。无其他来源项目及 Worker 发布。
- `desktop/poll-scheduler.mjs` 在自动行动开始前持久化下次最早启动时间并消耗当前队列项。开始后返回推延仍记录进度，按五小时调度。恢复、启停与队列入口检查同一时间。正式版候选通过三方合并保留已装版的轮询项目和初始化逻辑。正式版原 SHA-256 为 `4632bdac74cb1aa0a13316b723fedcd43c74ffd9f1c6df43cda6301426dfcb16`，候选为 `c3009f752d198e26c97cc738114fa74731b0bd618c5ec8151c0f8afeb545ea78`。
- `desktop/poll-settings-ui.mjs` 将手记质问显示为固定 300 分钟，保留启停。正式版原 SHA-256 为 `0dec6d98a7f95c3de13547d76eb4ae166008b90607aef70a3965645660a24245`，候选为 `e0c8216eccd7dce715c1c450ad3ac2c36583e6da6aa2a0589c4fbd1cd267251a`。
- `tools/test-poll-settings.mjs`、`tools/test-panel-titlebar-electron.mjs` 与需求、开发、审核三份文档留在源码仓库。更新包位于 `output/diary-audit-cooldown-20261121/`，用 `manifest.json` 与 `baseline/desktop`、`candidate/desktop` 比较。所有从正式版复制的支持文件摘要一致。安装只取清单中的两个运行文件。

### 数据、配置与风险

无数据库迁移、历史回填、外部配置变化及云端数据影响。复用本机 `reminder-checks.sqlite` 中的 `idle_poll_resume` 和 `local_polls`。已有手记质问间隔读为 300 分钟，保留启停及现存的最早恢复时刻。旧行动日志保留原样。旧版本在收到推延前已经开始的记录无法统一从检查状态分辨，本次从候选首次实际开工开始持久化上限。

安装前复核目标、登录入口、进程、资料目录、空闲状态、两份原摘要与候选摘要，备份原运行文件并记录手记质问对应的间隔与最早恢复时刻。若发布失败，保留真实回执并在进程退出后恢复两个原文件。若确需取消新规则留下的本机调度数据，核对当前值后只恢复 `diaryAudit` 对应的间隔与最早恢复时刻，保留期间新增的行动、手记及回答。

### 两轮自检

1. 开发树对照原始要求、历史的一小时提醒和本次五小时决定，确认变动覆盖自动入口与自动重试，手动续答沿用现有入口。运行 `node --test tools/test-poll-settings.mjs agent/tests/autonomous-idle.test.mjs agent/tests/diary-audit.test.mjs agent/tests/personality-memory.test.mjs agent/tests/screen-question-host.test.mjs`，53/53。运行 `node tools/build-desktop.mjs` 及 `desktop/node_modules/electron/dist/electron.exe tools/test-panel-titlebar-electron.mjs`，构建及七面板巡检通过。巡检中故意送入错误标题栏配置触发原有警告，随后恢复通过。
2. 正式基线和候选分别运行 `node --test output/diary-audit-cooldown-20261121/{baseline,candidate}/tools/test-poll-settings.mjs`（按两个路径分别执行）。基线 5/8，三个新场景预期未通过；候选 8/8。使用正式版 Electron 运行 `output/diary-audit-cooldown-20261121/candidate/tools/test-installed-panel.mjs`，实际轮询设置窗口验证固定 300 分钟、启停和其他轮询编辑通过。比对实际候选仅包含两个运行文件。重点复核已启动条件、超时后最早时间、重启、队列、手动续答，以及正式版保留的轮询项目。两轮均以临时资料执行，未发现本次范围内残留问题。

### 发布、核验和确认

用户已授权快速通道准备及提交对应代码。本次正式安装、花园登记意愿及具体清单待明确确认，第三方独立审核未执行。获准后先核验清单并备份，调用应用受控重启流程等待在途任务，再安装两份文件及核对摘要，从原入口启动。核实新进程、快捷方式、登录项和资料目录一致，核验本机 REST 就绪及轮询页面显示 300 分钟；首次真实质问后，从本地任务日志及轮询状态检查开始时间及五小时窗口。正式安装、正式版现场验证、实际运行时间与 Git 远端同步均待执行。安装结束后另记真实结果与 Git 状态；花园仅按另行确认的清单执行。

上述候选已按用户后续纠正撤回，从未安装。新范围及安装清单见下一节。

## 2026-11-21 JST · 手记质问按对象计时（本机发布前审核）

### 需求与验收

用户纠正「对同一个对象（不管具体是什么记录）5小时只能最多质问和检查一次，启动了就算检查过了。允许中断后继续查询，但是时长不能超过3分钟。3分钟到了就算是强制查询和质询阶段结束。」继续按用户指定的快速通道准备及提交对应代码。验收以单对象为单位，同一篇修改、无结果、出错或超时均沿用开始时的占用，其他未检查对象继续按正常轮询进入。查询和质询共用从首次启动起的连续三分钟，中断和重启不延长截止时间。到期取消进行中的查询与追问，保存已落盘回答并收起质询操作。已实际引用过的篇目继续沿用原有去重约定。

### 目标、基线与逐项范围

- 目标为 Windows 正式安装树 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，基线 Git `39fd098` 并含此前正式安装更新，以实际五个文件 SHA-256 为准。开发基线 `5b675b5`，来源为 WebCharacter 本子项目。对开发改动与安装原文件三方合并，核对候选与原文件差异。候选见 `output/diary-audit-object-20261121/`，比较 `baseline/desktop` 与 `candidate/desktop`，正式安装只取 `manifest.json` 中五个文件。
- `desktop/diary-audit.mjs` 在首次分析实际篇目时落盘开始时刻，按篇号判断五小时资格，保存已完成的推理阶段结果供同轮续查。截止时终止迟到查询与追问，关闭待续状态。保留正式安装基线现有的文字回答长度限制。
- `desktop/personality-diary.mjs` 复用本机资料库，自动建单行状态表，下发取消信号后阻止读取链继续或写入迟到结果。同步沿用正式版原接口。
- `desktop/personality-nags.mjs` 与 `desktop/shell.mjs` 将手记质问的中断重试接回既有轮询队列，重启时只续有剩余时间的轮次。正式版候选保留原有普通念叨接口。
- `desktop/screen-question-host.mjs` 收到截止信号后撤下质询操作并显示结束提示。开发树的 `desktop/poll-scheduler.mjs`、`desktop/poll-settings-ui.mjs` 及两份对应测试撤回前一候选的全局限制。正式版仍是原可配置轮询，安装清单不包含这两份运行文件。
- `agent/tests/diary-audit.test.mjs` 和需求、开发及审核文档随源码提交，仅用于验证及留痕。无其他来源项目。

### 数据、配置及兼容

本机 `personality-memory.sqlite` 自动创建 `diary_audit_state`，保存实际篇号开始时刻及当前轮次检查进度。无生产数据库迁移、历史回填、Worker 部署、配置或云端字段变更。现有手记、念叨、原有设置和资料目录沿用。旧待续质问首次恢复时按其已有创建时刻判定三分钟是否已满，超时写现有结束状态。首次上线之前的无结果检查历史无可靠对象时间，五小时记录从新版本开始。回退时退出旧进程并恢复五个原文件，保留已写手记、历史及新状态表。旧程序可忽略该表。如验证发现跨期恢复或迟到回写，保留日志和本机资料备份，核对轮次与按篇开始记录后决定补偿。

### 两轮自检

1. 开发树执行 `node --test agent/tests/diary-audit.test.mjs tools/test-poll-settings.mjs agent/tests/autonomous-idle.test.mjs agent/tests/personality-memory.test.mjs agent/tests/screen-question-host.test.mjs`，54/54 通过。对照用户最终决定核对同篇修改、其他篇可查、精确五小时边界、重启续查、三分钟硬结束、回答留存和原轮询设置。
2. 将基线、候选分别用 `node --test --test-name-pattern` 运行更新包内各自的 `agent/tests/diary-audit.test.mjs`。基线新增篇号回归 0/1，复现旧篇和新篇一起被重复送入比较。候选专项 7/7，覆盖断点续查、异篇、硬截止、已落盘回答和既有短文续答。依赖开发区当前支持质问的 Worker 作为隔离测试服务，正式安装目录携带的历史 Worker 文件不支持该接口，仅更换了测试夹具。使用 Electron 执行候选的 `test-expiry-electron.mjs`，实际隐藏气泡在截止信号后撤下质询按钮并显示结束提示。测试资料均为临时数据，未执行正式安装及真实模型计时验收。

### 发布与确认

用户已授权两轮自检、准备和本地提交对应代码。正式安装及花园登记意愿和具体清单待确认，第三方独立审核未执行。获准后核对当前实例、资料根、空闲状态和清单摘要，保留五个文件及本机资料的回退备份，在应用正常退出后安装，原入口启动。启动后核对新进程和五份摘要、本机 REST 就绪、轮询设定仍可编辑。用首次真实质问的本机日志和气泡确认五小时按对象与三分钟终止，追加正式版本、时间、验证和 Git 状态。用户同意的花园登记按真实结果另行执行。

### 2026-11-21 JST · 手记质问按对象计时安装验收

用户明确授权安装，并选择登记花园、先看具体清单。按源码本地提交 `39b54f9` 及五文件清单安装。旧进程 16092 正常退出，14:52:21 JST 从原桌面快捷方式启动新进程 13840，14:52:22 JST 核对完成。新进程使用同一应用目录、资料目录及登录入口，127.0.0.1:8765 的 `/infoguide` 返回 v4。五个文件的实际摘要与候选一致，本机 `diary_audit_state` 已创建，原有 10 个花园批次均保留。

安装后对五个正式文件执行 `node --check`，并以同一 Electron、实际安装版宿主与渲染资源、隔离资料执行 `test-installed-expiry.mjs` 和 `test-installed-poll-settings.mjs`。质询按钮到期撤下并显示结束提示，轮询间隔可编辑和保存。首次自然触发的实机质询待观察。原文件、原审核记录及一致性 SQLite 备份在 `output/diary-audit-object-20261121/install-backup-20261121-145211/`，结构化验收和两份 Electron 日志在同一更新包。无 Worker 部署和生产数据库迁移。

花园线上结构同步通过，读取基线修订 128，核实「网页角色组件」#16 及「绯月（桌面精灵）」#61。候选批次 `feiyue-diary-audit-object-20261121` 拟新增已修复缺陷 #27，版本 `15.3 → 15.4`。拟新增成功部署 #66 和明细 #137，版本 `15.4 → 16.1`，部署时间为 14:52:21 JST。清单在 `output/diary-audit-object-20261121/garden-draft/registration.json`，摘要 `9d4dc42c2f2134854fdc2608436859b4daf8308c979b9ca70d68d1f8b523fdf2`。待用户确认具体清单，SQL 草案留在调用方，尚未提交到主站 Git 或绯月 API，未写入生产花园。
