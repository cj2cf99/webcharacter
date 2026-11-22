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


## 本机 REST 一次性提醒（2026-11-23 JST，候选）

**需求与验收。** 用户要求「在rest把这个功能也放开」。调用端能用标题、可复制的原文提示词和明确的东京日期及时分创建一次性提醒，按稳定编号查询登记状态，成功返回既有提醒记录编号。原编号重交或在重启后恢复，只创建一条记录。花园原接口和原批次数据兼容。

**环境、来源及比较。** 发布目标为 Windows 正式安装 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`，使用该安装自己的原 `output/desktop-profile`。安装基线为 `46c2e0ac0916`，正式 `/infoguide` 为 v4，最近只读核对 PID 19400，启动于 2026-11-23 00:23:53 JST。源码为 `G:/selftool/WebCharacter/personal-digital-companion`，以 Git `4d9363f` 为基线对照本次补丁。候选四个文件以正式安装原文件为输入，逐项核对前后 SHA-256。清单位于 `G:/stockcheck/work/feiyue-rest-install-candidate/personal-digital-companion/rest-reminders-install-manifest.json`，完整清单摘要 `d5408e6f17d881f5d968159afdc2924365fbd00c862c53384125621e76a32299`。候选其余运行代码保留正式安装基线。

| 安装文件 | 变化 |
| --- | --- |
| `desktop/local-rest.mjs` | 原说明 v4 升为 v5，增设 `POST /v1/reminders`、`GET /v1/reminders/:id` 和 `POST /v1/reminders/:id/retry`。沿用回环地址、请求来源限制、令牌和正文上限。校验东京时分及日历。 |
| `desktop/local-task-pool.mjs` | 既有队列按入队顺序处理两类任务，共用名额和执行权。单独保存提醒编号、待处理正文、云端提交号和回执。登记完成后清除队列中的正文副本。 |
| `desktop/registration-flow.mjs` | 使用现有 `reminders.create` 任务，以原文和东京当地时分提交并校验入库回执。恢复时使用同一提交号。 |
| `desktop/shell.mjs` | 接入正式工作队列，完成时通过既有托盘提示展示提醒记录号。 |

调用手册更新于 `docs/LOCAL_GARDEN_API.md`。来源验证文件为 `agent/tests/local-rest-reminders.test.mjs`、`agent/tests/local-rest-garden.test.mjs`、`agent/tests/registration-flow.test.mjs` 和 `tools/test-desktop-shell.mjs`，开发留痕为 `docs/DEVELOPMENT.md`。安装候选中的新版提醒测试种子与启动测试仅供隔离验证。

**数据、配置与兼容。** 绯月在原 `local-batches.sqlite` 内按需建立独立的 `reminder_requests` 表。原花园批次表、列表、回执和确认流程保持兼容。云端部署、云端迁移、本地历史回填、模型和依赖调整、令牌变更、外部监听及定时任务变更均无。复用正式云端已确认支持 JST 时分的提醒模板。

**实际验证。** 来源的 `node --test --test-reporter=spec agent/tests/*.test.mjs` 为 436 通过、3 跳过、0 失败，`node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs --garden-api` 和 `git diff --check` 通过。原相对日期测试随真实日期变化的问题在原基线复现，已固定测试时钟；正式来源工作树已有同一修正。候选用 `node --test --test-reporter=spec agent/tests/local-rest-reminders.test.mjs agent/tests/local-rest-garden.test.mjs` 核对鉴权、时分和原文、重交、丢回执后的重启恢复及花园兼容，共 18 项通过。旧安装树附带的离线种子最初拒绝带时分日期，复核正式发布的模板更新记录后，改用已支持时分的离线种子。候选 `node tools/test-install-rest-reminders.mjs --garden-api` 验证真实桌面主进程模块在模拟窗口下启动 v5、鉴权、花园批次完成及正常退出。旧安装目录附带的全量桌面脚本含过时菜单断言，来源脚本则含与安装基线不同的日记断言，因此候选采用上述聚焦启动脚本。所有测试使用隔离资料和模拟云端，独立第三方审核未执行。

**安装、后检及恢复。** 审核重点为本机鉴权、原文与 JST 时分、云端提交号复用、旧花园批次切换和候选差异范围。获本次明确许可后，复核运行实例和前像摘要，等待在途工作结束并正常退出。备份四个旧文件和本地队列 SQLite，核对完整性，再替换四项文件并从原入口启动。复核新 PID、原资料目录、监听地址、v5 路由、原花园批次及摘要。按用户已授权的实际提醒内容登记，回读原编号和记录号，核对原文及东京时分；受控页面效果由用户自行确认。若安装失败，正常退出、恢复四项前像并核对原入口启动。回退前核实提醒在途状态，已落库提醒保留原记录，防止重复登记。本地 SQLite 备份用于核对，避免覆盖期间新增的任务状态。

**确认与待办。** 本次正式安装及受控重启待明确许可。另待确认本次绯月发布是否登记到花园。Git 提交及推送未执行。正式 v5、真实提醒记录和到期触发待安装及登记后验证。发布结束后追加实际结果、时间、版本、回执和 Git 状态。


**用户确认与实装。** 用户明确确认本次安装及受控重启，同意将本次绯月发布登记到花园，并要求先核对具体清单。2026-11-23 00:44:54 JST 完成正式 Windows 安装及后检，版本 `d5408e6f17d8`，旧 PID 19400 正常退出，新 PID 35136 从原入口启动。四项文件摘要、正式资料目录、回环监听、原启动项和快捷方式均通过核对。备份和实装队列 SQLite 完整性均为 `ok`，原花园批次 21 → 21，轮询配置一致。实际 `/infoguide` 为 v5，三条提醒路由在册。只读探针无令牌返回 401，已认证查询不存在的编号返回 404。

**正式提醒回读。** 2026-11-23 00:45:55 JST，通过新接口登记用户授权的一次性提醒，按相同编号读取状态 `done` 及正整数提醒记录号，同一回执的标题和东京日期及时分与请求一致；正文以原文提交，由登记链核对参数。到期通知待到期触发。机器回执保存在 `G:/stockcheck/work/feiyue-rest-install-candidate`。回退备份目录为该路径下的 `install-backup-20261123-004444718`。

**花园登记。** 用 `npm.cmd run db:sync-schema` 和绯月 v5 的 `inspect` 核对线上实际结构及修订 149。由 `prepare` 生成 `feiyue-rest-reminders-20261123` 待确认草案及两步精确 SQL，确认摘要 `02dc5bc17da3c599d241b5e49c1c644323e55d2c7c9f9135c1c7bcf663244511`。归属「网页角色组件 #16 → 绯月（桌面精灵）#61」，拟新增部署 #76、明细 #154 和已完成改善 #81。草案留在调用端，等待用户明确确认具体内容。未提交花园 SQL，未入队，也未写入花园。

来源代码和本次发布记录在独立分支 `codex/feiyue-rest-reminders` 留痕。远端尚未同步。
