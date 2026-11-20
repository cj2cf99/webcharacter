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
