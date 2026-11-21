### TXT 发布源码 Git 核验（2026-11-21 JST）

已从远端逐项回读：cloudflaremyapp/main 876dccba、informationmanager/main f5bebc0b、webcharacter/main b3269f90，桌宠正式安装同步分支 19d1a8d3；日记来源 b92f7ff、随手记 main 155b17e、鱼与熊掌 main cbd9f83。主站 main 含与本机 REST 所验提交 eb1955e 逐文件相同的 SQL 和清单。主站原日常工作目录另有未提交修改及非本次分支冲突，生产源码从独立发布工作树整合。Git 核验涉及上述实际推送的版本，无强制推送。

## TXT 附件正式发布与登记回执 · 2026-11-21 JST

三个目标均发布成功。用户明确许可本次备份、迁移、两个 Worker 部署及七文件本机安装，并选择跳过本地手动验收。最终花园修订 130 的实际编号和版本已经再次明确确认。

- stockanalysis 加密备份 d124f926cfba223a6ba89b113e3ae11b46971f3b，独立远端恢复 117/117，integrity ok，外键异常 0。仅应用 0033_txt_record_files.sql，生产后检确认六列、一条迁移账本项。历史待迁移项 0021、0028 与本次无关，未执行。
- subscriptions-api 于 2026-11-21 14:56:38 JST 切至 433cac21-d356-41f0-8fd2-f2264a37da29，myapp 于 2026-11-21 14:56:52 JST 切至 6c2f851f-4541-4695-86e4-5be83a680b71。均为单版本 100%，分别核对 14 和 42 个绑定，差异均为 0。无新增桶或生产配置。
- 绯月在 2026-11-21 15:02:18 JST 完成安装，旧 PID 13840 正常退出，新 PID 19436 和同一资料目录经 REST v4 核实。七文件清单实测一致，留存 11 个已有批次。正式路径的七项 TXT 专项和两项 Electron 交互通过。新安装基线全量 261 通过、20 失败、2 跳过，候选 268 通过，失败与跳过集合相同。WebCharacter 新 main 沿用测试夹具、由云端仓库管理服务实现，基线 263 通过、1 失败、2 跳过，合并后 270 通过、1 失败、2 跳过。主站 843/843，配套 API 41/41。线上 Access 界面待用户截图确认。
- 花园部署 #67，明细 #138–141，改善 #73–76。绯月 16.1 → 17.0。批次 txt-attachments-release-20261121 于 2026-11-21 15:09:26 JST 完成，五步均 verified，已 ack，线上回读修订 135。清单和五份 SQL 先提交，REST 按提交 eb1955e65e0945ab75110c1ffb92ae1728eca3c6 核对；主站发布分支包含字节一致的登记包。变更包和回执见主站 database/changes/txt-attachments-release-20261121 与 database/changes/txt-attachments-20261121。


### 安装前重新对齐 14:52 JST 正式基线

正式安装于 14:52:21 因另一项已发布的手记质问计时更新重启，PID 13840；五个同名文件发生变化。按新安装基线重整原七文件清单，保留按对象计时、中止信号、状态恢复和 UI。更新的七份摘要见 docs/releases/txt-attachments-20261121/desktop-manifest.json。相同条件全量检查：新基线 261 通过、20 失败、2 跳过；候选 268 通过、20 失败、2 跳过。失败集合相同，新增七项全过。候选装载正式版渲染资源，两条真实 Electron 到期和轮询设置专项通过。已取得本次生产部署、七文件安装及修订 128 登记清单的明确确认。

## 2026-11-21 五类记录 TXT 附件 · 绯月 Windows 正式安装版

用户要求五个既有入口支持明确选择的真实 TXT，编码限 UTF-8 或带 BOM 的 UTF-16。绯月日记、唠叨内超过 500 个 Unicode 码点的连续片段按同一记录汇总全段，仅遮蔽凭据命中处。引用采用前 200 字、约 200 字事实摘要、具名文件链接。自动合并后的实际文件大于 1,048,576 字节应完整留本机，按原工作收笔后报告。手选同一文件允许超限。无历史回填。

原始需求及修订见 cloudflaremyapp 的 diary-attachments-source 来源项目 REQUIREMENTS.md、docs/DESIGN.md 与 docs/reviews/TXT_DEVELOPMENT_REVIEW_2026-11-21.md。日记来源提交 b92f7ff，随手记 155b17e，鱼与熊掌 cbd9f83（含已有回执接线），绯月附件来源固定比对 WebCharacter 0518e28。开发复核最后连续两轮无新问题。五类页面和数据分别按既有记录归属处理。

基线为远端正式安装同步分支 codex/feiyue-installed-sync-20261121，59b3e438。用 git diff 59b3e438 -- personal-digital-companion 对照。本机目录 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion，当前安装回执 2026-11-21 14:10:49 JST，准备时本机 REST /infoguide 的 PID 为 16092，资料目录位于该安装的 output/desktop-profile。发布时再次核实运行进程与资料目录。

桌宠安装清单见 docs/releases/txt-attachments-20261121/desktop-manifest.json。七个 desktop 文件含 long-originals.mjs、personality-diary.mjs、diary-sources.mjs、personality-nags.mjs、diary-audit.mjs、screen-question-host.mjs、shell.mjs。逐文件列出旧版和候选的 SHA-256。超长文字先摘录、按记录汇总和校验全文哈希；超过自动上限的原件保存在本机记录目录“异常附件”，工作完成后提示。安装沿用正式版本的提示词、互动流程和任务队列。配套 Worker 来源及测试随 Git 保存；其部署单独执行。本机现有正式版不包含开发版“此刻所想”功能，本次不安装该项独立功能。SQLite 本机业务缓存新增原文索引与报告记录；无需手动迁移。已存日记、模型、技能、令牌和本机资料继续使用原路径。

隔离安装基线与候选分别运行 node --disable-warning=ExperimentalWarning --test agent/tests/*.test.mjs：基线 264 通过、17 失败、2 跳过；候选 271 通过、17 失败、2 跳过。失败用例名称完全相同，涵盖 GPU 选档及超时、退出、图像与日志等，详情见同目录 baseline-failures.txt。7 项新增附件测试通过。另在五处原生文件选择框实际上传及重开通过。发布源码中曾误接入其它分支的质问取消信号，已按安装版签名修复并重新运行。接近 1 MiB 非重复素材的真实推理耗时未测。重点复核凭据局部遮盖、整份大小、本机唯一副本与报告时机。

生产许可后先复核清单旧哈希；等待正式任务收尾，正常退出，备份被替换文件，原子替换、受控启动，再次核实实际加载文件、PID、启动时间和 REST 资料目录。用隔离材料复核安装路径加载结果，不向真实私人日记写测试内容。失败时恢复旧文件及启动方式，保留本机资料和异常附件。实际安装结果与回执补记后同步 Git。

本地隔离验收工作目录为 `C:\Users\asura\AppData\Local\Temp\feiyue-txt-site-24c26fb\myapp`。已复用该项目 node_modules。在 PowerShell 设置 `$env:TXT_API_ROOT='G:\chat\2026-11-20\wo-z\work\txt-api-candidate\api-worker'` 后运行 `node scripts/verify-txt-worker.mjs --serve`。脚本以真实 workerd、隔离 D1、R2 和合成记录启动，打印各入口的本机地址。授权身份在测试夹具注入。去掉 --serve 执行自动验证并退出。线上 Access 交互仍由用户自行确认。

截至准备时，已按用户选择跳过本地手动验收；正式发布、生产业务库变更和本机安装待本次明确许可。花园登记意愿及修订 122 的清单已确认。三次历史安装补登后，于 14:51 JST 核对修订 128，新清单的编号和绯月版本待重新确认。三目标均成功时拟一次登记部署 #66、明细 #137–140、改善 #73–76，日记 #3 从 2.0 到 3.0、随手记 #36 从 5.0 到 6.0、鱼与熊掌 #56 从 1.0 到 2.0、绯月 #61 从 15.3 到 16.0。无种子、项目、归属关系修改。提交前重新核对版本及编号，变化时重新确认。实际结果出来后先提交准确 SQL 与清单，再由正式安装的绯月 REST 提交一个批次，查询原编号验证回执。失败不登记成功。Access 受控界面线上效果待用户截图确认。独立第三方审核未执行。


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


## 2026-11-21 JST　情绪、新闻和 AI 心跳联合提交

用户要求两项一起提交，并允许覆盖重叠文件。交付目标为 WebCharacter 的 Windows 绯月、subscriptions-api 与主站 myapp 的同名本地发布分支 `codex/feiyue-emotion-news-heartbeat-20261121`。验收要求、原有功能范围、技术设计、回退与发布顺序见同目录 ORIGINAL_REVIEW.md；程序包资产、双端基线和两轮对照如下。若从根目录阅读，附件在 docs/releases/emotion-news-20261121。第三方独立审核未执行。

**实际基线。** 正式桌宠位于 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。心跳独立安装回执记录 16:23 JST 已经启动 PID 4348，旧设置库保留 12 个批次；现场逐项 SHA-256 匹配全部七个心跳文件，设置为启用、180 分钟。heartbeat-baseline.json 保存这七项的正式及合并后摘要。桌宠 Git 发布工作树合并搜索分支 50c178e 和手记修复 ab3ac36；只接入本次已核对的安装件、测试与纪要。保留两份开发与需求文档的独立历史条目。

**合并差异。** poll-scheduler.mjs 同时管理心跳 180 分钟、简报 720 分钟以及初始关闭的主动看屏。心跳在途时跳过，可在面板即时改期。shell.mjs 连接唯一 checkAiHeartbeat 入口，阻止旧计时器重复启动，心跳亦不占正式工作位。poll-settings-ui.mjs 与其构建副本保留心跳专用表单及新闻的 720 分钟上限。已安装且最终相同的设置 HTML、构建 HTML 和 task-lifecycle.mjs 无需再次复制。打包文件与用户资料、日志、模型、密钥分离。保留妻子身份、情绪、专题、念叨来源、手记与新闻流程。程序有效范围及逐文件发布前后摘要见 release-manifest.json。

**云端。** API 仓库以 f5bebc0b 为 Git 基线，程序变更仅 api-worker/src/companion/agent/assistant/personality-memory.mjs，接受新来源 curiosity。主站以 876dccba 为 Git 基线，程序变更仅 myapp/src/features/companion/vendor/memory-reader.mjs，用中文展示及筛选此来源。已对照上次实际生产源码核验这两处的 Git 前像。此前候选核实的线上 API 版本为 433cac21-d356-41f0-8fd2-f2264a37da29，主站为 6c2f851f-4541-4695-86e4-5be83a680b71。心跳合并没有云端运行代码差异。云端 DDL、业务回填、配置和绑定变更均为零。桌宠启动后复用现存轮询表、心跳行和用户已保存的间隔，新情绪和记忆数据按原审核存本机。

**两轮验证。** 在 G:/selftool/WebCharacter/work/feiyue-combined-heartbeat-20261121 使用临时资料。每轮桌宠 `node --test 'agent/tests/*.test.mjs'` 344/344，`python -B tools/test-skills.py` 17/17，API `npm.cmd test` 41/41，主站 `node --disable-warning=ExperimentalWarning --test --test-concurrency=2 'tests/*.test.mjs'` 843/843。每轮另通过 test-desktop-shell.mjs --garden-api、Electron 的 verify-heartbeat-panel.mjs 与 test-news-panel-electron.mjs，以及 combined-reader.mjs 走真实候选宿主写入、重建实例、跨端读回、打开列表和正文、跨账户拒绝。面板实际验证默认时间、改为 90 分钟、停用重开、模拟心跳回执。check-bundle.py 两轮逐项验证当前正式基线、归档内容、免费路径和两个 Worker 的运行树差异。

首轮主站有一次从目录联接启动导致 CLI 无输出，改用物理路径后另有一次临时 Git 仓库子进程失败。固定物理路径与测试并发数后两轮全量均通过。第二轮离屏 Electron 心跳面板退出时有 GPU 状态日志，其 UI 断言及进程退出码通过。自然三小时心跳、正式环境新版本数据及 Access 页面效果待发布后核实，线上效果由用户截图确认。真实 9B 及旅行照片验证边界见原审核。

**提交物与发布。** 发布包 G:/selftool/WebCharacter/work/feiyue-combined-heartbeat-20261121/feiyue-emotion-news-rc.zip，SHA-256 `edf4de17bb06d747e27124fb26f229d1687d85b1fba091b0bf384dc1c6977b0d`。114 个变动文件，其中桌宠 112、两个 Worker 各 1。另附清单。程序包以已安装心跳版为覆盖起点。将来发布前复核三端实际版本和逐文件前像；先 API、再主站，最后受控重启桌宠。若需回退，Worker 回到核验的旧版本并保留绑定，桌宠恢复本次替换前的心跳版文件和原启动入口，保留用户实际数据和设置。安装授权及上线效果与 Git 提交分开记载。花园意愿为准备草案；先前修订 135 的草案属于上一基线。心跳有独立安装记录，最终清单须重读花园实际版本并去重，依实际发布结果确认后再登记。


## 2026-11-21 JST · 非报纸功能合并候选 · Windows 正式安装

### 需求、范围和变更

用户要求汇总已经准备好的未上线内容，排除仍在开发的报纸项目。根据问答、手记质问和自主查询三份已审开发记录拟发往现有 Windows 正式安装。实际安装目录为 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，基线 PID 12220 于 16:37:39 JST 启动。发布源码基线 `99e0219`，上次发布归档分支当前可比提交 `0afa95c`，来源开发基线 `ab3ac36` 及相关未提交文件。先三方比对开发共同基线、实际安装与独立候选，再以原始安装 SHA-256 与候选 SHA-256 固定 46 项。七天报纸原型无包内文件，当前半日新闻简报和既有轮询不变。

- 普通问答之前使用较短的闲置时间和因场景而异的预算。本次 `desktop/{chat-budget,balanced-local-model,local-model,local-model-process,screen-question-host,screen-question-ui}.mjs` 及生成的气泡模块统一普通闲置 90 秒、本地文字 60 秒，并区分个人对话、工具反馈、日记、情绪评价。共用 `agent/assistant/response-style.mjs` 与四项技能。保留原有截图与明确指定的 DeepSeek 入口。
- 原手记准备时限可能延伸到用户等待或后续推理。此次 `desktop/{diary-audit,personality-diary,personality-nags,topic-memory}.mjs` 将三分钟限制用在首问准备与核实，用户阅读输入、后续答复另行处理，完整记录对象、题目、阶段和失败原因。保留已有自动质问节奏及 10 分钟工作未恢复处理。
- `desktop/{public-search,emotion-initiative}.mjs` 与 `workflows/comfyui/{public_images,public_reader,public_search_sources,search_budget,tavily_search}.py` 让自主查询选择公开 X、社论、图片、一般资料四类。查证过的免费账户按用量和余量选择，优先日额度，月额度按天分配并预留 20%。同一搜索预算用本机 SQLite，保留历史 Tavily 月消费；外部结果按固定 URL 和字段校验。来源缺失时可用现有资料，保留正式版本移除自动付费回退的边界。
- 技能从正式路由 2.6 生成 2.7，保留所有既有版本文件。完整包路径、源/目标 SHA 及回退前哈希见上级 release-manifest.json。目录内其余测试和 Worker 镜像文件供验证，Windows 安装只采用覆盖包清单。

### 数据、检测和发布

无 Cloudflare 数据迁移、历史回填、新密钥或新依赖。Windows 搜索预算在使用时按需建立 `search_daily`，既有 Tavily 月表和本机资料仍沿用。本机预算写入在候选模拟中验证，正式账户的 LangSearch 自然刷新和任务耗时未走真实供应商。

实际执行 `node --test --test-force-exit --test-timeout=20000 --test-concurrency=4 agent/tests/*.test.mjs` 347/347，独立 `node --test agent/tests/provider-test.test.mjs` 以候选主站适配器模拟 429、切线和脱敏写入。实际执行 `python -B tools/test-skills.py` 19/19、`node tools/build-desktop.mjs` 成功、`node tools/test-desktop-shell.mjs --garden-api` 成功，并由 Electron 运行 `tools/test-screen-question-electron.mjs --diary-audit`，真实气泡和待确认页的稍后、继续、答案、追问、拒绝及清除均通过。全量测试使用现行正式工作队列、v4 REST 和 Worker 对照夹具。早期旧夹具与正式版的冲突已按实际基线复验。

获准后先复核实际进程和安装摘要，核对有无在途任务，再备份覆盖项及本机搜索预算文件，沿用既有运行库、模型、资料目录和登录启动入口。两个 Worker 核对版本后安装覆盖包，按任务安全退出机制重启，核实进程、端口、/infoguide、气泡和资料回读。出现问题时受控退出，按备份仅恢复本包覆盖文件，保留用户资料和发布期间形成的业务数据，恢复原版后复核进程及本机 REST。重点审核文件白名单、报纸排除、三分钟边界及额度逻辑。

本次为部署准备，生产安装、进程重启、线上效果、花园写入、Git 同步未执行。现场验收与第三方独立审核待进行。花园如同意登记，按已核实正式 REST 的规则核对真实线上数据和最终结果。

### 两轮自测复核 · 2026-11-21 JST

第一轮桌面 Node 352/352，含厂商诊断专项，Python 技能和额度 19/19，隔离 Electron 手记气泡验证通过。第二轮隔离桌面壳 REST、七个面板深浅色、标题栏及轮询设定通过。面板首次挂在旧夹具的菜单断言，换已发布夹具复跑通过，生产代码未改。Windows 覆盖 46 项的首轮哈希与实际安装前置哈希吻合，简报、调度和工作队列未进入覆盖包。上级 `feiyue-windows-rollback-baseline.zip` 从实际目录留存 30 个既有原文件并逐项读回；另 16 个新增路径见 `selftest-r2-package.json`。核对正式实例 PID 12220，16:37:39 JST 启动，原路径及 /infoguide v4 均一致。

准备阶段完成。生产部署、安装、Git 推送、人工 Access 效果验证及花园登记均未执行。生产范围和合并批次花园登记等待用户决定。第三方独立审核未执行。

### 生产授权与花园预审 · 2026-11-21 JST

已取得三端生产部署许可。用户在确认取消五小时接口冷却属于候选后明确回复「部署，需要登记」。授权范围为主站、订阅 API 和 Windows 绯月，发布顺序、数据影响和回退方案沿用两轮自测。七天报纸排除。

正式绯月 REST 指南核对为 v4，线上花园结构同步通过，修订 137，结构新增 0 项。合并登记意愿已确认。花园演练预计新增部署 #69、明细 #143 至 #147，分别更新日记 #3（3.0→4.0）、随手记 #36（6.0→7.0）、鱼与熊掌 #56（2.0→3.0）、绯月任务链与自动登记 #58（6.0→7.0）、绯月（桌面精灵）#61（18.1→19.1）。项目与功能定义、种子、改善、Bug、关系、平台、数据源和既有历史无需修改。演练包留在临时目录。真实发布结果明确后以实际版本和时间重新生成精确清单，待用户明确确认整批内容再提交 SQL、调用正式本机 REST 写一次。

### 实际发布及花园回执 · 2026-11-21 JST

主站 `07dc0532-6937-48d1-8521-305a50899d77` 于 18:07:31 JST 上线，订阅 API `417c7b9f-504c-4772-8bd7-a99fe583bb00` 于 18:08:14 JST 上线。两端均为 100% 流量，42 个和 14 个绑定逐项一致。无生产数据迁移或配置变更。Windows 于 18:08:54 JST 重启，18:08:55 JST 核对 46 项文件、安装进程 17084、轮询配置、13 个历史批次和 REST v4。直接载入正式安装模块的隔离 Electron 质问回归通过。Access 线上效果待用户截图。

用户收到带实际版本和时间的具体清单后明确回复「确认这份清单」。已确认批次 `feiyue-non-newspaper-release-20261121`，正式绯月配置仓库先提交精确 SQL `bbb41510fe18507f2a5a38ce07e8245c698fbd19`，再向新版 REST 提交一次。18:12:21 JST 回执为 done，步骤 verified，修订 138。新增部署 #69 和明细 #143–#147，最终版本依次为 4.0、7.0、3.0、7.0、19.0。第三方独立审核未执行。

### Git 远端核对与登记签收

花园已独立逐项回读并完成绯月签收，修订 138，部署 #69 和五条明细均已核实。此次已核对以下源码提交与各远端发布分支一致。主站和日记来源共用一个远端，各自使用独立分支。

- myapp `fb6d4e7` · `codex/feiyue-non-newspaper-release-myapp-20261121`
- subscriptions-api `db0d5bf` · `codex/feiyue-non-newspaper-release-20261121`
- Windows `435c5b0` · `codex/feiyue-non-newspaper-release-20261121`
- recordanyting `3d46157` · `codex/feiyue-non-newspaper-release-20261121`
- resourceforlater `f8b3aa2` · `codex/feiyue-non-newspaper-release-20261121`
- diary-attachments `73f593f` · `codex/feiyue-non-newspaper-release-20261121`

## 2026-11-21 JST · 绯月 Windows 七日新闻发布审核

### 用户需求及验收

原始需求是把重复新闻稍作汇总，并保留多次刷新累积的报道。用户将可直接查看的期限由两天改为七天。同一件事跨来源汇成一块，首页先展示最新情况，事件详情再按从旧到新的顺序说明发展。七天前的事件本地归档，每事件保留 50–200 字的摘要、日期和消息来源，按日期分目录、每事一份文件。

首页保持紧凑，普通桌面宽度多栏。选择事件后列表缩为左侧单列，右侧是可主动关闭的详情，窄窗使用详情抽屉。首页和详情分别可回顶部。详情需要有结合时间的详细现状，底部来源默认折叠并可打开原文。RSS 有合适图片时用固定的 192×128 缩略图，按需加载并可放大。需求原文、确认的原型和两轮复审见 [需求变更](docs/REQUIREMENT_CHANGES.md)、[归档设计](docs/NEWS_BRIEFING_ARCHIVE_DESIGN.md) 和 [新闻实现复审](docs/reviews/NEWS_WEEKLY_IMPLEMENTATION_REVIEW_2026-11-21.md)。

### 发布目标和基线

- 只更新本机 Windows 绯月正式版。安装根目录为 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。用户资料目录为相对该根目录的 `output/desktop-profile`。当前正式进程 PID 17084，2026-11-21 18:08:50 JST 启动，本机 REST 指南 v4，快捷方式与登录启动项指向同一安装根。
- 上一批 Windows 交付记录为 `435c5b0`，明确排除七日新闻。只读核对到该发布分支 `codex/feiyue-non-newspaper-release-20261121` 的远端分支头为 `afc0bfe1a71c713ad636a8eb75030f23bddd64f1`。本次比较以正式安装文件实测 SHA-256 为准。新闻变更来自 `work/feiyue-combined-heartbeat-20261121/git-desktop/personal-digital-companion`，提交基线 `d700383` 及开发树中的新闻改动。纳入范围由白名单限定。
- 候选版本 `92be3d7d8d0f` 是 39 个差异文件及其基线、候选 SHA-256 清单的摘要。20 个运行文件、19 个测试和文档等伴随文件。完整路径和散列见 [release-manifest.json](G:/selftool/WebCharacter/work/feiyue-weekly-news-release-20261121/release-manifest.json)。本审核记录单独按历史版本和新段落内容核对。Git 源码同步应沿正式 Windows 发布基线单独提交新闻差异，构建产物由源码复现，逐项核对远端提交。当前尚未提交或推送本次发布。

### 行为变化和文件

| 变更 | 之前与候选行为 | 文件 |
|---|---|---|
| RSS 与本地累积 | 旧版主要显示最新期次。候选沿用免费的 RSS，正常 720 分钟一次，最多回看 72 小时做增量采集，结合本机已有数据按事件累积七个东京自然日。归并跨源转述，同一转述不推进事件时间。 | `desktop/news-briefing.mjs`、`desktop/news-history.mjs`、`desktop/source-updates.mjs`、`workflows/comfyui/news_watch.py` |
| 新闻总览和事件详情 | 由标题报面改为新闻事件总览。总览按最近进展排序，详情先讲现状，再按东京时间从早到晚显示进展、配图与底部来源。展开详情、收起、移动窄窗及两处回顶部独立生效。 | `desktop/news-layout.mjs`、`desktop/news-panel-{host,ui}.mjs`、`desktop/news-panel-preload.cjs`、`desktop/news-panel.{html,css}`、`desktop/news-weekly.css`，及同名的 5 个前端构建产物 |
| 摘要与配图 | 结合每个节点的事实和时间组织现状。沿用本机模型，数值与时间缺乏足够来源证据时保留有据摘录。RSS 无图的事件正常展示。使用延迟加载和分开的缩略图、放大图请求。 | `desktop/news-editor.mjs`、`desktop/shell.mjs`、`desktop/news-panel-host.mjs`、`workflows/comfyui/research_preview.py` |
| 旧闻归档 | 旧版轮询不保留跨期事件档案。候选在轮询时把已过七天的事件写入 `output/desktop-profile/news-archive/YYYY-MM-DD/<事件ID>.md`。写盘并成功提交后才从活动记录移出。写盘失败或证据不足以形成合格摘要时保留本地记录待重试。 | `desktop/news-history.mjs`、`desktop/news-briefing.mjs`、`desktop/reminder-checks.mjs` |
| 验证和需求留痕 | 增加正式新闻模块测试、Electron 测试图片、已确认原型和复审记录，补齐使用说明。 | `agent/tests/news-briefing.test.mjs`、`tools/test-news-panel-electron.mjs`、`tools/run-electron-check.mjs`、`tools/news-fixtures/spot-nasa-jpl.jpg`、`prototype/news-weekly/`、相关新闻设计、界面及开发文档 |

### 数据、配置和兼容性

本机 `reminder-checks.sqlite` 启动时增建 `news_events`、`news_event_urls`、`news_history_migration` 和 `news_poll_state`。旧刊由 `news_briefing.latest` 迁入一次，保留旧表和已收录去重记录。安装前只读检查 `PRAGMA quick_check` 为 `ok`，存在一条旧简报记录，正式新闻轮询已启用、间隔 720 分钟。本次保持其实际轮询设置。七日内容按本地现有记录和后续增量逐步积累。已被旧版刷新覆盖的刊次无现成副本可恢复。发布时间和存储格式保持现有语义，界面和归档使用 JST。

Cloudflare、主站、生产云数据库迁移、外部鉴权配置、正式快捷方式、开机项、模型文件及用户偏好改动均无。当前阶段仅备妥候选包、构建和验证。安装和验收尚未发生。

### 实际检测及未完成验证

- `node tools/build-desktop.mjs` 成功生成候选桌面资源。候选和安装基线按 SHA-256 对照，只覆盖白名单内差异。
- `node --test agent/tests/news-briefing.test.mjs tools/test-poll-settings.mjs` 通过 21 项候选测试。覆盖七天累积、旧刊迁移、来源、摘要数值和时间边界、归档失败及重启幂等、轮询配置。
- `python -B tools/test-skills.py` 在候选通过 4 项。开发树的完整新闻复审及更广的测试数字见实现复审记录，两处测试树基线不同。
- 使用共享的正式 Electron 二进制执行 `tools/run-electron-check.mjs tools/test-news-panel-electron.mjs`，隔离用户资料目录，通过新闻 IPC、三节点四来源、详细现状、折叠来源、双尺寸真实 JPEG 解码、桌面/窄窗布局、归档入口、刷新和重开操作。截图位于候选旁的 `e2e/`，为隔离数据。
- `node --test tools/test-reminder-checks.mjs` 中旧测试期待每页 20 条，正式安装基线和候选均为每页 8 条。`tools/run-electron-check.mjs tools/test-desktop-shell.mjs --garden-api` 在两份代码均停于第 117 行的旧托盘菜单断言。保持现行复盘和托盘设计。
- 对两份树执行 `node --test --test-timeout=12000 'agent/tests/*.test.mjs'`。候选 260 通过、23 失败、2 取消、2 跳过，安装基线 246 通过、23 失败、2 跳过。两份树失败用例名称一致，`pending-poller.test.mjs` 均未自行退出，已结束相应隔离测试子进程。两个并行超时的花园用例随后用 `--test-concurrency=1 --test-timeout=35000 --test-name-pattern='独立调用方仅凭|导入进度前缀后'` 单独复跑，两份树均 2 项通过。排除 `garden-first-use.test.mjs`、`local-rest-garden.test.mjs`、`balanced-local-model.test.mjs` 的同组对照，候选 249 通过、19 失败、2 跳过，基线 233 通过、19 失败、2 跳过。全量回归仍有基线红项。
- 先前开发验证 Google News RSS 样本得到 159 条报道，无 `imageUrl`。实际 RSS 配图到达和真实模型生成仍缺证据，现有模型回退和图片界面用隔离输入验证。正式库只读核对通过，实际迁入和正式重启验收待部署后核对。第三方独立审核未执行。

### 安装、恢复和发布后核验

1. 获得本次安装重启的明确确认后，按清单重验已安装旧文件和候选文件散列，核实正式 PID、启动目录、资料目录、本机指南、轮询设置和活动任务状态。对将替换的文件和历史审核记录做散列备份，对本机提醒 SQLite 做一致性备份，保留同目录归档。任何基线变更先停下核对。
2. 正常退出正式绯月并等待释放本机 REST 端口。写入根目录审核记录，按白名单逐文件安装，按散列逐项复核，再经现有正式入口启动。媒体资源、模型和资料目录按原样接续。安装失败只恢复本批已替换的旧文件和新路径，验证恢复散列，再启动旧版。旧数据由加法迁移保留，发生 SQLite 故障时先保全现场，再以一致性备份作恢复依据。
3. 核验新进程与启动时间、安装路径、REST v4、既有批次、原轮询设置和新闻库 `quick_check`，核对迁移标记及事件数量。确认打开正式新闻窗口，抽验事件详情、来源及关闭操作。待真实后续 RSS 到达再核对有图新闻和历史跨轮累积。将实际退出、启动、运行检查和 Git 提交与回读记录追加到本文件及开发纪要。
4. 本次部署许可待确认。花园登记意愿待单独确认。若同意，再只读核实线上结构与实际现状，提供具体清单供确认。获得清单确认后，按实际发布结果生成精确 SQL 并先提交 Git，再交给重启后的正式绯月 REST 一次，记录批次和回读回执。

### 绯月 Windows 七日新闻实际发布 · 2026-11-21 JST

用户回复「确认」，授权按审核记录安装并重启本机绯月。花园登记未获单独授权，本次无登记、花园 SQL 或外部部署。

正式绯月于 18:46:55 JST 启动 PID 38364，18:46:59 JST 核验完成。旧 PID 17084 正常退出。20 项运行文件与 19 项伴随文件的内容摘要逐项一致，使用原安装入口和数据目录。安装前已保留替换项原文件和一致性的本机提醒库副本。

本机 REST 指南 v4 可用，保留 14 个历史批次。正式 `reminder-checks.sqlite` 完整性检查通过，旧简报保留 1 行，迁入标记 1 行。回读 311 个事件和 316 个来源索引，正式新闻轮询继续每 720 分钟且启用。新闻库最近一次刷新为 16:38:41 JST。当前累计事件中 RSS 未提供配图。真实后续配图和本机模型生成待验证。

从已安装目录用隔离资料运行 `tools/run-electron-check.mjs tools/test-news-panel-electron.mjs` 通过，覆盖 IPC、累积、详情、来源、缩略图与放大、归档入口、刷新及重开。用户停止了 Windows 桌面控制，正式新闻窗口手动操作未完成。

发布标识 `92be3d7d8d0f`。Git 在上次已发布 Windows 分支的 `afc0bfe1a71c713ad636a8eb75030f23bddd64f1` 上建立独立发布分支，提交仅包含本次新闻源码、测试和审核记录。已推送至 `codex/feiyue-weekly-news-release-20261121`，远端回读核实源码提交 `91f14e8601988090603b9221e71546d16a2fac3a`。从独立 Git 工作树构建，20 个运行文件与本次安装清单的 SHA-256 一致，新闻及轮询专项 21 项通过。

### 绯月 Windows 七日新闻花园登记回执 · 2026-11-21 JST

用户查看完整清单后回复「确认」。本地 SQL 留痕提交为 `c3705112c931f3f1464241a903b3e556f6944152`。先提交再通过正式绯月本机 REST 入队一次，批次 `feiyue-weekly-news-release-20261121` 于 18:59:41 JST 完成。独立只读回查确认网页角色组件 #16 下绯月（桌面精灵）#61，发布 #70、明细 #148，版本 19.0 → 20.0，数据修订 140 → 141。归属、实际发布时间、说明和版本字段逐项一致，唯一发布标记核对通过。

确认摘要 `b65705afd19aca3a01802f5b34114cccc172f07ec5b23ba3d60939e0ce3cf1c8`。同一登记清单与 SQL 的 Git 对象散列已复核，确认记录及独立回执随它们推送到主项目远端 `codex/feiyue-weekly-news-garden-20261121`（`a515a845841be34b3afaf45e7d32315d35e357e9`），并回读一致。

## 绯月本地优先交互 · 2026-11-21 JST
用户要求先部署、部署记录后补，并明确本次无需再确认。服务端 subscriptions-api 从 417c7b9f-504c-4772-8bd7-a99fe583bb00 发布向后兼容的模板 GET、候补和最终复审。Windows 原路径、原配置启动。主站页面无需发布。验收为本地生成日记、按类型重做、候补择优、确认前零写入、确认后一次写入、保留现行新闻入口与历史技能。基线为 Windows 8912cca0320e3034e78436e4eb59ef36b7370965 和 API c683e93027947298e1d1ce3e746ca7fb063d269e，桌宠逐文件另与实际安装版比较。
部署清单及每项前后 SHA-256 见同目录 local-first-release-manifest.json。桌宠涉及 73 项，API 涉及 3 项。桌宠主进程和技能依次处理主力、9B、云端及复审，拒绝少项、迟到和未确认提交。API 兼容原 POST，新增只读 GET 和受限工作类型。数据库迁移、历史回填、配置及绑定新增均为无。
开发版 368/368、技能 19/19。合并后的候选登记、交互和新闻 60/60、API 41/41、技能 19/19、桌面构建与壳、7 面板、真实 0.8B/9B、Worker dry-run 均通过。旧正式分支的全量回归含历史测试问题，基线对照单列。真实外部供应商及 Access 线上交互待用户截图确认。第三方独立审核未执行。
发布前重读流量旧版本与文件前像，发布 API 后核对 100% 流量和原 14 项绑定。桌宠备份将替换的程序，等待正式实例空闲后正常退出，按清单原子替换并按原参数启动；逐项验算散列，核对 PID、端口、原资料目录和历史批次。失败时按前像恢复本地覆盖文件，云端可回到上述原 Worker 版本。花园数据待后补清单和用户确认。发布结果及 Git 回执按实际操作补记。


### 本地优先交互 · 正式发布回执（2026-11-21，东京时间）

- subscriptions-api 于 19:19:30 发布，版本 `e4d0f6d0-bf33-4058-a904-ea9fbba195c3` 承接 100% 流量。部署前后 14 项绑定一致。本次数据库迁移及回填为无。
- Windows 首次重启出现模块加载错误。核实桌宠入口的 114 个本地模块，正式目录缺少已有源码 `agent/assistant/probe-reply.mjs`。补齐后正式入口可加载，19:26:02 核实 PID 24632 与原快捷方式、原资料目录及本机 REST v4 监听一致。最终安装清单共 74 项，增加的第 74 项为上述依赖，如回退此次桌面发布，应随本次新增文件移除。初次替换前的程序保存在 `install-backup-20261121-191954`。
- 读取到原资料目录的 15 条批次，SQLite quick_check 通过。引导技能 2.8，登记技能 1.7。对正式版代码使用隔离数据库、合成输入和真实模型，日记本地生成及复审通过后云端调用为零，确认后仅一次写入。长 TXT、混合登记、云端不可用时 9B 候补经复审交付，均通过。
- 修复后第一轮核对安装文件、实际入口、实例、技能和上述四个隔离真实模型场景。第二轮再跑 `node --test agent/tests/local-first-interaction.test.mjs agent/tests/registration-flow.test.mjs agent/tests/screen-question-host.test.mjs`（41/41）及隔离 workerd 元数据、候补、失败和复审路由，均通过，两轮均无新增问题。
- 此前专项 60/60，API 41/41，技能 19/19。发布分支全量对照为基线 335/360（21 失败、4 取消），候选 357/380（19 失败、4 取消）。剩余失败与取消用例在旧基线已出现。未验证真实外部云模型供应商或 Access 线上界面，线上效果待用户截图确认。花园发布登记按用户指示后补。


## 已知回归清单补发（2026-11-21，JST）

用户要求先记录问题，再发布并进行花园登记。本次追加 docs/KNOWN_ISSUES.md 的 23 项逐项证据和本审核条目。来源为正式发布分支 2617439 及基线、候选测试日志，按用例名称与分类比对，19 失败、4 超时在旧基线均有同名同结果。实际安装目录 74 项程序与技能文件摘要全部匹配。配套 API e4d0f6d0-bf33-4058-a904-ea9fbba195c3 已核实承接 100% 生产流量。此次发布范围为问题清单和审核说明，无运行文件、数据、配置变化。发布方式为在正式安装目录追加并回读上述文档，与 Git 发布分支同步。回退可单独撤销本节及问题清单本节。业务行为、已知限制和待用户截图确认项见上一节。用户已授权发布及登记意愿，花园最终清单须单独确认。第三方独立审核未执行。


花园登记回执（2026-11-21 19:41:52 JST）：用户确认批次 feiyue-local-first-release-20261121。部署 #71、明细 #149 已登记为发布成功，归属网页角色组件 #16 → 绯月（桌面精灵）#61，版本 20.0 → 21.0。绯月回读 done，1/1 步骤 verified，花园修订 141 → 142。清单提交 e57cbebfd0d9633fbbb5e98c8023c3c7eeb223d5，确认摘要 f544f3d0afdeeb4226e2206ba1d065318427119854c17048d7ba06517218169e。

## 2026-11-21 JST · 绯月对话明细与模型档位 Windows 发布审核

### 用户需求、范围和基线

用户要求修正明细断句及发言重复，普通交互默认 Aggressive 9B，显存紧张时用 4B 或 2B，升级候补为标准 Qwen3.5-9B，直连不变。随后要求更新 Windows 正式绯月，并登记一条版本号不变的桌面精灵部署。验收核对完整回复能归档、旧长段和独立的问题回显不会重复出现、上一轮上下文及复述请求可继续使用、模型降档和直连行为与要求一致。详见[需求](REQUIREMENTS.md#2026-11-21-jst--对话明细与模型档位)和[开发复核](docs/reviews/CHAT_DETAIL_MODEL_REVIEW_2026-11-21.md)。

目标为 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，保留原 `output/desktop-profile`。准备时监听 PID 34580，19:33:09 JST 启动，回环 REST v4 和桌面快捷方式、登录启动项及实际进程命令行均指向同一安装。参考上次发布源 `e10f7b3`，以实际安装文件的 SHA-256 为最终前像。用开发提交 `2e215d2` 与其父提交计算本次差异，三方合入 Windows 安装基线，保留问答宿主原有独立修改和七日新闻路由。候选复测发现独立问题回显，补丁及回归在当前工作区的 `desktop/chat-output.mjs` 和 `agent/tests/local-first-interaction.test.mjs`。候选共 12 项程序和技能文件，完整前后散列见[安装清单](docs/reviews/CHAT_DETAIL_WINDOWS_RELEASE_MANIFEST_2026-11-21.json)。清单 SHA-256 为 `6384a329c293ecbd88ffd01f6657463d52d3156a2e75f52c5dfbf9ac3827762d`。

### 文件与行为

| 变更 | 原行为 | 候选行为 |
| --- | --- | --- |
| `desktop/screen-question-host.mjs`、`desktop/chat-output.mjs`、`desktop/interaction-work.mjs` | 普通口语字段上限 160 字，生成可在句中结束。旧长段或新问题回显可进入复审和归档。 | 使用模型输出预算及完整 JSON 校验。旧长段复用触发重写。单独成段的逐字问题回显可移除，后续回答保留。用户明确要求复述时保留原话。 |
| `desktop/balanced-local-model.mjs` | 普通交互优先 2B，资源不足可选 0.8B。升级候补使用 Aggressive 9B。 | 主力优先 Aggressive 9B、4B、2B，GPU 忙或不可用可选 CPU 2B。升级候补用标准 Qwen3.5-9B。直连沿用 Aggressive 9B 原路径。 |
| `skills/feiyue-interaction` 与 `skills/personal-conversation` 下的两份源说明、两份索引与四份快照文件 | 引导版本 2.8，对话版本 1.6。 | 引导版本 2.9，对话版本 1.7。与现有七日新闻转接和直连模型指令兼容。 |

数据库迁移、历史回填、配置变更、Cloudflare 或主站程序发布均为无。保留既有资料、资源、模型、账户、原档案、快捷方式和开机项。历史归档已缺失的句尾无法由此次更新补写。内置技能用自身版本维护历史，花园的功能版本单独由花园计算。

### 检测、风险及待验证

- 在隔离候选执行 `node tools/build-desktop.mjs` 通过。当地 `node --test --test-reporter=spec agent/tests/local-first-interaction.test.mjs agent/tests/balanced-local-model.test.mjs agent/tests/memory-archive.test.mjs` 通过 25 项。另加正式基线保留的 `screen-question-host.test.mjs` 时，候选有 3 项旧断言失败。隔离旧基线按同名复跑，图像确定性、网络摘要及旧登记时序 3 项均复现，详见候选与基线测试日志。技能用 `PYTHONPATH=G:/selftool/WebCharacter/tools` 执行 `python -B tools/test-skills.py` 通过该基线的 4 项。
- 第一次真实隔离试跑加载 CPU 2B 和标准 9B，发现 2B 偶尔会在回答之前独立重述本轮问题。先报告，再补本轮输出处理和回归。终轮通过 `electron.exe tools/run-electron-check.mjs output/chat-model-smoke.mjs` 重放合成问答。CPU 2B 的最终回复不含开头的问题回显，完整归档并通过复审。标准 CPU 9B 正确读取合成材料中的暗号。开发树终轮 `node --test --test-reporter=spec 'agent/tests/*.test.mjs'` 393 项通过、3 项可选契约跳过。未改界面文件。显存分档和直连行为由专项回归核对，正式实例实际重启待许可。
- 风险重点为当轮生成与复审一致、候补换档、正式版独立问答接线和既有新闻入口。正式进程、自然对话效果和用户界面须在授权安装后另外核对。未执行第三方独立审核。

### 安装、回退及版本登记

1. 收到针对本清单的明确许可后，再核验 PID、正在执行的正式任务和实际文件前像。只备份和替换清单中的文件及审核纪要。通过正常退出流程等待对话和在途任务处理完毕，确认旧 PID 退出及端口释放，从原快捷方式参数启动新进程。逐项验证 SHA-256、PID 和启动时间、原资料目录、REST v4、历史批次及隔离对话。若失败，按清单恢复原文件并移除本次新增项，再从原入口恢复并核验。完成后补记实际时间、结果和 Git 同步状态。
2. 花园登记意愿已经确认。线上结构同步成功，新增结构对象 0。授权只读核对修订 142，网页角色组件 #16 下唯一目标绯月（桌面精灵）#61，当前版本 21.0，最后部署 #71、明细 #149。现有花园 `store.mjs` 以实际关联部署次数计算主版本。正常新增一条会算成 22.0，仅让明细版本前后相等也会改变功能显示版本。已确认目前没有不计版本的新部署字段。保留 21.0，未制备会升版的写入包，也未提交 SQL 或调用写入接口。后续如获得能同时满足新增记录与版本不变的方案，须按实际安装结果重新制单并取得具体内容确认。种子、功能定义、改善、Bug 和既有部署均无需更改。
3. 用户查看候选审核后回复「提交」。按此前更新指令执行本机正式安装及受控重启，花园保持 21.0。已执行线上结构同步和只读核对。生产记录写入尚未执行。第三方审核未执行。

### 本次实际安装与验收

2026-11-21 21:02:52 JST，正式绯月从原应用路径启动。旧 PID 20312 正常退出并释放回环端口，新 PID 11896 使用原资料目录。21:02:52.987 JST 核对 12 项程序和技能、两份审核文件、快捷方式、登录启动入口、回环 REST v4、原轮询配置与 16 条历史批次。任务资料只读完整性检查为 ok。程序前像及原审核纪要在 `G:/selftool/WebCharacter/personal-digital-companion/output/chat-detail-release-20261121/install-backup-20261121-210243`，本机回执和复测日志同在该发布工作目录。

以同一 Electron 及实际安装目录调用隔离模型测试。CPU 2B 接续回答并复审，归档无开头的逐字问题回显。标准 CPU Qwen3.5-9B 从合成材料准确给出暗号。从上一正式源码 `8d78eb2` 单独准备本次发布分支，25 项交互、模型分档及归档回归全部通过。自然对话和用户日常使用效果待观察。此次仅发布 Windows 桌宠，无 Cloudflare 发布和数据库迁移。花园未写入或增加部署记录。完整保持版本和新增关联部署的方案仍待花园支持。

### Git 同步与花园回读

发布源码提交 `5aacfe8f04be6695fe846f2665faf84c7caa2bdd` 已推送并回读 `origin/codex/feiyue-chat-detail-windows-20261121`。提交中的 12 项程序与技能与安装候选逐项核对一致，Git 按仓库配置规范化两份技能索引的换行。发布后独立只读回查花园修订 142，绯月 #61 仍有 21 次部署，最新 #71。本次无花园写入、SQL 提交或登记批次。

## 2026-11-21 JST · Windows 绯月持续听写、自动校正和手动朗读发布审核

状态为隔离候选验收完成。用户回复「安装」，已授权本机正式安装及受控重启。第三方审核未执行。用户同意准备花园登记，实际清单和写入待确认。

### 需求和验收标准

原始要求包含「使用gpt-sovits就行，加载到绯月的气泡上，语音播报不用自动生效。语音录入放按钮就行」及「语音录入要加在所有允许我输入超过20个字以上的输入框上。且输入后需要自动进行ai修正，矫正明显的错字和无意义或者连续的嗯，啊，这个，哪个之类的口语停顿词」。完整原文及范围见 [BUBBLE_VOICE.md](docs/BUBBLE_VOICE.md)。验收包括按按钮持续录音、音频依次处理、停下自动整理、手输文字与有效指代和数字保留、录音与播放仅发生在用户操作后、稿件仍可编辑并由用户提交。覆盖气泡、随口登记、补充与确认的固定和动态字段、此刻所想、设置的搜索和资源改名。朗读使用本机 GPT-SoVITS，回复旁点击才按自然停顿接续朗读。

### 目标与基线

待发布项目为绯月桌宠 Windows 本机正式版。桌面快捷方式内嵌目标、登录脚本和正式进程均指向 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion/desktop`。核对时运行进程 PID 为 11896，启动时间为 21:02:49 JST。Electron 二进制为已有 WebCharacter 桌面依赖。候选来源为本仓库 `personal-digital-companion` 在 `067bfd5` 之上的语音改动，算法来源为已验收的 `voice-chat-lab`。复制实际正式安装的源文件和已构建资源，排除正式资料库，链接现有只读使用的 GGUF 和运行依赖。候选修改前 12 个既有源文件逐字比较与正式安装一致。以 [voice-release-files.json](voice-release-files.json) 的逐文件安装前和候选 SHA-256 为精确差异，新增文件的旧摘要为 `null`。完整清单为 21 项源码和 13 项构建资源。

### 实际改动与影响

- `desktop/dictation-host.mjs`、`dictation-preload.cjs` 和 `dictation-ui.mjs` 提供公共听写。原方框可键入，此后长文本框有麦克风按钮，以信任的本机主框架及点击开启的录音会话控制麦克风。停止后用已有本机交互模型校对本次听写，检查数字和可信文本变化，失败时保留收齐的原听写。已有草稿和手动提交语义延续。
- `desktop/bubble-voice-capture.mjs`、`bubble-voice-processor.mjs`、`bubble-voice-segments.mjs`、`bubble-voice.mjs` 和 `bubble-voice-worker.py` 从试验保留停顿和 8 秒以内的音频分段。Paraformer 配套本机标点与 VAD，GPT-SoVITS V5 Turbo 生成 30～50 字一段的朗读，保持短句边界以应对长文本。播放当前段时预取下一段。Python 进程按点击加载，朗读结束后释放。
- `screen-question-host.mjs`、`screen-question-preload.cjs`、`screen-question-ui.mjs`、`screen-question.html`、`screen-question.css` 和 `bubble-voice-ui.mjs` 负责气泡轻量按钮、回复全文、仅手动朗读和停止。`registration-ui.mjs`、`registration-review-ui.mjs`、`scene-ui.mjs`、`settings-ui.mjs`、`feiyue-surface.css` 接入其它文字字段并保持面板样式。`shell.mjs` 和 `source-updates.mjs` 接入生命周期和构建分发，已生成运行页所需的 13 个资源文件。
- 业务数据库迁移、历史回填、云端及 Access 配置、自动启动参数、云端 API、花园 REST 路由变化均无。使用既有本机 `GPT-SoVITS-v5-20261006` Python 和中文参考音色。新建可重建的本机资料子目录 `voice-runtime/` 存放推理设置。用户没有配置麦克风时有状态反馈。Windows 实体麦克风及扬声器由用户正式版试用确认。

### 实际检测与复核

- `node work/prepare-feiyue-voice-candidate.mjs` 构建隔离候选成功，运行模板依赖注册同步。`node --check`、Python 语法检查和 `git diff --check` 通过。开发区 `node --test agent/tests/screen-question-host.test.mjs` 11/11 通过。
- `work/feiyue-voice-candidate/voice-check.mjs` 在隔离真实 Electron 运行。无点击许可时麦克风拒绝，摄像头拒绝。气泡以模拟麦克风调用真实 Paraformer 并边录边回填，停止后真实本机模型自动整理。纠正样例由「嗯嗯，啊，那个，我想参加明天早上9点的会意，这个，嗯嗯，我先记下来。」得到「我想参加明天早上 9 点的会议，我先记下来。」。手输前缀保持。回复出现后保持安静，点击后实际 GPT-SoVITS 播放并接续两段，第二次点击停止。逐窗核对一个气泡输入、一个登记框、四个固定及动态补充框、一个场景回复、两个搜索框及 80 字动态改名框。
- 首轮发现气泡录音依赖初始化顺序错误，已修复并由实际录音复测。后检补充选中文本遇空听写的保护。最终 `voice-check.mjs --selection-qa` 验证空听写完整保留选择前原文。内联断言通过，覆盖数字变化的拒绝、有意义指代文本的保护、空填充词和明显错字。按停止规则无语音功能待修问题。
- 旧安装随包的 `screen-question-host.test.mjs` 三条失败在未改动的安装基线逐条复现：旧菜单路径、网查提示、旧登记路由期望。旧标题栏脚本在候选和未改动基线均因将 `menu.html` 当常规单标题栏窗而失败。旧 `test-desktop-shell.mjs` 在两者均依赖已改名的「特殊菜单」而停止。开发区同名 shell 脚本另有既有「新闻简报」菜单清单期望差异。用开发区当前 `test-panel-titlebar-electron.mjs` 在候选执行，七个面板、深浅色、窄屏原生标题栏、状态与热加载通过。以上基线失败列作已知问题，未计作通过。

### 风险、回退和安装后验证

首次模型加载耗时，录音分段先留在内存，校正遇本机模型不可用或输出校验失败时保留已识别结果并显示状态。长时间录音的实体环境、不同音色与识别质量以用户试用为准。朗读资源不足时按测试采用 CPU，停止或关闭释放工作进程。

授权后复核实际进程、路径、版本及 34 项前值 SHA-256。若任何旧值漂移，重核差异后再请求变化范围的确认。确认正式绯月无在途任务和录音，沿其受控重启机制等待收尾并备份将被替换的文件。只安装清单里的 34 个运行文件，并保留发布审核历史。安装完成后确认新 PID、加载路径、快捷方式、登录目标和文件摘要。核对实际气泡语音输入、停止后校正、回复默认安静和手动朗读，再看其余文本框按钮。问题发生时停新进程，恢复旧文件并移除本批新增运行文件，重启原入口并核对相同摘要，保留现有用户资料。

本次安装已授权。线上结构同步通过，只读确认花园修订 142，归属项目 #16、功能 #61，当前 21.0、最近部署 #71，未匹配到重复记录。发布后按实际结果制单并交由用户确认。实际版本、完成时间、正式验收、Git 提交、推送及花园回执待后续记录。

### 2026-11-21 JST · 忠实听写校对增补

用户补充「我需要你再整理我的发言时，会主动矫正我没提到的口语常见录音问题并尽量保留我的措辞和内容前提下去除发音记录的问题」。本次验收以修正明显口语记录问题、保留说话人原词和内容为准。只修改清单中的 `desktop/dictation-host.mjs` 和候选说明。既有安装目标、流程、权限、业务数据与回滚方式沿用本节前文。增强后的 SHA-256 见同一 `voice-release-files.json`。

- 先针对明确的孤立停顿音、代词头部重字和「会意纪要」的明确搭配做少量修正，再调用现有本机 AI 检查其它明显问题。模型校对的范围包括无意义重复、同音误识、错误断句及跨段断行。数字及时间写法、否定、估计程度和明确引用均参与短段校验。有歧义时保留原话，模型不可用时保留可用听写。
- 第一轮实际本机 2B 太保守，漏修三例。第二轮加入前置清理后保留了指代和有意强调，也清除了重起与停顿，但仍漏改「会意纪要」。第三轮增加明确搭配和引用保护，并在只针对本次修改的范围内复测。
- 使用候选的 Electron 执行 `work/feiyue-voice-candidate/dictation-cleanup-check.mjs`，实际 CPU 2B 的五条样例均通过。例如「我我先看一下会意纪要，嗯嗯，下午三点再发给你。」整理为「我先看一下会议纪要，下午三点再发给你。」。其它样例验证断行合并、保留「特别特别」、「这个文件」「哪个版本」「先别发」「大概」、「会意一笑」和明确引用的「会意纪要」。Node 内联断言检查 16 组合成守卫或回退案例，覆盖数字和时间变更、明确引用、意义上的重复、单独的「嗯？」和「哈哈。」以及模型不可用。`node --check`、`git diff --check` 通过。
- 模型和确定性规则依据有限样例验证，个别同音词或语意不明的情况会留在输入框供人复核。Windows 正式安装和用户录音的语料验证待执行。用户已授权安装。花园具体内容授权待实际结果及完整清单。
- 重建时剥离同行工作区的其它修改，恢复此前语音候选的精确文件；正式基线与候选共 34 项逐一通过清单摘要复核。

安装清单 SHA-256 为 `39238f4d0de2ad913af7bc409c13b6daf65b833bf26c6f8b4c4bc1b840c923e2`。回退备份包含原有运行文件及审核文件，不复制资料或令牌。配套发布证据包含审核记录、同根目录清单和语音说明。

### 实际安装、功能复核与花园回执

2026-11-21 23:43:08.593 JST，Windows 正式绯月从原入口受控重启，PID 11896 → 15148。23:43:11 JST 核对 34 项运行文件 SHA-256、3 项审核资料、快捷方式、登录项、回环 REST v4、原资料目录及 16 条历史批次。任务数据库只读完整性校验通过，轮询配置一致。版本标识 39238f4d0de2，安装前文件备份位于工作区 work/feiyue-voice-candidate/install-backup-20261121-234255。无业务数据库迁移与 Cloudflare 部署。

隔离 Electron 从正式安装目录加载模块。首轮模拟麦克风 35 秒内未回填，复测定位首次 Paraformer 推理约 90.3 秒，热态每段约 0.84～0.98 秒。随后验证录音中分段回填、停止后自动整理、手输前缀保留及无点击时麦克风拒绝。最新例句「我我先看一下会意纪要，嗯嗯，下午三点再发给你。」得到「我先看一下会议纪要，下午三点再发给你。」。另一例中模型漏改「会意」并保留部分停顿词。实体麦克风和扬声器待用户试用。

用户已确认 #72 与 #150 的花园清单。批次 feiyue-windows-voice-20261121，SQL 提交 fe679dfd8881d35ebfeab0ee38289d45575e72b5，审核摘要 43afda26b96cfb587b2315b4870a72b7d435a6629d8022e6bdc2926a1c1950ee。2026-11-21 23:49:44.410 JST 绯月回执 done，步骤 verified，线上修订 143。部署 #72、明细 #150 归属项目 #16 及功能 #61，版本由 21.0 更新为 22.0。发布登记元数据免做整库备份。第三方审核未执行。

从正式安装目录单独复测 GPT-SoVITS，收到回复时未启动播放，点击后实际生成并接续播放两段，再点击停止。气泡、随口登记、补充与确认、此刻所想和设置面板的长输入入口均经隔离检查。未在正式资料中发送测试对话。

独立回读线上 #72 与 #150 的完整字段一致，绯月于 2026-11-21 23:51:23.953 JST 签收批次。花园主仓库 844 项测试及 Wrangler dry-run 均通过，SQL 提交 fe679dfd8881d35ebfeab0ee38289d45575e72b5 已推送并回读远端 main。

绯月语音源码 b0ac380c29a9e54d878d078d571ba562ff45e860 已推送并回读专用分支 codex/feiyue-windows-voice-20261121。21 项运行源码与正式文件在 Git 换行规范化后逐项一致。

发布回执提交 e2a54b01d35be265320e53039d7816df695a2673 已回读同一远端分支。

## 2026-11-22 JST · Windows 绯月待确认联合发布审核

### 需求与验收

用户要求质问、念叨和确认共用本机待确认。每次轮询最多提一个已有问题，平时只提示待回答，最多 20 条，到上限后优先提醒。同类型同编号只生效一条。日记、悬疑点、唠叨与消费条目分别识别。保留闲置轮询单次 10 分钟预算，取消旧版答题时限及重复询问时间锁。中断后按原编号续答。用户回答且追问结束后才同步。每篇日记最多 3 个问题，先排除已答和无关问题，再按探明价值从高到低录入。收笔记录原答和绯月当时的真实情绪。配套发布包括订阅 API 与主站手记回链。

### 目标、基线和变更

- Windows 正式安装根目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，原 Electron 入口与 `output/desktop-profile`。发布准备实查 PID 15148，开始于 2026-11-21 23:43:08.593 JST，回环 REST v4。上次正式版本标识 `39238f4d0de2`，语音源码 `b0ac380c29a9e54d878d078d571ba562ff45e860`，回执 `e2a54b01d35be265320e53039d7816df695a2673`。
- 源项目 `G:/selftool/WebCharacter/personal-digital-companion`，开发差异从 Git `067bfd5` 查看相关文件。候选直接以实际安装目录为底，保留该版语音和用户正在编辑的其它内容。完整逐文件比较见工作区 `work/feiyue-pending-release-20261122/windows-files.json`，以实际正式前值和隔离候选后值 SHA-256 核对。41 个运行文件，包含 17 个新增文件与 4 个生成的界面资源。清单摘要 `737232786c05f3a47fe7803b0fc4ee367b52728e56da74b37492ea914b8d2826`。
- `desktop/pending-questions.mjs`、`personality-nags.mjs`、`diary-audit.mjs`、`topic-memory.mjs`、`scene-curiosity.mjs` 和 `emotion-initiative.mjs` 将各类主动确认纳入同一候选排序和本地留存。旧版有即时提问和提前保存未结记录的入口，本次统一为挑一个已有问题，按原编号恢复。`desktop/poll-scheduler.mjs`、`shell.mjs`、`menu-layout.json` 接入同一个轮次和待确认入口。`screen-question-*`、`conversation-*.mjs` 以及相应生成界面显示实际待确认状态并恢复同一条目。
- `desktop/personality-diary.mjs`、`skills/diary-writing` 1.9 先审问题价值与已有答案，核对短答、原文和语义限定，再排序选前三。`desktop/diary-audit.mjs`、`skills/diary-audit` 1.6 从已经记录的答复和当时情绪生成收笔。气泡、本机和服务端用同一段正文。
- 数据库迁移、现有数据批量回填、凭据、新依赖和配置调整均无。沿用本机资料目录和现有记忆存储，首开遇旧的未完成记录沿用原编号并登记待确认。服务端旧历史保留。语音、开机入口和模型文件不在安装清单。

### 验证和审核关注点

- 子项目在真实 Aggressive 9B CPU 三轮验证中通过 6/6、5/5、8/8。三轮气泡收笔分别带「牵挂」「释然」「平静」，原回复和隔离服务端回读一致；答复之前服务端为零条。Node 全集 398 通过、3 可选跳过；桌面构建、桌面 shell、隔离 Electron 标题栏和气泡通过。详细场景见子项目 `docs/reviews/PENDING_QUESTIONS_QUALITY_REVIEW_2026-11-22.md`。
- 正式基线候选执行 `node --test` 的 6 个目标测试文件（`autonomous-idle`、`diary-audit`、`emotion-initiative`、`personality-memory`、`scene-curiosity`、`topic-recovery`），76/76。`node tools/test-desktop-shell.mjs` 通过。使用候选 Electron `tools/run-electron-check.mjs tools/test-personality-model-electron.mjs --thread-review --audit --round=3` 同款实际 9B CPU 复测 8/8，收笔含「平静」，等待期间仅本机且最终按原编号回读一致。
- 候选 Electron `tools/run-electron-check.mjs tools/test-screen-question-electron.mjs --diary-audit` 通过气泡稍后、继续、答复、追问、拒绝及清除。`install-pending.ps1` 的 PowerShell 语法与默认只读模式通过，核对正式进程、启动项、快捷方式、本机任务完整性、41 个运行文件旧值与新值、2 个伴随审核文件。此次预检任务计数为 0，回环 API 可读 17 个历史批次，实际安装前再查。
- 独立审核关注历史记录兼容、只在最终同步、同目标跨重启去重、20 条上限、日记前三与 9B 证据准确性，以及新旧窗体通信；复核所有文件前后摘要。
- 实际语料和生产使用待用户验收。第三方独立审核未执行。2026-11-22 JST，用户回复「部署」，正式安装及受控重启已获授权。用户随后回复「确认」，批准本次花园拟登记清单。实际编号、版本、时刻及结果待发布后形成精确清单。

### 安装、恢复和验收

待用户确认后，以实际版本和 SHA-256 检查无漂移。先完成配套 API 与主站，再暂停新问题并确认绯月没有正在进行的任务、对话和录音。工作区 `work/feiyue-pending-release-20261122/install-pending.ps1` 默认仅检查。正式执行显式传入 `-Apply -ApprovedReviewSha <已审核根文件 SHA-256>`。该脚本复核原路径、快捷方式与登录项、窗口进程、轮询、批次和文件；备份旧文件，正常退出桌宠后原位覆盖清单并重启。保留原资料与模型，不复制或输出令牌。若切换失败，凭备份恢复旧文件并移除本轮新增运行文件，重启后核对旧入口和摘要，保留本机记录及云端已同步记录。

发布后回查新进程、JST 时间、原资料与开机入口、REST v4、运行文件摘要及历史批次。用户检查气泡提示、待确认、退出再打开，以及答复后收笔。Access 线上手记由用户操作并待截图确认。更新三个审核记录及仓库 Git 提交和远端，按联合实际结果一次登记花园。参见工作区 `GARDEN_REGISTRATION_DRAFT.md`。

### 本次生产发布回执

2026-11-22 JST，订阅 API `ba9388dc-a2f1-4766-81a2-824a07d668a0`（2026-11-22 01:12:40 JST），主站 `b86d1843-b706-4bdf-b7ec-9742a0180d65`（2026-11-22 01:13:42 JST）。均为 100% 生产流量，14 和 42 个既有绑定的实际字段与前版一致。Windows 绯月 `737232786c05` 受控启动于 2026-11-22 01:14:50 JST，核验于 2026-11-22 01:14:51 JST。PID 15148 → 34600，回环 REST v4、41 个运行文件和 2 个伴随文件摘要一致。原快捷方式、登录启动项、资料目录、轮询设置与 17 条历史批次保留。Windows 旧文件备份在工作区 `install-backup-20261122-011439`。业务数据库写入无。线上 Access 页面待用户截图确认。花园拟清单已确认，精确登记待用户确认。

### 本次发布 Git 同步回执

- Windows 代码提交 `00c09cd620622c37e8d60b11548ef936a8e56b69`，远端 `codex/feiyue-pending-release-20261122` 已回读一致。
- api-worker 代码提交 `0cd714a79bb168c3df77e0c28c44edbc0c2e11bb`，远端 `main` 已回读一致。
- myapp 代码提交 `b643509f29ed7e8bbc399319e979ca981b09a17e`，远端 `main` 已回读一致。

### 2026-11-22 JST · 待确认联合发布花园回执

用户已确认实际登记清单。2026-11-22 01:34:05.613 JST 正式绯月回执为 `done`，唯一一步为 `verified`。独立只读回查确认网页角色组件 #16 下的绯月（桌面精灵）#61，发布 #73、明细 #151，22.0 → 23.0，生产修订 143 → 144。实际发布完成时间、归属、说明和版本全部同清单一致，发布标记仅出现一次。批次 `feiyue-pending-release-20261122`。精确 SQL 已先提交并推送为 `206fa1a0164d0adacdf89e35c3877224ca5225ce`。仅发布元数据，整库快照豁免。

正式绯月签收时间为 2026-11-22 01:35:51.075 JST。

## 2026-11-22 JST · Windows 绯月与转录登记合并发布审核

### 需求与范围

用户要求汇集合并现有未部署内容并登记花园。按实际正式安装逐项核对后，合并主动专聊及七条随机接话、七罪周期菜单头像、闲时工作反馈、普通对话关窗转录与确认，以及「今日任务」「三地天气」冷启动首击修复。普通语音和原待确认联合更新已发布。两段推理优化、语音模型预热试验及独立原型仍沿开发记录。需求和验收基准见 [REQUIREMENTS.md](REQUIREMENTS.md)、[开发纪要](docs/DEVELOPMENT.md) 和 [转录稳定性复核](docs/reviews/CONVERSATION_TRANSCRIPTION_STABILITY_REVIEW_2026-11-22.md)。

| 改动 | 旧行为与候选验收 | 主要文件 |
| --- | --- | --- |
| 主动专聊 | 独立待聊、低负载邀请。开始后 CPU 文字和 GPU GPT-SoVITS，首段音频完整后开窗。每轮正文 50–200 字，30–50 字自然分段，最多十轮。七条承接句抽一句、只播一次。支持主动结束和异常释放工作位。 | `desktop/private-chat*`、`bubble-voice*`、`dictation-host.mjs`、`emotion-initiative.mjs`、`shell.mjs`、`assets/voice/private-chat/` |
| 七罪头像 | 菜单标题从月印改为本次东京周期头像，悬停或键盘焦点显示真实强度，缺档或缺图时回到月印。保留 A、B 和情绪资产。 | `desktop/menu-*`、`menu.css`、`menu.html`、`shell.mjs`、`assets/desktop-media/feiyue-faces/` |
| 闲时工作反馈 | 显示开工目的和实际完成、暂停、失败结果及耗时。正式工作优先，同一结果可在自主行动日志回查。 | `desktop/{autonomous-audit,configured-renderer,poll-scheduler,reminder-checks,personality-nags,shell}.mjs`、`index.html`、`style.css` |
| 关窗转录 | 普通对话关窗后生成可恢复本机作业。三段同一模型，候选按来源展示并逐条确认。有标题的记录统一为 `[十字以内摘要]绯月助记-YYYY-MM-DD HH:mm:ss`，沿用同一次拟稿。有正文的记录使用固定栏目和尾部红心。确认前不写用户业务记录，确认后以原提交号和已保存的预览参数提交。 | `desktop/conversation-transcription.mjs`、`conversation-history.mjs`、`screen-question-host.mjs`、`task-inbox*`、`task-lifecycle.mjs`、`registration-flow.mjs`、`balanced-local-model.mjs`、`skills/conversation-transcription` 1.7、`skills/feiyue-interaction` 3.1 |
| 首击可见 | 页面已加载但 Windows 第一次 `show()` 仍隐藏时，在同一次点击补显。同一窗实例只加载一次业务数据。 | `desktop/panel-window.mjs`、`reminder-review-host.mjs`、`weather-host.mjs`、`private-chat-panel.mjs`，详见[开发注意点](docs/DEVELOPMENT.md#windows-重启后菜单弹窗首击可见性) |

### 目标、基线及数据库

- Windows 正式树 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，Git 底座 `39fd098e40ebf7c2c82dd5a6f9944ae98055566e`，含已发布安装补丁，上次源码回读 `00c09cd`。实查 PID 34600、回环 REST v4、原快捷方式、登录项及资料目录。开发来源 `067bfd5` 加工作区选定差异。以实际安装文件 SHA-256 为前值，叠入隔离候选后构建。`output/combined-release-20261122/windows-files.json` 共 129 项，75 新增、54 替换，摘要 `b767af5df02701559a1894168de66b279e0d75fcf673fb430c76f417ac15833c`。本机首次使用时创建加密转录 SQLite，原资料库无改表或回填。用户资料、语音模型和凭据不进包。
- 主站 `myapp` 生产版本 `b86d1843-b706-4bdf-b7ec-9742a0180d65`（源码 `b643509`），订阅 API `subscriptions-api` 生产版本 `ba9388dc-a2f1-4766-81a2-824a07d668a0`（源码 `0cd714a`），均已在控制面按时间核对为 100%。候选在 `output/combined-release-20261122/workers/`，以这两个版本的实际发布树为底。子项目先完成分类读取和提醒适配，再同步到主站私有 `CompanionHost.resourceCategories()` 和 API 的登记目录、提醒适配器、种子定义。`worker-files.json` 共五个 Worker 源文件及五份 SQL，摘要 `86e7acc0e136c0240f51da8945913e7c0b864cc25ba97a647341dfc651350727`。配置、已有绑定、依赖、凭据变化均无。
- 生产只读核对 `feiyue-companion.tasklist` 的 `reminders.create` 仅接受日期。`02-feiyue-companion.sql` 仅更新该行且要求确切旧值，增加可选 JST `HH:mm`，保留仅日期用法。`stockanalysis` 的 `ra_categories` 和 `rl_categories` 均缺少用户指定的「AI登记内容」，且 `ai-registration` 未占用。`05-stockanalysis.sql` 各新增一条，已有 ID 或名称时跳过并根据 `04-stockanalysis-check.sql` 核查兼容性。变更含两份业务库的种子数据，结构变化和已有业务记录回填均无。实际提交前核对结构、指纹和受影响行，先将精确业务 SQL 提交 Git 并更新数据库总账。对两库事先做加密快照、推送、远端恢复验证，再按先数据库后代码执行。花园登记元数据单独适用既有备份豁免。

### 已执行检查

- 候选 `node tools/build-desktop.mjs` 与桌面壳验证通过。候选 Electron 复测专聊接话、连点单播、首段后续接、模拟话筒与异常关闭，复测闲时头顶反馈和日志，以及标题栏和深浅色。菜单真实七种主题头像、强度工具提示和回退通过。「今日任务」「三地天气」隔离冷启动从自绘菜单点击一次均可见。普通对话关窗模拟流程完成，确认后只通过一条登记链执行勾选项并收到隔离回执。专聊整体候选复测使用样本音频，既往真实 2B CPU + SoVITS GPU 的开发记录在原纪要内。
- 合并 Node 回归最终 124 项通过。隔离手记测试初跑混用了旧 Worker 布局，且合成 TXT 存储未注入正式 API 使用的 `myR2` 绑定。换用同版 Worker 测试模块、给同一个测试存储提供该绑定后复跑通过，改动限于隔离夹具。两 Worker 的 `wrangler deploy --dry-run` 通过。`node worker-check.mjs` 用两个实际候选 Worker 模块、模拟认证及隔离 D1 验证 RPC 分类目录，新增分类各一行、提醒模板更新一行、重放不新增、提醒模板恢复与原有访问限制。`git diff --check` 通过。Windows 只读预检确认当时 PID 34600、129 项前后摘要、2 个伴随审核文件、18 条历史批次，等待或执行的本机任务为 0。正式执行前再次检查。
- 加入固定版式后，合并专项 Node 回归 126 项通过。检查七类字段、原话条件、缺项与上限、去除重复署名和尾心。Windows 最新候选隔离 Electron 复测从关窗开工到勾选登记。模型只给日记正文时，宿主补标题且只有一条个人日记。清单显示及隔离业务提交的运动正文逐字一致。此次版式变更只涉及桌面候选，无新增 Worker 或数据库差异。既有生产 Worker 与 D1 仍待本批发行确认。
- Skill 1.7 标题专项纳入本次候选。126 项合并回归通过。隔离 Electron 从关窗经原有三次模型调用生成清单，校验个人日记标题的东京年月日时分秒、正文与模拟业务写入逐字一致。单测另覆盖资源摘要十字上限、标题重复标记清理、提醒缺标题回退及一键事件。
- 本地 Worker 验收从目录 `output/combined-release-20261122` 执行 `node worker-check.mjs --serve`，只使用内存数据和模拟身份，拟监听 `127.0.0.1:8798`。常驻验收尚未获启动指令。真实生产手记、实际用户输入和扬声器听感待发布后确认，受 Access 控制的线上页面由用户截图确认。独立第三方审核未执行。

### 发布顺序与恢复

用户已要求合并并表示登记意愿，三个目标的新范围与两个业务 SQL 变更尚待明确部署确认。获准后复核活跃进程、候选摘要、两个生产版本、两库旧值和备份回执；先提交业务 SQL 和总账，再应用 SQL 并回读实际影响行；先主站提供私有 RPC，再切换订阅 API，最后按原入口受控重启绯月。验证资源目录、日期与时分兼容、窗口首击、启动路径、资料、任务库、历史批次与新 REST 实例。失败时逐目标记录真实结果，按前一版本回滚 Worker。Windows 由逐项备份恢复。提醒模板如需恢复按确切新值回滚；分类若有后续业务引用则保留，只有核实无引用才可以处理。已有业务记录和资料不覆盖。实际发布后补记三个版本、回执与 Git 推送实况。

### 花园预核

已执行 `npm.cmd run db:sync-schema`，结构新增为 0。现有网页角色组件 #16 → 绯月（桌面精灵）#61 版本 23.0，最后部署 #73、明细 #151，基线修订 144。成功分支演算为新增部署 #74 与明细 #152，版本 23.0 → 24.0，原记录不改，项目和功能归属、种子、独立改善、独立缺陷及其他关系无更新。三个目标一并登记，批次 `feiyue-combined-release-20261122`。拟清单在 `output/combined-release-20261122/garden-preview/registration.json`。正式实际结果明确后复核基线并生成精确清单，失败按「发布中」记实际情况，保留成功版本。精确清单由用户确认后先提交 Git，再由新正式实例接手一次登记、核验并取回回执。目前无生产写入、安装、部署、Git 发布或花园入队。

### 实际生产发布回执

- 主站 myapp f46a9f75-745d-4625-882d-5dbc97407bbe，2026-11-22T04:43:30.1143550+09:00。订阅 API 8526fb2e-7f62-4938-a2bb-54114c75bc24，2026-11-22T04:43:39.3544980+09:00。生产流量和绑定前后一致。受 Access 控制的线上页面效果待用户截图确认。
- Windows 版本 b767af5df027 于 2026-11-22T04:44:10.2150000+09:00 受控启动。PID 34600 → 27708，129 项安装文件和 2 个审核文件全部校验。保留原运行入口、资料、轮询、18 条历史批次。
- 生产 D1 后检通过。提醒模板一行，随手记及资源分类各一行，业务 SQL 27086a60bdc879e5dde94a7b6d9449f4c614303c。用户已明确批准这次合并发布。花园精确清单待用户确认。

### 绯月合并发布与花园最终回执

2026-11-22 JST，用户明确批准合并发布及花园部署 #74、明细 #152 的实际清单。

- Windows b767af5df027 于 2026-11-22 04:44:10 JST 从原入口受控重启，PID 34600 → 27708。129 项安装件、2 个审核文件及 18 条历史批次已核对。正式安装目录的独立临时资料冷启动验证「今日任务」「三地天气」首击均可见。
- 主站 f46a9f75-745d-4625-882d-5dbc97407bbe 于 2026-11-22 04:43:30 JST 发布。订阅 API 8526fb2e-7f62-4938-a2bb-54114c75bc24 于 2026-11-22 04:43:39 JST 发布。两端 100% 生产流量、原有绑定逐字段一致。Access 受控页面效果待用户截图确认。
- 提醒模板更新一条并可接受 JST 时分，随手记及鱼与熊掌各新增一个「AI登记内容」分类，生产已回读。两库的加密备份 stockanalysis cc189caa51bf（远端恢复 118/118）、feiyue-companion 2c5c77703bb9（远端恢复 18/18）。业务 SQL 提交 27086a60bdc879e5dde94a7b6d9449f4c614303c。
- 部署 #74、明细 #152，网页角色组件 #16 → 绯月（桌面精灵）#61，23.0 → 24.0。登记先提交精确 SQL 22dbb3aad4df3bce028edba26b2e82b16b71169a，期间仅通过正式绯月 REST 提交一批 feiyue-combined-release-20261122。绯月于 2026-11-22 04:49:49 JST 返回 done，唯一步骤 verified。生产独立复核修订 144 → 145，两个目标行与清单相符，发布标记一次。签收于 2026-11-22 04:50:08 JST。
- 三个已发布代码提交均已推送并回读：myapp 19f3cb76f29598439c03ebe91ee88069d884139a、api-worker df21190d209dbf6f772d1b31e722d7c993e2ee16、windows 311efb6e3b51b24e5879d2675338b9e90cf2b44b。
