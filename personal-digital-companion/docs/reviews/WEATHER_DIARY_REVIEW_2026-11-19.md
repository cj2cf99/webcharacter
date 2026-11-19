# 绯月三地天气与日记接口

## 原始需求与依据

> 另外天气服务的对接也顺便做了，我需要同时关注我在的地方（目前小仓北区），我父母在的地方（西安市未央区），我妻子在的地方（咸阳永寿县），我会关注这三个地方的同时的一般天气（温度/风雨雪晴）和特殊警告（气象台特殊关注警告）。你帮我整理下可实现性。

> 也就是不管来源，每日的聊天记录汇总到一起后做个总结，就是写日记，然后还有一个根据需求自己去找日记的功能是吗

> 那么就开发吧，日记功能你先用自己当成api进行内部测试，接口留下就行

沿用 V1.5 TOOL-04 的明确确认、写入和回读，以及 [任务模板预览](../TASK_TEMPLATE_PREVIEW.md) 的同账户、主站正式记录和固定接口约定。查阅了根与子项目开发索引、主站 AGENTS.md 和 `G:/cloudflare/myapp/docs/design/api.md`。未找到独立开发设计备忘录，沿用任务模板预览的查找记录。遵循 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md` 的单人自用、现有依赖、东京时间和精简接线。天气复用 Electron 主进程、托盘和本地窗口，日记复用主站日记接口契约。

## 天气

- 托盘「三地天气」按地点同屏展示气温、风速、天气、时间及可展开的预警原文。选用三个区县代表点。实测小仓北区的和风天气地名搜索会排出同名的东京、冈山地点，首版预设三个经核对的位置。
- [和风天气 v1 实况](https://dev.qweather.com/docs/api/weather/weather-current/)覆盖三地，[和风天气 v1 预警](https://dev.qweather.com/docs/api/warning/weather-alert/)覆盖中国两点，按发送单位保留多条同时生效的预警。处理更新、解除和过期，失败时保留上次数据并标记未更新。
- [日本气象厅现行预警](https://www.jma.go.jp/bosai/warning/#area_type=class20s&area_code=4010000)取北九州市。入口沿用其网页当前使用的福冈 r8 数据。区县卡片有官方预警和雨云雷达入口。河川氾滥由独立水系接口发布，首版通过官方页面查看。
- 绯月运行期间每 30 分钟更新实况，每 10 分钟检查预警，窗口支持即时刷新。中国橙色及以上、日本警报及以上在新发或升级时提交一次本机通知。三地时间默认显示 JST。
- 本机导入核对公私钥配对。使用 Windows 当前用户加密，密文放在本机应用数据目录。凭据只在主进程使用。配置和密钥均无仓库记录。

## 日记

- `createDiaryWorkflow({allowedSources, readMessages, summarize, store})` 是内部入口。调用方提供允许纳入的聊天来源和读取函数。按东京日过滤、排序、去重后调用 `summarize({instructions, day, timezone, messages}) → {title, content}`；返回可编辑草稿，无记录时返回空状态。
- `save(draft, {confirmed: true})` 才写入。以日期标记聊天小记，保存前查同日条目，成功时回读标题及正文，同一进程并发保存合并。如果写入结果不明，先查回执；仍不明确时提示保留草稿并核对，拦截本次进程重复提交。
- `search({query, page})` 搜索现有日记标题和全文，`findDay(day)` 找该日聊天小记，`read(seq)` 按需加载正文。通过 `createMainSiteDiaryStore(request)` 留下 `GET /api/diaries`、`GET /api/diaries/:seq`、`POST /api/diaries` 接线。调用方须提供已认证的请求能力。
- Codex 生成一份合成对话的小记结果，以它作为模型接口的内部测试回包。未启用真实来源、外部模型或正式写入。主站现有新建接口缺少服务端幂等，跨进程同时写同一天仍需正式接线时解决。

## 复核

1. 实测鉴权和三个实况、中国两地预警成功。发现日本旧预警路径返回 HTTP 200，但停在 2026-05-28；切换到 r8 并验证北九州市的当日发布记录。小仓北区同名搜索风险以固定预设解决。
2. 原先的 Electron 加密在同一运行目录的两个配置间可回读，换新运行目录时仍失败。纠正实况回归夹具的风速字段后，`node --test tools/test-weather.mjs agent/tests/*.test.mjs` 142 项通过，覆盖 JMA 状态、和风预警替换和解除、故障留存、通知去重与升级、东京日期边界、授权过滤和日记写回核对。
3. 改用 Windows 当前用户 DPAPI，独立 Node 进程加密回读成功。首屏保持加载状态直到首批查询返回。全新 Electron 临时运行目录用 `tools/test-weather-electron.mjs` 从密文读取凭据并请求真实接口，三地实况和预警全部通过，深浅主题窄窗通过。实测北九州市有 3 条注意报，未央区返回空列表，永寿县同时返回县、市、省气象台发布的大风蓝色预警。最终 142 项自动测试、`node tools/test-desktop-shell.mjs`、`node tools/test-pc-settings.mjs`、`node tools/build-desktop.mjs` 通过。

待实机确认 Windows 通知的系统展示。用户运行中的桌宠尚未重启。日记联调使用隔离的内存接口，尚未接实际聊天来源或向主站写入。未部署。
