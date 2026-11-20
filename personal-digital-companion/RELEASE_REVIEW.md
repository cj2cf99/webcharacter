

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
