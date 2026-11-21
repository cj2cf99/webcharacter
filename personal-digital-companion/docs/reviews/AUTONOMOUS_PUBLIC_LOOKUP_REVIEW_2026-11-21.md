# 绯月自主查阅公开资料复核

日期为 2026-11-21 JST。范围为 Windows 桌宠开发区，Git 基线 `ab3ac36`。工作区中的并行开发改动继续保留。Tavily 预算从 `f68e9ad` 复用，并对照 `50c178e` 的结果数量和联合候选的免费边界。未改正式安装目录或 Worker。

## 需求与设计依据

用户原话为「开发并支持绯月自主查询民众心声（走X.com），社论（新闻），图片（图片搜索），其他（一般搜索api）」。随后要求核实 Arctic Shift 能否无关键词浏览、是否能支持热帖和自行找灵感，并提供 Weir 与 Bright Data 作为 X.com 候选，明确授权用各自的密钥核验，并在确认免费额度时各查询一次公开样本。

对照原有 [情绪详细设计](../FEIYUE_EMOTION_PROGRAM_DESIGN.md) 中的傲慢周独立查证、真实回执及本机证据边界。查阅根与子项目代理说明、开发指南、全局 `C:/Users/asura/.claude/CLAUDE.md` 相关章节、`G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md` 和 [项目备忘录索引](../TASK_TEMPLATE_PREVIEW.md)。在全局开发资源和项目索引未发现独立设计备忘录。按原流程使用本机模型、空闲查证名额、专题和复盘。外部请求使用已有公开关键词或内置哲学主题，发出一轮选定的一种查询。无新定时器、依赖、界面或业务迁移。

| 验收项 | 实际行为 |
| --- | --- |
| X 公开讨论 | 本机已配置 `WEIR_API_KEY` 时先核验余额均来自免费积分，余额不足、授权失败或无法核实时停止。成功按最新排序取至多八条 X 原帖，标注东京发帖时间。没有配置 Weir 时可用 Tavily 的 X 限域索引。来源记录说明其样本性质。 |
| 新闻社论 | Google 新闻 RSS 查询近三日窗口，只取标题带社论或评论类别标签的候选，最多五条。保存媒体、RSS 来源链接和可得发稿时间。普通报道不会因发布者名称含观点词而入选。 |
| 搜图 | 经核实的免费 SerpApi，或按需查询 Commons。最多给本机模型五个标题，选一张后保存出处与图片链接。取材阶段不用下载、解码或打开图片。 |
| 一般资料 | Tavily 使用原免费账户核验和本机 SQLite 共享额度，最多整理十份资料。模型无法产生合规的带编号综合时保留出处与摘录，并写明摘要未生成。 |
| 保存与取消 | 专题按来源和查询类别保存，采用旧 `web` 状态。既有任务复盘记录类别、公开目标、实际结果与耗时。前台抢占、断网或重启未获保存回执时，本轮记为未完成或中断。 |

## 接口核实

- **Arctic Shift**。实际用无密钥、无关键词的三个请求取帖。指定 `philosophy`、仅指定近一小时、全站按时间取新帖，各返回三条。适合逛公开版块或取样找灵感。官方文档的帖子排序按发帖时间，票数和评论数约 36 小时更新，不能据此确认 Reddit 当前 Hot 排名。 [Arctic Shift API](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md#posts-and-comments) [Reddit Hot 接口](https://www.reddit.com/dev/api/#GET_hot)
- **Weir**。使用用户明确授权的凭据，`GET /v1/usage` 返回 200，确认余额来自免费积分。对公开词 `aurora` 发一次 `POST /v1/x/search`，返回 200 和三条带正文、发帖时间及 X 原帖链接的结果，消耗四个免费积分。可以按关键词、账号、标签或列表做有范围的发现。单独的 Reddit 板块／站内 Hot 接口在文档中存在，核实时 Weir 状态显示 Reddit 故障，当次未用密钥再请求 Reddit。 [X 查询契约](https://docs.weirapp.io/reference/x/searchX) [额度契约](https://docs.weirapp.io/reference/account/getUsage) [Reddit 列表契约](https://docs.weirapp.io/reference/reddit/getSubredditPosts) [服务状态](https://weirapp.io/status)
- **Bright Data**。授权密钥访问活动区域接口返回 200，余额接口返回 403。无法从该密钥确认免费额度，未发起抓取。产品页的 5,000 月度免费额度为公开承诺，套餐用尽后的行为受账号资金影响。公开的 X REST 抓取端点明确以已知帖子 URL 为输入。 [X 帖子接口](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/twitter-posts-collect-by-url) [产品和计费说明](https://brightdata.com/products/web-scraper/twitter)

两份用户提供的凭据只用于对应服务商临时联调。未纳入项目文件、业务日志或版本管理。Reddit 灵感和热榜属于本次接口核实，当前开发版自主查证仍提供用户最初要求的四类。

## 复核和测试

1. 第一轮检查自主入口、用户已定的结果数和重启。发现新类别直接当专题状态时重启无法读取，常驻单一哲学主题首次成功后会被旧欲望去重耗尽，且复用的早期 Tavily 候选默认只请求五条一般资料。保留既有 `web` 存储状态和同轮回执，按既有哲学兴趣提供四个可查主题，由旧欲望去重避免重复消费。一般资料请求补齐至十条。
2. 第二轮验收上轮修正，检查公开关键词边界、同类专题回读、免密钥 RSS 和 Commons。隔离测试通过，实际查询各返回五个候选。新增的候选供应商核实得到 Weir 真实 X 原帖，开发版选择本机已配置的 Weir 作为首选，并为不足额、含付费余额及暂停支出加了回归用例。
3. 第三轮对照四类原始需求、两项供应商调查及用户免费授权复查。全量 Agent 347 项通过，未发现待修正的实现偏离。真实桌宠模型自行决定公网查询、正式客户端配置及用户实际使用仍待安装验收。Tavily 和 SerpApi 本轮使用模拟响应验证。

| 实际命令 | 结果 |
| --- | --- |
| `node --test --test-reporter=spec 'agent/tests/*.test.mjs'` | 347 通过。默认沙箱限制本地回环，授权在临时回环端口运行后获最终结果。主站代码路径 `COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp`。 |
| `python -B tools/test-skills.py` | 13 通过，涵盖社论筛选、东京时间、Tavily 额度共用和搜图回退。 |
| `node tools/build-desktop.mjs` 与 `node tools/test-desktop-shell.mjs` | 构建及桌面壳回归通过。 |

状态为开发区通过复核，待用户下一步指令。未安装、部署、同步远端或执行花园登记。
