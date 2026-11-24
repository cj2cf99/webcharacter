# 绯月天气行动提醒开发复核

基线为 WebCharacter `0af864b` 及本次开始前的开发工作区。比较范围为 `agent/weather/api.mjs`、`desktop/weather-{brief,host,service}.mjs`、三个天气与提醒测试入口及本次文档。未修改工作区并行开发的新闻、任务轮询和 REST 功能。

需求依据见[用户原话和确认标准](../../REQUIREMENTS.md#2026-11-23-jst--每日天气首报与行动提醒)。对照 `docs/REQUIREMENT_CHANGES.md` 中的三地天气、原先早晚提醒和四小时简报，及 `docs/reviews/WEATHER_ALERTS_REVIEW_2026-11-19.md` 的警报与低温门槛。参阅 `docs/TASK_TEMPLATE_PREVIEW.md` 的备忘录索引、全局 `C:/Users/asura/.claude/CLAUDE.md` 及 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md` 的单人低负载、最简及东京时间约定。上述索引未列独立的全局或桌宠设计备忘录。下方先保留首轮记录，当前交付以「本机查询与 14 天纪录」为准。

## 行为与范围

- `weather-brief.mjs` 将旧的四小时变化比较改为东京日首封和行动提醒。首封汇总三地已取得的实况、气温和当前预警。首轮遇到新警报合并进首封。有效天气数据尚未取得时，仍可先送达新发或升级的警报。
- `weather-host.mjs` 与 `weather-service.mjs` 将门槛判定集中到简报，并让后台轮询使用只读小时预报。已有本机 SQLite 事务同时保存提醒和比较状态，旧简报日期可继续用作当日基线。取数失败保留已知状态。无数据库迁移、配置和依赖变更。
- 天气 Worker 复用原固定地点及鉴权，新增 `GET /api/weather/{place}/hourly`。每次后台检查每地多一次请求，只取 7 小时以覆盖接下来 6 小时。默认每小时一轮时，按 31 天持续开机推算新增最多 2,232 次请求，是否计费取决于账户合计用量。[和风小时预报](https://dev.qweather.com/docs/api/weather/weather-hourly-forecast/) · [和风用量定价](https://dev.qweather.com/docs/finance/pricing/)
- 未来 6 小时内降雨、降雪或雨夹雪的逐小时概率达到 60% 时进入判断。当天首封会列明预计时点。后续某类雨雪在最近成功预报中无明显信号，本轮新增时才提醒。相邻时段或短暂回落后恢复沿用之前雨雪状态。低温只在同一东京日首次跌破门槛提醒，首封已报告的低温计入。全天温度范围的小幅变化、实时风速与普通晴阴变化仍可记入检查记录。

## 复核与验证

1. 发现按时段的初版去重在同一场雨时间延后时会重报。改为由最近成功预报中的干湿转换触发，并增加雨时推迟、短暂撤回后恢复及之后独立雨段的用例。
2. 对照原话和已有三地规则复验。天气与提醒专项 `node --disable-warning=ExperimentalWarning --test tools/test-reminder-checks.mjs tools/test-weather.mjs` 21 项通过，覆盖东京跨日、旧状态、上游故障、零散变化、新增与持续雨雪、低温阈值、官方警报升级及权限路由。`node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs` 和 `git diff --check` 通过。隔离 Electron `tools/test-weather-electron.mjs --isolated` 验证首轮在启动后 60 秒开始、三地天气和低温合并、相同预报静默、新增雨报发一次和双主题窄窗。`tools/test-panel-titlebar-electron.mjs` 通过。

使用 `COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp` 运行完整 Agent 与天气专项时，开放隔离测试回环权限后 467/468 通过。剩余一项在项目已有工作区变更 `desktop/news-editor.mjs` 上读取测试夹具缺失的 `reports.length` 失败，属于本轮之外的新闻工作流。真实和风账户和正式天气接口未测试。开发范围复核结束，Windows 正式安装、Worker 接入和生产发布待后续授权。

## 本机查询与 14 天纪录

用户提出在本机留存查询状态，并将过去 14 天高低温纪录纳入提醒。改为由 `weather-credentials.mjs` 复用已配置的 Windows 加密凭据直接查询和风的小时预报。撤回首轮 `agent/weather/api.mjs` 的新增路由，核对该文件与 Git 基线无内容差异。实况、每日预报及官方预警沿用已发布接口。开发所用和风账号经 `node tools/configure-weather.mjs --check` 验证可解密并签名，三地小时预报直连均返回 HTTP 200，各 7 小时可解析。只读验证未把凭据、头部或预报正文写入记录。

`reminder-checks.mjs` 启动后从旧本机检查回执恢复各地可用的高低温，复用同一 SQLite 中已有的每地天气比较状态保存滚动历史。窗口按地点当地日期取前 14 个完整日历日，当天只作为待比较值。历史每项取每日最后一个有效预报值，首封显示历史极值及不足 14 天时的样本天数。当天预报严格突破该地点有完整 14 天的方向才提示，同一天每方向一次。对照原话复核了统计和破纪录两项，晚间普通变动继续静默。无新增表、定时器、配置字段或云端写入。

天气与提醒专项 24 项和 `node tools/build-desktop.mjs` 通过，新增夹具覆盖旧记录按地点日期恢复、部分缺高温、过期极值排除、相同值、双向突破、持续突破和次日重新比较。`node tools/test-desktop-shell.mjs`、隔离 Electron 标题栏及天气回归通过。Electron 从 14 条既有格式回执恢复低温纪录，首封合并低温破纪录，后续有新高温纪录时独立提醒，温度继续升高时去重。完整 Agent 与天气回归 475/476 通过，剩余同一项新闻夹具失败。正式桌面安装与真实提醒体验尚未验收，无需部署 Cloudflare Worker。
