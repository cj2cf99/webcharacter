## 2026-11-23 JST · 绯月陪练补项 · 本次发布准备

**需求与验收。** 在已安装的「陪我学习」中，绯月演 A、用户作 B，语言取材后本地练习和总结。按错误和独立验证次数强化，普通模考保持原规则。按账户识别已做题，正式中继保留原场号、成绩和写入代次，冲突须核对；原题换版后明确选择重练。验收包括基础包验真、云端材料只读、网页首次正确仍属已做、双方交卷成绩一致、21 题复盘能从第二页回到原题。依据为 WebCharacter 的 personal-digital-companion/REQUIREMENTS.md、docs/STUDY_DESIGN.md、docs/reviews/STUDY_COMPLETION_REVIEW_2026-11-23.md。工作区既有其他功能不在本次清单内。

**发布目标与先后。** 第一项为生产 subscriptions-api，第二项为 Windows 正式绯月。Cloudflare 控制面已确认网关 c56920a9-8f20-4a9b-b781-36eb854c31ff 与主站 myapp ed14dae6-a533-4282-9993-6c3c6ef75d46 各承担 100% 流量。现行 myapp 的 routes.js 调用默认网页模式；按页返回 attempted 只在网关启用 desktopExamOnly 时生效。已用原生产主站的知序文件及网页资产与新网关做双向联调。主站、LanguageStudy、selfexamsystem 均无需另部署。

**基线与逐文件差异。** 冻结目录 G:/selftool/WebCharacter/work/study-completion-release-20261123，下文命令从此目录执行。
- 网关由实际已发布源码 57453cbd5c067b99ecc94cb40555b23d35dcb6b8 的 api-worker 导出，再叠加 worker-files.json 中的 5 个文件。study.mjs 增加受既有服务身份保护的剧本、场景目录与单项 GET；study-engine/api.mjs 增加按已登录账户及本页题号的 attempted；language-source/server/dialogue-library.mjs、language-source/app/src/fixed-contract.js 和 fixed-local-practice.js 复用来源 R2 读取、校验及练习契约。此前桌面只有知序路由，题目页缺少完整作答事实。来源分别为 LanguageStudy 工作树 c83b270a、selfexamsystem 工作树 bab3cc73 及 informationManage 工作树 a63983aa 的学习改动。清单含新旧 SHA-256，可用 api-before 对照两个替换文件；三个新增文件可与来源逐字对照。worker-inputs.json 冻结全部 src 及构建入口与配置，指纹 55c455f6965402b93470e2316a0cb5580cf7d9f4646c6f8b72b8c01e6c017147。
- Windows 正式安装在 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。实际应用基线 247f3713f3f2，Git 参考 39fd098e 加已安装补丁；来源 WebCharacter 03942463 加通过自审的学习文件。此次 7 项均为替换，windows-files.json 的 SHA-256 为 d035d8bc77b21c77e5b560cddb2f66ca6ed068ab51c2664d5be4454c2a5473b9。比较 before 与 candidate 的同名文件。desktop/cloud-connection.mjs 放行指定 GET；study-host.mjs 校验固定基础包；study-materials.mjs 校验旧题来源；study-relay.mjs 处理来源报错、来源缺失与草稿冲突；study-store.mjs 解释换版差异并保护旧回执；study-ui.mjs 及 output/desktop-bundle/study-ui.mjs 更新复盘排序、分页定位、版本和入口提示。正式版已具备基础剧本、模型、菜单和考试中继，本次无需替换这些资源。
- R2 使用原 myR2，D1 使用原 APIDB，配置、密钥、绑定、表结构、回填和安装时业务数据写入均无变化。网关 --keep-vars 保留现场变量和两项学习 Secret。既有缓存、语言记录、考试快照和正式场次兼容；缺少稳定来源题号的旧回执保留计分、仅供回看。本次纯代码发布跳过业务数据库备份。桌面按 7 项保存文件前像。

**已执行的检查。** 网关候选 node --test 为 41/41，桌面候选 node --test agent/tests/study.test.mjs 为 13/13。node worker-review.mjs --dry-run 从控制面带入既有公开配置后打包成功，16 个绑定，前后流量版本相同。原包装器单独 dry-run 自动查找 Access audience 时 DNS 失败；改为使用经控制面核对的配置成功，无需访问受控页面。qa 的 tools/test-study-shared-worker.mjs 在隔离 Workerd 上用原主站、候选网关和候选桌面、合成 D1/R2 验证了仅 GET、其他身份拒绝、取材、双向接续、两种草稿冲突选择、正式分数回读、重练及未见筛选。node local-worker.mjs --check 已从本机真实 HTTP 验证知序页、题库及两项语言目录。模型专项从隔离正式基线经自绘菜单首击，Qwen3.5-2B CPU 和 SenseVoice 处理日语预录样本，浅深窄窗、草稿恢复、重练返回、材料及历史分页通过。pwsh -File ./install.ps1 -Mode Rehearse 在隔离目录验证了中途故障及完整替换的回退，7 个前像全部复原。

**本地验收与尚未验证项。** 常驻验收命令为 node local-worker.mjs --serve。自动初始化临时 D1/R2、模拟账户和单题库，输出 127.0.0.1 实际端口及入口；仅收到用户启动指令后启动并保持可用，退出时释放临时状态。实体麦克风现场拾音及用户手动本地验收待测。线上 Access 界面与交卷体验待用户自行访问、截图确认。第三方独立审核未执行。请重点核对 5 个网关文件、7 个安装前像、正式写入权限、回执和线上绑定集合。

**获准后的执行与恢复。** 发布前重查流量版、所有候选输入摘要和 7 个现场前像，范围变化重新确认。先 node worker-review.mjs --publish，运行前需获得本次生产许可。核对新版本独占流量、16 个绑定与旧版逐项一致，保留回执；若异常先查现行版本，必要时用 Wrangler 回滚到上列原版本并核对流量、绑定，停止桌面阶段。随后 pwsh -File ./install.ps1 -Mode Preflight，确认原入口、在途任务和正式实例；安装许可生效后才可执行 -Mode Install。等待空闲、正常退出、备份七项、定向替换、原入口启动；核实新进程、资料目录、文件摘要和 REST v6。用独立资料从安装目录复验学习窗口，已有场次由用户自行确认。失败恢复该次七文件备份并受控启动旧版。收尾补记实际版本、JST、结果和 Git 同步回执。

**花园与确认。** 已按正式 REST /infoguide 核对流程；线上 D1 结构核对新增 0 个对象。使用与在产主站一致的只读模型核得修订 157，项目 #16「网页角色组件」、功能 #61「绯月（桌面精灵）」32.0。本批 study-completion-release-20261123 无重复；如两目标作为同一次成功发布，拟新增部署「绯月语言与题库陪练补项」，明细归 #61，记上实际结果与版本，功能仅加一次 0.1。以当前记录算，候选部署 #83、明细 #161，版本 32.0 → 32.1。项目、种子、功能基础资料、改善、缺陷及关联无需增改；前次独立发布的未办批次另计。生产当前版本模型会给 33.0，新模型读现有库提示 VERSION_MIGRATION_REQUIRED；本次不包含花园迁移。待模型就绪、核对在先批次及最终目标值后，再确认具体清单；结果明确后先提交精确 SQL 与清单，再通过正式本机 REST 登记一次。失败则记录实际失败及「发布中」，保留成功版本。本次尚无部署许可、花园具体清单确认、生产部署或安装结果。


### 安装前像与并行更新复核

安装清单中的 247f3713f3f2 指七个学习文件的来源版本。准备期间其他发布更新了正式桌面，新闻提醒版本 948648e620bb 已安装，原进程 16124 已退出。只读 Preflight 核得新 PID 28504、04:57:53 JST 启动、REST v6，快捷方式、登录项、资料目录及七个文件的原摘要全部符合。已把新的正式 shell、提醒及新闻文件同步到隔离验证树，七个学习文件的候选摘要保持一致；在更新的壳上重跑实际右键菜单到学习窗口、浅深窄窗、续考、分页及原题返回，通过。七个面板的标题栏专项也已通过。现场仍可能有其他发布，正式安装前重做相同核对。本次准备期间对正式安装目录的写入仅为根审核文档。


### 正式发布回执 · 绯月陪练补项 d035d8bc77b2

2026-11-23 JST，用户明确授权部署，后续指定暂缓花园、Git 仅提交。本次在已审核的两项目标上执行。05:05:42，subscriptions-api 从 c56920a9-8f20-4a9b-b781-36eb854c31ff 切换至 496a10e4-6b8d-44ce-b65f-3f3af17e5341，控制面回读单版本 100% 流量，16 个绑定与发布前逐项一致。主站沿用原版本。

05:06:19，Windows 正式绯月完成七文件定向安装，发布清单 d035d8bc77b21c77e5b560cddb2f66ca6ed068ab51c2664d5be4454c2a5473b9。原进程 25224 正常退出，新进程 9756 于 05:06:18 从原入口启动。安装器核对程序摘要、原资料目录、资料完整性、在途任务与 REST v6。安装后再从原资料目录的正式实例独立回读并确认 7/7 文件。应用文件备份已保留，无业务数据库迁移、回填、生产试题写入或业务库备份。

使用独立临时资料从实际安装路径跑 Electron 专项。自绘菜单首击、模考暂停与重开、草稿恢复、Qwen3.5-2B CPU 自由对练、SenseVoice 日语样本回填、逐句信心、21 题分页重练后返回原题、30 套基础剧本按需载入均通过。实体麦克风现场拾音未测；受 Access 保护的线上取材和正式交卷效果待用户截图确认。花园登记暂缓。本次代码、测试与发布材料按用户要求保留本地 Git 提交，未推送。


### 部署收尾核对

2026-11-23 JST，控制面回读 subscriptions-api 版本 `496a10e4-6b8d-44ce-b65f-3f3af17e5341` 承载 100% 流量。绯月七个已安装学习文件均与 `d035d8bc77b2` 的清单一致，使用原正式资料目录。部署时 REST 为 v6，收尾时正式实例报告 v7。五个仓库的本地发布提交逐一回读通过，源码提交见[本地发布提交清单](local-git-receipt.json)。本次仅本地提交，花园登记暂缓。受 Access 保护的线上取材与正式交卷效果待用户截图确认。
