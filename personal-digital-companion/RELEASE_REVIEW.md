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



## 绯月长期计划每日实际工时 · feiyue-hours-20261120 · 生产候选

用户要求「单纯登记投入时间」「写入主站长期计划，绯月和主站都能看到」，并要求正式 task 模板。本次在「今日任务」给当日计划任务输入 0 至 24 小时，可含小数。验收以两端读回同一数值、一次派发只登记一次、计划继续停在当前节点为准。用户要求开始部署，花园只登记部署信息、保持原版号。最终范围许可和花园具体清单确认待取得。第三方独立审核未执行。

本项目发布目标为绯月桌面及功能来源，今日任务工时入口。

### 来源、范围与复核

来源 WebCharacter 的隔离 main 基线 415a125892c1f4a643f2827fbbe3897eaad8f367，API 基线 601629250a0f630a7f63f16f0537c48faaa0a879，主站基线 b8cc7a375e53d1aaa3a06efea27c024d4fde0e2e。三个候选根在 G:/selftool/WebCharacter/work/fyh 的 src/personal-digital-companion、api/api-worker 和 main/myapp。逐仓运行 git diff <对应基线> -- <下列文件>，同时用 git ls-files --others --exclude-standard 核对新增项。保留已发布的供应商心跳与回退。候选沿用远端主线的桌面窗口和私有 RPC，只包含工时所需差异。实际生产控制面核验 myapp 版本 63f59cf7-9ee2-4e8f-ba36-275f3b588ed8、subscriptions-api 版本 12934226-3a1a-470d-ad2b-f61bc1ff258d 各承载 100%。

### 代码、数据和兼容性

- 来源 agent/seeds/tasklist-registration.sql、agent/tasks/parameters.mjs、agent/tasks/hu-shi-execution.mjs 和新增 agent/tasks/planner-hours.mjs 定义 planner.hours.record，复用提交号、领取和回执。agent/host/reminder-review.mjs 提供派发版本、可登记状态及已登记值。API 接入位于 src/companion 下相同的五个模块/种子文件。
- 来源 desktop/reminder-review-flow.mjs、desktop/reminder-review-ui.mjs、desktop/reminder-review.css 新增输入、模板执行及只读回执核对。旧列表可按提醒号读取当天派发。测试为 agent/tests/planner-hours.test.mjs、agent/tests/reminder-review.test.mjs、tools/test-planner-hours.mjs、tools/preview-planner-hours.mjs。来源单独保留验收脚本与原始需求。
- 主站 src/features/companion/reminder-review-gateway.js 和 vendor/reminder-review.mjs（同目录下）将本人可见提醒关联到当日派发，调用现有 record-dispatch。原本只能查看锁定项，现在可登记小时并刷新读回。核对账户、日期、派发、版本和实际小时数；审核重点为失败与未获回执的差别，回执丢失后只读，不再次执行。
- 生产 feiyue-companion 的 tasklist 现有 6 条、目标类型 0 条。仅以 API 的 database/changes/feiyue-hours-20261120/template.sql 新增 1 条，写后应为 7 条、目标恰好 1 条。全量初始化 seed 只供初始化，生产使用单行 SQL。业务表结构迁移、旧数据回填、绑定、Secret 和配置变更均无。发布验收不写真实示例工时。旧客户端原提醒接口可用。

### 已执行的验证与本地验收

- 生产只读核对采用主站 npm.cmd run db:sync-schema，217 个结构对象同步验证；任务库仅导出结构，在内存 SQLite 重建后再核对模板。花园数据库当前修订 92，项目 #16「网页角色组件」、功能 #58「绯月任务链与自动登记」已有两次发布，最近为部署 #43、明细 #111、版本 2.0。本次标记计数 0。
- 来源 node tools/build-desktop.mjs 成功。COMPANION_HU_SHI_MAIN_SOURCE 指向候选主站的 node --test agent/tests/*.test.mjs 为 196/196。原回归中旧列表的当日计划现可登记，因此未选可操作项的预期数从 1 更新为 2。API node --test 为 33/33，主站 node --disable-warning=ExperimentalWarning --test tests/*.test.mjs 为 836/836。主站 npm.cmd run check 与 API npm.cmd run deploy:dry-run -- --keep-vars 都通过，API 打包使用合成 Audience。
- 来源 node tools/test-planner-hours.mjs --source 及不带参数的同一命令通过，运行真实主站计划和任务处理器。1.5 小时两端一致、重复执行一次计入、回执中断后只读恢复、过期派发与无效小时拒绝、计划节点未推进。node tools/test-planner-hours.mjs --preview 在实际本地 workerd、隔离 D1 验证页面和工时任务读写。
- 手动本地 Worker 已准备，用户要求启动时执行。工作目录 G:/selftool/WebCharacter/work/fyh/src/personal-digital-companion。PowerShell 设置 $env:FEIYUE_MAIN_DIR='G:/selftool/WebCharacter/work/fyh/main/myapp' 和 $env:FEIYUE_API_DIR='G:/selftool/WebCharacter/work/fyh/api/api-worker'，再运行 node tools/test-planner-hours.mjs --serve。进程自动用独立内存数据建立当天计划，监听 127.0.0.1 的 8796 端口，退出丢弃。当前未为用户启动常驻验收，未取得人工验收。受 Access 保护的线上效果待用户截图确认。
- 在生产结构的隔离副本演练单行模板成功、重复插入拒绝。花园参数化 SQL 使用合成旧说明演练成功、并发旧值冲突与重放拒绝，显示版本和发布数均保持原值。

### 生产步骤、恢复与发布后登记

1. 取得本次生产许可和花园清单确认，复核两个 Worker 与远端 main 未偏移。为 feiyue-companion 创建当前生产加密快照，单独提交并推送至备份分支，从远端干净检出解密还原，逐表核对、外键与完整性通过，再次核对写前基线。先提交精确模板 SQL，再应用和后检。前置守卫失败停止，期间新增业务写入须重新核对。
2. 先从候选 main/myapp 执行 npm.cmd run deploy -- --keep-vars，再从 api/api-worker 执行 npm.cmd run deploy -- --keep-vars。分别核实 100% 版本、旧绑定与 Access 匿名门禁。现桌面源码已有适配，旧进程需重启加载；不强停正在执行的任务。用户在实际桌面填真实工时并提供截图后补记线上效果。
3. 花园清单拟在 #43 的 #111 末尾追加一段本次部署信息，含实际 JST 时间、两份 Worker 实际版本及结果。沿用功能 #58 的 2.0。新增功能、种子、改善和新的部署主记录均为 0。若部分发布或失败，按实写「发布中」及失败情况。发布结果明确后准备精确 SQL，数据库 stockanalysis 写前独立加密备份、推送、远端还原验证，复核原说明与修订，先提交 SQL，再一次写入及查重后检。预期修订 92 → 93。准备模板在主站 database/changes/feiyue-hours-20261120/garden.template.sql。
4. 接口异常时保留已登记数据，停止继续发布。需要恢复时按 API、主站相反次序恢复上述已核实版本，任何模板补偿先查现存任务引用，禁止删除已应用的工时或覆盖计划。花园补偿另核对旧文、标记及后续记录。生产备份、两库写入、生产部署、本次 Git 提交与推送和线上效果均未执行。结束后逐仓普通 push 与远端 SHA 核实，补记真实发布、数据库与备份回执。

用户已明确确认本次双 Worker 生产部署、单行模板、备份及花园 #111 同版追加清单。执行结果以下方实际回执为准。

### 实际生产回执 · 2026-11-20 JST

- 2026-11-20 11:16:55 JST，myapp 部署 f630ee6e-6fd5-43c7-b204-a3f73416dfe3，版本 facfbd09-9bcf-4619-ac6e-7c8b0b6c3d46。2026-11-20 11:18:09 JST，subscriptions-api 部署 e6cb13be-1cbf-4865-bb86-8a76d0c114b7，版本 8add9912-a4fc-4a30-98e2-ddc2f97facdd。两次均从控制面确认 100% 流量，原有绑定集（主站 42 个、API 13 个）与发布前一致。匿名访问主站任务链返回 302，API 今日任务返回 403。Access 受控的真实工时登记效果待用户截图确认。
- 独立任务库事前备份 32681e5e70c252b47621a80502433c4c64d4ce91，从远端恢复 15/15 表。精确 SQL 已以 ff2f567 提交推送，写前核对备份有效，新增正式模板一条。整库 15 张表与预演完全一致，完整性和外键检查通过。
- 花园库事前备份 865b6c60ead9222ebffc6cdc14fc0e088389ddfb，远端恢复 117/117 表。精确 SQL 以 1aae8dd 提交推送。写前重新核对备份有效，发布后仅一次追加到项目 #16、功能 #58、部署 #43、明细 #111，唯一标记计数 1，修订 92 → 93，版本仍为 2.0。关联发布数仍为 2。全部 117 张表与预演一致，完整性和外键通过。
- 三仓发布代码已推送并读回核对。来源 c1c313c483a637055dad37b61b2c1d0935373ab9，API 87261e151626f6aebd835378d81e977f15cf5acf，主站 e15dcae1ce817b70459bc55e7ef5035b4d6378d3。本回执随独立记录提交保存。无用户业务工时被用作生产测试。


### 2026-11-20 JST　绯月 PC 队列、服务器生图与提醒调整

**状态**　候选已在隔离环境集成。用户已确认花园清单。生产发布许可待确认，生产 SQL、Worker 发布、发布结果登记及远端同步均待执行。未委派第三方审核。

**桌面和来源变更**　`desktop/server-task-command.mjs`、`server-registration-plan.mjs` 和 `agent/{chains,devices,tasks,execution}` 接通服务器建单、领取、串行执行和结果回执。`desktop/{interaction-skills,image-planning,image-tasks,memory-archive,conversation-details}.mjs`、`skills/` 及 `workflows/comfyui/image_chain.py` 接通稳定技能 ID、按需步骤、图片本地归档及任务复盘。对话、模型、附件核对与登记、头部点击、开机启动、轮询设置、提醒及天气对应改动位于 `desktop/` 和 `agent/`；`tools/` 包含同步、集成、Electron 及规划回归入口。交付包含本地来源和可重建桌面包；本次 Cloudflare 目标仅为表中两个 Worker。运行中的桌宠需另行重启加载主进程改动。

`node tools/build-desktop.mjs` 已从 Git 资源构建。真实隔离 Electron 的 `tools/test-panel-titlebar-electron.mjs` 通过六个面板、深浅色、热加载和轮询设置检查。13 份 skill 最新索引已逐项比对历史快照，按 Git 检出换行重新核对内容摘要，保留 `feiyue-interaction` 1.6、`image-task-chain` 1.7 等现有版本，未修改线上或正在运行的用户配置。

**需求和验收**　用户要求通过绯月创建服务器端图像任务，沿用领取队列，本机生成 PNG 并放进对话归档和任务复盘，服务器接收任务号与结果回执。服务器入口本次接收文字提示，参考图、改图及放大使用桌面本地工作流。PC 任务保留指定设备或任意一台可用电脑的选择，串行链逐项放行。业务写入支持同号重试和回执核对。提醒查找和更改在原业务权限内执行。以上线前生产版本为恢复点。

| 核对目标 | 当前基线 |
| --- | --- |
| 来源 WebCharacter，子目录 personal-digital-companion | 远端 main `7b64f23ad043fee3e550f4365c5bc4c0492b37a5`，叠加工作区 `84688b875476b9e58d6da83b9534a6a8b092bf26` 之后的绯月改动，保留远端登记修复 |
| cloudflare 主站 myapp | Git `aaecaecfc25514a2d2df99b613233b92244d4150`，生产版本 `facfbd09-9bcf-4619-ac6e-7c8b0b6c3d46` |
| informationManage 的 subscriptions-api | Git `39dbfb32f96b7643bb56c01ebc331cae50dd1bd8`，生产版本 `8add9912-a4fc-4a30-98e2-ddc2f97facdd` |

三个独立工作树同属本地分支名 `codex/feiyue-pc-release-20261120`。在对应仓库运行 `git diff --name-status <表中该仓基线> HEAD` 枚举已提交的准确文件，去掉 `--name-status` 查看逐行差异。从来源根的 `tools/sync-release-sources.mjs` 核对服务端模块映射。两个 Worker 的上一发布源码至表中基线的 src 差异为空。

**数据、配置与兼容性**　已运行主站 `npm.cmd run db:sync-schema` 并只读核对生产。任务库 `feiyue-companion` 缺少迁移 014、015 和十个 `pc.*` 模板。业务包 `myapp/database/changes/feiyue-pc-tasks-20261120/01-companion.sql` 新增 tasks.dispatch_all 和 chains.serial_pc，两列默认 0；新增空表 pc_registration_receipts，插入一项文字生图、一项回显、八项业务模板。历史任务沿用原默认行为，无业务数据回填。无新密钥、绑定、环境变量或包依赖。未接入处理器的旧客户端须升级后才能执行新任务；仅部署 Worker 无法更新已运行的桌宠。

**花园清单**　线上 stockanalysis，修订 93，项目 #16「网页角色组件」，功能 #58「绯月任务链与自动登记」处于 test，现有部署 #41、#43。用户已确认发布成功后新建一条部署和对应明细，累计 2 次变 3 次，2.0 → 3.0，保留 #43 和明细 #111 原文。说明包括 PC 派发与串行领取、服务器生图本地归档、提醒调整、实际结果、两个 Worker 版本。功能、种子、改善均无需更新。成功 SQL 模板 `02-garden-success.template.sql` 只供预演；以真实 UTC 时间和版本生成精确 SQL，展示时间使用 JST。基线不匹配时停止并重读。不论结果只登记一次；若失败按真实情况登记「发布中」，成功模板不得执行，若版本计算会增加部署次数则先确认失败记录的处理，再写花园。

**隔离测试和证据**　来源 `node --test agent/tests/*.test.mjs` 在两个候选项目环境下 229/229，技能目录 `python -B tools/test-skills.py` 4/4。主站 `npm.cmd test` 837/837，API `npm.cmd test` 33/33。主站 `npm.cmd run check`、API `npm.cmd run deploy:dry-run -- --keep-vars` 均通过。
从来源运行 `node tools/release-preview.mjs`，真实双 Worker 处理器和隔离 D1 完成六笔合成业务、幂等恢复和私有 RPC 读回；模型供应商使用替身。`node tools/test-serial-pc.mjs --integrated` 通过九节点串行、八次提前领取拦截、五个竞争请求中两次成功三次冲突。`node tools/test-server-image-live.mjs --live` 接隔离任务库与本机 ComfyUI，作业达到 COMPLETED，归档 446777 字节的 512×512 PNG；服务器回执仅含作业号、格式、尺寸和归档状态。本次未在生产创建测试业务或上传图片。SQLite 预演覆盖业务迁移、十模板、旧数据、外键与完整性、重复执行拒绝、花园版本与并发修订冲突，#111 历史说明逐字保留。受控页面线上效果待用户截图确认。真实云端供应商和不同电脑之间的通信未在生产验收。

**供用户启动的本地双 Worker**　以下为 PowerShell，从隔离工作树运行。需要本机已有主站依赖，脚本自行初始化隔离数据库和合成数据；按 Ctrl+C 结束。短时集成运行已通过，持久在线验收等待用户下达启动指令。

```powershell
$releaseRoot = 'G:/selftool/WebCharacter/work/feiyue-pc-release-20261120'
$env:FEIYUE_MAIN_DIR = Join-Path $releaseRoot 'site/myapp'
$env:FEIYUE_API_DIR = Join-Path $releaseRoot 'service/api-worker'
Set-Location (Join-Path $releaseRoot 'source/personal-digital-companion')
node tools/release-preview.mjs --serve
```

**执行与恢复顺序**

1. 获得本次生产许可，复读 Worker 版本与绑定、数据库结构及花园旧值。复核候选差异。运行本地检查的测试数据只用于隔离环境。
2. 任务库写入前另做全库一致性加密备份，独立提交推送到备份远端，并从全新远端副本恢复校验。对照鲜活基线预演、校验 SQL 哈希，精确 SQL 先提交推送，再执行 D1 变更包。写后逐表与预演比对，检查外键与完整性。如有差异中止。
3. 依次在主站、API 候选根执行 `npm.cmd run deploy -- --keep-vars`，记录真实版本、流量和绑定。核对匿名端点的访问控制；授权页面由用户访问并提供截图。两个 Worker 均成功后才使用成功登记方案。
4. 花园写入前对 stockanalysis 独立加密备份、推送、全新远端恢复验真与写前复核。以最终精确 SQL 提交后登记一次，后检部署/明细、修订及 #43/#111 原文，保存脱敏回执。发布结束补记实际时间、Worker 和 Git SHA，三仓常规提交、推送并读回校验。
5. 部分失败时停止后续放量，按已变动目标恢复上表版本（双端均已放量时先 API、再主站）。追加字段和空表兼容旧代码，优先保留已有工作数据。业务数据补偿前核对增量和使用情况，不能用旧快照覆盖后续业务；任何破坏性回退单独确认。生产备份、线上写后验证和回滚演习尚未执行。

**补充复测**　隔离 Electron 加载本机 Qwen，以 `tools/test-skill-responses.mjs 4 <输出文件>` 回放 8 组启用/移除 skill 对照。首次 15/16，一条普通对话回忆出现 LOCAL_AI_TIMEOUT；同候选独立重跑 16/16，8/8 桌面对话入口和 5/5 图片分流检查通过。`tools/test-image-planner-mock.mjs regression <输出文件>` 通过 19/19 个去重图像样例，使用模拟队列终态。以上保留首次超时，不能保证本机推理每次在时限内完成。

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

### 2026-11-20 JST　两轮自审与合规检查

本次复核起点为来源 `b008175`、主站 `50671ab`、API `d98f6bf`。沿用已确认的发布范围和数据库时序。以下结果对应本轮修正后的候选。第三方独立审核尚未进行。

**第一轮 · 任务与回执**　对照“服务器提交文字生图、PNG 存本地复盘、服务器收任务号与回执”，从桌面确认、领取、原文传递、ComfyUI、归档到 Worker 终态逐项核对。桌面原先已返回正确的五个字段，但服务端的通用结果校验允许多余内容。来源 `agent/tasks/actions.mjs` 对生图成功回执增加专用检查，仅允许与任务匹配的作业号、PNG 格式、正整数宽高和已归档标记；由既有执行记录校验保证各次尝试与最终回执一致。失败任务沿用原约定。来源 `agent/tests/task-lifecycle.test.mjs` 新增六类无效回执、数据库无变更、合法回执与重放的回归。来源通过后同步至 API 同名模块，两份内容哈希一致。通过实际桌面对话测试宿主、隔离 Worker/SQLite 与本机 ComfyUI，再次成功归档 512×512 PNG（451031 字节），终态 COMPLETED。作业号、格式、尺寸、归档标记以外的内容均未进入成功回执。服务端校验回执字段；本机文件存在性在桌面实际归档处验证。

**第二轮 · 恢复、登记与发布合规**　复查指定设备和任意电脑领取、前序成功门槛、同号重放、业务回执核对与旧记录。核对花园 `store.mjs` 的部署计数和版本算法。发现旧成功模板接受缺少 Worker 版本的说明和无效的时间。更新主站 `database/changes/feiyue-pc-tasks-20261120/02-garden-success.template.sql`，核对毫秒精度 UTC 时间、两个 Worker 版本的 UUID 形状以及说明中对应的名称与版本。真实版本须在发布后从控制面读取。可在候选集合目录运行 `python -B site/myapp/database/changes/feiyue-pc-tasks-20261120/test_release_sql.py source/personal-digital-companion`。两组隔离 SQL 用例通过，覆盖旧任务与旧链默认值、十个模板、修订冲突、回执不全、重复提交和旧明细 #111 原文保留。拒绝的花园写入前后全库转储相同。花园当次线上只读基线为修订 93，本次复核使用隔离数据；真正写入前须按前述流程重新比对。

**验证结果**　`COMPANION_HU_SHI_MAIN_SOURCE` 指向候选 myapp 后执行 `node --test agent/tests/*.test.mjs`，230/230。主站和 API 各自执行 `npm.cmd test`，分别为 837/837 和 33/33。双 Worker 私有 RPC、六笔业务回执及恢复、九节点串行链、八次提前领取拦截通过。两个 Worker 构建预演通过。13 份技能索引与来源内容摘要一致，先前记录的一次普通对话模型超时继续保留。发布差异已检查生产凭据常见格式、模型、本机配置、日志与生成图片；本轮新增测试仅用合成占位值。

**结论**　两处缺口均在本地修正并复验。现有花园清单仍为 #16/#58 成功后从 2.0 到 3.0，#43 原文保留。生产发布许可、写前备份及远端恢复验真、生产写入、最终 Git 推送和受控页面用户截图仍待后续阶段。自审期间未执行生产登记或部署。


### 2026-11-20 JST　追加两轮故障自测

本次以来源 `af6c50d`、主站 `ba18141`、API `c05c12a` 为起点，只增加回归用例和审核记录。Worker 运行代码和待执行生产 SQL 与这三个基线一致。

1. 生图任务回执断线。通过桌面服务器任务入口创建 all 生图任务，在隔离 Worker 前后分别模拟结果未送达和已提交成功但响应丢失。使用同一 profile 重建桌面任务及图片模块，调用启动恢复两次。两种场景均只调用一次模拟生图，补传报文与原报文逐字节相同；服务器最终为 COMPLETED，执行记录一条，复盘能读回同一作业，归档 PNG 内容一致。本轮图像后端使用固定测试图片，上次真实 ComfyUI 的证据见上节。运行 `node --test agent/tests/server-image-task.test.mjs`，3/3。含主站契约的来源全量 232/232，零跳过。
2. 事务中途失败。使用隔离 SQLite 和 Miniflare D1 实际执行发布 SQL。在第十个 PC 模板插入时触发中止，确认同批新增字段、回执表、模板全部回滚。另在花园完成部署与明细插入并更新修订时触发中止，核对原部署、明细及修订均恢复。移除测试故障后两包重试均成功，PC 模板共十个，花园仅新增一条部署，修订 93 → 94，版本 2.0 → 3.0，#43/#111 历史完整。可复跑的 SQLite 用例位于 `myapp/database/changes/feiyue-pc-tasks-20261120/test_release_sql.py`，两组均通过；D1 使用本地内存绑定与单批事务，生产执行前仍须按实际执行方式及有效备份重新预演。

两轮未发现新的发布阻断项。此次没有操作生产数据库或发布 Worker。


### 2026-11-20 JST　生产发布与花园登记回执

用户批准部署并登记花园。以下为生产控制面、两库全量后检和 Git 远端读回的实际结果。

- 2026-11-20 14:44:22 JST，myapp 版本 `4a258f53-a6af-4cd0-bafc-3852b255fdb9`，部署 `4a75877e-753b-42e6-b4c8-f62df02fc46d`，流量 100%，42 个绑定逐项匹配发布前配置。
- 2026-11-20 14:44:59 JST，subscriptions-api 版本 `20b295f1-5d27-4985-a663-9ee5cd4a3a3b`，部署 `41e56562-3b7c-4bf1-85ac-6b9fa404b67c`，流量 100%，13 个绑定逐项匹配发布前配置。
- feiyue-companion 事前加密备份 `c64a0c68dc3ecf0f9e1420071321dbcfdb78b62a`，从指定远端恢复 15/15 张表。业务 SQL 提交 `cd3deb9`；以提交中的精确字节预演并比对写前新鲜度，单次迁移及十模板写入成功，全部 16 张表与预演匹配，完整性、外键通过。
- stockanalysis 事前加密备份 `6fdbb69bb574ed7516f70296a025510eb4c91e42`，远端恢复 117/117 张表。成功登记精确 SQL 提交 `a7b753016e119ac5784a1efe34d4acfb3645cb74`。写前复核通过后单次导入。花园 #16/#58 新增部署 #45、明细 #113，2.0 → 3.0，修订 93 → 94。旧 #43/#111 原文保留。后检 117 张表及完整性、外键与预演一致。
- 匿名主站任务链返回 HTTP 302、API 任务链返回 HTTP 403，验证了访问控制。受控页面实际交互待用户截图确认。本次未在生产创建生图样例，未重启用户桌宠。
- 发布代码及精确 SQL 已推送并读回核对三仓 main。来源 f9527e9，主站 a7b7530（Worker 源码 cf61773），API a4f3e0d。生产回执随本次后续记录提交保留。主站数据库变更包 `database/changes/feiyue-pc-tasks-20261120/` 含 SQL、执行清单及脱敏回执。

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

### 2026-11-21 JST · 手记质问按对象计时花园登记完成

用户确认原清单并要求本地收尾。写前重新核对生产花园修订 128、功能版本 15.3、项目和功能归属及三个新增编号，均与确认时一致。主站先提交确认清单和两步精确 SQL `303be5c57d7dd18ddce83a94f7f121de695d6380`，再经正式绯月 v4 一次提交原批次。15:01:25 JST 返回 202，15:02:01 JST 批次完成，两步分别核对修订 129 和 130。15:04:54 JST 独立回读，逐字段核实 Bug #27 为已修复、部署 #66 和明细 #137 各一条，归属项目 #16 / 功能 #61，版本 `15.3 → 15.4 → 16.1`，同一发布标记只出现一次。结构指纹与写前一致。工作区 `output/diary-audit-object-20261121/garden-verified.json` 保存独立核对摘要。

另一次 TXT 附件更新随后沿用此次安装为基线。15:02:17 JST，新的正式进程 19436 从同一目录和资料目录启动。当前实际安装文件的隔离专项复测 4/4 通过，实际 Electron 的到期气泡和可编辑轮询设置均通过。该复测不向真实手记写入测试资料，首次真实自然质问待观察。

15:07:07 JST 已通过正式绯月标记回执已取回，并核实本批退出待回执清单。主站执行回执和数据库总账本地提交 `690405fd147253aca2a3bb301a5f4c05ae4b2e0c`。本次收尾提交留在本机 Git。

### 本次 Git 同步范围

GitHub 主线 `b3269f9` 已含 `ca0e94b` 的计时修复。归一化换行后，主线五个运行文件均与当前正式安装版一致。此合并补齐本次审核、验收回执和回归测试，测试使用仓库既有的隔离手记服务夹具。相关 Node 回归 33/33，桌面资源构建通过。

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

### 2026-11-21 JST · 手记质问按对象计时花园登记完成

用户确认原清单并要求本地收尾。写前重新核对生产花园修订 128、功能版本 15.3、项目和功能归属及三个新增编号，均与确认时一致。主站先提交确认清单和两步精确 SQL `303be5c57d7dd18ddce83a94f7f121de695d6380`，再经正式绯月 v4 一次提交原批次。15:01:25 JST 返回 202，15:02:01 JST 批次完成，两步分别核对修订 129 和 130。15:04:54 JST 独立回读，逐字段核实 Bug #27 为已修复、部署 #66 和明细 #137 各一条，归属项目 #16 / 功能 #61，版本 `15.3 → 15.4 → 16.1`，同一发布标记只出现一次。结构指纹与写前一致。工作区 `output/diary-audit-object-20261121/garden-verified.json` 保存独立核对摘要。

另一次 TXT 附件更新随后沿用此次安装为基线。15:02:17 JST，新的正式进程 19436 从同一目录和资料目录启动。当前实际安装文件的隔离专项复测 4/4 通过，实际 Electron 的到期气泡和可编辑轮询设置均通过。该复测不向真实手记写入测试资料，首次真实自然质问待观察。

15:07:07 JST 已通过正式绯月标记回执已取回，并核实本批退出待回执清单。主站执行回执和数据库总账本地提交 `690405fd147253aca2a3bb301a5f4c05ae4b2e0c`。本次收尾提交留在本机 Git。


## 2026-11-21 JST · AI 接口心跳轮询设定（本机发布前审核）

### 需求与验收

用户要求「把这个加入轮询设置」「频率默认改为3小时」，随后要求更新正式桌宠、自动提交花园记录并推送收尾代码。Windows 绯月的「设置与维护 → 轮询设定」应显示 AI 接口心跳，默认启用且每 180 分钟检查，可独立启停，间隔范围 10–300 分钟。保存新间隔或重新启用后即时重排，下一次时间显示为 JST，上一轮还在执行则跳过。

### 目标、版本与差异

- 目标为 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion` 下的 Windows 正式桌宠。已核对在运行的 PID 19436、8765 监听进程、15:02:17 JST REST 启动时间、资料目录和原桌面快捷方式及登录入口。无其他部署环境和 Worker 更新。
- 正式安装树 Git 基线 `39fd098e40ebf7c2c82dd5a6f9944ae98055566e`，并有既有正式补丁。开发来源为 `G:/selftool/WebCharacter/personal-digital-companion`，比较基线 `ab3ac36c01cbcca4a587e523ac2efffc89d4e1ea`。使用开发基线、当前开发文件、实际安装文件三方对照。发布包 `G:/selftool/WebCharacter/personal-digital-companion/output/ai-heartbeat-release-20261121/manifest.json` 列出各文件前后 SHA-256。只按该清单在 `baseline` 和 `candidate` 逐文件执行 `git diff --no-index --ignore-cr-at-eol`。
- `desktop/poll-scheduler.mjs` 新增 180 分钟心跳，复用既有本机轮询配置及诊断记录。到点遇到在途检查或应用正在退出则跳过，不进待处理队列。`desktop/task-lifecycle.mjs` 去掉独立 30 分钟计时器，保留既有心跳请求、取消及任务通信日志入口。
- `desktop/shell.mjs` 将心跳接入桌面调度。三方合并时的两处处理均保留正式版现有闲时项目清单和忙碌判断，只加 AI 心跳；开发版的「此刻所想」及并行工作不包含在候选。
- `desktop/poll-settings.html`、`desktop/poll-settings-ui.mjs` 增加心跳配置显示，沿用公共卡片和 JST 格式。`output/desktop-bundle/poll-settings.html` 和 `output/desktop-bundle/poll-settings-ui.mjs` 为该两份实际加载的资源，共七个运行文件。源码同步另含本次回归测试、需求、指南和审核纪要。

### 数据及兼容性影响

已有本机 `reminder-checks.sqlite` 首次自动插入一条 `local_polls` 配置记录。不需 SQLite 结构迁移、现有数据回填、生产业务数据库变更、Worker 部署或账号经费配置变更。云端已有心跳路由、失败换线及收费线路跳过规则沿用。旧文件回退后忽略该本机设置行。单独的花园元数据登记按实际发布结果、经用户确认的清单执行。

### 实际验证和审核重点

- 开发树两批专项共 87 项通过，2 项既有跳过。桌面构建、桌面 shell 回归、Electron 浅深色与窄窗口、两套截图均通过，命令见 [开发复核](docs/reviews/AI_HEARTBEAT_POLL_REVIEW_2026-11-21.md)（开发树）。
- 正式版候选按七路径比对 SHA-256 和差异，五个 `.mjs` 执行 `node --check` 通过。在候选 `agent/tests/pending-poller.test.mjs` 执行 `node --test --test-name-pattern 'AI 心跳默认三小时'`，1/1。正式 Electron 对候选执行 `verify-panel.mjs <候选根>`，默认 180 分钟、东京时间、90 分钟即时改期、停用重开、原手记轮询及模拟请求回执通过。
- 重点核查心跳只有一个定时入口、改期与启停的持久化、在途请求退出取消、原轮询卡片与正式版闲时项目仍可操作。正式实例重启和首次自然触发尚待验证。第三方独立审核未执行。

### 发布、恢复、登记与 Git

用户已要求更新、登记花园并推送。七文件范围的本次安装及受控重启待明确确认。获准后核对监听、原启动入口、活动任务与全部摘要，备份原文件和本机设置库，通过应用流程正常停旧进程，替换清单文件，从原快捷方式启动。核对新 PID、资料路径、8765 `/infoguide`、七项摘要和 SQLite 心跳设置行，在隔离资料下从实际安装目录复跑 Electron 面板。启动或验收失败时先正常停止，再从备份恢复七文件，以旧入口启动并复核。用户正式版界面验收及正式供应商自然心跳结果待后核验。

花园结构同步实际通过，新增结构对象 0，线上只读核实修订 135、项目「网页角色组件」#16、功能「绯月（桌面精灵）」#61、当前版本 17.0，未发现本批发布标记或同名改善。拟登记该功能的已完成改善与实际部署明细。项目、功能定义、种子及其他类别无需更新。安装结果确定且制单时复核线上基线后，展示完整前后值、确切编号、版本和实际时间，取得清单确认。然后提交 SQL 后经重启后的绯月 API 提交一次，回读并留存回执。批次 `feiyue-ai-heartbeat-poll-20261121` 尚未提交。实际发布、登记和远端 Git 验证均待执行。推送只含本次范围，保留已有历史和并行工作。


## 2026-11-21 JST · 绯月情绪与主动互动联合发布候选

本次用户要求把情绪模块和等待它的已开发功能一起准备上线，整包做两轮自测及合规检查，并准备花园登记清单。阶段完成标准为三端候选可复核、真实桌宠写入路径及主站列表和正文在隔离资料上贯通、同一包复测、旧功能与本机隐私边界可查证。当前阶段为待用户验收及发布确认。第三方独立审核未执行。

### 目标与差异基线

候选根目录为 `G:/selftool/WebCharacter/work/feiyue-emotion-news-rc-20261121`，三个子目录分别为 personal-digital-companion、api-worker 和 myapp。发布压缩包 feiyue-emotion-news-rc.zip 共 114 个变更文件及一份清单，SHA-256 为 `bcba1573a637094f674c9d07611f5e12ec6eff32c091f5cb692725b79b59afe5`。release-manifest.json 按目标和路径列出旧值、新值及长度。没有删除项。源码留痕副本在 WebCharacter 的 personal-digital-companion/docs/releases/emotion-news-20261121/。

* Windows 目标为 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。PID 19436、实际启动命令、登录启动项、REST v4 实例与 profile 指向该安装树。Git 基线 39fd098e 加其后的已安装单文件更新。逐文件比较实际安装字节，流程采用 50c178e 的搜索／新闻和 0518e28 的人格工作区，叠加 ab3ac36 保留已安装的手记限时、续办和中断逻辑。搜索费用修正在隔离搜索开发树及本候选同步。正式桌宠发布范围 112 个文件。
* API subscriptions-api 使用前次实际发布树 G:/chat/2026-11-20/wo-z/work/txt-api-candidate/api-worker。生产控制面只读核对 `433cac21-d356-41f0-8fd2-f2264a37da29` 占 100%。改动仅 src/companion/agent/assistant/personality-memory.mjs。子项目源为 agent/assistant/personality-memory.mjs，前次源码同步 f5bebc0b。
* 主站 myapp 使用前次实际发布树 C:/Users/asura/AppData/Local/Temp/feiyue-txt-site-24c26fb/myapp。生产控制面只读核对 `6c2f851f-4541-4695-86e4-5be83a680b71` 占 100%。变更仅 src/features/companion/vendor/memory-reader.mjs。子项目源为 agent/host/memory-reader.mjs，前次源码同步 876dccba。两端完整 src、public 及 wrangler.jsonc 已与实际基线目录逐项核对。独立的 AI 接口心跳候选也会改 shell 和轮询文件，哪一包先装，后一包就必须以新基线重新合并并验证。

### 需求、行为与主要文件

| 验收主题 | 之前与本次改动 | 实现及验收依据 |
|---|---|---|
| 妻子的情绪与欲望 | 正式版已有手记语气，本次新增跨事件情绪、每周七面骰、当前欲望与同罪累计池。满 100 项触发一次，余系总数随机清除向上取整的一半；欲望满足奖励三次可累积，情绪低落仍履行正式工作。 | desktop/emotion-{core,service,initiative}.mjs、desire-pool.mjs；emotion-appraisal、love-and-reason、initiative-decision 技能。FEIYUE_EMOTIONS、FEIYUE_EMOTION_INTEGRATION 及相关测试。 |
| 本地专题与表达 | 对话可取本机旧记录，空闲查证、合并并接续专题；备份至多三份，全损可重建并求助。发言、念叨、主动决定、专题日记取同一轮状态和来源。 | desktop/topic-{memory,files}.mjs、personality-{diary,nags}.mjs、diary-audit.mjs、shell.mjs、screen-question-host.mjs，专题、对话及手记技能。 |
| 此刻所想 | 新增可选的闲时观察、反思、图文分享与回话。自动看屏初始关闭。确认登记的成品念叨在主站显示来源，可筛选；照片和决策文件只存本地。现有消费及手记的原记录链接沿用原入口。 | desktop/scene-*、poll-scheduler.mjs，主站阅读器及 API 来源准入。SCENE_CURIOSITY.md。 |
| 环球之旅与公开取材 | 新增旅行入口，在本机工作流分别处理目的地、服装、姿势和镜头。公开资料网页上限十条后用本机模型综合，搜图上限五张返回一张。 | desktop/image-{planning,tasks}.mjs、public-search.mjs、conversation-routing.mjs、workflows/comfyui/ 下的 world_tour、tour_*、public_*、tavily_search 和来源配置。 |
| 半日简报 | 新增 720 分钟新闻轮询，从上次成刊点回看，最长三天；有新报道才提醒。报面卡片、报道缩略图、中文和原文切换使用本机缓存。 | desktop/news-*、reminder-checks、source-updates 和新闻配图，workflows/comfyui/news_watch.py。 |
| 免费层与日常兼容 | 查新闻统一 RSS；移除检测到 Brave 密钥即调用及搜索后自动改问 DeepSeek 的路径。用户明确点名可询问 DeepSeek。Tavily 查免费账户状态并在 SQLite 预占；SerpApi 查免费档和剩余额度；Google 计费接口未加入。 | public_reader.py、screen-question-host.mjs、test-skills.py。已安装的 TXT、质问五小时对象检查与三分钟硬截止、正式工作队列、登录启动和角色素材均以实际安装基线核对。 |

### 数据、配置及恢复

云端数据库 DDL、历史回填、新增绑定和生产配置变更均为零。按现有 owner 和业务接口上传已成篇日记及正式念叨。情绪状态、周骰、欲求、查证过程、决策复盘、截图和专题备份保留本机。首次使用会在原 profile 和本机记忆目录增建情绪 SQLite、专题及恢复文件，并在轮询库增加新闻设置、去重及刊物表；沿用旧数据和设置。模型和密钥由各自现有本机配置提供；确认版本的免费路径之外未启用 Exa 或 Currents 新主副路由。此包覆盖的免费边界适用于新闻和自动搜索。用户点名调用 DeepSeek 使用其已有账号的计费设置。

安装前须重新核对 Worker 流量版本、桌宠进程和清单每一项旧哈希。遇基线漂移先重合。保留两端原 Worker 版本及绑定；桌宠正常退出后备份清单旧文件、既有资料库一致性备份并记录新增路径。只按本目标清单安装。若失败，恢复旧应用文件、移走本次新增程序文件，保留用户产生的资料；检查在途任务、待传念叨和真实回执，再按实际情况决定是否恢复 Worker。避免旧读取器遇到新来源的窗口。独立项目的更改须与本次分别核对。

### 两轮实测、合规和限制

两轮均在隔离资料中通过桌宠 Node 344/344、Python 技能 17/17、主站 843/843、API 41/41。命令为桌宠 `node --test 'agent/tests/*.test.mjs'`（主站契约环境变量 COMPANION_HU_SHI_MAIN_SOURCE 指向 G:/cloudflare/myapp）、`python -B tools/test-skills.py`，两 Worker 各 `npm.cmd test` 及 Wrangler `deploy --dry-run`。两轮主站入口 bundle SHA-256 为 059251148c528cc7aff3af78bc197eeb63d722b78260aea2a6c117b73e56b3fb，API 为 3e10da6a19fbda8780cda3d498e7da28b2f1fd548d6cb8a68ed7b441bdb1d454。

两轮均通过桌宠 shell 的 --garden-api、Electron 标题栏、新闻、原生场景、--topic-recovery 和真实 Aggressive 9B --emotion 测试。两次专题查证均取得五条样本，真实情绪均为“欣慰”；主动决定各为 done 与 wait。综合测试 combined-reader.mjs 使用真实桌宠写入、重建实例、模拟服务身份、候选 API 处理器与主站阅读路由，在离屏 Electron 中实际打开念叨列表和正文，验证两次提交仍一条、双方原话、分类和跨账户拒绝。合成截图和复盘标记未出现在云端正文。线上 Access 效果待用户截图确认。

两轮均用 check-bundle.py 检查封包路径、旧／新哈希、两个 Worker 的完整运行树差异、免费路径和主动看屏默认关闭。首轮清理了可付费搜索回退，修订原有 Brave 测试为“即使有密钥仍走 RSS”，并修复跨端测试驱动的启动时序。隔离用例首次受沙箱禁止回环影响，改为授权的临时回环端口后复测通过。第二轮未发现新增阻断。逐项原始结果在候选根目录的 r1-*.log、r2-*.log、electron-results.log 和对应模型日志。未以生产账户写样例、未重新抓取用户画面。环球之旅本轮验证参考选择和工作流，未重新实拍或渲染一张成片；外部搜索覆盖率、新闻时延和旅行成片观感需在真实使用时核验。

### 发布顺序与授权状态

本地联调从候选 personal-digital-companion 目录设置 FEIYUE_MAIN_DIR 为相邻 myapp 的绝对路径，使用 `node tools/personality-memory-preview.mjs --integrated --serve` 启动内存 D1 和本地 Worker，地址 http://127.0.0.1:8796/companion/memory/。另以 --integrated --visual 在实际 workerd、临时 D1 和 Electron 验证浅深主题、桌面及手机尺寸、旧念叨原记录回链及正文，已通过并自动退出。持续运行的本地手动验收服务按用户启动指令提供。准备好的原型、dry-run、离屏用例各有独立记录。

待用户确认部署范围后，先发布兼容旧客户端的 API，再发布主站阅读器并核实两端配置、版本和流量；最后按基线更新 Windows 桌宠并受控重启、核对 PID、启动入口和 /infoguide。使用正常入口打开报面、检查轮询和专题恢复，云端以真实结果及用户截图确认。用户同意准备花园草案；线上实际基线修订 135，草案见 GARDEN_DRAFT.md。具体清单、生产发布授权、安装及发布后的 Git 提交与推送、正式花园写入和最终回执均尚待后续。


## 2026-11-21 JST　情绪、新闻和 AI 心跳联合提交

用户要求两项一起提交，并允许覆盖重叠文件。交付目标为 WebCharacter 的 Windows 绯月、subscriptions-api 与主站 myapp 的同名本地发布分支 `codex/feiyue-emotion-news-heartbeat-20261121`。验收要求、原有功能范围、技术设计、回退与发布顺序见同目录 ORIGINAL_REVIEW.md；程序包资产、双端基线和两轮对照如下。若从根目录阅读，附件在 docs/releases/emotion-news-20261121。第三方独立审核未执行。

**实际基线。** 正式桌宠位于 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。心跳独立安装回执记录 16:23 JST 已经启动 PID 4348，旧设置库保留 12 个批次；现场逐项 SHA-256 匹配全部七个心跳文件，设置为启用、180 分钟。heartbeat-baseline.json 保存这七项的正式及合并后摘要。桌宠 Git 发布工作树合并搜索分支 50c178e 和手记修复 ab3ac36；只接入本次已核对的安装件、测试与纪要。保留两份开发与需求文档的独立历史条目。

**合并差异。** poll-scheduler.mjs 同时管理心跳 180 分钟、简报 720 分钟以及初始关闭的主动看屏。心跳在途时跳过，可在面板即时改期。shell.mjs 连接唯一 checkAiHeartbeat 入口，阻止旧计时器重复启动，心跳亦不占正式工作位。poll-settings-ui.mjs 与其构建副本保留心跳专用表单及新闻的 720 分钟上限。已安装且最终相同的设置 HTML、构建 HTML 和 task-lifecycle.mjs 无需再次复制。打包文件与用户资料、日志、模型、密钥分离。保留妻子身份、情绪、专题、念叨来源、手记与新闻流程。程序有效范围及逐文件发布前后摘要见 release-manifest.json。

**云端。** API 仓库以 f5bebc0b 为 Git 基线，程序变更仅 api-worker/src/companion/agent/assistant/personality-memory.mjs，接受新来源 curiosity。主站以 876dccba 为 Git 基线，程序变更仅 myapp/src/features/companion/vendor/memory-reader.mjs，用中文展示及筛选此来源。已对照上次实际生产源码核验这两处的 Git 前像。此前候选核实的线上 API 版本为 433cac21-d356-41f0-8fd2-f2264a37da29，主站为 6c2f851f-4541-4695-86e4-5be83a680b71。心跳合并没有云端运行代码差异。云端 DDL、业务回填、配置和绑定变更均为零。桌宠启动后复用现存轮询表、心跳行和用户已保存的间隔，新情绪和记忆数据按原审核存本机。

**两轮验证。** 在 G:/selftool/WebCharacter/work/feiyue-combined-heartbeat-20261121 使用临时资料。每轮桌宠 `node --test 'agent/tests/*.test.mjs'` 344/344，`python -B tools/test-skills.py` 17/17，API `npm.cmd test` 41/41，主站 `node --disable-warning=ExperimentalWarning --test --test-concurrency=2 'tests/*.test.mjs'` 843/843。每轮另通过 test-desktop-shell.mjs --garden-api、Electron 的 verify-heartbeat-panel.mjs 与 test-news-panel-electron.mjs，以及 combined-reader.mjs 走真实候选宿主写入、重建实例、跨端读回、打开列表和正文、跨账户拒绝。面板实际验证默认时间、改为 90 分钟、停用重开、模拟心跳回执。check-bundle.py 两轮逐项验证当前正式基线、归档内容、免费路径和两个 Worker 的运行树差异。

首轮主站有一次从目录联接启动导致 CLI 无输出，改用物理路径后另有一次临时 Git 仓库子进程失败。固定物理路径与测试并发数后两轮全量均通过。第二轮离屏 Electron 心跳面板退出时有 GPU 状态日志，其 UI 断言及进程退出码通过。自然三小时心跳、正式环境新版本数据及 Access 页面效果待发布后核实，线上效果由用户截图确认。真实 9B 及旅行照片验证边界见原审核。

**提交物与发布。** 发布包 G:/selftool/WebCharacter/work/feiyue-combined-heartbeat-20261121/feiyue-emotion-news-rc.zip，SHA-256 `edf4de17bb06d747e27124fb26f229d1687d85b1fba091b0bf384dc1c6977b0d`。114 个变动文件，其中桌宠 112、两个 Worker 各 1。另附清单。程序包以已安装心跳版为覆盖起点。将来发布前复核三端实际版本和逐文件前像；先 API、再主站，最后受控重启桌宠。若需回退，Worker 回到核验的旧版本并保留绑定，桌宠恢复本次替换前的心跳版文件和原启动入口，保留用户实际数据和设置。安装授权及上线效果与 Git 提交分开记载。花园意愿为准备草案；先前修订 135 的草案属于上一基线。心跳有独立安装记录，最终清单须重读花园实际版本并去重，依实际发布结果确认后再登记。


## 2026-11-21 16:37 JST · 三端实际发布与花园最终回执

用户已确认发布和覆盖安装。API 16:36:31 JST 上线 e506e723-b78e-41b8-96e8-9dd1ccb8ae2d，主站 16:36:43 JST 上线 1993378e-42a8-43da-9f8c-c7d8d75d28ba，各承载 100% 流量。逐项核对两端 14、42 项绑定相同。无业务库迁移或回填。桌宠安装前已备份程序和资料库，覆盖 112 项并核对 SHA-256，16:37:42 JST 核实正式进程 12220、REST v4 和原有 12 个批次。保留心跳 180 分钟、新闻 720 分钟、主动看屏关闭。

发布前同包两轮全量测试及合规复核通过。发布后在隔离测试资料上载入正式桌宠文件，心跳设置、简报中文/原文切换与重开、手记写入与重启重试、经配套 API 和主站读取列表与正文均通过。Access 线上界面待用户截图确认，自然三小时心跳及半日出刊待观察。第三方独立审核未执行。

花园根据修订 135 单独确认并提交 SQL，批次 feiyue-emotion-news-heartbeat-20261121 的两个步骤分别回读修订 136、137，16:45:58 JST 完成。独立重读线上改善 #77、部署 #68、明细 #142，与确认字段逐项一致。项目 #16、功能 #61，从 17.0 经 17.1 到 18.1。既有心跳未重复登记。

已向三个仓库独立发布分支推送，并用 git ls-remote 核验。桌宠从已同步的正式安装基线 4922336 提取本次安装清单、对应构建源、文档与测试，发布源码提交 99e0219 与本地候选 d700383 的安装清单逐项比对。API ab9e11a，主站程序 7365d0c，含确认 SQL 的主站发布分支提交 9885d19。绯月实际执行其配置工作树中的相同 SQL 包 ab22375。回退基线和原恢复步骤继续适用，当前没有回退。

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
- 候选版本 `92be3d7d8d0f` 是 39 个差异文件及其基线、候选 SHA-256 清单的摘要。20 个运行文件、19 个测试和文档等伴随文件。完整路径和散列见 [release-manifest.json](docs/reviews/NEWS_WEEKLY_WINDOWS_RELEASE_MANIFEST_2026-11-21.json)。本审核记录单独按历史版本和新段落内容核对。Git 源码同步应沿正式 Windows 发布基线单独提交新闻差异，构建产物由源码复现，逐项核对远端提交。当前尚未提交或推送本次发布。

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

确认摘要 `b65705afd19aca3a01802f5b34114cccc172f07ec5b23ba3d60939e0ce3cf1c8`。同一登记清单与 SQL 的 Git 对象散列已复核，确认记录及独立回执随它们推送到主项目远端 `codex/feiyue-weekly-news-garden-20261121`（`a515a845841be34b3afaf45e7d32315d35e357e9`），并回读一致。正式绯月最终回执已签收。

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

Git 代码回执：发布提交 e10f7b32a86f220b14b50a8dadc1c4856d3b1bb4 已推送到 origin/codex/feiyue-local-first-desktop-20261121，并经 git ls-remote 核对一致。


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

## 2026-11-22 JST · Windows 主动专聊与菜单弹窗首击修复

### 范围与验收

用户要求绯月提前准备话题，在 GPU 利用率低于 40% 时发邀请，接受后让文字固定走 CPU、GPT-SoVITS 语音固定走 GPU。完整首段就绪后按自然停顿接续播放，正文每次 50～200 字，支持麦克风和打字，最多十轮，退出后恢复任务。用户要求七条已试听接话都加入，每场随机一条只播一次。另要求核对重启后菜单弹窗首击不显示，并明确选择把「今日任务」「三地天气」的修复纳入这一候选。见 [原始需求与验收](REQUIREMENTS.md#2026-11-22-jst--绯月主动专聊)及[开发注意点](docs/DEVELOPMENT.md#windows-重启后菜单弹窗首击可见性)。

### 目标、基线与变更

目标仅为 Windows 正式绯月 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。Git 底座 `39fd098e40ebf7c2c82dd5a6f9944ae98055566e` 加实际安装补丁。已核对正式应用参数和登录项，回环 REST v4 的 PID 为 34600，启动时间 2026-11-22 01:14:50.745 JST，资料目录仍为该安装树的 `output/desktop-profile`。候选以实际安装文件为基线，仅合入 WebCharacter 开发树 `067bfd5` 上本次相关差异。候选位于 `output/private-chat-release-20261122/candidate-OaWg4Q`。

| 范围 | 变更与涉及文件 |
| --- | --- |
| 专聊调度与模型 | `desktop/shell.mjs`、`emotion-initiative.mjs`、`balanced-local-model.mjs`、`private-chat.mjs` 增加待聊、同场随机一次、显卡门槛、两进程复用及任务占用。此前正式版无专聊入口。 |
| 语音与气泡 | `desktop/private-chat-*`、`private-chat.html`、`private-chat.css`、`bubble-voice.mjs`、`bubble-voice-worker.py`、`dictation-host.mjs` 接入专聊气泡、计时、播放和同场听写。普通气泡仍沿用原入口。 |
| 菜单与待处理 | `desktop/menu-layout.json`、`menu-*` 和 `conversation.*` 接入专聊动作及对应入口。构建登记由 `desktop/source-updates.mjs` 更新。 |
| 冷启动首击 | `desktop/panel-window.mjs`、`reminder-review-host.mjs`、`weather-host.mjs` 复用 Windows 可见性补救。之前页面已加载却仍隐藏，候选在同一点击中根据可见性补一次显示。 |
| 资源 | `assets/voice/private-chat` 的固定邀请、七条接话及清单，`assets/desktop-media/feiyue-faces/waiting-b.png` 与构建副本。只合入专聊入口所需头像。 |

逐文件核对采用 [desktop-files.json](docs/releases/private-chat-20261122/desktop-files.json) 中的安装前和候选 SHA-256，共 53 项，其中替换 24 项、新增 29 项。清单摘要为 `96e5b9924c6c0cc1ccc3fd8e826096aed84623845db3959925a4e2662a49dce5`。同期关窗转录及七罪周期菜单头不在本候选。数据库迁移、回填、生产配置、主站或 Worker 部署均无。首次产生待聊时按需写入本机资料目录的 `private-chat.json`，保留既有模型、任务和连接配置。

### 实际检测与待完成项

- 基线隔离复现了今日任务、三地天气首击后 `did-finish-load` 已触发但 `isVisible()` 为假，两处第二击才可见。本地复盘现有补救仍生效。覆盖补丁后，两入口各通过自然冷启动和模拟首次显示仍隐藏的复测。完整候选从两处正式自绘菜单首击可见。
- 隔离候选执行 `node tools/build-desktop.mjs`、`node --check desktop/shell.mjs`、`node --test tools/test-private-chat.mjs`，构建和五项专聊单测通过。开发树的主动行为、轮询和真实任务等待专项 31 项通过。
- 候选运行真实 Electron 的 `tools/test-private-chat-electron.mjs`，覆盖两条接话单次播放、较长接话播完再播正文、菜单连点、听写和崩溃退出。标题栏使用当前测试工具复验通过，覆盖七面板及深浅色。旧版标题栏测试曾把自绘菜单误当带标题栏的普通面板，在加载数据前失败。
- 正式基线与候选各执行 `node --test --test-force-exit agent/tests/balanced-local-model.test.mjs`，各 1 通过、同名 3 失败。原三套旧测试合跑未完成，两个运行日志均已观察到旧任务轮询和模型断言失败，因此本轮没有全量通过结论。候选的专聊和窗体专项通过。开发阶段曾真实验证 CPU 与 CUDA 两轮并驻。本次候选 Electron 使用语音替身，正式重启、真实设备及自然邀请仍待验收。独立第三方审核未执行。

### 发布、恢复与花园预核

用户批准将两处首击修复纳入候选，已表示本次愿意登记花园。实际安装、重启及最终登记清单仍待确认。获准后复核 PID、快捷方式、登录项、53 项前值和候选摘要。确认无正在录音或执行的业务工作，按原桌宠受控重启流程等待收尾。逐项备份旧文件，安装清单后按原入口启动，核实新 PID、应用和资料目录、回环 REST、语音摘要及今日任务和天气单次打开。真实专聊应确认 GPU 门槛、接话只播一次、正文衔接和结束恢复。需要恢复时先正常退出新进程，再恢复本批备份并逐项移除本批新增资产，随后按原方式启动。避免改变原资料目录和凭据。显卡读数无效或余量低时继续待聊。

按正式 REST v4 指引执行 `npm.cmd run db:sync-schema` 和只读 `inspect`，同步新增结构对象 0。核对线上修订 144，归属「网页角色组件」#16 →「绯月（桌面精灵）」#61，版本 23.0，最新部署 #73、明细 #151。本地演算得到成功分支预计新增部署 #74 和明细 #152，版本 23.0 → 24.0，仅登记本次桌宠专聊及两处首击修复。项目、种子、功能改善和独立缺陷条目无需新增。草案在 `output/private-chat-release-20261122`，演算时间不作为正式部署时间。发布后根据真实结果和当时基线生成准确清单与 SQL，给用户确认后先提交 SQL，再向重启后的正式 REST 提交一个批次并回读。未安装、未写生产花园、未执行发布提交或推送。

用户在看到本次发布范围后选择「暂缓安装」。保留可追溯候选、审核和花园预核清单。正式实例、生产花园和 Git 发布状态均未改变。

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

### 绯月合并发布与花园最终回执

2026-11-22 JST，用户明确批准合并发布及花园部署 #74、明细 #152 的实际清单。

- Windows b767af5df027 于 2026-11-22 04:44:10 JST 从原入口受控重启，PID 34600 → 27708。129 项安装件、2 个审核文件及 18 条历史批次已核对。正式安装目录的独立临时资料冷启动验证「今日任务」「三地天气」首击均可见。
- 主站 f46a9f75-745d-4625-882d-5dbc97407bbe 于 2026-11-22 04:43:30 JST 发布。订阅 API 8526fb2e-7f62-4938-a2bb-54114c75bc24 于 2026-11-22 04:43:39 JST 发布。两端 100% 生产流量、原有绑定逐字段一致。Access 受控页面效果待用户截图确认。
- 提醒模板更新一条并可接受 JST 时分，随手记及鱼与熊掌各新增一个「AI登记内容」分类，生产已回读。两库的加密备份 stockanalysis cc189caa51bf（远端恢复 118/118）、feiyue-companion 2c5c77703bb9（远端恢复 18/18）。业务 SQL 提交 27086a60bdc879e5dde94a7b6d9449f4c614303c。
- 部署 #74、明细 #152，网页角色组件 #16 → 绯月（桌面精灵）#61，23.0 → 24.0。登记先提交精确 SQL 22dbb3aad4df3bce028edba26b2e82b16b71169a，期间仅通过正式绯月 REST 提交一批 feiyue-combined-release-20261122。绯月于 2026-11-22 04:49:49 JST 返回 done，唯一步骤 verified。生产独立复核修订 144 → 145，两个目标行与清单相符，发布标记一次。签收于 2026-11-22 04:50:08 JST。
- 三个已发布代码提交均已推送并回读：myapp 19f3cb76f29598439c03ebe91ee88069d884139a、api-worker df21190d209dbf6f772d1b31e722d7c993e2ee16、windows 311efb6e3b51b24e5879d2675338b9e90cf2b44b。

## 2026-11-22 JST · Windows 纯文字登记入口修正候选

用户报告相同文字在「自动」模式正确解析，但「登记」模式进入旧缺项窗。最新要求是登记与自动复用解析逻辑，登记意愿明确时必须提供个人日记候选。验收对照 REQUIREMENTS.md C16 与 docs/DESIGN.md「登记模式复用关窗清单」。文字登记关闭后补一篇保留原文的日记，专项检测沿用现有转录，按用户逐项确认写入。空登记命令提示补充文字，保持模式。附件核对和旧草案的补充与恢复入口保留。

Windows 目标为 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，已安装基线标识 `b767af5df027`，远端发布回执 `eb770325`。来源工作区 `067bfd5` 加本次特定差异，按实际安装字节前后比对。`output/registration-entry-20261122/windows-files.json` 固定四项 SHA-256，清单摘要 `8f54a4222ec444208054c04310c31f2b1144aaf174a9be93c367ea761e413a9e`。`desktop/screen-question-host.mjs` 建立登记窗口的本机转录会话并标出有明确登记意愿的发言。`desktop/conversation-transcription.mjs` 用这些发言保证一篇日记，并保留共同清单及依赖。`desktop/screen-question-ui.mjs` 和对应构建文件保留输入模式。配置、依赖、数据库迁移、历史回填和 Worker 更新均无。新标记存在既有加密作业负载内，旧记录和旧任务可读。

执行 `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs` 和 `node --test --test-force-exit --test-timeout=45000 tools/test-conversation-transcription.mjs agent/tests/local-first-interaction.test.mjs agent/tests/registration-flow.test.mjs agent/tests/task-template-preview.test.mjs`，46 项通过。隔离 Electron 的 `test-conversation-transcription-electron.mjs --mock`、`--mock --registration` 和 `test-panel-titlebar-electron.mjs` 均通过。真实模型 `test-conversation-transcription-electron.mjs --registration` 使用 Qwen3.5-4B Vulkan，合成会话关窗约 29.7 秒后产生四类，确认前无登记读写，选择后隔离 Worker 回执通过。检查日记全文、重复、准备条件、已存草稿及普通模式回归。正式资料验收和独立第三方审核未执行。

待本次 Windows 部署明确许可。安装前再核对进程、登录与快捷方式、原资料目录、四项摘要和在途工作。沿受控重启流程备份四个旧文件、覆盖清单、按原入口启动。失败则正常退出候选，恢复四个原文件后回读原版本。发布后用隔离临时资料从正式菜单按「登记」打开气泡并核对关窗清单，同时核验新 PID 和历史任务。花园登记意愿与精确清单在本次实际发布流程分别确认。未安装、未写生产数据、未推送本轮源码。

## 2026-11-22 JST · Windows 拖拽保持动作单圈替换

用户确认单圈动图并要求替换现有持续拖拽动画。验收为按住时以原速重复完整一次侧摆和回摆，松开仍按原逻辑转入退出。安装目标为 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。预检主进程 PID 25184、桌面快捷方式的应用参数及登录启动脚本均指向该树，实际配置为 dragIn / dragLoop / dragOut。安装仓库底座 39fd098e40ebf7c2c82dd5a6f9944ae98055566e，来源为 WebCharacter/personal-digital-companion 开发仓库 3830b6069d1c442ce51f9f8496ea8dbfa03fb483 加已确认的两档媒体。比较以实际六个文件的 SHA-256 为准。

**安装差异**。分别在 assets/desktop-media 和 output/desktop-bundle 下替换 clips/drag-loop-speed.webm、clips-compact/drag-loop-speed.webm，逐份更新 RESOURCE_MANIFEST.json 的这两个条目。旧为每轮 72 帧约 3 秒，新为旧片零基帧 39～62 共 24 帧约 1 秒。两份清单各自以现场文件为底，分别保留其余 32 和 25 个条目。普通档散列 784a0e23 → fbf47761，紧凑档 d72ec27e → c9876ad5，两张清单 c9ce8fe0 → 26edd1ed、0e78dbd7 → 0a06e8ed。六项完整哈希与候选位于开发项目 output/drag-cycle-release-20261122/windows-files.json 及同级 candidate/，清单 SHA-256 为 cf0970cb8568b8ebaacd8a63959e5e6472915eda7576dbe8a992bcad09e65f7d。开发仓库重做切点可查 tools/prepare-animation-speed.mjs，原型时长可查 prototype/settings.html。安装范围为上述六个媒体相关文件和发布留痕。数据库迁移、回填、配置、依赖和云端发布影响均无。既有素材 ID、路径、画布、透明通道、帧率兼容。

**检测及审核关注点**。已执行 node tools/prepare-animation-speed.mjs、node tools/build-desktop.mjs，普通与紧凑两个构建件均逐帧匹配原片同一段。按安装目录清单在隔离目录组装候选，用 tools/media.mjs 的 inspect 加 libvpx-vp9 解码四个候选视频，均为 24 帧，末帧结束时间约 0.999 秒。核对清单仅两项变化。复跑 node tools/test-pc-settings.mjs、node tools/test-desktop-priority.mjs、node tools/test-player-resources.mjs、node tools/test-desktop-shell.mjs 均通过。审核重点为实际 dragLoop 映射、两档接缝、构建和安装资源一致、两张清单其余条目完整。

**发布与恢复**。安装前复核六个旧值、实际应用目录和在途任务，按原路径备份六项，受控退出并等待应用就绪后切换六项，从原入口启动。启动失败或部分替换时恢复该次备份并回读旧值后按原入口启动。发布后核对新 PID、启动目标、六项新摘要与槽位；从安装媒体解码确认时长，长按与释放的正式观感待用户验证。用户已确认预览效果并明确本次不登记花园。安装、受控重启及安装后验收待本次发布确认。独立第三方审核未执行，本次尚未提交或推送。

2026-11-22 06:48:34 JST 已在 Windows 正式安装版启用经用户确认的拖拽单圈。用户批准本次安装及受控重启，并选择不登记花园。原进程 25184 正常退出，新进程 26308 从原安装入口启动，六项 SHA-256 与候选一致。由原资料的 dragLoop 映射回读运行包，普通和紧凑两档均实际解码为 24 帧约 1 秒；原快捷方式、登录项及轮询已核验。未代用户进行实际长按拖动。

Git 留痕：本机独立发布分支 codex/feiyue-drag-cycle-20261122 的提交为 2eff23471f8273cebcc4183ce9b46ae415db340f。自动审批在运行 git push 前拒绝向 GitHub 的 cj2cf99/webcharacter 发送本次素材、代码与发布记录，要求该具体目的地与内容的明确外传授权。当前仅本机提交，远端未同步。

Git 同步补记：用户已明确授权向 cj2cf99/webcharacter 推送拖拽循环动画、制作脚本及发布记录。codex/feiyue-drag-cycle-20261122 已推送，git ls-remote 回读 2eff23471f8273cebcc4183ce9b46ae415db340f，与本机发布提交一致。

## 2026-11-22 JST · Windows 今日任务隐藏已登记长期计划

**原始需求与验收。** 用户原话「长期计划已经登记当天投入的情况下，应该视为当天已经完成，不需要再显示了」。桌面以主站返回的东京业务日待办为准。成功登记、刷新或重开后该事项从待办及计数移除。仍有待办时正常列出，只剩已登记记录时显示「今天没有到期事项。」操作回执和主站执行详情继续提供工时。

**待发布目标和基线。** Windows 正式绯月，应用目录 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。预检主进程 PID 21228，启动于 2026-11-22 16:28:50 JST，实际应用参数指向该安装目录的 desktop，共用开发区 Electron。安装树 Git 基线 39fd098e40ebf7c2c82dd5a6f9944ae98055566e，实际安装前像以逐文件散列为准。开发来源 WebCharacter/personal-digital-companion，Git 基线 8dcb4c81bffc3c0a93d94039f399777f26a85aa4 加已校验的 reminder-review-ui.mjs 工作区差异。使用 git diff --no-index 对比安装前像与开发源码，构建副本和候选逐文件核对。桌面快捷方式存在，当前探查未取得有效的快捷方式参数，登录启动入口尚未确认。实际切换前须核对可恢复的启动命令、资料目录和在途任务。

**文件与行为。** 只替换 desktop/reminder-review-ui.mjs 和 output/desktop-bundle/reminder-review-ui.mjs。两项 SHA-256 均从 29ad1bec5e0f9bbb6a01dc6c63c2437a5711d1195953ec108c6b880c71cbf1d7 变为 3e7832ea5c0163c32e53a254f5c30a80ac153af7afdb9159eaaf99712e3aa49d。旧界面将 recordedHours 追加到计划组并参与空状态判断。新界面只渲染待办 items，沿用原操作回执。用户资料、数据库迁移、历史数据回填、配置、协议、依赖和 Worker 部署影响均无。安装候选及隔离验证入口在 G:/selftool/WebCharacter/personal-digital-companion/output/today-planner-release-20261122，候选中的其他文件只作验证支撑。来源仓库对应回归为 tools/test-panel-titlebar-electron.mjs，需求与复核见 docs/REQUIREMENT_CHANGES.md 和 docs/DEVELOPMENT.md。

**实测与风险。** 在来源项目执行 node tools/build-desktop.mjs、node --test agent/tests/reminder-review.test.mjs agent/tests/reminder-review-history.test.mjs（11 项通过）、node --test 'agent/tests/*.test.mjs'（隔离回环可用时 419 通过、3 跳过）、Electron tools/run-electron-check.mjs tools/test-panel-titlebar-electron.mjs、浅深色 tools/capture-menu-panels-electron.mjs 和消息框回归，均通过。实际基线候选执行 Electron tools/run-electron-check.mjs output/today-planner-release-20261122/check-candidate.mjs，通过 0.1 小时提交、保留成功回执、其他待办、刷新和重开空状态。额外问答气泡回归出现浅色 300 像素布局断言失败及等待回复超时，问答文件无发布差异。审核请重点检查只读 items、组计数、空状态、原回执和两个运行副本同源。第三方独立审核未执行。

**发布与恢复。** 用户已明确本次不用登记花园。正式安装与受控重启待本次确认。获准后复核原入口、资料目录、在途工作及两项散列，备份旧文件，等待旧进程正常退出后替换清单两项，从已核实的原入口启动。核对新 PID、应用和资料目录、两项散列与本机 REST 就绪，使用隔离资料复验实际安装文件。启动或验证失败时正常退出新进程，从备份恢复两项，核对原散列并从原入口启动。正式版实际数据效果待安装后用户确认。继补实际版本、时间、核验结果和 Git 提交及推送状态。本次尚未安装、提交或推送。

用户回复「安装」，明确批准了此次安装及受控重启。
**实装结果。** 2026-11-22 19:05:32 JST 已完成 Windows 正式安装，版本标识 3e7832ea5c01。旧 PID 21228 正常退出，新 PID 25416 从原入口启动。两份安装脚本 SHA-256 均与候选一致，回环 REST 实例、快捷方式、登录项、原资料目录已核对。原轮询设置一致，本机任务库快速完整性检查通过，历史批次前后均为 19 条。正式安装文件用临时资料执行 check-installed.mjs，通过模拟 0.1 小时登记、成功回执、其他待办、刷新和重开空状态。用户真实列表效果待用户查看。本次未登记花园，无云端部署。旧脚本备份保留在候选目录 install-backup-20261122-190521。

## 2026-11-22 JST · Windows 绯月待生成记录原地编辑

**需求和验收。** 用户原话「我需要修改文字内容」「时间也算」「尽量用一个页面搞定」「原地修改也行」「注意仅有待确认时可以修改」。在「绯月任务管理 → 本机执行中 → 对话内容转录 → 查看结果」，原地修改当前登记类型的文字及适用字段。事项提醒可修改东京日期和可选时分，正文中的发生时间随正文修改。保存后仍待确认，关窗重开可看到已保存的草稿。确认提交采用已保存的版本。修改按钮、读取编辑字段和保存操作都只允许待确认状态。已确认等待提交、正在提交、已登记、已放弃及其他状态拒绝修改。系统登记时间沿用业务原协议。

**目标和基线。** Windows 本机正式绯月，安装根 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。核对 REST、运行 PID 17588、启动时间 20:22:19 JST、应用参数、资料目录、快捷方式及登录启动项。正式树 Git 基线 39fd098e40ebf7c2c82dd5a6f9944ae98055566e，当前运行版本 df33eb993539。来源 WebCharacter/personal-digital-companion 开发仓库 bd7bd7d7a3a3caa3dbb97f1da166ab31134fcd41 及经复核的工作区变更。比较基线为正式版实际文件的逐项 SHA-256。组装脚本及精确清单见 G:/selftool/WebCharacter/work/feiyue-transcript-edit-release/prepare.mjs 和 windows-files.json。8 项清单 SHA-256 为 51578f12bb0df4fc7f678233b458a88461f445700dfa9f565037fe62f1f20f2d，候选标识 51578f12bb0d。

**文件和行为。** desktop/conversation-transcription.mjs 从现有模板取得字段，读取和保存时校验待确认状态、字段白名单、必填和合法 JST 提醒时间。草稿按原编号保存，复核可核实的缺项及前置依赖。desktop/shell.mjs、desktop/task-inbox-host.mjs、desktop/task-inbox-preload.cjs 接通任务窗口的本机调用。desktop/task-inbox-ui.mjs、desktop/task-inbox.css 及其 output/desktop-bundle 同名副本实现同页编辑、保存和取消，离开待确认态即隐藏编辑入口。旧版可看并勾选转录拟稿，新版可先修改再确认。正式树既有登记及模型接线和悬念功能以实际基线保留。

**资料、配置及兼容。** 复用本机加密 conversation-transcription.sqlite、原作业与候选编号及现有登记协议。SQLite 与云端数据库结构迁移、历史回填、配置、依赖、模型、登录项、令牌、REST 接口及 Cloudflare 发布影响均无。安装不触发历史重提或生成。只有用户确认登记后，才通过原有业务提交链。

**已执行的验证。** 开发区桌面构建、转录 11 项专项及 git diff --check 通过。执行 node work/feiyue-transcript-edit-release/prepare.mjs 输出 8 项前后摘要。实际基线候选执行 Electron check-candidate.mjs --mock 和 --mock --dark，验证同页修改、关窗重开、隔离 Worker 收到修改后的正文和时分。测试暂停已确认的队列，核对入口隐藏且读取和保存都被拒绝，恢复后完成提交并复核已登记状态拒绝保存。修改保存期间无云端请求。真实用户草稿未操作，正式效果待安装后实测。独立第三方审核未执行。

**安装顺序、风险和恢复。** 审核重点为待确认状态校验、实际基线上仅包含本次改动、JST 日期时分的传值以及本机草稿与确认提交的边界。获准后复核运行实例、摘要及在途工作，正常退出，备份 8 项旧文件及本机加密转录库。原子替换文件后从原入口启动。核对新版本、PID、REST、资料完整性、快捷方式与登录项，再用隔离资料从正式安装文件复跑编辑和状态校验。若替换、启动或验证失败，正常退出新进程，恢复 8 项前像并核对，按原入口启动。保留 SQLite 备份备查，避免覆盖重启后产生的用户资料。

**权限和 Git。** 已收到初始「安装」意向和「仅有待确认时可以修改」的约束。根目录审核就绪后的本次安装及重启确认待回复。花园登记意愿待回复，未读取线上目录或准备登记清单。尚未安装、重启、提交或推送。发布后补记实际版本和验证结果。


用户明确回复「安装，不登记」，授权本次 8 项待生成记录编辑功能安装和受控重启，并选择不登记花园。


**实装结果。** 2026-11-22 21:32:41 JST，Windows 正式绯月完成安装和受控重启，版本 `51578f12bb0d`。旧 PID 17588 正常退出，新 PID 19120 经原安装入口启动。已核对 REST、实际资料目录、快捷方式、登录项以及 8 项文件摘要。任务库和转录库完整性检查通过，原 3 个转录作业保留，检查时运行中的转录为 0。轮询配置一致，已有本机批次仍为 19 条。使用实际安装文件在隔离 Electron 复验原地修改、正文与东京提醒时间保存、关窗重开、确认后冻结以及按修改值登记，结果通过。未编辑真实用户作业，真实使用效果待用户验收。

备份位于 G:/selftool/WebCharacter/work/feiyue-transcript-edit-release/install-backup-20261122-213228，含 8 项旧文件和经完整性核对的加密 conversation-transcription.sqlite 副本。机器回执在 G:/selftool/WebCharacter/work/feiyue-transcript-edit-release/install-receipt.json。按用户明确授权执行安装、不登记花园。云端发布、Git 提交和远端推送均未执行。


## 2026-11-22 JST · Windows 绯月多线会话与动态整理预算

**需求和验收。** 以 `REQUIREMENTS.md` 的 C、T 组及用户关于本地整理 token 不足阻塞任务、按实际错误隔离模拟、接受动态调整的补充为依据。问绯月支持继续原线、新建和切换，迟到回复只进入对应线；记录窗口保留待聊、进行和 JST 历史入口。不把草稿或旧上下文重复入队。用本机 tokenizer 估算整理输入及输出，对可拆长输入先拆批，对首次动态预算截断按原步骤让到队尾并用完整预算复试。硬上限和同一步最多三次的边界继续生效。超限批次能查到原因，后续批次继续。转录、核对与编辑在本机完成，待确认结果仍通过原入口由用户确认后登记。

**环境、来源和比较。** 目标为 Windows 正式绯月 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。版本基线为最近一次实装 `51578f12bb0d`，正式树 Git `39fd098e40ebf7c2c82dd5a6f9944ae98055566e`。用户启动后核对旧 PID 768，2026-11-22 23:21:45 JST 开始服务，REST v4 与同一进程、资料目录及快捷方式、登录入口匹配。来源为 WebCharacter 的 `personal-digital-companion`，三方比较起点 `0aa2a6443daf4553955435960ff91ff99c10d55c`、已推送检查点 `86cc16dd4922d5623a62b23c73d4905b91e217c9` 和随后工作区动态预算。以实际安装文件计算旧、新 SHA-256；候选和前像见 `G:/selftool/WebCharacter/work/feiyue-threads-release-20261122/` 下的 `candidate/`、`before/`，组装脚本 `prepare.mjs`、人工解冲突 `resolved/`、精确比较 `windows-files.json`。该清单包含 40 个路径，SHA-256 `49023239b9adb37c79e539fb00b169feda64c35c2c884341042a3fadcca2448b`，候选标识 `49023239b9ad`。只安装清单所列文件，候选目录内的测试支撑、模型联接与测试资料无安装差异。

**变更与前后行为。** 路径以 `desktop/` 为前缀，同名运行副本位于 `output/desktop-bundle/`。

| 范围 | 涉及文件 | 前后行为 |
| --- | --- | --- |
| 对话与记录 | `conversation-{details,history,thread-reference,thread-replies,threads,ui}.mjs`、`conversation-preload.cjs`、`conversation.css`、`conversation.html`、`screen-question-{client,host,ui}.mjs`、`screen-question-preload.cjs`、`screen-question.css`、`screen-question.html` | 从单气泡和日期回顾扩展到多线继续、引用、切线、静默便签及三页签。按线隔离后到回复，关窗复用已有挂起会话。 |
| 转录和提交边界 | `conversation-transcription.mjs`、`task-inbox-ui.mjs` | 新发言触发待整理批，记录已完成步骤和失败回执。编辑、用户确认和原登记回执沿用。保留明确登记模式的原文处理。 |
| 本机模型和宿主 | `ai-request-queue.mjs`、`ai-workflow-model.mjs`、`balanced-local-model.mjs`、`local-model-process.mjs`、`local-model.mjs`、`local-output-budget.mjs`、`server-task-command.mjs`、`shell.mjs` | 固定额度改为按材料实际 token 预算，模型按已装载层数使用 CPU 1,024／GPU 2,048 的上限，保留前台优先、阶段续办及云端候补边界。 |
| 行动评价和巡检 | `diary-audit.mjs`、`diary-sources.mjs`、`memory-archive.mjs`、`personality-diary.mjs`、`personality-nags.mjs`、`poll-scheduler.mjs`、`reminder-checks.mjs`、`task-traffic-log.mjs` | 预算故障的部分素材与未受影响素材分开推进，沿用现有评价入口；任务日志巡检默认一小时，只计实际异常，预检拆分留诊断记录。独立的手记和唠叨修订功能与新闻编辑不在清单。 |
| 运行副本 | `conversation-ui.mjs`、`conversation.css`、`conversation.html`、`screen-question-ui.mjs`、`screen-question.css`、`screen-question.html`、`task-inbox-ui.mjs` | 七个页面和资源副本与桌面源码对应，安装后由正式窗口加载。 |

**数据、配置及兼容。** 云端迁移、云端服务发布、Access、生产业务数据回填、REST 契约、令牌、快捷方式、登录项、模型和依赖影响均无。首次启动在既有资料目录按需增加 `conversations.sqlite` 的线、发言、整理及超期表，`ai-requests.sqlite` 的队列和阶段快照，手记库故障记录表及提醒库巡检游标和 `inspection` 轮询。原转录库已具有 `summary` 列，复用其加密载荷、原编号和用户确认边界。原会话历史保留，无全量历史回放或云端补写。隔离旧登记用最近开发种子中的时分兼容模板重现前一版本验证环境，候选安装不灌入该种子。

**验证过程。** 开发区执行 `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs` 和 `node --test "agent/tests/*.test.mjs"`，报告 433 通过、3 可选项跳过、0 失败。固定和动态的 4B Vulkan 整理均得到 2 项运动候选、1 条后续提醒，同一个注入故障保留待查。五次有效调用的上下文从 3,072–4,096 降至 2,048，累计耗时 16.704→15.394 秒，单次样本未测显存峰值。正式基线候选通过入口模块加载。隔离模拟首次以安装树内旧 SQL 初始化 Worker，18:45 受旧模板拒绝。对比前次正式发布的隔离测试，确认其使用来源项目已支持时分的种子，改回该夹具，恢复三方合并漏掉的显式登记原文处理，并按 C16 修正新多线入口，保持登记模式、合并两条原文且仅生成待确认草稿。候选通过 `test-desktop-shell.mjs`、月印标题栏隔离测试、`check-candidate.mjs --dark` 和 `--light`，并通过 `test-conversation-transcription-electron.mjs --mock` 和 `--mock --registration --dark`，覆盖待确认改时分、重开保留、确认冻结和单链提交，全部使用临时资料。候选真实推理首测未返回模型就绪，核实为合并后的就绪日志引用了丢失的变量。已恢复开发区通过测试的模型生命周期、取消处理和平衡模型调度接线，复核保留原有五项记忆轮询并排除单独的修订任务。

候选真实模型复测执行 Electron `tools/run-electron-check.mjs check-candidate.mjs --real --adaptive-retry` 及 `tools/run-electron-check.mjs check-candidate.mjs --organize`。2B CPU 对 1,763 token 返回预检拆分，用时 3 ms、零生成；另一次实际截断于动态 384 token，完整额度 1,024 内重试生成 510 token。4B Vulkan 两个工作者得到原长批 2 项、注入故障待查、后续批 1 项，五次有效调用均使用 2,048 的上下文。


**审核重点及剩余。** 对照 `docs/reviews/FEIYUE_CONVERSATION_THREADS_IMPLEMENTATION_REVIEW_2026-11-22.md` 和 `docs/reviews/FEIYUE_ADAPTIVE_TRANSCRIPTION_BUDGET_REVIEW_2026-11-22.md`。重点核查长句和换行、同线来源、预算让行和三次上限、持久阶段复用、等待状态与单一登记链，以及已实装的待确认编辑、语音预热和原 REST 队列。开发区动态预算自审修正后连续两轮无新问题。安装候选另复核两遍：一查多线登记原文和确认边界，重跑浅深、普通和显式提交；二查模型预算、失败后续行、正式文件摘要和已有应用入口。独立第三方审核未执行。跨旧自主任务的一小时陈旧领取接管、所有旧云端调用合用一个串行入口仍未完成。旧截图模拟回执超时在开发基线复现。未用真实私人长对话作回放，长期语义质量、模型收尾措辞及显存峰值待观察。线上真实模板字段未另行访问，保留上一正式版相同的协议和写入链。

**发布、后检和恢复。** 安装确认后重新核对实际进程、资料目录、在途任务、旧文件与候选摘要。待模型、对话、转录及登记在途工作收尾，走正常退出，备份全部受影响的旧文件和现存 `conversations.sqlite`、`conversation-transcription.sqlite`、`personality-memory.sqlite`、`reminder-checks.sqlite`、`ai-requests.sqlite`，SQLite 备份做 `quick_check`。逐项原子替换，从原入口受控重启。复核新 PID、REST、资料、快捷方式、登录项、40 项摘要、已有批次和转录作业、原轮询配置及预期巡检项，并用实装文件和临时资料重跑会话及既有编辑。失败时正常退出，核对并恢复旧文件或撤回本次新增文件，重新走原入口；保留数据库备份，避免覆盖重启期间产生的资料。用户实际桌面数据效果待上线后验收。

**Git、确认和花园。** Windows 正式安装及受控重启在本记录就绪后待明确确认。开发检查点已推送，动态预算及发布留痕还未提交和推送。用户已明确本次需要登记。使用正式 v4 `infoguide` 所列方式运行 `npm.cmd run db:sync-schema`，只读同步新增 0 项，随后读取实际线上花园目录。基线修订 145，唯一归属「网页角色组件」#16 →「绯月（桌面精灵）」#61，当前 24.0，最后发布 #74。计划只追加本次部署和该功能明细，保留归属及历史。成功预计按花园模型升为 25.0；失败按实际情况登记「发布中」，保留成功版本。项目归属、种子、独立改善、独立缺陷及关系无需更新。发布结果明确后复查现值，生成精确 SQL 和前后值清单，经用户另行确认后先提交 SQL，再向新实例提交一个批次。正式安装、花园 SQL 提交、生产写入和入队当前均未执行。发布后补记版本、时间、实测、Git、批次状态及最终回执。

用户明确回复「确认安装并重启」，批准候选 49023239b9ad 的 Windows 正式安装和受控重启。

**实装结果。** 2026-11-22 23:45:20 JST 完成正式安装及受控重启，版本 49023239b9ad。旧进程 768 正常退出，新进程 33352 从原入口启动。回读本机 REST v4、资料目录、快捷方式、登录项和全部 40 项文件摘要。已存在的受影响 SQLite 安装前备份并通过完整性检查，重启后五个相关数据库均通过检查。对话线、AI 快照和任务巡检表已初始化，原轮询配置保留，巡检为 60 分钟。花园批次 19 → 19、转录作业 3 → 3。

使用实装文件及隔离资料复验多线切换、迟到回复归属、静默便签、JST 历史和显式登记合并原文，结果通过。用本机模拟 Worker 复验待确认正文和时分编辑、确认后冻结、按修改内容以单一登记链提交，结果通过。正式用户历史和真实业务写入未作为测试输入。控件实际使用效果待用户验收，本次无云端服务部署。

备份在 G:/selftool/WebCharacter/work/feiyue-threads-release-20261122/install-backup-20261122-234459，机器回执在同级的 install-receipt.json。来源仓库的已安装清单为 docs/reviews/FEIYUE_WINDOWS_THREADS_RELEASE_49023239b9ad.json，内容摘要与本次版本一致。


**实装推理后检。** 实装模块在隔离资料中再次使用 2B CPU 模型。1,763 token 预检 3 ms、生成 0 token。另一输入在 384 token 实际截断，完整额度重试生成 510 token，仍在 1,024 上限内。

**花园待确认。** 新正式实例的 REST v4 已核对，按接口指引只读同步结构，新增 0 项。线上归属网页角色组件 #16 → 绯月（桌面精灵）#61，最近部署 #74，现有版本 24.0，修订 145。精确 SQL 和清单演算仅新增部署 #75 及明细 #153，版本 24.0 → 25.0，记录实装结果和时间。批次 `feiyue-threads-budget-20261122`，审核摘要 `7599c46b74174c05cd3bc2e77efee171cd365e3f919bf53dc015b3742386b34a`。该清单待用户确认，SQL 尚未提交，REST 尚未入队，生产未写入。


**花园确认及入队。** 用户回复「确认，按这份清单登记到花园，完成后核对回执。」确认当前清单。正式绯月的 PID 33352、安装文件摘要和 REST v4 已核对。执行 npm.cmd run db:sync-schema，新增 0 项。以修订 145 重新制单，摘要与 SQL 字节和原清单一致。主项目 npm.cmd test 844 项通过，npm.cmd run check 的 Wrangler dry-run 通过。先提交精确 SQL 94dd90b42133d84d1de77a4d0253dba39942929b，再通过本机 REST 于 2026-11-22 23:53:21 JST 提交批次 feiyue-threads-budget-20261122 一次，入队回执显示顺位 1。审批摘要为 7599c46b74174c05cd3bc2e77efee171cd365e3f919bf53dc015b3742386b34a。提交时状态 queued，终态以随后回读为准。

**花园终态回执。** 批次 feiyue-threads-budget-20261122 于 2026-11-22 23:53:45 JST 完成，状态 done，1/1 verified。于 2026-11-22 23:54:08 JST 独立回读生产，网页角色组件 #16 → 绯月（桌面精灵）#61，部署 #75 及明细 #153 所有字段与确认清单一致。花园版本 24.0 → 25.0，修订 145 → 146，本次发布标记仅 1 条。已核对 SQL 提交 94dd90b42133d84d1de77a4d0253dba39942929b 和用户确认摘要 7599c46b74174c05cd3bc2e77efee171cd365e3f919bf53dc015b3742386b34a。

**花园回执已取回。** 2026-11-22 23:54:38 JST 通过原批次的 REST 签收并回读确认。完整执行回执位于主项目 database/changes/feiyue-threads-budget-20261122/execution-receipt.json。


## 2026-11-23 JST · Windows 绯月情绪补评与巡检归并

**需求及验收。** 用户要求「已经又报错了，检查并优化行为」，并追加「准备安装和重启，装好后重点复验那两条待评事件，看看巡检还会不会重复报错」。目标为原两条事件沿既有正式队列完成，保留各自评价回执。巡检同一失败只计一次，正常取消和可恢复的拆批留诊断，独立失败继续提醒。实装后重点回读工作事件 #26、收益事件 #27 和自动巡检结果，另用实装代码只读回放首轮 1,272 条日志验证归并。

**环境、来源及比较。** Windows 正式安装根 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，当前版本 `49023239b9ad`。预检正式 PID 33352、REST v4、进程启动时间 2026-11-22 23:45:08 JST、原资料目录及回环监听。来源为 WebCharacter 的 `personal-digital-companion`，Git 基线 `4d9363ffee01a97551953cfcf523f4b3258f0ec2` 加本轮开发差异。四项安装文件与 Git 基线正文逐项相同，精确比较取正式版原文件与候选文件的 SHA-256。候选 `46c2e0ac0916`，完整清单摘要 `46c2e0ac09167f3289620c4b15806f075daed1bf8a85d91a35bf8f2eafc033f8`。组装脚本、旧文件、候选及逐项摘要位于 `G:/selftool/WebCharacter/work/feiyue-local-error-20261123` 的 `prepare-release.mjs`、`before/`、`candidate/` 和 `windows-files.json`。

| 文件 | 前后行为 |
| --- | --- |
| `desktop/emotion-service.mjs` | 原 15 秒共享时限导致待评。现继续用 Aggressive 9B，单次 45 秒和 384 token，首次超时延后 30 秒重试一次。后续材料和前台可先运行。已保存评价与专题偏好写入使用各自回执。 |
| `desktop/ai-request-queue.mjs` | 原数字 `23`、`20` 分别记录为 `TimeoutError`、`AbortError`。前台抢占保留取消状态，过期取消快照沿用 24 小时清理。 |
| `desktop/local-model-process.mjs` | 固定模型入口保留 420 token 额度和 2,048 上下文。日志增加实测 token 数，区分输出截断、上下文不足和其它错误。已部署的动态会话整理沿用原策略。 |
| `desktop/task-traffic-log.mjs` | 同秒、同手记技能、同代码的旧模型和任务失败回执一对一归并，独立失败继续出现。尾段重试及正常让行不重复提醒。 |

**资料、配置及兼容。** 云端部署、业务迁移、历史回填、模型、依赖、快捷方式、配置、REST 及界面影响均无。复用已有 SQLite 表及原轮询游标，取消快照沿用已有状态字段。回读 `emotions.sqlite`、`ai-requests.sqlite`、`reminder-checks.sqlite` 通过 `quick_check`。基线事件 #26、#27 均为 pending，提醒 #15，巡检游标为 2026-11-22 23:46:08 JST，巡检已启用、间隔 60 分钟。备份原三库和代码，评估和巡检仍在本机运行。

**实际验证。** `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs` 和 `node --test "agent/tests/*.test.mjs"` 通过，后者 436 通过、3 跳过。候选四项 `node --check` 通过。安装准备阶段重跑队列、情绪和会话专项 40 项全过。正式同一窗口只读回放 1,272 条，由 31 条报告归并为 16 次失败，`LOCAL_AI_INFERENCE_FAILED` 30 条归并为 15 次。隔离 Aggressive 9B CPU 对照复现旧 15.008 秒超时，新预算 27.813 秒完成，输入 693、生成 78 token。隔离 Electron `test-conversation-threads-electron.mjs --real --gpu` 验证实际 420 截断、完整输出 1,003 token 和超长上下文错误，`--organize` 验证 2 项、故障待查及后续 1 项。新增测试覆盖正常取消、前台下个时隙、待评退避和归并。开发区复核修正后连续两轮无新问题。验证命令和实际记录见来源 `docs/reviews/FEIYUE_LOCAL_AI_INCIDENT_REVIEW_2026-11-23.md`。独立第三方审核未执行。

**安装、后检及恢复。** 审核就绪并获明确确认后，复核运行实例、事件当前状态、正式批次和四项摘要，按应用正常退出流程等待在途工作。备份四个旧文件和三份 SQLite，备份逐一 `quick_check`。原子替换，按原入口启动并核对新 PID、实际资料目录、原用户配置、花园批次、巡检游标及四项摘要。使用实装日志模块只读回放原窗口。再观察正式进程自然处理 #26、#27，逐项查 `status` 和已存评价，并等下次正式巡检游标前进，核对检查时段与通知编号、旧错误是否重发。过程只提取编号、状态、计数和错误码。历史巡检通知 #15 保留。若安装或基础后检失败，正常退出新进程，恢复四项旧代码并复核旧摘要，原入口重启。SQLite 备份保留供核对，既有资料及重启期间自然落盘的数据保持连续。

**待验证及授权。** 正式两条待评的结果及新一轮真实巡检待安装后核对。历史通用 `LOCAL_AI_INFERENCE_FAILED` 的逐次内部原因、单独的到期事项 HTTP 503 和长期负载数据继续保留。来源代码及发布留痕待实装后同步。本次安装和受控重启的明确确认待回复。本次花园登记意愿待回复，未生成或提交登记。安装、重启和发布后验收尚未执行。

用户明确回复「确认安装并重启，这次也登记到花园」，授权候选 46c2e0ac0916 的 Windows 安装和受控重启，并确认本次登记意愿。具体花园清单另行确认。

**实装结果。** 2026-11-23 00:23:54 JST 完成基础安装验收。旧 PID 33352 正常退出，新 PID 19400 从原入口启动。正式 REST v4、资料目录、四项 SHA-256、既有轮询设置及批次数核对通过。三份 SQLite 备份和实装资料均通过快速完整性检查，基线工作 #26、收益 #27 均保留为原记录，巡检游标及历史提醒 #15 保留。备份在 G:/selftool/WebCharacter/work/feiyue-local-error-20261123/install-backup-20261123-002336，机器回执在同级 install-receipt.json。

**已验证的巡检行为。** 用正式实装模块只读回放旧窗口，1,272 条中归并为 16 次独立失败。将原正式巡检游标与实际归档作为只读输入，在隔离 SQLite 中连续执行两次实装巡检，依次扫描 58 条和 0 条，两轮新增通知均为 0。正式进程的首次自动巡检因后台占用顺延。现有轮询设置未改动，自动巡检和正式两条补评仍需分别回读。

**正式补评回读。** 2026-11-23 00:35:57 JST，PID 19400 的原工作事件 #26、收益事件 #27 均为 done，均已保存 Aggressive 9B 评价。启动后的前两次尝试由于手记核对占用而按 AbortError 取消，原事件在后台时隙释放后自然完成。审核时新巡检仍待常规轮询，历史通知仍只有 #15。实装模块的两轮隔离巡检已通过。后续调度和交互时机修正属于新的开发范围。

**待确认的花园清单。** 结构只读同步新增 0 项。生产回读为网页角色组件 #16 → 绯月（桌面精灵）#61，当前版本 25.0，最新部署 #75，修订 149。本次精确演算只新增部署 #76 和明细 #154，版本 25.0 → 26.0，修订 149 → 150。批次 feiyue-local-ai-incident-20261123，审核摘要 427fb3fc169d5183315fd103f855b6d8ae24faf3d8f6e5ba95ace6af7b3fb5ca。已获安装授权及登记意愿，具体清单待用户确认。未提交 SQL 或写入花园。

**正式自然巡检及 Git 同步。** 上次安装的四项摘要在后续本机 REST v5 重启后逐项复核一致。正式实例 PID 35136 于 2026-11-23 00:45:53 JST 自动完成巡检 #853，扫描自原游标起的 117 条日志，未发现失败，历史通知仍为 #15，无新增。正式补评 #26、#27 仍有已存评价，三库完整性检查均通过。只读验收回执为 `G:/selftool/WebCharacter/work/feiyue-local-error-20261123/live-retest.json`。已安装修复的来源提交 `7d7d6d38b3ccd56dddec302fb6b53efc10691899` 已推送并核对 `origin/codex/workspace-checkpoint-20261120`。新增调度及被动操作不打断修正仍在开发工作区。

**花园登记、回读与签收。** 原确认清单的部署 #76 和明细 #154 已由另一次发布占用。2026-11-23 JST 重新同步花园结构，新增 0 项，以生产修订 151 只读演算。用户确认更新后的编号 #77／#155、花园版本 26.1 → 27.1、修订 151 → 152，发布归属、发布说明和实际时间沿用原清单。审核摘要 `d4835b4193076868140ec9781b676c278ef1b09acd0260d10934506f1bc98a29`。主项目先提交 SQL `526f0524378b22e079c71b0f52db81e20d1250ad`，再由正式 REST v5 提交原编号一次。批次 `feiyue-local-ai-incident-20261123` 于 01:01:28 JST 完成，状态 done，1/1 verified。独立回读确认部署、明细、实际时间、归属、版本和唯一发布标记，当前修订 152。于 01:02:21 JST 签收并回读 acknowledged。主项目 844 项通过，Wrangler dry-run 通过。完整回执保存于 `G:/cloudflare/myapp/database/changes/feiyue-local-ai-incident-20261123/execution-receipt.json`，清单、SQL 与回执三文件已同步至主项目远端独立分支 `codex/garden-feiyue-local-ai-incident-20261123`，远端提交 `b2279a44e852e85cbb3adef42228ab70ffc83b86`。未部署线上 Worker。

## 2026-11-23 JST · Windows 绯月自主动作与手记分批

**需求与验收。** 用户要求普通点击、拖拽、看新闻不打断自主动作，只有实际提交问答或指令时才抢占，并要求按实际资料量模拟十分钟内无进度现象，减少单次投入。用户明确由本人复验正式界面。验收时先看桌宠出现「闲时 · 核对手记」和已保存步数，依次轻点桌宠、拖一下、打开已有新闻简报并停留，观察在途批次继续。之后核对步数累计、最多两次新推理一批、下一批从原进度续做及十分钟共享时限。可以在批次进行时送出一条明确问答，验证保存步骤后让行。原始需求、设计依据及两轮无新增问题的复核见来源 `REQUIREMENTS.md` 和 `docs/reviews/FEIYUE_IDLE_SCHEDULING_REVIEW_2026-11-23.md`。

**发布目标和比较范围。** Windows 正式桌宠应用 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，应用参数为 `desktop`，复用既有 `output/desktop-profile`，正式 REST v5。前像 Git `39fd098e40ebf7c2c82dd5a6f9944ae98055566e` 加实际已安装文件。来源 `G:/selftool/WebCharacter/personal-digital-companion` Git `16c6608bdda84b1235498874289dba488dfd9263` 加本次六文件差异。`G:/selftool/WebCharacter/work/feiyue-idle-release/prepare.mjs` 将来源基线对齐实际前像，逐项断言其余内容相同。正式 shell 中已发布的 v5 提醒登记段原样保留。尚未安装的修订手记与唠叨轮询及其它并行开发未纳入。候选清单 `windows-files.json` SHA-256 `f011f0687aec301ee69876599c898197c965ff75317e9644fc3a6105eebeb4c9`，候选号 `f011f0687aec`，同目录保存六项前后文件与隔离验收记录。

**逐项行为及差异。**

| 文件 | 本次候选行为 |
|---|---|
| `desktop/shell.mjs` | 移除把普通窗口切焦当作用户问答的中断路径，转发手记整理进度。手记核对与情绪评价共享原有询问池，撤去整轮独占。原锁屏、休眠、明确任务接管和退出路径保留。 |
| `desktop/screen-question-host.mjs` | 将前台抢占移到有效提交，打开窗口、空输入、预热和读完备好的新闻期间原任务继续。 |
| `desktop/dictation-host.mjs` | 打字或语音草稿校正走原模型队列，校正入口不再无条件取消后台处理。 |
| `desktop/diary-audit.mjs` | 保留近七日范围、原分段和步骤快照。每批最多两次新推理，保存一项即更新阶段和累计步数。 |
| `desktop/personality-nags.mjs` | 原样传递分批待续回执和保存步数，避免把仍待续的任务误判为整轮完成。 |
| `desktop/poll-scheduler.mjs` | 读日志巡检独立到期。手记下批按原 15 秒复查节奏重新取件，复用已有持久化冷却和原十分钟共享预算。 |

**数据、配置及兼容性。** 数据库结构迁移、历史回填、线上 Worker、令牌、模型、依赖或配置修改均无。复用既有 SQLite 的手记步骤、轮询等待和游标。退出前有步骤时仍按原资料状态恢复。备份正式代码及 `personality-memory.sqlite`、`reminder-checks.sqlite`、`local-batches.sqlite`，备份只供核对及应急，回退默认只还原模块，保留运行中自然保存的数据。

**实际检测及未完成项。** 来源 `node tools/build-desktop.mjs` 和 `node --test "agent/tests/*.test.mjs"` 通过（442 通过、3 跳过）。`node work/feiyue-idle-release/prepare.mjs` 对正式前像和六个候选做摘要与 `node --check`。安装脚本经 PowerShell 语法检查。`node work/feiyue-idle-release/check-candidate.mjs` 在正式基线的隔离副本运行 53 项，全部通过，含分批进度、重启续做、模型让行、日志巡检以及 v5 花园和提醒的兼容用例。早期隔离验证夹具缺生成工具、执行环境又限制本机端口，已补齐夹具并在随机本机端口重跑。`node work/feiyue-local-error-20261123/simulate-audit-workload.mjs` 用现场 13 篇的长度和真实推理耗时模拟，旧版 10 分钟保存 22 步且无进度回调，新逻辑首两批各 2 步、累计 4 步，模拟约 53 秒和 58 秒。模拟时长不作为实际耗时承诺。正式候选未安装，真实点击、拖拽、新闻、实时进度及整轮耗时待用户复验。独立第三方审核未执行。

**安装、恢复及发布后验证。** 获明确许可后对照正式路径、进程、快捷方式、登录项和文件摘要，等待运行中的正式任务、花园或提醒登记和转录完成。备份并正常退出，核对三库并原子替换六项文件，从原入口启动。核对新 PID、回环 REST v5、原轮询、既有批次与提醒、代码摘要及手记步数元数据。发生替换或验收失败时正常退出候选，从已核对的备份还原文件并用原入口运行旧版。后台活动前景冲突、步骤累计、读新闻后是否继续及最终体验由用户验收。安装后的程序回执、实际时间、Git 状态随后补记。

**授权情况。** 用户已要求准备安装和重启，并明确正式交互复验由本人进行。执行新版安装及重启待本次明确许可。新版花园登记意愿待确认。上次实装的批次 `feiyue-local-ai-incident-20261123` 是单独的已完成登记。

**安装授权。** 用户明确确认安装并重启 Windows 候选 `f011f0687aec`，确认新版也登记到花园，具体 SQL 清单待按实际结果准备并确认。用户将自行复验点击、拖拽、看新闻和闲置整理分批续做。

**实装结果。** 2026-11-23 01:12:09 JST，Windows 正式版 f011f0687aec 已受控重启。旧 PID 18548 正常退出，新 PID 3096 使用同一应用和资料目录，六项正式摘要、REST v5、原轮询和本机正式队列核对通过。三份 SQLite 备份及正式资料完整性通过。核对手记续做锚点一致，安装前已保存 60 步，启动回读 60 步。回执位于 G:/selftool/WebCharacter/work/feiyue-idle-release/install-receipt.json，同级目录留存备份。正式交互与分批体验待用户复验。首次启动的只读轮询检查遇到 SQLite 短时占用，已正常回退。只读检测增加等待，保留同一候选，第二次启动后检通过。正式交互未代操作。

**新版花园待确认。** 线上结构同步新增 0 项。正式归属为网页角色组件 #16 → 绯月（桌面精灵）#61。以修订 152 演算本次发布成功记录 #78 和明细 #156，花园版本 27.1 → 28.0，修订 152 → 153，记录实际安装时刻 2026-11-23 01:12:09 JST。工作区草案 `G:/selftool/WebCharacter/work/feiyue-idle-release/garden-draft/registration.json`。批次 `feiyue-idle-scheduling-20261123`，审核摘要 `c84e8751cc3d34d9f9a27540ae34afd20f03c75361afdad47dd7d54a45e35357`。用户确认按此清单登记，拟先提交 SQL 后通过正式绯月 REST v5 执行并独立回读。

**新版花园回执。** 正式绯月 REST 执行单批次 feiyue-idle-scheduling-20261123，先提交 SQL f9a4db2fe2daa9008436521f60b33af65be6946d。01:15:49 JST 完成，唯一一步已核对。独立回读部署 #78、明细 #156、版本 27.1 → 28.0、修订 153，发布标记唯一。01:16:24 JST 签收并回读。完整回执 G:/cloudflare/myapp/database/changes/feiyue-idle-scheduling-20261123/execution-receipt.json。主项目 844 项测试和 Wrangler dry-run 通过。三项留痕已同步至独立远端分支 codex/garden-feiyue-idle-scheduling-20261123，核对提交 8e4c236174360e56cba690934d78322bbd3f4bb4。

**来源 Git 同步。** 调度修改、测试、实际六项清单和验收记录已提交至 6dc09a3c38ba9f14c76527ea28cb8db02a8da33d，已推送并回读 origin/codex/workspace-checkpoint-20261120。当前实装清单为 f011f0687aec。

## 2026-11-23 JST · Windows 绯月补行动评价截断与巡检归并

**需求及验收。** 用户要求修正实际 Bug 并尽量降低报错频率，明确错误不得屏蔽，随后要求两轮自审与合规检查，再要求部署。以正式版 01:13:08 至 01:37:40 JST 的输出截断为复现窗口。验收包括在隔离资料复现三条原失败样本并使候选完成生成与审核，设备忙时减少无效请求，单条失败保留待查且剩余材料继续，前台请求仍能优先，历史待续能恢复。巡检保留原始日志及真实错误，准确关联同一次推理发出的两份回执。原始需求和复核见 `REQUIREMENTS.md` 与 `docs/reviews/FEIYUE_LOCAL_AI_INCIDENT_REVIEW_2026-11-23.md`。

**发布目标及差异范围。** Windows 正式本机绯月，实际根目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。应用由原 Electron 启动 `desktop`，使用原 `output/desktop-profile`，回环 REST v5。安装前核对 PID 8908 启动于 2026-11-23 01:46:27 JST，当前正式天气发布 `b8cc72a294b1` 计入基线。正式树 Git 参考 `39fd098e40ebf7c2c82dd5a6f9944ae98055566e`。开发来源为 `G:/selftool/WebCharacter/personal-digital-companion`，基线 `90f672b73e02894122955289f7837578edcb8cea`。`work/feiyue-review-output-release/prepare.mjs` 用实际前像逐文件比较。四文件的实际前像与来源 Git 基线正文一致。`personality-diary.mjs` 只合入 `review` 与 `reviewMaterials` 两个方法，候选保留正式版其它方法的前像。天气、待安装 Skill、记忆修订等并行工作不在此次五文件范围。候选 `2165f39c88c7`，清单 SHA-256 `2165f39c88c73e60ab46286a8eaa07612c34e240e23385b1bc1800cb4b69bae5`，前后像和机器记录在 `G:/selftool/WebCharacter/work/feiyue-review-output-release`。

| 文件 | 前后行为 |
|---|---|
| `desktop/ai-workflow-model.mjs` | 原 2B 截断后在同一阶重复。候选限制草稿输出，校验短评及审核改写，2B 截断切换至现有 9B 补正，审核截断按原模型分级升级；保留旧草稿与最终失败可追踪状态。 |
| `desktop/personality-diary.mjs` | 并发待领由最多 20 条收敛至每批 4 条。整批显卡忙保留余项；最终拒绝或上限耗尽留待查，继续其它材料。持久步骤和主动重试复用现有数据。 |
| `desktop/ai-request-queue.mjs` | 将已有尝试编号传给运行时并写入询问池回执。 |
| `desktop/local-model.mjs` | 本地模型回执记录同一尝试编号，以便与询问池关联。 |
| `desktop/task-traffic-log.mjs` | 新日志按推理编号归并，短时跨游标仍只算一次；对已证实的旧同秒双回执兼容归并，保留单边错误、每次真实截断、原始诊断日志与已有检测规则。 |

**数据、配置和兼容性。** 新依赖、数据库迁移、数据回填、外部服务、Worker、云端配置、接口协议、令牌或模型权重变更均无。复用原队列、原模型设备上限、前台优先和既有资料路径。正常启动仍由 REST v5 提供回环服务。已有待补评及巡检资料留存。诊断新增内部的尝试标识，不包含正文或凭据。

**实际验证。** 两轮自审已查出并修正审核改写校验、单条拒绝影响整批、短草稿限额误拦审核正文的问题。隔离源码基线仅叠加本次修正，`node tools/build-desktop.mjs` 通过。真实模型退出后执行 `node --test "agent/tests/*.test.mjs"`，445 项通过、3 项跳过、0 失败。以三条现场截断快照和同一正式 2B 权重在隔离环境对照，旧版三条均截断，最终修正后三条均完成生成与审核，草稿实际输出 71、82、106 token。`node work/feiyue-idle-release/replay-recent-errors.mjs` 在 462 条窗口中保留 66 次真实截断与 3 次资源等待，132 条原始截断回执仍可回读。`node work/feiyue-review-output-release/prepare.mjs` 核对五文件前后摘要及 `node --check`。`node work/feiyue-review-output-release/check-candidate.mjs` 在实际安装前像叠加五文件后 11 项专项通过。PowerShell 安装脚本语法检查通过。正式运行、长期报错频率及独立第三方审核尚未执行。

**安装、后检及恢复。** 获本次明确许可后执行 `work/feiyue-review-output-release/install.ps1 -Install`。验证审核记录、五项摘要、正式进程、回环入口、登录项与快捷方式。等待正式任务、花园、提醒和转录等在途业务完成后，用原入口正常退出。校验五项代码备份及四个 SQLite 备份（人格记忆、轮询、正式登记、AI 请求）。原子替换后从原入口启动，核对新进程、既有路径、REST v5、五项摘要、三类本机队列和原轮询配置。安装后用正式已装文件作只读日志回放及隔离候选验证，可观察自动补评的保存/待续情况。安装或启动失败时正常退出候选，仅恢复有核验摘要的旧文件，再从原入口启动，保留所有自然新增资料。发布后补记真实进程、时间、复验、备份和 Git 状态。

**确认状态。** 用户已要求部署，当前等待对候选 `2165f39c88c7` 的本机安装和受控重启明确确认。花园登记意愿须按本次发布单独确认。若登记，按装好后的实际结果与生产花园基线另行准备具体清单，获确认后先提交精确 SQL，再由正式本机 REST 发一批并回读。当前安装、重启、SQL 写入及 Git 推送均待执行。

**安装授权。** 用户明确同意安装并重启 Windows 候选 2165f39c88c7。用户确认本次登记意愿，具体清单待实际结果后确认。

**实装结果。** 2026-11-23 02:10:20 JST。2165f39c88c7 已完成本机安装和受控重启，旧 PID 8908 正常退出，新 PID 14388 使用原入口和资料目录。五项摘要和四份本机数据库完整性核对通过，原轮询和正式队列保留。实装模块只读回放旧窗口，462 条扫描中保留 66 次真实截断及 3 次模型装载等待。实际长期开机报错频率待后续观察。机器回执和备份在 G:/selftool/WebCharacter/work/feiyue-review-output-release。

**花园清单。** 线上结构同步新增 0 项，修订 154。本次归属网页角色组件 #16 → 绯月（桌面精灵）#61，新增发布成功记录 #80 和明细 #158，版本 29.0 → 30.0，修订 154 → 155。批次 feiyue-action-review-budget-20261123，摘要 9150c15b6115f714c62e9971984f4b7353782da6fb31e2918f2d030e69a4636c，具体内容已送用户确认。此时尚未提交 SQL 或写入生产花园。

**来源 Git 同步。** 已安装修复和实际清单的来源提交 86e56ec5ba31ae78ccc76cdef1e9b5f709edcf20 已推送，并回读 origin/codex/workspace-checkpoint-20261120 核对一致。

**花园登记与回执。** 用户明确确认原清单。绯月正式 REST v5 校验原批次不存在，复核生产修订 154 及结构无新增，先提交精确 SQL b56753f0653680e7367e0bb7275f8f306018a719 后仅提交一次。批次 feiyue-action-review-budget-20261123 于 2026-11-23 02:21:27 JST 完成，状态 done，1/1 verified。独立线上回读确认「网页角色组件 #16 → 绯月（桌面精灵）#61」、部署 #80 和明细 #158、版本 29.0 → 30.0、修订 155，发布标记唯一。2026-11-23 02:21:32 JST 签收并回读。完整回执 G:/cloudflare/myapp/database/changes/feiyue-action-review-budget-20261123/execution-receipt.json。主项目 844 项测试通过，Wrangler dry-run 通过。清单、SQL 和回执三项已推送至 codex/garden-feiyue-action-review-budget-20261123，远端提交 104bd7123de0a27f17ede5546887678f8b3582c9 已核对。

## 2026-11-23 JST · Windows 绯月手记首问与待确认

**用户要求及验收。** 用户指出关心不必写成问句，要求先检查原题还缺什么、后文有无回答，确认仍缺才结合出处自然发问，避免词语重合判断。依原 11 个真实模型场景、三个补测及自审新增的重复出处和长句场景，核对实际入队和气泡。验收包含关心、已答及明确否定不入队，未决事项只问原题同一项，重复引用后仍检查补答，长句选出可读来由，界面分开展示原话和问句。已按用户要求写入项目「对话、摘要与待确认的开发注意事项」并在 WebCharacter 总开发指南建立索引。

**目标、基线与差异范围。** 仅发布 Windows 本机绯月。实际待发布项目 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，旧实例 PID 14388，JST 2026-11-23 02:10:19.240 启动，实际运行 `desktop`，资料 `output/desktop-profile`，回环 REST v5。已核对监听进程、桌面快捷方式和 HKCU 登录入口；旧安装版本 `2165f39c88c7` 的五个文件摘要与实际一致。正式目录 Git 参考 `39fd098e40ebf7c2c82dd5a6f9944ae98055566e`。来源项目 `G:/selftool/WebCharacter/personal-digital-companion` 在其 Git `ac7a2b37c6f5485325b235e9cdb60eb457ae27b3` 上的定向改动。以实际旧文件为前像三方比较，`personality-diary.mjs` 保留实装的行动评价修正，`screen-question-host.mjs` 仅合入 `threadView`，未带其他对话路由工作。候选 `1a04985f6789`，清单 SHA-256 `1a04985f6789173fc980290c41b2d8c4c34ae7ad52d93e05886d98cb844d09f0`，8 个源码文件另同步 2 份正式入口读取的资源。源码固定为首次实模候选清单 577c66c3b36d 的实际合成结果，后续工作区续答与知识卡片改动均排除。清单、候选及十项前像在 `G:/selftool/WebCharacter/work/feiyue-diary-opening-release-20261123`。

| 文件 | 改动与前后行为 |
| --- | --- |
| `desktop/pending-questions.mjs`、`desktop/diary-audit.mjs` | 保留原句尾标点。历史问号与无问号变体仍去重，无追问占位不入队。 |
| `desktop/emotion-initiative.mjs` | 按核实意图区分待确认和普通关心，不再用问号决定队列。 |
| `desktop/personality-diary.mjs`、`desktop/personality-nags.mjs` | 已绑定原话和可定位后文参与原题核对，已答或无依据止于核对。原话重复不丢后答，长句分成可选短段。只依据有效缺项生成自然问话，引用按编号从已读原文取得。撰写不附带无依据的开口动作，开口理由用已核对结果。 |
| `desktop/screen-question-host.mjs`、`desktop/screen-question-ui.mjs`、`desktop/screen-question.css` | 首次气泡把原话和问句分别显示，历史发言与原来源入口保持原样。 |
| `output/desktop-bundle/screen-question-ui.mjs`、`output/desktop-bundle/screen-question.css` | 同步与对应源码相同的字节。这是实际运行读取的镜像。最初隔离验证定位了只更新源码会导致正式入口引用空白的问题，最终包锁定镜像前后摘要。 |

**数据库、数据和配置。** 无业务 SQL、迁移或回填。保留现有悬念、手记、待确认、本机资料、技能、模型、队列、端口和凭据。无 Cloudflare Worker 部署。花园为获确认后的一次发布元数据登记，按现行规则免整库加密快照。Windows 安装前留存十文件前像，安全退出后针对现有 `personality-memory.sqlite`、`conversations.sqlite`、`reminder-checks.sqlite`、`local-batches.sqlite`、`ai-requests.sqlite` 作本机 SQLite 级备份与完整性检查。不以备份覆盖自然新增资料。

**验证。** 从实装前像组装隔离副本。实际 Electron 运行 `tools/run-electron-check.mjs output/initiative-real-model-recheck.mjs --verify` 完整回放 17/17，复验实际队列、原文及气泡问句。`test-conversation-threads-electron.mjs` 浅色和 `--dark`、`test-panel-titlebar-electron.mjs` 七个面板通过，测试前后十项摘要一致。隔离测试以候选桌面搭配开发仓目前使用的模拟 Worker 夹具，执行 `node --test agent/tests/personality-memory.test.mjs agent/tests/diary-audit.test.mjs agent/tests/emotion-initiative.test.mjs agent/tests/autonomous-idle.test.mjs`，70/70。配合打包目录里早期的测试副本曾出现缺少夹具和旧接口校验差异，未用其替代模拟服务或安装云端代码。来源自审已通过四轮并最后两轮连续无问题，真实模型独立复查 6/6，桌面构建及界面通过。工作区全量 458/459，已知范围外的新闻摘要夹具缺 `reports`，不影响本次候选。开发注意事项见 `docs/DEVELOPMENT.md`，自审见 `docs/reviews/FEIYUE_DIARY_SELF_AUDIT_2026-11-23.md`，候选日志在上述工作目录。正式装好后的实际入口和长期自然轮询尚未验证。独立第三方 AI 审核未执行。

**部署步骤、风险与恢复。** 用户明确确认上述候选后，重新核对正式 PID、启动时刻、十项前像和当前在途业务。待原正式任务、对话、转录、花园及提醒允许正常退出后，使用 `work/feiyue-diary-opening-release-20261123/install.ps1 -Install` 执行保留正式入口的受控重启。校验实际进程、回环端口、各文件摘要、原轮询和待处理状态，按正式已装文件核对气泡与真实模型行为。若更新/启动失败，正常退出候选并恢复同次已核验的前像，再从旧入口启动。现有待确认和历史发言不批量改写，现场自然发生的资料保留。发布后记录实际版本、时间、后检和 Git 提交/普通推送/远端核对，档案排除无关开发改动。

**花园与授权。** 用户已要求部署并表达登记意愿。本次候选的正式安装与受控重启尚待明确确认。已按说明「结构同步新增 0 项」，线上只读基线修订 155，网页角色组件 #16 → 绯月（桌面精灵）#61 当前 30.0。模型预演成功时新增部署 #81 与明细 #159，预计 30.0 → 31.0、修订 155 → 156，批次预留 `feiyue-diary-opening-20261123`。项目与功能基本资料、种子、独立改善及缺陷、关系、平台、链接、数据源、既有发布无需更新。这里只是预案。安装完成后按真实结果与最新基线给出完整清单，经明确确认，先提交最终 SQL，再从新实例 `/infoguide` 核对身份、走本机 REST 一次登记、独立回读与签收。若失败，另以实情准备「发布中」，不生成成功版本。实际安装、登记及本次 Git 同步均未执行。

**实际安装与后检。** 用户明确确认安装本次候选。2026-11-23 03:03:50.761 JST 正式安装 `1a04985f6789`，PID 从 14388 切换到 2356，新实例于 03:03:49.047 JST 启动。正式进程、REST 监听、桌面快捷方式、登录启动项和十项文件摘要均复核。正常退出后完成十项文件及五个 SQLite 本机备份。重启后五个库的完整性检查、待确认、原轮询、提醒和队列回读一致。正式版日常交互和长期自然轮询待用户复验。来源 Git 基线再移植安装差异时保留开发版已有的记忆细化及刷新路径，隔离重跑四个专项测试文件 70/70；实际安装的十项摘要单独保存在 `docs/reviews/FEIYUE_WINDOWS_DIARY_OPENING_RELEASE_1a04985f6789.json`。

**花园实登。** 用户在看到实际结果和完整清单后明确选择「确认按清单登记」。SQL 与清单先提交到花园仓 Git `9a90af4a852daac17a0d17d9af853b1cf45d243b`，确认摘要 `e329cd09bb58d90ac7378f9d9433de3810a4d78e37239e3f5827d9400ab5b222`。重启后的正式 v5 REST 接收唯一批次 `feiyue-diary-opening-20261123`。2026-11-23 03:09:43.455 JST 完成，独立线上只读复核全部实际值一致。部署 #81，明细 #159，项目 #16，功能 #61，版本 30.0 → 31.0，花园修订 156。项目及功能基本资料、种子、独立改善与缺陷、关系、平台、链接、数据源和旧部署未列入本次写入。无 Cloudflare 主站代码部署。

**签收与 Git 留痕。** 03:12:50.600 JST 已从正式 REST 签收，花园仓独立回读和签收回执提交为 `05ac7acdd197085e4cb03acefd68941c71e9e206`。花园 SQL 与回执按本机登记流程留在 Cloudflare 仓本地 `main`，该分支还有其他待同步提交。WebCharacter 源码同步结果随后补记。

**WebCharacter 源码同步。** 发布提交 `5a60b2cb6a9d5eeaee7d58e3ef4326baafe27bf9` 已普通推送到 `origin/codex/workspace-checkpoint-20261120` 并从远端复核。

## 2026-11-23 JST · Windows 绯月外置总纲、Skill 热更新及能力目录

### 需求与验收

用户要求总纲作为目录，默认定位功能 Skill，允许用外部模板调整命令链、条件和提示，并经只读接口描述技能、用途、调用方式及例子。本轮明确要求先用真实本地模型跑转录，发布模板后验证下一项实际执行新步骤，再交用户确认是否安装。原话和初版依据见来源项目 REQUIREMENTS.md 的「外置总纲及功能 Skill」。

验收用同一候选、同一真实模型和同一条虚构对话先后完成两项转录。两项之间只发布流程模板。日志对应各自版本，新任务实际多执行复核，两项均停在待确认。目录返回实际版本、步骤和示例。花园和提醒接口须通过隔离复测。正式安装须另获明确许可。

### 目标、基线与差异

- 目标为 Windows 正式应用 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion，沿用原启动入口及其 output/desktop-profile。正式版本 f011f0687aec，REST v5，PID 3096 于 2026-11-23 01:12:08.929 JST 启动，回环监听、命令行、桌面快捷方式、登录项及资料路径已比对。正式 Git 基线 39fd098e40ebf7c2c82dd5a6f9944ae98055566e 加已安装的补丁。正式资料尚无外置总纲 active.json。
- 来源为 G:/selftool/WebCharacter/personal-digital-companion，Git 90f672b73e02894122955289f7837578edcb8cea 加本轮技能差异。先比对前次六个正式补丁摘要，再按当前正式前像逐文件核对 13 项候选的 SHA-256 和内容差异。仅叠加本次技能变更，工作区并行的天气、新闻、记忆修订和主动交流改动未纳入。
- 候选 b1a5364422e2，清单 SHA-256 b1a5364422e2b67a1ebd502a4cba53dde1b1ba6cb98692450ca50a1e9f8430fd。比较材料在 G:/selftool/WebCharacter/work/feiyue-skill-release 的 windows-files.json、before/、candidate/、formal-base.json 和组装脚本。三项新增的前像为 null。QA 副本排除正式资料，模型和 Node 依赖链接到现有运行资产。

| 文件 | 发布前后的行为 |
| --- | --- |
| skills/catalog.py、skills/skill_updates.py、skills/feiyue-interaction/capabilities.json | 原随附 Skill 继续提供初始版本。新增外置总纲、草稿、发布快照、切换和损坏回退。目录只展示当前安装具备的技能。 |
| desktop/interaction-skills.mjs、desktop/shell.mjs、desktop/screen-question-host.mjs | 桌宠向技能目录传递本实例的实际资料目录。普通问答新增「查看技能目录」，与 REST 使用同一来源。原正式工作队列和闲时调度保留。 |
| desktop/conversation-transcription.mjs | 开工固定同一版流程和提示，可追加条件复核。疑点进入待确认备注，业务校验和确认仍由程序处理。 |
| desktop/image-tasks.mjs、workflows/comfyui/image_chain.py | 图像编排可取外置文字提示，执行端继续绑定实际 ComfyUI 工作流版本和节点。 |
| desktop/local-rest.mjs | 指南升级为 v6，新增原本机令牌鉴权的只读 GET /v1/skills。原花园和提醒继续使用既有路由。 |
| docs/LOCAL_GARDEN_API.md、docs/SKILL_HOT_UPDATE.md、skills/README.md | 追加调用和维护说明，提供命名新增、步骤模板、切换及回退示例。 |

### 数据、配置及兼容性

数据库结构、现有数据回填、Worker、云端接口、业务 SQL、新依赖、新密钥和端口变更均为无。转录作业在原加密负载内保留工作中的 Skill 快照，旧负载经原入口继续读取。初装不建立测试模板，默认使用随附版本。运行发布命令时才在原资料目录建立外置技能目录，原令牌和启动配置沿用。测试模板、SQLite、令牌、新模型和夹具均不进安装包。QA 使用与上次正式 v5 验证相同口径、支持东京时分的离线种子。

### 实际检测及未完成项

- 运行 node work/feiyue-skill-release/prepare.mjs、revise-candidate.mjs、check-formal-base.ps1。正式实例、原启动方式、13 项 SHA-256 及候选 JavaScript 语法通过。初版候选遇到尚未安装的记忆修订 Skill 时，目录返回 503。现按安装内容过滤，最终候选列出 22 项。前三项提醒/转录时分断言因隔离种子版本早于线上已支持的时分目录而失败，修正 QA 夹具后通过。
- 候选执行 node --test --test-reporter=spec agent/tests/skill-hot-update.test.mjs agent/tests/local-rest-garden.test.mjs agent/tests/local-rest-reminders.test.mjs tools/test-conversation-transcription.mjs，共 32 项通过，含原花园和提醒接口、鉴权、热更新、回退和重开后续用原版。
- 在候选上以 Electron 巡检入口运行 work/feiyue-skill-release/real-model.mjs。使用同一进程、实装共用权重 Qwen3.5-4B-Q4_K_M、Vulkan 33 层，同一虚构用户发言「明天提醒我给田中回信」，输入时间固定为 2026-11-23 10:00 JST。1.0 完成整理、拟稿，整项 11.48 秒。2026-11-23 01:49:07.515 JST 仅更新 workflow.json 并发布 1.1，随后目录展示三步。下一项完成整理、拟稿和复核，整项 12.59 秒，其中复核 1.13 秒。两项均生成 2026-11-24 的「给田中回信」提醒并停在 ready，实际登记为零。复核返回「缺少东京日期和行动」，对照实际草稿两项都已存在。这是模型误报，仅显示在复核备注，未改变字段或确认资格。作业、阶段时长、版本、实际字段和模型回执在同目录 real-model-receipt.json，SHA-256 为 1c1765efad7395fae7ae914263cceabb8aaa95423eadee714b5a7032fcdf8294。
- 在候选实际运行图像工具 describe --profile，发布提示后采用新的编排内容，执行版本和 ComfyUI 工作流版本未变化。未调用实际图像后端。
- 随附提示下的两次真实筛查出现限制。带时分的「明天上午九点提醒我给田中回信」只进摘要，未生成请求项，结果为空。日期样例的默认拟稿一次返回 LOCAL_AI_RESULT_INVALID。此次对照使用隔离外置模板的简短提示，两项共用同一份提示，只改变复核步骤。正式默认提示的广泛识别质量、长期运行、真实私人材料、正式窗口交互和第三方独立审核尚未验证。

### 风险、安装与恢复

第三方审核重点为目录与安装内容一致、同一作业保持原版、确认/业务校验和工具权限、两个模型提取限制，以及候选范围和恢复路径。

1. 获本次明确许可后复核本记录、正式前像和候选 SHA-256。等待正式队列和转录的在途工作收尾，用应用自身退出流程停止旧进程。
2. 备份及校验 10 个旧文件，记录三个新增目标原本不存在。正常退出后备份相关转录与队列库并检查 SQLite 完整性。按清单原子替换或新增文件，从原入口启动。
3. 核对新 PID、原启动方式、资料目录及 13 项摘要。读取目标实例的 v6 /infoguide，鉴权读取 /v1/skills，并只读核对原队列。用正式安装代码与隔离资料复验，正式资料交用户操作验收。
4. 安装、启动或验收失败时正常停止新进程，恢复原文件，对三个新增目标核对本次摘要后逐项移除，按原入口启动并检查 v5。保留资料和备份，不直接覆盖重启后新增的用户记录。发布后补记实际结果、时间、回执、Git 提交及远端核验，Git 同步只纳入本次范围。

### 确认状态

正式安装及受控重启待用户明确许可。花园登记意愿待另行确认。如同意，核对线上实际归属和已有记录，提供具体清单，按真实发布结果和用户确认内容提交 SQL，再经新实例本机 REST 执行一次登记及回读。目前未安装、未写入正式业务或花园、未提交 SQL、未推送 Git。

## 2026-11-23 JST · Windows 绯月 Skill 三轮自审及合规复核

用户本轮要求三轮自审及合规检查。Windows 绯月外置总纲发布条目的候选、正式运行基线和确认状态以本追加记录为准。原候选 b1a5364422e2 的真实模型结果保留作为运行文件的验证证据。

1. 需求与范围。总纲、版本绑定、外置流程、回退、真实转录及只读能力目录与用户原始需求一致。发现手册过度概括，将可配置命令链明确为现行普通对话线，旧式会话作业仍走原整理流程。并行的天气发布把正式基线变为 b8cc72a294b1。回读确认 REST v5、PID 8908、2026-11-23 01:46:27.008 JST 启动。原启动入口及资料目录一致。天气五项文件与本次 13 项无交集，已将五项正式前像同步到隔离验证副本。
2. 实现与复测。候选 32 项回归通过。另行验证无效步骤拒绝发布、前版继续生效、损坏总纲回退及目录只读约束。对随机回环端口确认 401、403、POST 404、授权 GET 200、正式能力数 22 和响应不含提示正文。候选运行文件摘要均与原真实模型对照一致，沿用证据，本轮未重跑真实推理。保留上文的默认提取漏项、拟稿错误和复核误报。
3. 发布与合规。以新候选 089792ecb6ec 为准，完整清单 SHA-256 089792ecb6ecb2c3fc5dbebc64ed588103ec081ea6a469a9964624bcc8e16208。13 项正式前像、候选及隔离副本摘要、JavaScript/Python 语法检查通过。正式 Git 仍为 39fd098e40ebf7c2c82dd5a6f9944ae98055566e 加此前正式补丁，独立天气更新已计入安装基线。清单及前后像仍在 G:/selftool/WebCharacter/work/feiyue-skill-release。最终只读实例回执为 formal-base-final-review.json，回归记录为 self-review-regression.log，探针为 self-review-check.json。数据库迁移、数据回填、Worker 变更、新端口和新凭据均无。未访问 Access 页面或生产业务资料。第三方独立审核未执行。

安装、受控重启和花园登记仍待用户分别确认。原候选的审核内容继续保留供追溯。此次自审未安装或重启，未提交 SQL、登记花园或推送 Git。

## 2026-11-23 JST · 绯月 Skill 最终候选自审通过

用户要求继续自审，按最新规则跑完五轮，第四、第五轮连续无新问题和无遗留，已停止。逐轮记录位于来源项目 docs/reviews/SKILL_RELEASE_SELF_AUDIT_2026-11-23.md。正式安装待授权，第三方独立审核未执行。

本追加记录更新前一 Skill 候选和正式基线。目标及资料目录不变。正式已另行安装补评更新 2165f39c88c7，REST v5，进程 14388 启动于 2026-11-23 02:10:19.240 JST。正式 Git 参考仍为 39fd098e40ebf7c2c82dd5a6f9944ae98055566e，加此前安装更新。利用两份冻结清单确认补评五项与 Skill 包无交集，已复制这五个正式模块至隔离副本，正式前像和旧启动入口均回读一致。来源工作区以之前记录的 90f672b 基线及本轮 ac7a2b37c6f5485325b235e9cdb60eb457ae27b3 上的两项变更和验证为准。

最终候选 837023461fac，清单 SHA-256 837023461fac86cce8be524d74ffc164b5085163271184d51d6e15a434786168。相对 089792ecb6ec，desktop/conversation-transcription.mjs 补齐带时分的原话提取、仅在全部事项都能确定时的格式错误恢复，以及复核区分字段缺项和内容遗漏。desktop/reminder-command.mjs 将已有时分解析函数导出，复用原解析规则。原 13 项加这一文件合计 14 项，原 3 项新增不变，旧文件由 10 项变成 11 项。新旧摘要、前像和候选文件见 G:/selftool/WebCharacter/work/feiyue-skill-release/windows-files.json、before/、candidate/。测试文件只用于隔离候选。未引入其他并行功能、数据库迁移、回填、Worker、更改端口、凭据、模型或依赖。

实测 work/feiyue-skill-release/real-model.mjs --timed，最终候选同进程真实 Vulkan Qwen3.5-4B-Q4_K_M。沿用随附阶段提示，同一条虚构原话「明天上午九点提醒我给田中回信」，1.0 整理拟稿 10.49 秒，1.1 整理拟稿与复核 13.43 秒。两项均交回 2026-11-24 09:00 JST 待确认提醒，无登记。最终复核返回空 issues。手工注入拟稿 LOCAL_AI_RESULT_INVALID 验证恢复，注入完整字段的缺项误报及内容遗漏，验证备注过滤和保留。真实回执 real-timed-model-receipt.json 的 SHA-256 为 34e4da2b8fac6c2d6bc3a060475c69e40ee3b9172f9b4dd6fb41d3af39ecf484。

候选 33 项回归、来源提醒解析 3 项、Electron 七面板标题栏检查、独立本机权限探针、JS/Python 语法及全部正式前像摘要通过。命令和指标见五轮报告，另见 final-timed-audit-regression.log、timed-final-review-check.json、formal-base-timed-review.json。旧审核中的这三个验收遗留已针对原样例或故障注入复核修正。正式安装的用户验收留待安装后。

安装与恢复步骤沿用前文，执行范围替换为最终候选的 14 项。备份并核对 11 项已有代码和涉及库，同时确认三个新增目标原先不存在。获明确许可后受控停止、按最终摘要替换、按原入口启动并核对 v6 和队列，失败则按本次前像恢复。只测试了隔离候选，正式应用未安装、未重启，未推送 Git，未提交或登记花园。部署与花园登记意愿仍待单独确认。

## 2026-11-23 JST · 绯月 Skill 正式部署准备

用户指令为「准备部署」。本条更新前述 Skill 自审通过记录的候选、实际基线与执行准备。发布目标仍为 Windows 正式绯月 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion，沿用原启动入口、原 output/desktop-profile、回环地址 127.0.0.1:8765 和原令牌。

预检发现另行部署的手记首问更新 1a04985f6789 已生效。正式 PID 2356，REST v5，原快捷方式、登录项、回环监听和资料目录一致。用手记包已装十项摘要和实际安装回执核对。Skill 待发布的 14 项只有 desktop/screen-question-host.mjs 前像变化。对照旧前像、正式文件及冻结 Skill 版本逐段合并，保留正式手记首问的 openingSource 和既有气泡样式。Skill 相关三处改动仅为导入技能目录方法、把目录问句识别为已有入口、以及从同一只读目录返回答案。其余 13 项候选与之前通过五轮自审的版本逐字一致。半自动合并脚本为 work/feiyue-skill-release/rebase-diary-opening.mjs。既有 Git 来源及正式参考仍按前述记录，正式业务资料不进入隔离副本。

当前候选 9f30f8978053。完整清单 SHA-256 9f30f89780536c2754a6d40f2854706dffc0c8c37561134df102f9e8fa8879f6。新前像 a703e608758ef663aedfc9afa1c980c0a1230dcac07df51aa801cfe36d4d3f4b，新宿主 ae6a139ea88156c7f0027b415abd24b29ab09e5bb8adadba2a502621c47782f9。范围仍为 11 项替换、3 项新增。无数据库迁移、回填、新凭据、新端口、模型或依赖变更，无 Worker 发布。旧有真实模型回执直接覆盖未变的转录、Skill 加载和模板热更新链。本轮未另重跑模型。改动的问答宿主用独立入口和界面测试复核。

- 隔离候选执行 node --test --test-reporter=spec agent/tests/skill-hot-update.test.mjs agent/tests/skill-directory-question.test.mjs agent/tests/local-rest-garden.test.mjs agent/tests/local-rest-reminders.test.mjs tools/test-conversation-transcription.mjs，34 项通过。新增的问答入口断言检查能显示默认两步流程且不调用模型或业务登记。日志为 prepare-deployment-regression.log。
- 在隔离 Electron 运行 tools/run-electron-check.mjs tools/test-conversation-threads-electron.mjs。浅色用例通过，包括手记来源、首问、关闭、新旧回复、后台整理及 360px 气泡。采用已按实装摘要核对的手记资源，使用合成会话。
- work/feiyue-skill-release/install.ps1 -Mode Preflight 只读通过。14 项摘要、三项新增路径、原正式进程和启动入口已核对。对话转录、花园和提醒批次、桌面任务、轮询、AI 请求五个 SQLite 完整性通过，检查时无在途桌面任务、花园批次、提醒或转录。结果在 install-preflight.json。最初预检因发现问答宿主新前像而停止，重组后复跑通过。
- 同一脚本的 -Mode Rehearse 在隔离副本通过安装中断回退和全量回退，包含新文件移除及 11 项既有文件恢复核验。执行 node work/feiyue-skill-release/rehearse-db-backup.cjs，五个合成库的备份和 SQLite 完整性、前后状态一致性通过。生产资料备份待授权并正常退出后执行。

正式指令为 work/feiyue-skill-release/install.ps1 -Mode Install。脚本会核对本条审核和最终摘要、等在途工作收齐、保留旧代码和五库备份，通过应用自己的正常退出流程停止旧进程，原子安装后按原入口启动。后检核对新进程、原入口、v6 /infoguide、技能目录无令牌 401 和认证读取、原花园与提醒路由及五库完整性。失败时正常停止候选，恢复已核验的旧文件，逐项移除本次新增并重新启动 v5。备份保留原资料，回退默认不覆盖用户数据库。受控重启与正式后检尚未执行，用户目视体验待确认。

本次明确安装授权与花园登记意愿仍待分别确认。第三方独立审核未执行。未安装、重启或推送 Git，未进行本次花园结构同步、制单或写入。其他发布的授权及登记意愿不沿用。

### 绯月 Skill 正式实装结果

用户明确确认安装 9f30f8978053 并受控重启，且同意本次发布登记到花园。具体花园登记清单另行确认。

2026-11-23 03:17:00 JST，候选 9f30f8978053 安装及后检完成。原 PID 2356 正常退出，新 PID 23656 在 03:16:59.671 JST 从原应用入口、原资料目录启动。14 项文件摘要、原快捷方式、登录项和回环 REST v6 通过。未认证访问技能目录返回 401，认证读取 22 项，随附对话转录为 1.7、默认整理和拟稿两步。原花园和提醒路由在册。对话转录 8 条、花园批次 27 条、REST 提醒 1 条及轮询配置保持，相关五个 SQLite 库和安装备份均通过检查。旧代码和库备份位于 G:/selftool/WebCharacter/work/feiyue-skill-release/install-backup-20261123-031650，机器回执为同目录上级 install-receipt.json。正式安装使用 install.ps1 -Mode Install。正式个人资料未写入试验数据，桌宠目视交互待用户验收。

本次不涉及 Worker、数据库结构迁移、回填、新凭据或端口。Git 同步和花园登记分别留痕。花园生产未写入，SQL 未提交，待当前线上基线制单及用户具体清单确认。


#### Git 同步与花园登记草案

在独立工作树基于远端 0394246 组装发布源码，先纳入已实装 REST v5 的提醒兼容依赖，再合并冻结的 14 文件变更，保留基线已提交的其他开发内容。精确暂存 29 项，`git diff --cached --check` 通过。运行 `node --test --test-reporter=spec agent/tests/skill-hot-update.test.mjs agent/tests/skill-directory-question.test.mjs agent/tests/local-rest-garden.test.mjs agent/tests/local-rest-reminders.test.mjs agent/tests/registration-flow.test.mjs tools/test-conversation-transcription.mjs`，51 项通过、0 项失败。发布源码提交 `e817e393651a2d72cf549d71ea144a98763e0e6f` 已推送至 `origin/codex/workspace-checkpoint-20261120`，回读与本地一致。

花园已完成只读结构同步，新增结构对象 0 个。线上修订 156，确认归属「网页角色组件」#16 →「绯月（桌面精灵）」#61，已核对当前版本 31.0 和上次发布 #81。草案 `feiyue-skill-hot-update-20261123` 新增发布 #82 和明细 #160，状态为发布成功，时间为 2026-11-23 03:17:00 JST，推出版本 32.0。审核摘要 `f102031f64319f041d1482a6a2870b5df84e79a1499ea85565ccb7dce78c8c31`。具体清单待用户确认，SQL 尚未提交，花园生产尚未写入。


#### 花园实际登记与独立回读

用户在完整清单后回复「登记」。精确清单和 SQL 的本地 Git 提交为 `1d5bc034e23eef52e4eb5ad520aa1566d11e4d2f`，确认摘要 `f102031f64319f041d1482a6a2870b5df84e79a1499ea85565ccb7dce78c8c31`。正式绯月 REST v6 于 2026-11-23 03:31:26.516 JST 接收批次 `feiyue-skill-hot-update-20261123`，2026-11-23 03:31:52.572 JST 整批完成。独立线上读取确认项目 #16、功能 #61、发布 #82、明细 #160 的关联和实际字段全部相符，发布成功标记唯一，版本 31.0 → 32.0，发布历史 31 → 32，花园修订 156 → 157。 本批仅写发布元数据，适用本项目整库快照豁免。


#### 花园签收与 Git 同步

2026-11-23 03:33:23.722 JST 正式绯月已签收原批次。花园本地回执及总账提交 `390a3e8c97482f113ad48822e367b7970506c1d2`。从花园远端主分支基线只导出本次 SQL、清单、回执和总账新增条目，推送至 `refs/heads/codex/feiyue-skill-hot-update-20261123` 并回读一致，远端提交 `77ace90ecc285cfd72fbe0edf64ddefb673f2368`。桌宠界面待用户复验。

## 2026-11-23 JST · Windows 绯月主动质问续答

**需求与验收。** 用户要求绯月回应刚说的话，避免原样复述开场，用实际事件隔离复验生成和保存，完成自审后要求「安装，登记」。验收直接续答、归档重复回复触发改写、连续复述保留待答和原发言组，以及重开念叨与对话线两库读回。范围和四轮自审见 [续答自审](docs/reviews/FEIYUE_NAG_REPLY_REVIEW_2026-11-23.md)，第 3、4 轮无新问题。

**目标与基线。** 只更新当前 Windows 正式绯月，根目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。正式安装版 `9f30f8978053`，REST v6，PID 23656，JST 03:16:59 启动，原 `output/desktop-profile`。来源开发仓库 WebCharacter 子项目，参考 Git `03942463b3de924c380ae45a0c29a30bfbbee1c6` 与已自审的续答专项差异。从正式安装前像逐段移入修复，保留手记首问及更新后的外置 Skill 宿主。候选 `4f12e1d6d84e`，清单 SHA-256 `4f12e1d6d84ea5d711d3837eb3c4baccab6be43943f41167b7b7608a34aeb40f`，逐文件前后摘要和测试位于 `G:/selftool/WebCharacter/work/feiyue-nag-reply-release-20261123`。

**文件与行为。**

- `desktop/personality-nags.mjs` 的续答输入单列最新发言，去掉已经存在于同线历史中的旧问副本。改用现有 4B 档位单次生成，每次预算 25 秒。保存前拒绝复述旧问或整句用户原话，只重写一次。仍复述则保留原发言及待重试状态。旧气泡迁入对话线时只保存一次消息关联；重复的追问字段不会变成新的待办。
- `desktop/personality-diary.mjs` 为基础质问续答限定直接对话口吻、人称与最多 150 字的正文，避免存档截断句尾。既有数据库接口、用户原文、状态和回执格式继续使用。

**兼容性。** 数据库结构迁移、历史回填、新配置、模型文件变更、凭据变更、依赖变更、REST 版本变化和 Worker 发布均无。只发布已自审的两项运行文件。并行中的记录复审、知识库、新闻和其它工作区修改在范围外。

**实际验证。** 用 `node prepare.mjs` 固定两项前后像，实际运行两个文件的 `node --check`。对隔离正式基线与候选执行同一组 24 项 Node 测试，基线 19 通过、候选 21 通过；续答新增两项由失败变为通过，图像确定性和两项旧问答宿主夹具在两边同样失败，已比较名称和栈。通过 `node replay.mjs` 对实际归档做两次本机 4B CPU 回放。直答 14.2 秒、注入正式旧重复结果后的改写 8.3 秒，各存一轮，完整正文、原发言编号和预览回读一致，正式原记录只读比对一致。开发版此前 83 项专项通过。正式交互和长期冷启动行为待本次安装后核对，独立第三方审核未执行。审核关注前后台复用、旧气泡重试和同线历史边界。

**安装、验证和恢复。** `pwsh -NoProfile -File ./install.ps1 -Mode Rehearse` 在隔离目录验证两项替换、第一项替换后中断回退和全部替换后的回退。安装前复核正式应用入口、进程、回环 REST、资料目录、两项前像及在途工作。正式工作收尾后正常退出桌宠，备份两项旧文件和七个相关 SQLite，再原子替换两文件并从原应用入口启动。核对新 PID、启动时间、两项候选摘要、REST v6、轮询、队列和七库完整性，正式历史不写测试记录。异常时正常退出新进程，从已校验的前像还原并重启旧版，保留备份和实际回执。源码和发布记录仅同步本次范围，回读远端提交。

**确认与花园。** 用户已明确表达安装意愿和本次登记意愿。候选 `4f12e1d6d84e` 的受控安装待本次确认。正式 REST 指定的花园结构同步新增 0 项；已授权只读核对「网页角色组件 #16 → 绯月（桌面精灵）#61」版本 32.0、修订 157、末条部署 #82／明细 #160，本次批次标记无记录。基线不变且安装成功时预计新发布 #83／明细 #161，功能版本 32.0 → 33.0，修订 157 → 158。具体时间、结果和最终清单以实装为准，另获用户确认后先提交名为 `feiyue-nag-reply-20261123` 的精确 SQL，再通过新实例的本机 REST 登记一次并独立回读签收。当前没有执行安装或登记写入。

**安装授权与结果。** 用户明确确认安装并重启该候选。2026-11-23 04:03:20 JST，正式绯月 4f12e1d6d84e 完成安装及后检，PID 23656 → 11844。沿用原应用与资料路径，REST v6、两项文件摘要、七个 SQLite 库、技能目录、提醒及原轮询核对通过。质问 17 → 17 条，发言 53 → 53 条。安装后再次以正式文件摘要匹配的候选回放实际对话，直接生成与强制改写均通过，两库回读一致。安装回执和代码、数据库备份见本次候选目录。正式界面待用户复验。

**花园决策。** 展示安装后的精确清单后，用户选择「暂不登记」。批次草案 feiyue-nag-reply-20261123 仍留在本机，花园线上及登记 SQL Git 均无本次写入。

**主动质问续答源码同步。** 发布源码提交 f23b2e56055323b35216a83420eaeff89d20f1b7 已推送至 WebCharacter codex/workspace-checkpoint-20261120，并独立回读确认。导出该提交的项目源码复跑两项续答专项，均通过。用户选择暂缓花园登记，未提交花园 SQL。

## 2026-11-23 JST · Windows 正式绯月情绪复盘候选 c2da3c2ccbf0

**用户需求与验收。** 用户确认情绪复盘按事件类型组织询问、任务日志默认分段并折叠原始 JSON，要求用截图里的外置 Skill 与技能目录发布登记工作记录验证可保留原欲求，随后要求更新正式版。验收核对模型原始 keep、空引文、同一欲求编号与三语满足条件、无奖励，以及从任务日志按需展开原始快照。此次用户明确选择「本次不登记」。

**目标与基线。** 只更新本机 Windows 绯月，正式目录 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。原实例 REST v6，PID 11844 于 2026-11-23 04:03:19.596 JST 启动。正式安装基线 4f12e1d6d84e，对应已同步来源提交 f23b2e56055323b35216a83420eaeff89d20f1b7。此次来源为 G:/selftool/WebCharacter/personal-digital-companion 的工作区，开发 Git 基线 03942463b3de924c380ae45a0c29a30bfbbee1c6。实际安装文件和工作区另有其他变更，安装以现有文件逐项合入。

**精确比较与文件。** 以下命令均在 G:/selftool/WebCharacter/work/feiyue-emotion-release-20261123 下运行。windows-files.json 的 SHA-256 为 c2da3c2ccbf0a8b0f9e008f8fe905cfbd0b413a26eb101703dae5545f6d18246。每项列出完整前后 SHA-256，before 与 candidate 两目录分别保存原件与待装文件，使用 `git diff --no-index before candidate` 查看实际差异。开发仓副本在 personal-digital-companion/docs/reviews/FEIYUE_WINDOWS_EMOTION_REPLAY_c2da3c2ccbf0.json。本次 13 项，9 项替换、4 项新增。

- desktop/emotion-service.mjs 及新增 desktop/emotion-prompt.mjs 将原扁平 JSON 输入改为事件证据、事前欲求、表达参考和历史。交流保留双方原话，工作等事件取事实标题。状态决定引文是否可填；保留旧欲求时新欲求字段为空。沿用原状态库和既有奖励结算。
- desktop/conversation-ui.mjs、desktop/conversation.css、desktop/source-updates.mjs 及 output/desktop-bundle 下的 conversation-ui.mjs、conversation.css、emotion-prompt.mjs，使新旧快照打开后按段阅读，并可展开完整原始 JSON。正式文件移植仅取本次日志段落、样式与页面模块接线。
- skills/emotion-appraisal 下更新 source/SKILL.md、source/local-ai.json、latest.json，新增 versions/emotion-appraisal-v2-3/SKILL.md 及 local-ai.json。正式随附版 1.6 升到已验证的 2.3，旧历史版本保留。

**数据与配置。** 数据库迁移、回填、云端部署、端口、凭据、外部依赖及花园数据库写入均无。已有情绪事件与快照仍可读取。试验使用临时个人资料，受控重启前等待在途工作，原个人资料与入口沿用。

**实际检查。** `python -B prepare.py` 完成候选组装。候选目录运行 `node --test qa/agent/tests/emotion-core.test.mjs qa/agent/tests/emotion-initiative.test.mjs`，28/28 通过；开发工作区三组相关回归此前 42/42 通过。进入 qa，用现有 Electron 执行 `tools/run-electron-check.mjs tools/test-emotion-work-replay-electron.mjs`，本机 Aggressive 9B CPU 在 28.222 秒返回 keep 和空引文，数据库保留同一欲求及条件，档位 −4、奖励维持 0；直接写明三语听写已解决打字慢的标题返回 satisfied、逐字证据，奖励维持 3，未原样重建旧欲求。日志深浅色、360 像素窄窗、原始 JSON 完整回读通过。使用开发版隔离 Electron 核对旧日志和标题栏的回归也已通过。`./install.ps1 -Mode Rehearse` 在隔离目录通过安装中断和全量回退两种检查。

**风险与审核重点。** 请核对新模块在正式页面资源、技能源文件和固定版本中的一致性，以及 keep 的空引文和同一欲求回读。正向对照中模型的内心话仍用了期待语气，状态判断和结算正确；两条固定样例不覆盖所有自然语言。CPU 在开发迭代中出现过单次 45 秒超时，沿用原补评机制。本次未跑候选全仓回归，正式界面及真实新事件尚待安装后验证。

**安装、恢复与确认。** 先以 `./install.ps1 -Mode Preflight` 核对正式进程、回环监听、入口、文件前像和资料状态。用户明确确认本候选后才执行 `./install.ps1 -Mode Install`。等待在途任务，备份被替换文件、正常退出、备份含 emotions.sqlite 的八个本机库，再逐项原子安装并经原入口重启。验证新 PID、原资料目录、REST v6、启用的情绪技能 2.3、13 项文件摘要及 SQLite 完整性与关键业务计数。失败时正常退出新实例、按清单恢复旧件、移除本次新增文件，以原入口重启；保留用户数据及备份。安装成功后补记实装版本时间、后检与相关 Git 提交、普通推送及远端回读。当前为部署准备，本候选安装与重启待用户明确许可，独立第三方审核未执行。

候选 c2da3c2ccbf0 正式安装前预检已完成。install.ps1 -Mode Preflight 核对原 PID 11844、REST v6、快捷方式、登录启动入口及 13 项前像通过，八个资料库 quick_check 均为 ok，检查时无在途桌面任务、提醒、花园或转录。用户选定本次跳过花园，结构同步命令被自动审批拒绝，未执行，花园无写入。

### 情绪复盘 c2da3c2ccbf0 正式安装回执

用户确认安装。本机于 2026-11-23 04:21:53 JST 完成 13 项文件安装，原 PID 11844 正常退出，新 PID 26996 于 04:21:52 JST 从原入口及资料目录启动。已核对 13 项 SHA-256、八个 SQLite 库安装前后完整性及原轮询配置。正式 REST v6 返回随附情绪技能 2.3，匿名读取技能目录为 401。代码及本机资料备份保存在发布工作目录的 install-backup-20261123-042142。

使用实际安装路径的模型、服务及页面，以临时测试资料运行 installed-replay.mjs。截图样例在 CPU 上用时 26.021 秒，回执为 keep、空引文，SQLite 中同一欲求及满足条件保留，档位 −4、奖励维持 0。验收标题对照返回 satisfied、原文引证、维持 3 次，未重建同一欲求。正向对照的内心话仍带期待语气。任务日志分段、原始 JSON 折叠及展开回读、深浅色和窄窗通过；正式个人资料的日常使用体验待用户复验。本次无迁移，按用户决定跳过花园登记。

本次正式安装的发布源码、技能、测试及审核记录已从独立工作树普通推送到 origin/codex/workspace-checkpoint-20261120，远端回读提交 827d0a476d9c91085fc981790070c8806fab4d2b 与发布源码一致。该发布工作树三组专项测试 41/41 通过。

## 2026-11-23 JST · Windows 绯月唠叨与手记固定复审

**需求与验收。** 用户报告对话历史在展开时重复显示相同文字，续答会重复旧问题，有时答错场景或人物。要求复审现有唠叨及日记，固定写入 Skill，能当场改就当场改，否则事后按原话逐条补记。以原四条真实对话试错，加正常回应对照，保留原始发言并控制耗时和 token。需求依据见来源子项目 `REQUIREMENTS.md` 的「唠叨与日记的固定复审」和「人物归属、事后更正与响应时效」，设计和六轮开发自审见 `docs/FEIYUE_PERSONALITY_MEMORY.md` 及 `docs/reviews/FEIYUE_RECORD_QUALITY_REVIEW_2026-11-23.md`。验收覆盖展开后仍可读正文及来源、正确归属、旧问题不再复述、正常回复一次推理、失败后的补记与版本回读以及发言原样保留。

**目标与比较。** Windows 本机正式绯月，根目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，沿用应用入口和 `output/desktop-profile`。只读核对实装基线 `4f12e1d6d84e`、回环 REST v6、PID 11844、启动时间 2026-11-23 04:03:19.596 JST。来源为 `G:/selftool/WebCharacter/personal-digital-companion`，Git 基线 `03942463b3de924c380ae45a0c29a30bfbbee1c6` 加固定复审的工作区差异。对实装前像逐段合入，保留正式 Skill 热更新宿主、天气、任务和花园接口。候选 `58a789073314`，清单 SHA-256 `58a789073314ed72cae48baf89a2d102d9523c4b062f8dde6f051ddd071e64b3`。`G:/selftool/WebCharacter/work/feiyue-record-quality-windows-20261123` 保存 `prepare.mjs`、`windows-files.json` 和各项前像与候选。共 34 项，18 项既有文件及 16 项新增。Worker 代码、知识库、新闻和其他并行开发无发布差异。

**逐项变更。**

- `desktop/conversation-ui.mjs`、`desktop/conversation.css` 和 `output/desktop-bundle/` 下对应两项。收起时保留预览，展开时只隐藏卡头的重复预览，详情中保留发言、说话人、来源和继续回复。维持原月印标题栏和 JST 时间展示。
- `desktop/personality-nags.mjs`、`desktop/nag-reply-check.mjs`、`desktop/pending-questions.mjs`。新增可以根据原话确定的角色纠正，对照同线原答及已出现的话拦截旧题复述、历史长答串场和空占位。一般回复一次模型生成，必要时额外改写一次，合计 25 秒预算。二次结果仍不合格则保留原话并明确留待复核。正常回应或必要短引文照常显示。
- `desktop/personality-diary.mjs`、`desktop/ai-workflow-model.mjs`。写入前清除生成字段中的重复语句及伪栏目，保留来源原话和既有评价，成文复审核对归属。新增正文替换空占位的组装规则，云端追加仍由服务端接口负责。
- `desktop/memory-refinement.mjs`、`agent/assistant/memory-refinement.mjs`、`desktop/shell.mjs`、`desktop/poll-scheduler.mjs`。复用闲时队列做逐条修订和回执检查。私密唠叨在本机补记，关联的原始发言字段保持等值。同步记录需要服务端 `/refine`，旧接口的读取若返回 404，跳过该次记录，无写请求，到后续轮询再检查。服务端可用后，按原记录编号进行修订和独立回读。
- `skills/feiyue-interaction` 的路由、3.2 版本指针和快照，以及 `personal-conversation` 2.5、`diary-writing` 2.0、`memory-refinement` 1.6 的源码、版本指针和快照。固定即时回应、手记成文和事后修订规则。隔离目录读取到 23 项能力及以上三个随附版本，实装预检三项均无外置覆写。

**数据和配置影响。** 用户原话、说话人、时间、现有附件和原编号继续保留。安装不批量回填。启动时在本机 `personality-memory.sqlite` 新建三张可重建的修订表和活动任务索引，在 `reminder-checks.sqlite` 增加每 60 分钟的闲时修订轮询。新轮询错开启动批次，已有轮询沿用原设置。无云端迁移、凭据、端口、依赖、模型文件或本机 REST 版本变化。

**实际验证。**

- `node prepare.mjs` 为候选 ESM 运行 `node --check`，验证各 Skill 的实际路由和值。来源项目 `node --test agent/tests/conversation-threads.test.mjs agent/tests/personality-memory.test.mjs agent/tests/diary-audit.test.mjs agent/tests/memory-refinement.test.mjs` 76 项通过。隔离实装候选运行同组桌面专项 74 项通过。两项网页身份与 TXT 上传路由用例依赖未纳入的 Worker 接线，在仅桌面隔离树中失败，使用 `--test-skip-pattern '网页只读|绯月以桌宠身份上传'` 单独排除，来源测试全量通过。候选 `node --test --test-name-pattern '成文|首问' agent/tests/ai-workflow.test.mjs` 的成文归属修正通过。
- `node nag-fast-replay.mjs --no-baseline` 实际 4B CPU 回放。四条归档坏稿均纠正，五条对照原样通过。强制改写失败可按原话补记，五次隔离试修各写一次并回读，正式唠叨原话在回放前后等值。正常实模 9.7 秒，292 输入 token、91 输出 token，无额外复审调用。两条确需改写的推理分别为 13.2 和 14.2 秒，分别为 262+62、278+83 token。旧服务 404 的独立回归核对无写入，接口恢复后原记录成功补记、原话严格等值。`node diary-record-replay.mjs` 对 16 篇只读排查及四篇隔离试修全部通过。
- 隐藏 Electron 使用隔离资料运行 `tools/run-electron-check.mjs tools/test-conversation-threads-electron.mjs`，浅色及 `--dark` 均通过，包括展开去重、原话、来源、切线、便签和 360px 布局。旧实装树的 `node tools/test-desktop-shell.mjs` 在旧测试查找「特殊菜单」的标签时停止，正式菜单已经使用其它名称。实际窗口的关键路径用上述 Electron 测试及安装预检补充。正式界面和实际长期轮询待发布后确认。
- 在同一隔离树运行 `tools/run-electron-check.mjs tools/test-release-panel-titlebar-electron.mjs`。七个面板的深浅色、原生标题栏、热加载及轮询设定通过。旧巡检的菜单标签断言已过期，源项目完整版包含候选范围外的情绪日志展示。隔离用例仅去除该段情绪日志断言，保留其余检查。
- `pwsh -NoProfile -File install.ps1 -Mode Preflight` 34 项前像和新增路径、实际启动入口、进程、原资料及七个 SQLite 库完整性通过，检查时无在途任务。`pwsh -NoProfile -File install.ps1 -Mode Rehearse` 隔离演练通过，包括第一项替换后中断回退和全量回退。

**未完成事项和审核关注。** 四条真实归档属于已同步记录。按现有发布记录，已发布的 `subscriptions-api` 基线缺少 `/refine`，Windows 先更新时这四条的正式同步补记及旧日记的正式逐条修订仍待配套服务发布。尚未写正式历史。请重点核对旧服务 404 回退、未来重试和回执、本机私密记录不外发、展开时正文可见、正常回复不增加固定模型调用、原话等值及冷启动错峰。第三方独立审核未执行。

**安装和恢复。** 正式安装命令为候选目录下 `pwsh -NoProfile -File install.ps1 -Mode Install`。需用户明确授权；安装前再次核对清单和正式前像，等待任务收齐，正常退出旧应用，备份旧文件及七个 SQLite 库，原子替换并按原入口启动。后检核对新 PID、启动时间、34 个摘要、REST v6、已认证和未认证的技能目录、三项技能实际版本、原提醒和任务、本机三张修订表及一项新轮询、七库完整性、原有唠叨发言及日记缓存摘要。失败时正常退出候选、恢复已核验的文件并重启基线，保留 SQLite 备份，不自动用旧备份覆盖用户资料。安装后另记实际完成时刻、回执、Git 同步及用户界面复验。

**确认与花园。** 本候选的具体安装及受控重启待用户确认，未安装、重启、提交或推送。按最新规则默认登记，草案编号 `feiyue-record-quality-20261123`、归属待正式读取场景核对「网页角色组件 → 绯月（桌面精灵）」。准确清单须使用实际安装结果、当时的线上结构和版本，展示后另经用户确认。当前制单所复用的 `G:/cloudflare/myapp/src/features/garden/store.mjs` 按发布次数推导版本，成功新增一次发布会增加主版本，和新规则要求的 0.1 不一致。等能用实际花园模型校验 0.1 后再准备正式登记，不手填版本。未生成本次 SQL、未提交花园批次、未写花园生产库。

### 9c9a1c162aed · 安装前基线变动与复核

用户回复「确认」，授权前述 Windows 记录复审更新及受控重启。正式安装首次检查发现四个界面文件已随情绪复盘 `c2da3c2ccbf0` 实装更新。校验在停机前退出，旧候选没有写入或重启。当前正式 PID 26996，2026-11-23 04:21:52.512 JST 启动，REST v6。

本次安装清单保留原来的 34 个路径与全部功能差异，只重新基于当前正式文件应用对话预览去重。`node verify-rebase.mjs` 证明 30 项前后摘要与用户确认时一致。其余 `desktop/conversation-ui.mjs`、`desktop/conversation.css` 和 `output/desktop-bundle` 下对应四项，反向撤销同一去重差异后均逐字节还原当前情绪复盘文件。新的 SHA-256 为 `9c9a1c162aed7fbcd3f39361f3fb8a496cc2988e8f244b09b8ad4cda56a33086`。原清单和首次校验回执保存在候选目录 `approved-58a789073314`，新清单和比较证明见 `windows-files.json` 与 `rebase-proof.json`。

`install.ps1 -Mode Preflight` 和 `-Mode Rehearse` 在新清单上通过。四项去重移植在隔离 Electron 验证，浅深色均保留原话和来源，标题栏、轮询设定、情绪日志分段及原始快照回读均通过。已确认的安装范围、SQLite 本地变更、回退方式及 Worker 和花园待办沿用前述记录。

### 9c9a1c162aed · 正式实装结果

2026-11-23 04:26:38 JST，已按用户确认完成 Windows 正式安装并受控重启。基线情绪复盘 `c2da3c2ccbf0` 保留。旧 PID 26996 正常退出，新 PID 11376 于 04:26:37.259 JST 经原入口启动。34 项文件摘要、REST v6、23 项技能、原提醒与轮询、七个 SQLite 库完整性均通过。新增三张本机修订表和一项闲时轮询。唠叨 17 条及会话发言 53 条保持，原话和日记缓存摘要在安装前后相同。通过新进程再次读回随附 `personal-conversation` 2.5、`diary-writing` 2.0、`memory-refinement` 1.6 与 `emotion-appraisal` 2.3。

机器回执位于 `G:/selftool/WebCharacter/work/feiyue-record-quality-windows-20261123/install-receipt.json`，旧文件和七库备份保存在同目录下 `install-backup-20261123-042627`。用户界面复验待执行。Worker 未随本次发布，已同步旧记录的逐条补记待配套接口。花园仍按默认登记处理，现用制单模型与 0.1 步长的差异未解决，待核对兼容模型后按实际结果制单并确认，当前无花园写入。Git 同步结果另记。

#### 9c9a1c162aed · Git 同步回执

绯月 Windows 记录复审源码提交 `9c3183d8bd206183edfc282f7085b5a0b5e9f9be` 已普通推送至 `origin/codex/workspace-checkpoint-20261120` 并回读确认。来源测试档在隔离 Git 基线上通过 30 项专项及 1 项手记成文回归，三项 Skill 解析为正式随附版本。仅同步本次 Windows 范围，独立 Worker 发布和花园登记继续待办。

同步复核发现一份已有工作流用例重复出现在本次差异，随后清理重复并单独复测新增的手记成文用例。本次补记只更新测试和发布纪要。

## 2026-11-23 JST · Windows 绯月七日新闻与社论候选 cafa85c28ea2

**用户需求与验收。** 按拟真页续编跨天新闻，全部、社会、科技和市场各保留五条热点及五条其他重点的席位。同一事件只有一个主题，标题随最新实质进展更新。满 48 小时无进展移到「暂未更新」，连续 168 小时才撤榜。新闻发展和社媒两条历史随话题归档，来源区可独立滚动。社论按同一近 72 小时窗口，最多三组关键词查 X 和 Reddit，合并摘要、标注原帖与变化，两站合计占用至多 70% 免费额度。验收还要求真实本机模型的标题质量、逐阶段落盘与恢复。完整口径见 REQUIREMENTS.md 的「七日新闻编辑与社论风向」及 docs/reviews/NEWS_EDITORIAL_SKILL_REVIEW_2026-11-23.md。

**目标及基线。** Windows 本机正式绯月，应用根目录 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。当前实装版本 0279cbf32be3，知识库安装回执为 2026-11-23 04:32:26.808 JST。实测 Electron PID 30888，启动 2026-11-23 04:32:24.194 JST，沿用原应用和 output/desktop-profile，回环 REST v6。安装工作树 Git HEAD 39fd098e40ebf7c2c82dd5a6f9944ae98055566e，已有多次后续实装内容，采用实际文件 SHA-256 作前像。开发来源为 G:/selftool/WebCharacter/personal-digital-companion 工作区、Git HEAD 03942463b3de924c380ae45a0c29a30bfbbee1c6。cafa85c28ea2 取代未安装的 ea7695ce5088、0585430f5e6d 与 20bc621f3af4。预检拦住了重叠文件变动，以知识库后的实装前像重新合入新闻接线，保留情绪、手记和知识库。

**精确比较与范围。** 候选和安装工具位于 G:/selftool/WebCharacter/work/feiyue-news-release-20261123。windows-files.json 的 SHA-256 为 cafa85c28ea21822de9dedb6ab2dc0dc514f4d0e352e4d0ae3eb2dd19b049e75，35 项，20 项替换、15 项新增。用 git diff --no-index before candidate 查看差异，以当前清单路径为准，逐文件核对 before 和 after 哈希。源仓清单为 docs/reviews/FEIYUE_WINDOWS_NEWS_EDITORIAL_cafa85c28ea2.json。

- desktop/news-briefing.mjs、news-history.mjs、news-layout.mjs、news-market.mjs、news-board.mjs 将已有报道按事件续写，持久保存各栏席位和本机归并标记。首轮收拢已收录事件的重复分组，保留各来源原链接；后续持续累计节点。
- desktop/news-editor.mjs、news-editorial.mjs 通过共享 AI 池分离拟标题、复核、汇总、提词和社媒归纳。只有程序校验和审核通过的标题替换当期标题。流转按话题编号和实质进展保存；已保存的平台回包可复用。
- desktop/news-panel-host.mjs、news-panel-preload.cjs、news-panel-ui.mjs、news-panel.html、news-editorial.css、news-heatmap.mjs 以及相应五项 output/desktop-bundle 页面资源，提供按报道数占比的热力图、独立话题图、暂未更新折叠区、两条时间流、引用和来源独立滚动。社论历史按需读取。
- desktop/shell.mjs、reminder-checks.mjs、poll-scheduler.mjs、source-updates.mjs 仅移植本次新闻接线。加入每 10 分钟至多推进一步的编辑轮询，停用新闻关注时暂停。保留其余已装轮询、页面模块和功能。
- workflows/comfyui/news_social.py、tavily_search.py、search_budget.py 接入共享预算和两路限域查询，按帖子时间截取。有预占但无回执时保存待核对状态。
- skills/news-editorial 变更为随附 Skill 1.6。skills/feiyue-interaction 的能力目录与发布快照从正式 3.2 增到 3.3，仅登记本次新闻编辑入口。

**数据库、回填和配置。** 首次启动自动新增本机 reminder-checks.sqlite 的 news_boards、news_editorial 两表、缺失的新闻迁移标记 2 和 3，以及编辑轮询条目。既有新闻事件按证据归并，来源索引保留，现有社媒历史无回填。第一次有效社媒请求在既有本机预算库按用量预占能力新增 news-editorial 记账。保留原资料目录、凭据、模型、监听端口和启动方式。其余业务库迁移、Cloudflare Worker 发布、远端业务库写入和服务配置改动均无。花园发布元数据另按确认清单办理，适用备份豁免。

**已执行检查。** 隔离候选从真实安装文件组装，JS 逐文件语法检查通过，随附目录加载总纲 3.3 和新闻技能 1.6。候选里执行 node --test --test-concurrency=1 agent/tests/news-editorial.test.mjs agent/tests/news-briefing.test.mjs，21/21 通过；开发工作区新闻和共用队列回归 35/35 通过，Python 限域日期与共享预算专项通过。未改动的七日新闻页面此前在基于实际安装版的独立 Electron 验证通过主题折叠、热力图、社论历史懒加载、原帖、来源独立滚动。check-migration.mjs 使用正式 SQLite 的只读隔离副本，迁入前 425 个事件、438 个来源索引，迁入后 360 个事件、438 个来源索引，无孤立链接，quick_check 和重入通过。真实本机模型对四类标题及保存的 X、Reddit 回包验证见上述开发复核。本次准备未发起新社媒请求。

**审核重点与未完成项。** 检查同一话题改名时的编号与归档、新闻迁移对旧节点的影响、热力块及图资源按需载入、两站共用账户的额度预占。部分缺少事件线索的笼统标题仍可能留为独立项。Reddit 原帖时间缺证据时显示待核实。正式安装后实机视觉和真实查询计费尚待验证，第三方独立审核未执行。

安装工具的 -Mode Rehearse 已在隔离目录通过 35 项安装、模拟中断回退及完整回退。capture-news-change.mjs 对正式库只读模拟精准范围，当前 67 条会变更的新闻和 75 条直接关联来源索引，两个缺失迁移标记、两个新表和一个新轮询键均已核对。备份脚本语法、逐键复核及合成材料的 Windows DPAPI 加密回读通过。正式安装前会再核对原实例、文件前像和实际影响。

**安装及回退。** 候选目录 install.ps1 先核对完整审核、SHA-256、实例、桌面快捷方式和登录入口，等待在途事务。备份逐个旧文件，通过应用正常退出。新闻库只将模拟计算出的受影响旧行、直接关联索引、必要结构定义和拟新增键的原状态写进 Windows DPAPI 加密局部备份，其他 SQLite 仅做只读完整性检查。本次不启动整库备份。逐项原子替换后，用备份逐键核对写入目标旧值，再从原入口受控启动。后检核对新 PID、同一资料目录、REST v6、未认证 401、正式技能目录 1.6、两张本机表、一次性迁移、编辑间隔、旧轮询和来源索引完整性。安装失败按清单恢复原文件，移除本次新增并重启原入口。正常代码回退保留候选期间产生的新资料，如确需数据回退，先核对现值，再据局部备份恢复实际受影响的目标。正式实装结果、版本、时间、Git 提交与推送回读待实际执行后追加。

**花园及确认。** 按用户规则默认登记。已执行主项目现行结构同步，远端仅导出结构，本机补项 0。只读当前花园修订 157，归属「网页角色组件」#16 →「绯月（桌面精灵）」#61，现值 32.0，历史 32 次，当前批次 feiyue-news-editorial-20261123 没有登记。按当前编号，拟在成功后新增发布 #83 及一条关联 #61 的发布明细 #161，用实际版本、JST 时间和结果，功能版本 32.0 → 32.1。项目、种子、改善、Bug、关系和既有发布无需更新。若实际失败，登记发布中并记失败原因，保留成功版本。现行花园模型以发布总次数作为主版本，成功发布会写成 33.0，无法执行新步长。待模型支持及同批次最终清单确认后再提交。候选实装与重启待用户确认。

### 七日新闻候选 cafa85c28ea2 正式安装回执

用户明确回复「安装」。2026-11-23 04:36:26.675 JST 完成 35 项文件安装及后检，正式 PID 由 30888 变更为 14308，新进程于 04:36:25.386 JST 由同一应用目录启动，沿用原快捷方式、登录入口及资料目录。完整候选 SHA-256 为 cafa85c28ea21822de9dedb6ab2dc0dc514f4d0e352e4d0ae3eb2dd19b049e75，逐项安装文件与清单一致。REST v6 回读正式新闻 Skill 1.6、记录修订 1.6、对话转录 1.7、情绪复盘 2.3。未认证技能目录返回 401。

正常退出后，按局部备份规则以 Windows DPAPI 加密保存 67 条受影响新闻记录和 75 条直接关联来源索引，以及迁移标记、选定目标表定义和新增轮询键的原状态。加密备份已回读，启动前逐键核对了目标旧值。备份与旧代码位于 work/feiyue-news-release-20261123/install-backup-20261123-043613，安装回执为其上级 install-receipt.json。七个本机资料库完整性检查通过，未启动整库备份。新闻迁移完成，来源索引 438 条全部保留，两张新表已建立，新闻编辑轮询启用，间隔 10 分钟。原有轮询配置回读一致。正式新闻窗口目视体验和下一次实际社媒计费待日常使用确认。

花园批次 feiyue-news-editorial-20261123 保留待登记。现行版本算法仍与 0.1 新规则不一致，本次花园未提交写入。待算法支持后重新核对实际旧值和记录编号，展示最终清单后单批提交。

### 七日新闻候选 cafa85c28ea2 源码同步

安装对应的源码从 215247fa10a272aa1ce5fac5bd7ff2f29ce6aa50 按 41 项核对清单叠加，仅携带七日新闻相关改动。正式页面资源由源文件构建。源码提交 0655e38fb6d5d3f5cf0bc2dd5078744634b393e2 已推送至 origin/codex/workspace-checkpoint-20261120 并回读一致。共享入口按新闻增量移植，保留同分支已有的独立改动。花园仍待版本规则支持。

## 2026-11-23 JST · Windows 绯月「陪我学习」安装候选 247f3713f3f2

**用户需求和验收。** 绯月按现有材料做 A/B 对练、保存总结和强化练习，支持本机缓存、抽题、模考。用户随后确认绯月通过 subscriptions-api 与网页版共用知序账户和正式场次，先用真实结构和少量生产只读样本在本地验收。两个 Worker 已单独发布，用户随后要求安装。验收范围为右键或明确对话指令打开同一学习面板，本机材料及模型可用，知序取材、接管续考和交卷可回读，草稿与复盘仍在本机。

**目标和比较方法。** 目标为 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion 的 Windows 正式绯月。实际安装版本 cafa85c28ea2，安装树 Git 参考 39fd098e40ebf7c2c82dd5a6f9944ae98055566e 加实际补丁。准备时正式 REST v6，PID 14308，04:36:25 JST 开始运行，同一 Electron、实际命令行、登录项和 output/desktop-profile。来源 G:/selftool/WebCharacter/personal-digital-companion，Git 基线 03942463b3de924c380ae45a0c29a30bfbbee1c6。依据 REQUIREMENTS.md 的学习章节、docs/STUDY_DESIGN.md 和 docs/reviews/LEARNING_IMPLEMENTATION_REVIEW_2026-11-23.md；仅合入学习文件和必要钩子。此前候选 b693d0853451 未实装；知识库和新闻编辑的并行发布使四个前像变化。按实际最新文件重新落入学习门面，仅重做 shell.mjs、screen-question-host.mjs、menu-layout.json、source-updates.mjs 的学习接线，其余 21 项摘要不变，最新正式功能保持原代码。

冻结目录 G:/selftool/WebCharacter/work/feiyue-study-install-20261123。windows-files.json 的完整 SHA-256 为 247f3713f3f227c75c91d1d0cedf071f382044f91afafc55426ab3704bda1903，逐项记录 before/ 与 candidate/ 的文件路径、旧摘要和新摘要。25 项中 10 项替换现有文件，其余为新增。核对旧、新两树对应的文件即可还原差异。

**具体文件和行为。**

- desktop/shell.mjs、screen-question-host.mjs、conversation-routing.mjs、menu-layout.json 和 source-updates.mjs 增加学习入口、显式对话触发、面板生命周期与热加载。其它正式版模块继续使用原代码。
- 新增 desktop/study-host.mjs、study-preload.cjs、study-materials.mjs、study-relay.mjs、study-store.mjs、study-ui.mjs、study.html、study.css 和 pair-choice.mjs。范围为安全 IPC、材料导入缓存、题库抽练和模考、A/B 对练、复盘、强化、正式考试续考和交卷。输出目录同步 study-ui.mjs、study.html、study.css 和 pair-choice.mjs。回执使用既有知序修订号、写入者代次及幂等键。复盘显式使用 JST。
- assets 和 output/desktop-bundle 的 study-initial.v1.json 为同一份 LanguageStudy 正式初始包，30 套，按需载入。tools/build-desktop.mjs 增加资源收集。
- cloud-connection.mjs 复用已有身份接入已发布的知序服务。线上自建语言材料路由留待服务端发布，当前可用基础剧本和本机导入。知序生产回执暂未提供完整历史作答标记，未见题明确采用本机已知记录，普通抽练、正式续考和交卷使用现有契约。
- dictation-host.mjs、bubble-voice.mjs 和 bubble-voice-worker.py 为可信学习窗口接入日语听写，使用现有 SenseVoiceSmall 模型；普通中文听写沿用原逻辑。无需安装依赖或另复制模型。

**数据库及配置。** 无已有业务库的迁移、回填或安装时写入；无 Cloudflare 发布或配置修改。首次打开学习窗口按需在原资料目录创建独立受保护的 study.sqlite。只在用户实际操作正式考试时提交。纯代码和资源发布按新个人发布规则跳过数据库备份，仅备份本次替换的应用文件。已有资料、登录项、启动入口和模型配置沿用。

**实际验证。**

- 隔离正式基线运行 node --test agent/tests/study.test.mjs，13/13。覆盖离线、草稿、续考、特殊配对、复盘、来源分页和当前发布的 Access 请求范围。
- windows-study-audit.mjs --as-integrated --synthetic 精确加载候选桌面代码及实际 Worker 候选。隔离 Workerd 共享真实结构，合成样本双向续考各 6/6，并发开考/接管各一方成功，交卷只结算一次，超时草稿保留。上一阶段已用 6 道真实只读样本验收。
- install.ps1 -Mode Rehearse 在隔离目录完成中途失败与完整回退演练。基础包与 LanguageStudy 源文件 SHA-256 相同，宿主、路由、语音和打包接线通过语法检查。
- 最新 test-panel-titlebar-electron.mjs 在隔离正式基线通过布局、原生标题栏和热加载检查。正式树的旧检查脚本将常规自绘菜单误当作标题面板，复测使用项目现有新版脚本。仅更换测试副本。
- 同样的学习实现和模型文件先前已在隔离 Electron 通过 test-study-electron.mjs --real-cpu --ja-sample=<预录样本>。重基线后重跑带模型替身的正式基线冷启动、标题栏、候选 Workerd、13 项专项与安装回退演练，均通过。冷启动脚本改为等待菜单学习项完成渲染，安装文件未改变。日语预录样本同时通过实际模型直测。实点自绘菜单首击、深浅色窄窗、考试暂停恢复与关窗草稿、载入 30 套基础剧本。本机 Qwen3.5-2B CPU 完成 A/B 对练，模拟麦克风经本机 SenseVoice 日语识别回填，待用户确认后才提交。

**安装和回退。** 取得对候选的明确确认后，再次核对候选摘要、现场正式版本、启动入口、在途任务和正式资料路径。等待空闲后正常退出，应用定向文件，保持原启动入口，核对新进程、REST v6、资料目录和已安装文件摘要。异常恢复被替换文件、移除新增文件并启动旧代码。既有数据库只做只读完整性回查。安装后补记实际版本、JST 时间、后检与 Git 回执。

**当前限制和确认。** 等待正式安装授权，尚未替换正式代码。第三方独立审核未执行。重点检查工作区范围、可信 IPC、题目与场次共用、超时恢复及独立本地资料。生产 Access 效果待用户截图确认。

花园默认草案 feiyue-study-install-20261123。当前修订 157，网页角色组件 #16 → 绯月（桌面精灵）#61 现为 32.0，本次独立成功按新规则加 0.1。如果上次两个 Worker 的记录先登记，则按届时版本续算。现行模型会计算为 33.0，暂不生成版本不一致的执行 SQL。待支持新模型及实际结果后回读编号、前后版本和清单并取得单独确认。既有项目、种子、改善、缺陷和历史无需更新。

### 实际安装回执 · 247f3713f3f2

用户确认后于 2026-11-23T04:45:26.4677741+09:00 完成安装，旧 PID 14308 正常退出，新 PID 16124 于 2026-11-23T04:45:25.4730000+09:00 从原 Electron 入口启动，使用原正式资料目录。25 项应用文件 SHA-256 与候选完全一致，原快捷方式和登录项通过查验。正式 REST v6 的受控技能目录可回读，未认证为 401；既有资料库完整性及必要状态核对通过。

从实际安装目录加载正式 shell、页面及固定资源，以独立临时资料运行 installed-study-entry.mjs。自绘菜单首击、本地模考暂停恢复、关窗草稿恢复、深浅色窄窗、逐句信心、返回原答和按需加载 30 套基础剧本通过。安装未变更已有业务数据库，未执行数据库备份、DDL 或回填。保留被替换应用文件的回退副本。线上 Access 页面和正式取题交卷待用户截图确认，代理未代登录。

花园批次 feiyue-study-install-20261123 待支持 +0.1 的计数模型及具体清单确认，暂未登记。准确安装源码的 Git 同步状态在后续回读时补记。

### 安装源码同步 · 247f3713f3f2

已推送已安装学习功能的 29 项源码、测试与文档至 origin/codex/workspace-checkpoint-20261120，2026-11-23 04:50:27 JST 已回读并与 7d848e0a19cde6744bc3f7b53d60a945626319ee 一致。保留并行改动，学习专项 13/13。正式安装完整字节清单见 docs/releases/feiyue-study-install-20261123/windows-files.json。


## 2026-11-23 JST · Windows 绯月新闻更新提醒 · 948648e620bb

**需求与验收。** 用户要求“修一下新闻更新提醒，别再弹 Electron 欢迎页了，点提醒就打开绯月的新闻简报”，随后要求安装。新闻入库后仅出现绯月的提醒；点击首次打开，已有窗口恢复并读到新增报道。关闭、超时、空更新均不额外打开简报。

**发布目标与基线。** Windows 本机安装版 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。准备时正式版本 247f3713f3f2，PID 16124，同一 desktop 入口与 output/desktop-profile。安装树 Git 39fd098e40ebf7c2c82dd5a6f9944ae98055566e，开发来源 G:/selftool/WebCharacter/personal-digital-companion 的 03942463b3de924c380ae45a0c29a30bfbbee1c6 加本次工作区差异。当前已发布学习版源码回执 7eb3f03d0a58a258486d699c60dd92906e59bf0a。安装树含后续发布的实际字节；以清单逐项 SHA-256 校验。

**比较与范围。** 本机候选目录 G:/selftool/WebCharacter/work/feiyue-news-notice-20261123。windows-files.json 的 SHA-256 为 948648e620bb59407b8388fed5a33e100f19ca0154d72cc317f1bdb832325353，候选 11 项，6 项替换、5 项新增。可复核该目录的 before、candidate 以及 git diff --no-index before candidate。仓库清单见 docs/releases/feiyue-news-notice-20261123/windows-files.json。

- desktop/shell.mjs 只改新闻通知回调及其导入。旧入口在入库后调用 Windows 托盘气球；新入口交给现有绯月主进程。desktop/source-updates.mjs 新增提醒页资源登记。逐块移植以上两项，保留正式学习、桌宠和既有功能。
- desktop/news-panel-host.mjs 新增非抢焦点的单张提醒，在工作区右下角显示，15 秒收起；点击恢复原简报或打开简报。desktop/news-panel-preload.cjs 和 desktop/news-panel-ui.mjs 接入主动读取新增报道。普通后台更新仍保留当前阅读位置并提示可刷新。
- desktop/news-notice.html、desktop/news-notice.css、desktop/news-notice-preload.cjs 提供月印标题栏、标题纯文本显示及打开或关闭操作。output/desktop-bundle 中交付 news-panel-ui.mjs、news-notice.html、news-notice.css 三项对应页面资源。

**数据库、配置及兼容。** 业务数据库迁移、回填、设置变更、新依赖、云端部署均无。恢复所需资料为 6 项旧应用文件与新增路径原先不存在的记录。按纯代码发布规则跳过业务库备份。沿用原快捷方式、登录项、模型及资料目录。新闻提醒在应用内收起后，可从绯月菜单打开简报；不会进入 Windows 通知历史。

**实测与限制。** 开发版本构建、桌面壳、新闻单测 18/18、新闻报面、标题栏和菜单回归通过；全量 Node 检查 500 项通过、0 项失败。开发环境另有截图问答 UI 回归在等待模拟回答时超时，见 tools/test-screen-question-electron.mjs:375。正式基线候选上运行 Electron tools/run-electron-check.mjs 指向候选 qa/tools/test-news-notice-electron.mjs，隔离资料及模拟稿件，验证非抢焦点、无新事件、重复替换、关闭、第一次打开、最小化恢复并读取新报道、15 秒自动收起，通过。pwsh -File install.ps1 -Mode Rehearse 完成 11 项安装、中断回退、完整回退并核对前像。真实日常新闻通知尚待安装后出现时由用户实点。第三方独立审核未执行。

**安装及恢复。** 安装前运行 install.ps1 -Mode Preflight 复核候选、实际进程、8765 监听、入口、资料目录和已列文件前像；等待在途任务结束，正常退出，保存替换文件，逐项原子安装并从原入口受控启动。核对 11 项哈希、新 PID、启动时间、资料目录、REST 及现有数据库完整性，然后从已安装文件用隔离资料复验新闻提醒。写入或启动验收失败时按反序恢复旧文件、移除本次新增文件，重启原版本。重点复核共享 shell 的差异、IPC 限定、关闭及超时路径，以及新闻之外的菜单行为。

**花园、授权与 Git。** 默认批次 feiyue-news-notice-20261123。db:sync-schema 成功且新增对象 0；正式 inspect 返回 VERSION_MIGRATION_REQUIRED。只读复核线上修订 157、项目「网页角色组件」#16 与功能「绯月（桌面精灵）」#61，上次已登记版本 32.0，本批记录 0；线上 garden_flower 尚无 release_offset。拟新增本次发布及关联明细，并记录本次新闻提醒修正。以实际发布结果、届时旧值及 +0.1 步长出最终清单，现值不变时成功将为 32.1。种子、功能归属及历史无需修改。等待模型与线上结构一致后再制单、取得具体清单确认、提交精确 SQL 并通过绯月一次登记。本次不迁移花园，未执行生产写入。用户已要求安装新闻修复；本记录对应的候选安装结果与 Git 收尾待实际执行后补记。


### 新闻提醒正式安装回执 · 948648e620bb

用户明确要求「安装」。安装前预检核对 PID 16124、8 个 SQLite 的只读完整性、快捷方式、登录项与 11 项前像通过，未见在途任务。2026-11-23 04:57:54 JST 完成安装，旧实例正常退出，新 PID 28504 从原入口启动并沿用原资料。正式 REST v6 和 24 项技能回读正常，未认证返回 401。11 项文件 SHA-256 全部匹配。6 项旧应用文件已保留在本机候选目录 install-backup-20261123-045743。本次无数据库或配置变更。

从实际安装版加载模块、页面及预加载脚本，以独立 Electron 资料和模拟新闻运行 installed-check.mjs 通过。覆盖首次点击打开、复用最小化的简报并显示新报道、关闭、超时、重复更新和不抢焦点。Git 交付树新闻单元测试 18/18。日常真实新闻到达时的实点待用户确认。正式 API 对批次 feiyue-news-notice-20261123 回读 404，尚未提交；待花园线上版本迁移及最终清单确认。

新闻提醒 948648e620bb 的安装源码、测试、11 项字节清单及安装回执已提交至 632da6b188cbab440a9114e80f1faab2ad087686，并推送至 origin/codex/workspace-checkpoint-20261120，远端读取与本地提交一致。


## 2026-11-23 JST · Windows 绯月巡检重启间隔 · 19da7edac181

用户根据提醒列表指出频率异常，核对缺陷与本地修复结果后明确要求“安装”。验收依据为 docs/DESIGN.md 的可调小时周期。上次成功巡检距今未满所设周期时，重启后等到原到期时间；过期在预热后检查一次。失败提醒与已读状态沿用现有记录。

目标是 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion 的 Windows 安装版，开发来源为 G:/selftool/WebCharacter/personal-digital-companion，开发 Git 基线 03942463b3de924c380ae45a0c29a30bfbbee1c6，安装树 Git 基线 39fd098e40ebf7c2c82dd5a6f9944ae98055566e。准备时核对正式新闻提醒发布回执 948648e620bb、PID 28504、启动 04:57:53 JST 和原资料目录。按实际文件前像比较，唯一安装路径 desktop/reminder-checks.mjs，旧 SHA-256 为 152359e2e2bc4854bf9e7619ec760374051020a0a5344dce91b000455bf1cfc8，新值 ee6d10d2255db0a2164ca20621708d6f5950059f8ca4b207c27185181db7afc7。候选清单 SHA-256 为 19da7edac1810dbdd4ef557c3d7a2d7add6601c448638f8984dfe2e8abb6b874。可对比仓库根 work/feiyue-inspection-interval-20261123 中 before 和 candidate 的同名文件。

旧版每次重启预热一分钟便再次扫描。新版复用已经和通知一同提交的 log_inspection.through，调度器按实际设置恢复到期时间。重点核对首次无游标、重启跨周期、调整周期及其他轮询独立性。已有表及提醒兼容。数据库迁移、数据回填、配置修改、业务数据备份、新依赖、云部署均无。保留安装文件前像用于恢复。

实测 node --test agent/tests/autonomous-idle.test.mjs tools/test-reminder-checks.mjs 与 node --test tools/test-poll-settings.mjs 共 23 项通过；Electron 的 tools/test-panel-titlebar-electron.mjs 七面板通过。新增用例在旧代码重现多一条通知。在正式模块依赖上执行 node --test work/feiyue-inspection-interval-20261123/candidate-test.mjs，连续五次重启、自定 30 分钟和过期补一次均通过。pwsh -File work/feiyue-inspection-interval-20261123/install.ps1 -Mode Rehearse 通过中断恢复、完整替换及回退检查。

安装时先复核前像、入口、进程与资料目录，等待在途任务，正常关闭应用，备份并替换一个模块，从原入口重启。失败则还原该文件并从原入口恢复。重启后核对运行进程、监听、摘要、轮询设置和资料完整性。用正式模块和隔离资料重跑重启回归，并在真实预热窗口后只读检查巡检时间。日常长期表现待观察。用户已明确授权安装本次修复；第三方独立审核未执行。安装回执、实际时间与 Git 同步在执行后补记。花园批次 feiyue-inspection-interval-20261123，默认登记；本次线上结构同步被自动审批拒绝，尚未生成可确认的精确清单，尚无花园写入。

2026-11-23 05:00:25 JST 安装成功。版本 19da7edac181，单文件摘要与审核一致；原 PID 28504 正常退出，新 PID 28580 于 05:00:24 JST 从原入口启动，资料目录及 60 分钟设置保留。8 个本机库快速检查通过，REST v6 技能目录可用。node --test work/feiyue-inspection-interval-20261123/installed-test.mjs 通过。05:01:30 JST 只读回查，重启后巡检及巡检提醒均为 0，上次成功时间 04:58:53，下次按周期为 05:58:53。长期运行待用户观察。Git 使用独立工作树同步本次代码、回归和纪要；花园结构同步因跨项目自动审批拒绝，登记尚未提交。

## 2026-11-23 JST · Windows 正式版候选 7fcdfda70149 · 头顶气泡与固定动画尺寸

用户反馈头上冒泡会自动缩小，要求直接在头顶弹出内容，并要求除特殊指定外始终保持动画的固定展示大小。验收比较进度、等待、开工目的、完成耗时、收起和重新显示时的角色窗口位置与尺寸、CSS 画布和绘图缓冲区。靠近屏幕上沿时只移动提示，已有特殊动作按各自的尺寸展示。

**发布目标及基线。** 绯月 Windows 正式安装根为 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。桌面快捷方式实际参数、登录启动项、主进程及 REST v6 指向同一正式应用，PID 16124，原正式资料目录 output/desktop-profile。安装基线 247f3713f3f2，已推送的学习安装收尾提交 7eb3f03d0a58a258486d699c60dd92906e59bf0a。来源是 WebCharacter/personal-digital-companion 的开发补丁，普通工作树 Git 基线 03942463b3de924c380ae45a0c29a30bfbbee1c6，需求见 docs/REQUIREMENT_CHANGES.md 的联想云条目。对共享文件 shell.mjs 和 source-updates.mjs 只在实装原件上移植气泡相关行。新闻通知与其他并行开发不在清单中。

**可复现差异。** 仓库根 work/feiyue-fixed-overlay-20261123 下的 before/、candidate/、prepare.py 和 windows-files.json 给出 16 个文件的前后字节及 SHA-256，10 个替换，6 个新增。清单完整摘要 7fcdfda701494b1cbd427b61e0d643115988e8fc84ee5f70251b91a748ff54b4。可用 git diff --no-index before candidate 逐项审核。

- desktop/shell.mjs 和 movement.mjs 固定普通动画逻辑尺寸、保留 DPI 对齐和已指定的依附动作大小，解除依附时回到该屏普通尺寸。原逻辑会按工作区缩小角色。
- desktop/style.css、index.html、configured-renderer.mjs、preload.cjs 移除角色页内的思考云、对应订阅与挤压画布的规则。原进度和结果分别压低 70 和 84 像素，并收窄 48 像素。
- 新增 desktop/thought-overlay.mjs、thought-preload.cjs、thought.html、thought.css。透明窗按需创建，点击穿透，不抢焦点。显示最新任务内容，跟随角色移动，隐藏和退场时释放。上方不足时优先侧放，两侧均不足时优先下放；极小工作区的边界会限制可见区域。
- desktop/source-updates.mjs 登记独立页面。output/desktop-bundle 同步 index.html、configured-renderer.mjs、style.css，并新增 thought.html 和 thought.css。原角色入口保留本地动画目录加载。

**数据和兼容性。** 业务库迁移、回填、数据库备份、配置修改、外部服务部署、新依赖均为无。复用原用户资料、动作素材和启动入口。软件文件留逐项回退副本。跨屏沿用既有物理像素网格对齐。

**已执行验证。** 开发区 build-desktop、test-desktop-shell（含 --garden-api）、test-walk、真实 Electron 动作、七面板及浅深色截图回归通过。正式基线隔离候选执行 node tools/test-walk.mjs 通过；Electron 的 tools/run-electron-check.mjs 分别运行 tools/test-context-actions-electron.mjs 和 tools/test-panel-titlebar-electron.mjs，均退出 0。实测 CSS 画布 246 × 360、绘图缓冲区 369 × 547。进度和结果切换、快速收起、隐藏恢复及左上角避让均通过，退场 6071 ms。初次隔离目录缺电梯素材清单，已从正式版补齐只读夹具后重跑通过。标题栏测试含无效配置回退警告。install.ps1 -Mode Rehearse 已验证模拟中途失败回退、完整替换及完整回退。待实际安装后的运行入口复验和用户桌面观感确认。

**安装及恢复。** 安装前逐项核对目标旧值、新文件缺席、清单摘要、快捷方式、登录项、实际进程、端口和原资料目录。若基线改变先重评差异。等待在途工作收尾后正常退出，依清单逐个替换或新增文件，从原入口受控重启；回读新 PID、启动时间、REST、文件摘要及资料完整性，再以实际安装文件和隔离资料复测气泡。安装异常按已完成项倒序恢复旧文件并移除本次新增，恢复旧入口。重点审核热更新依赖、隐藏销毁、旧进程退出及其他并行工作是否混入。无正式安装结果、发布后 Git 回执或独立第三方审核结论。

**花园及确认。** 默认登记，批次 feiyue-fixed-overlay-20261123。npm.cmd run db:sync-schema 成功，线上只读核对修订 157，归属网页角色组件 #16 → 绯月（桌面精灵）#61，本批标记 0 条。正式版 inspect 返回 VERSION_MIGRATION_REQUIRED。当前无法用实际模型制出每次成功增加 0.1 的精确清单。待版本迁移生效且安装结果确定后重新核对、提交具体清单供确认，之后按规定提交 SQL、入队和回读；本次仅拟新增发布和对应部署明细，既有项目、功能定义、种子、改善及缺陷记录无变更。花园无生产写入。用户已提出安装，此记录供该候选安装及受控重启前的本次发布确认。


### 正式新闻提醒基线重核及安装许可

用户在看到正式审核、16 项范围和重启影响后明确答复「确认安装并重启」，在基线变化通知后再次要求「安装」。首次写前校验拦截旧清单，未写入任何文件。正式新闻提醒版本 948648e620bb 于 04:57 JST 完成安装，PID 28504。旧候选留在 work/feiyue-fixed-overlay-20261123/reviewed-7fcdfda70149/。将相同补丁应用于该正式基线得到最终候选 dda429cff282，完整清单摘要 dda429cff282de7db0ecca6f872147c15962f29bde22dd6f299f5c931f823e2d。16 个相同路径的逐文件增删行与已确认候选完全一致；新闻逻辑原样保留。正式基线隔离 Electron 再次核对画布 246 × 360、绘图像素 369 × 547，气泡状态、收起恢复、边缘避让和七面板测试通过。安装中断及完整回退演练再次通过。目标、部署范围、数据及配置影响与原确认一致。


### 实际安装回执 · dda429cff282

2026-11-23 05:01:05 JST 安装成功。旧 PID 28580 正常退出；新 PID 25224 于 05:01:04 JST 启动，复用正式资料、快捷方式和登录项。16 个目标 SHA-256 回读一致，REST v6 可用，受控技能目录返回 24 项，未认证访问返回 401。既有业务库只读检查通过。由实际安装文件使用隔离资料重测进度、等待、结果、屏幕边缘、快速收起和重新显示，画布为 246 × 360、绘图像素为 369 × 547，正常退场 6072 ms。日常桌面观感待用户确认。花园清单暂受版本迁移阻塞；未写入。
