# 半日新闻汇总复核 · 2026-11-21 JST

用户看到报面上五条近似的英伟达新闻，问“你没把内容稍微汇总下吗”。原始需求同时包括按重要性和相关性排版、三天以内的增量取材、原文切换和点击查看详情。以 [需求记录](../REQUIREMENT_CHANGES.md)、[新闻设计记录](../DEVELOPMENT.md)、[桌宠界面说明](../DESKTOP_UI_GUIDE.md) 对照。全局框架偏好位于 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`，按其紧凑呈现、按需读取和东京时间约定实现。核对了全局规则及[项目备忘录索引](../TASK_TEMPLATE_PREVIEW.md)，未找到独立的全局或项目设计备忘录。

开发以 `d700383` 的桌宠工作树为基线，新闻与通知相关运行文件与正式安装目录逐项校验一致，和 `99e0219` 的发布记录基线在这些文件上也一致。改动范围是 `desktop/news-briefing.mjs`、`news-layout.mjs`、`news-panel-host.mjs`、`news-panel-ui.mjs`、`news-panel.css`、`shell.mjs` 及两项专项测试。保留 SQLite 中的原始标题、网址及发布时间，读取时合成事件。重复判断采用 12 小时内的清理后同标题，或同市场、同主体、同方向且变动幅度和明确时段相符的股价报道。普通摘要只取确有增量的已有摘录。合并后的报道展开才取原始出处。没有新增依赖、模型调用、数据迁移或外部请求。

| 复核 | 发现与处理 |
| --- | --- |
| 第一轮 | 旧去重只覆盖完全相同的标题和链接。新增合并时保留原始来源，同时避免把涨跌方向、盘中和收盘、不同公司或不同幅度的报道混为一条。市值金额做单位换算后比较，出现分歧时只提示分歧。 |
| 第二轮 | 对照用户截图与既有报面设计，实测五篇报道合为一个豆腐块，展开原始标题和对应链接，检查头图、筛选、语言切换、旧期读回、深浅色和 375 像素宽度。继续复用原有轮询与窗口。专项范围无残留阻断。 |

实际执行 `node --test tools/test-poll-settings.mjs tools/test-reminder-checks.mjs agent/tests/news-briefing.test.mjs`，15 项通过。执行 `node tools/build-desktop.mjs` 构建通过。现有 Electron 运行器通过 `tools/test-news-panel-electron.mjs`、`tools/test-panel-titlebar-electron.mjs` 和 `tools/capture-menu-panels-electron.mjs`。共享标题栏测试仍打印既有的配置警告，退出码为 0。样刊基于模拟来源，未核实市场数据或新闻原站，也未启动正式安装版进行验收。

合并规则覆盖有较强标题证据的重复事件。标题差异较大或无法确认同一事件时仍各自显示。只有标题或没有可新增的摘录时只显示标题。完整旧刊的存储未在本次修改范围内，后台生成新的一期仍会替换已存的一期。正式安装和用户验收待确认。
