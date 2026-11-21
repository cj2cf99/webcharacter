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
