

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
