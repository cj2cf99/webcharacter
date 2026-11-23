## 2026-11-23 JST · Windows 绯月双模型调度与手动任务优先启动 · bba9a244c54c

**原始需求与验收**　用户要求「给绯月的菜单上的两个手动任务，赋予能强制开始启动模型进行 ai 任务处理的机制」，随后明确「空闲检查可以留下」。验收目标是原空闲检查通过后，手动写日记和补写本机任务执行评价立即唤醒询问池，需要模型时优先执行；已有结果可复用，忙时沿用原提示。用户追加「带上另一边的双库ai线程的修改，准备更新，不要做部署前测试」。按另一条开发记录的实际功能合并 GPU 4B 与 CPU 2B 调度，以及单项 120 秒、主力纯推理累计 30 分钟停接和 60 分钟切断、执行时冻结轮询。保持已开始的正式工作及可续检查点。

**目标与基线**　只更新 Windows 绯月正式安装目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。正式文件基线为 `52b187f85636`，实装记录清单七项均重新比对 SHA-256 一致。来源为 WebCharacter 的 `personal-digital-companion` 开发目录及「拆分绯月任务并规划双模型协作」已完成的改动，以当前开发 Git `03942463b3de924c380ae45a0c29a30bfbbee1c6` 和实际工作区文件为来源参照。工作区含其他未提交改动。只封装白名单文件，并逐项与实际安装字节比较。候选清单 SHA-256 为 `bba9a244c54cade535f5f20f58b6edc2990f45bc9fbce9bc54c78e5b777903b9`，共 26 件，25 件替换、1 件新增。包目录为 `G:/selftool/WebCharacter/work/feiyue-dual-ai-manual-20261123`。

**变更及涉及文件**

- `desktop/ai-execution-round.mjs`、`ai-request-queue.mjs`、`ai-workflow-model.mjs`、`balanced-local-model.mjs`、`local-model.mjs`、`local-model-process.mjs`。从旧的单路处理转为 4B GPU 起草、2B CPU 简审、4B 定稿；纯判断和可代写的短评级可用 2B，实际装载出错按对应分支处理。单项达限丢弃，整轮到限保留可续检查点。后台不再用 GPU 利用率和显存预采样阻断整理。既有码位、模型资产与教研功能不增装模型。
- `desktop/shell.mjs`、`personality-diary.mjs`。桌宠角色与托盘菜单名称和空闲检查保留。点击通过检查后唤醒询问池，手动摘录、写手记、补评价使用优先级 6，后台池满时可接件。原有可复用结果、失败处置和整轮预算仍适用。空闲判定沿用双模型来源修正，面板仅打开时不作为真实执行。主动邀请另检查用户是否已打开面板。
- `desktop/poll-scheduler.mjs`、`reminder-checks.mjs`、`task-lifecycle.mjs`、`conversation-ui.mjs`、`poll-settings-ui.mjs` 及两份 `output/desktop-bundle/` 同名页面资源。执行期间冻住轮询倒计时，恢复后从剩余时间继续；旧 10 分钟墙钟整理上限由新执行预算替代。提醒详情和轮询设定显示暂停。现有「提醒检查 · 待执行」入口和队列行沿用。
- `desktop/study-host.mjs`、`screen-question-host.mjs`、`conversation-thread-replies.mjs`、`conversation-transcription.mjs`、`personality-nags.mjs`、`interaction-work.mjs`、`server-task-command.mjs`、`knowledge-runtime.mjs`、`memory-refinement.mjs`、`diary-audit.mjs`。接入实际执行状态、模型分配、输出复审和暂停恢复；涵盖学习问答、会话摘要、转录、念叨、参数整理、知识核对和手记修订。`desktop/news-editorial.mjs` 仅在正式基线移植双模型分工和预算处理两处，其他报纸内容与提示词改动不打包。

**数据库、配置与兼容性**　实际本机 `ai-requests.sqlite` 尚无 `execution_ms`、`task_key`。首次打开时程序在 `ai_requests` 增加上述两列及 `ai_task_execution` 索引，现有排队记录保留，历史未计量的执行从零起计，没有业务回填。无 Worker、生产云端业务数据库、配置、依赖、模型文件或 REST 契约变更。事前记录涉及对象定义及新列原本不存在，见 `ai-requests-schema-before.json` 和 `ai-requests-upgrade.sql`；正式安装将重新保存具体对象定义。新列为执行元数据，旧版显式列读写可兼容，代码回退时保留增量列及这段期间的记录。无整库备份要求。程序原文件已留在包内 `before/`。

**已执行的准备与历史验证**　运行 `python -B work/feiyue-dual-ai-manual-20261123/prepare.py`，已生成 26 件前后摘要、文件差异及正式 SQLite 结构前像，这些仅为制单和恢复依据。按用户要求，合并候选未运行部署前测试、模型回放、Electron、语法检查或安装演练。此前开发目录的两轮 24/24 回放早于双模型最后的静态修正；手动入口开发时已有桌面壳及 78 项 Node 检查记录。两者均不是本次候选验证。第三方独立审核未执行。

**风险、安装及恢复**　重点核对高优先级是否只赋给两个手动入口、实际忙碌时能否让位、同材料分片和恢复时累计预算是否一致、两份页面资源与对应源码是否相同、新旧 SQLite 的队列可见性。明确获准后按候选 `install.ps1` 核对正式根目录审核、哈希、进程与业务空闲状态，经应用自身流程退出，保存结构前像，逐件换入并按原入口启动。启动后核对新进程、REST v7、资料路径、26 件实装哈希与新增列、索引。若中途失败，用 `before/` 恢复旧文件并移除本次新增程序文件，再启动原版；数据库新增列可保留以保存安装后资料。实际推理与日常体验待安装后确认。

**确认、花园与 Git**　用户已要求准备，明确安装和重启许可尚待取得。花园按默认路径保留。本次拟新增一条发布和一条明细，归属「网页角色组件 → 绯月（桌面精灵）」功能 #61。前次回执版本 33.3，若登记时现场一致且本次成功，预计 33.4；失败保留原成功版本。项目、种子、独立功能目录无更新。精确清单按实际安装结果及线上回读另行确认，未执行生产 SQL、提交批次或 Git 推送。发布结束后加记实际结果和远端回读。
