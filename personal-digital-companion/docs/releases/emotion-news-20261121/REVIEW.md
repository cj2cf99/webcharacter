## 2026-11-21 JST　情绪、新闻和 AI 心跳联合提交

用户要求两项一起提交，并允许覆盖重叠文件。交付目标为 WebCharacter 的 Windows 绯月、subscriptions-api 与主站 myapp 的同名本地发布分支 `codex/feiyue-emotion-news-heartbeat-20261121`。验收要求、原有功能范围、技术设计、回退与发布顺序见同目录 ORIGINAL_REVIEW.md；程序包资产、双端基线和两轮对照如下。若从根目录阅读，附件在 docs/releases/emotion-news-20261121。第三方独立审核未执行。

**实际基线。** 正式桌宠位于 G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion。心跳独立安装回执记录 16:23 JST 已经启动 PID 4348，旧设置库保留 12 个批次；现场逐项 SHA-256 匹配全部七个心跳文件，设置为启用、180 分钟。heartbeat-baseline.json 保存这七项的正式及合并后摘要。桌宠 Git 发布工作树合并搜索分支 50c178e 和手记修复 ab3ac36；只接入本次已核对的安装件、测试与纪要。保留两份开发与需求文档的独立历史条目。

**合并差异。** poll-scheduler.mjs 同时管理心跳 180 分钟、简报 720 分钟以及初始关闭的主动看屏。心跳在途时跳过，可在面板即时改期。shell.mjs 连接唯一 checkAiHeartbeat 入口，阻止旧计时器重复启动，心跳亦不占正式工作位。poll-settings-ui.mjs 与其构建副本保留心跳专用表单及新闻的 720 分钟上限。已安装且最终相同的设置 HTML、构建 HTML 和 task-lifecycle.mjs 无需再次复制。打包文件与用户资料、日志、模型、密钥分离。保留妻子身份、情绪、专题、念叨来源、手记与新闻流程。程序有效范围及逐文件发布前后摘要见 release-manifest.json。

**云端。** API 仓库以 f5bebc0b 为 Git 基线，程序变更仅 api-worker/src/companion/agent/assistant/personality-memory.mjs，接受新来源 curiosity。主站以 876dccba 为 Git 基线，程序变更仅 myapp/src/features/companion/vendor/memory-reader.mjs，用中文展示及筛选此来源。已对照上次实际生产源码核验这两处的 Git 前像。此前候选核实的线上 API 版本为 433cac21-d356-41f0-8fd2-f2264a37da29，主站为 6c2f851f-4541-4695-86e4-5be83a680b71。心跳合并没有云端运行代码差异。云端 DDL、业务回填、配置和绑定变更均为零。桌宠启动后复用现存轮询表、心跳行和用户已保存的间隔，新情绪和记忆数据按原审核存本机。

**两轮验证。** 在 G:/selftool/WebCharacter/work/feiyue-combined-heartbeat-20261121 使用临时资料。每轮桌宠 `node --test 'agent/tests/*.test.mjs'` 344/344，`python -B tools/test-skills.py` 17/17，API `npm.cmd test` 41/41，主站 `node --disable-warning=ExperimentalWarning --test --test-concurrency=2 'tests/*.test.mjs'` 843/843。每轮另通过 test-desktop-shell.mjs --garden-api、Electron 的 verify-heartbeat-panel.mjs 与 test-news-panel-electron.mjs，以及 combined-reader.mjs 走真实候选宿主写入、重建实例、跨端读回、打开列表和正文、跨账户拒绝。面板实际验证默认时间、改为 90 分钟、停用重开、模拟心跳回执。check-bundle.py 两轮逐项验证当前正式基线、归档内容、免费路径和两个 Worker 的运行树差异。

首轮主站有一次从目录联接启动导致 CLI 无输出，改用物理路径后另有一次临时 Git 仓库子进程失败。固定物理路径与测试并发数后两轮全量均通过。第二轮离屏 Electron 心跳面板退出时有 GPU 状态日志，其 UI 断言及进程退出码通过。自然三小时心跳、正式环境新版本数据及 Access 页面效果待发布后核实，线上效果由用户截图确认。真实 9B 及旅行照片验证边界见原审核。

**提交物与发布。** 发布包 G:/selftool/WebCharacter/work/feiyue-combined-heartbeat-20261121/feiyue-emotion-news-rc.zip，SHA-256 `edf4de17bb06d747e27124fb26f229d1687d85b1fba091b0bf384dc1c6977b0d`。114 个变动文件，其中桌宠 112、两个 Worker 各 1。另附清单。程序包以已安装心跳版为覆盖起点。将来发布前复核三端实际版本和逐文件前像；先 API、再主站，最后受控重启桌宠。若需回退，Worker 回到核验的旧版本并保留绑定，桌宠恢复本次替换前的心跳版文件和原启动入口，保留用户实际数据和设置。安装授权及上线效果与 Git 提交分开记载。花园意愿为准备草案；先前修订 135 的草案属于上一基线。心跳有独立安装记录，最终清单须重读花园实际版本并去重，依实际发布结果确认后再登记。
