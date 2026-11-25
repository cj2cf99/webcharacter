# 发布审核单 · 绯月新闻周/日热点版面与话题概括（2026-11-25）

## 1. 需求与验收
- **需求来源**：[personal-digital-companion/docs/news-hot/README.md](personal-digital-companion/docs/news-hot/README.md) 与 [prototype/index.html](personal-digital-companion/docs/news-hot/prototype/index.html)
- **验收目标**：
  1. 顶部改为「左周（七日窗口）右日（36 小时滚动窗口）」双热力图，各放至多 5 块，单块面积 ≤ 50%，周榜满 24h、日榜满 8h 重算快照。
  2. 新增 `news_topics` 生命周期（在榜、48h 折叠、120h 中断），热度按报道 URL 去重计数。
  3. 接入本机 AGY `topic` 与 `reportBrief` 阶段（v2-3 提示词，固定本机队列、校验重试），`title` 收紧至 12–32 字并拆为 `main`（冻结）+ `latest`。
  4. 节点首次成形定稿 `node.fixed`（迁移 6），`summary` 支持 `corrections` 纠错并保留原文 `was` 及「已更正」徽标。
  5. 面板自适应字号（`cqmin`）、窄块折行与截断回退、下方双栏 5×2 实时热度榜（支持展开/收起及 420px 无横向溢出）。

## 2. 目标与基线
- **目标安装目录**：`G:\selftool\.release-feiyue-handbook-desktop-20261120\personal-digital-companion`
- **基线与候选 SHA-256**：
  - `desktop/ai-workflow-model.mjs`：`2712EAD7F1AC705B676A14F6EA386237F8F24E161AEB88883AF52CE712AFDAF3` → `3E8D4169B145C80F02268C7DA4076259D019923DE366A9388F4FB083CD0725E3`
  - `desktop/news-board.mjs`：`DE4ECFF7CC6E78051C327EAF1C57E07488C9317C65ED9574D2229C394F67063B` → `F55BF356AD40F11C4D2261E6675F4C5E3ED5E6A547074B932DCD6A4FBA7B5F52`
  - `desktop/news-briefing.mjs`：`50FC291784FD7375A22E54E49784D21232DE24369FCA061C2E395A1D6BDB413B` → `48F9E73846C9055A8E17B61F975A6FFF48DEB11B4BA9944AE53E4DC335A61D97`
  - `desktop/news-editor.mjs`：`A25A08AE920024ECFD1FF7D3589EF4B0F25FDF710E614A9FC27F8EB3C8676B82` → `67E8BEC5041DC99EFE96B8055EC95E0E6FDD1B7E021B312DBC57448577C3FC70`
  - `desktop/news-editorial.css`：`949971E1353F049A8BFD5F47D7D34B8FD95126D4B5134E72572C09EC30F04818` → `F4574DB2E3106F5F78D0B4B1C0CDC1FE1D7F9173744F4771384FB0434BF5346E`
  - `desktop/news-editorial.mjs`：`E20FAB48DA39805D728A0F5D17E3D33A770FEA4D9B49939B8863FA39154883AE` → `F4E092FAE7948D8E9D3E4D727CC278EF67BF5B8B4167D51E99A9046F1C7A4F38`
  - `desktop/news-heatmap.mjs`：`F46501CAA87B54BD02C6D6AC93B49D0AD2DBE1BB787671C36D518CFF8B38B1C9` → `080C267AB598E9E43A95D0F31959CDEB0140D6822125316F731BC7DCCDA1DA83`
  - `desktop/news-history.mjs`：`86A49B22BA6294DEEFA860F4CB7733589659D2C221A9701FA49B4A132F1D38BB` → `F7C731DEDF54D241065AE124ECBDCAA5ABBD0C34F5A356E4FEFC83D0D08E6D69`
  - `desktop/news-panel-host.mjs`：`BFF83301A019CE6A37A01A00B088922F0F79071B6ECD988A7F24E15565EAE93E` → `86DECC490BCF06CF1A3C595E4561A98A72F0F157C26A39EA5967B5C4CAF71414`
  - `desktop/news-panel-ui.mjs`：`F0ABFEBB78262719734A626933FBBB6A6A1D7F2589C34AA0BE1D71A4208283FE` → `5691DC47CD4B47C64F155ABFDBD05A55DA18FF2E72CBB859B581D774FA572319`
  - `desktop/news-panel.html`：`E3E4BAF9E0C9CBBEE37E6E406E8A9480FF1534E8F2A28B3908EEE01FCAC5BE6B` → `B401BF8CC99C16849CE736B4572A4C3B46D89BB7022C548F9395D77A0C8C0605`
  - `skills/news-editorial/latest.json`、`source/SKILL.md`、`source/local-ai.json` 及 `versions/news-editorial-v2-3/`

## 3. 数据和配置影响
- SQLite `news_boards` 表更新为 `{week, weekAt, day, dayAt}` 快照格式（旧格式自动重算）。
- 新增 SQLite `news_topics` 表与 `news_history_migration` 迁移 6（节点定稿 `node.fixed` 与冻结 `event.main`）。

## 4. 实际验证与自审
- 语法检查通过；`news-briefing.test.mjs` 20/20 通过；`news-editorial.test.mjs` 5/5 通过（清除 `bandao_api_key` 下验证）；隔离 Electron 面板实测 1100px/420px 无报错与溢出。
- 已完成连续 2 轮无新问题自审。

## 5. 风险与恢复
- 备份全部基线文件至 `output/install-backup-news-hot-20261125/`；异常时停止进程、覆盖还原并重启。

## 6. 用户确认与第三方审核
- 用户已明确许可部署、花园登记并推送（`部署，登记，push，后面不需要确认。`）。第三方审核：无。
