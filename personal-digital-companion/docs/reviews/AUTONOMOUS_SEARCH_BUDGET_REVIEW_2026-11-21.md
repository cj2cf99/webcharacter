# 绯月自主查阅额度分配复核

2026-11-21 JST。用户追加「你自己整理一个调用流量分配逻辑，尽量控制被提前花超了额度，以及能先用 每日刷新的旧先别用每月刷新的」。本次范围是桌宠的 X 公开讨论、新闻社论、图片和一般资料自主查阅。Git 比较锚点 `ab3ac36`，实际开发基线为本工作区上一轮已实现的四类自主查阅；保留并行改动。原始需求见 [需求变更](../REQUIREMENT_CHANGES.md)，详细设计以 [情绪模块额度分配修订](../FEIYUE_EMOTION_PROGRAM_DESIGN.md) 为准。

查阅根和子项目代理说明、开发指南、`G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`、`C:/Users/asura/.claude/CLAUDE.md` 相关章节和 [项目备忘录索引](../TASK_TEMPLATE_PREVIEW.md)。索引未列出独立的全局或子项目设计备忘录。沿用原空闲轮询、只发公开词、每轮一种查证、本机摘记和 SQLite，无新依赖或全局定时任务。

## 调用顺序和额度边界

| 用途 | 优先来源 | 免费月额备选 |
| --- | --- | --- |
| X 公开讨论 | LangSearch 日额，限最近七天可从帖号核对日期的 X 原帖 | Weir 优先。若请求内容前无法获准，再检查 Tavily 的 X 限域检索。 |
| 一般资料 | LangSearch 日额 | Tavily。它与 Tavily 的 X 路径共用额度。 |
| 新闻社论 | Google 新闻 RSS | 无。 |
| 图片 | Wikimedia Commons | SerpApi 免费档。 |

LangSearch 需要本机配置，使用日令牌额度，供应商于 UTC 00:00 刷新，即东京 09:00。Weir、Tavily 和 SerpApi 会先读实际免费余额。月额至少留 20%，据月周期和剩余余额限制当天总量，无额度证明时停止。预占使用原本机 SQLite，并发、重启和无回执仍计入本机用量。一次 Weir 最多八条结果，余额较低时缩小单次请求。一次内容请求已经发出后，空结果、超时或异常均保留预算，本轮不再追加另一条月额线路。当前规则按供应商的 UTC 计量日记录。Weir 从账户响应读取实际重置时点，其余月额用日历估算限流并且始终服从供应商实时余额。

费率和刷新口径见 [LangSearch 套餐](https://langsearch.com/pricing)、[搜索契约](https://docs.langsearch.com/api/web-search-api)、[Weir 额度](https://docs.weirapp.io/billing)、[Tavily 额度](https://docs.tavily.com/documentation/api-credits) 和 [SerpApi 账户接口](https://serpapi.com/account-api)。

## 复核记录

1. 第一轮发现旧搜图首选 SerpApi，月账余额缺少日节流。为 Commons 和 LangSearch 设置前置优先级。月额改为分日预占，校正了最初按单笔计算的剩余天数份额，最终检查当天累计额。保留原 Tavily 月记录作为额外边界。
2. 第二轮用模拟供应商和隔离 SQLite 验证日额命中免扣月额、X 域名与发帖时间、日源限流转入月额、Weir 缩小结果数、空结果或超时不连扣、Commons 命中免扣 SerpApi、并发、跨日和历史月数据。全量初测遇到同时更新的手记质问源码和断言，单独复跑最终的手记质问 15 项全部通过，未调整其代码。
3. 第三轮检查普通对话原入口、四类自主查询、免费证据和预占时序。最终全量 Agent 348 项通过。政策符合原始目的，暂未发现待修正问题。当前开发进程没有 LangSearch 密钥，日额度使用官方契约的模拟响应核验。本轮不消耗线上日额度或月额度，未在正式安装版验收并发或到期刷新。

| 实际命令 | 结果 |
| --- | --- |
| `python -B tools/test-skills.py` | 19 项通过。另实跑自主查阅 CLI 的无密钥路径。 |
| `node --test --test-force-exit --test-reporter=spec 'agent/tests/*.test.mjs'` | 348 项通过。临时回环访问及 `COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp`。 |
| `node tools/build-desktop.mjs` 和 `node tools/test-desktop-shell.mjs` | 均通过。 |
| `git diff --check` | 本次相关路径通过。 |

本次在开发工作区完成，等待下一步指令。正式安装和部署未执行。
