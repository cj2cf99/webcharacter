# 日记新增「新闻 36 小时 Top 5 一句话新闻」来源自审报告

- **日期**：2026-11-25（Asia/Tokyo）
- **审核对象与范围**：绯月开发版（`personal-digital-companion`）日记内容来源新增「新闻 36 小时 Top 5 话题一句话新闻」，涉及：
  - `desktop/news-briefing.mjs`
  - `desktop/reminder-checks.mjs`
  - `desktop/shell.mjs`
  - `desktop/personality-diary.mjs`
  - `desktop/memory-refinement.mjs`
  - `agent/host/memory-reader.mjs`
  - `agent/tests/news-briefing.test.mjs`
  - `agent/tests/personality-memory.test.mjs`
- **基线**：Git 提交 `f23a026`（开发工作区当前改动）
- **原始需求**：`日记的内容来源加一个 新闻的36小时top前5话题的一句话新闻。`
- **审核方式**：按 2–9 轮自审规则逐行代码审读、数据流与边界路径推演、单元测试与桌面壳回归验证（清空 `BANDAO_API_KEY`，不触发外部云端请求）。
- **结论**：**自审通过**（共 3 轮，第 2、3 轮连续两轮无新问题、无遗留问题）
- **状态**：已确认并完成正式版安装与花园登记（2026-11-25 19:30 JST）

---

## 实际执行的命令与原样摘要

1. **第 1 轮修正后单元测试（`BANDAO_API_KEY=''`）**：
   ```powershell
   node --test --test-force-exit agent/tests/personality-memory.test.mjs agent/tests/news-briefing.test.mjs agent/tests/news-editorial.test.mjs
   node tools/test-reminder-checks.mjs
   ```
   结果摘要：
   - `tests 57 / pass 57 / fail 0`（`news-briefing.test.mjs` 21/21、`news-editorial.test.mjs` 5/5、`personality-memory.test.mjs` 31/31）
   - `tools/test-reminder-checks.mjs`：`tests 12 / pass 12 / fail 0`
2. **第 3 轮桌面壳检查**：
   ```powershell
   node tools/test-desktop-shell.mjs
   ```
   结果摘要：7 项 `PASS`（含「本周期已写仍能手动启动绯月手记，隐藏时显示桌宠，重复点击只写一份，离线保留草稿」等全部场景），退出码 `0`。
3. **语法检查**：
   - `node --check` 校验上述全部改动文件：`SYNTAX_OK`。

---

## 逐轮自审记录

### 第 1 轮

- **上轮遗留**：无（首轮）。
- **五项检查与发现清单**：
  1. **① Bug、缺漏和边界错误**：
     - **[F1 · 中] 同一新闻进展节点在 `dayText` 补齐前后重复写入**：
       - **证据**：`desktop/personality-diary.mjs` 的 `materialChunks` 按 `hash([day, source, at, i, content])` 生成素材 ID。若某条 36h Top 5 新闻在 `newsEditorial` 生成 `dayText` 之前先用回退的 `title` 被评价或写入日记，随后 `dayText` 生成（`at` 未变），文案变化会产生新 ID；下次写日记时会把同一进展再写一次（若前次仅 `review` 未入册，还会与 `historical` 捞回同时写出两条）。
       - **修正**：在 `desktop/personality-diary.mjs` 中新增预编译查询 `hasNewsSource`（`SELECT 1 FROM material_sources WHERE source=? AND at=? LIMIT 1`），`events()` 收录 `news(day)` 时若同一 `news:<id>` 在同一 `at` 已入库则跳过；在 `agent/tests/personality-memory.test.mjs` 补充「同节点文案更新不重复写入 + `at` 推进的新进展正常收录」断言。
  2. **② 不合理流程（含重复步骤）**：
     - **[F2 · 低] 历史补评扫描重复触发全表新闻列表构建**：
       - **证据**：`desktop/personality-diary.mjs` 的 `mode==='review'` 历史续办分支会遍历所有 `memory.archiveDays()` 历史日期调用 `events(day)`，每次都会调用 `news(day)` -> `history.list(false)` 扫描解析 `news_events`，对超过 7 天的历史日期完全无效。
       - **修正**：在 `desktop/news-briefing.mjs` 的 `diary(targetDay)` 开头增加日期快返：`if(!targetDay||targetDay<tokyoDay(now()-7*day))return [];`。
  3. **③ 需求偏离**：无。
  4. **④ 合规性（最简化设计、时区 JST、个人自用范围）**：通过。两项修正合计 4 行代码，无新增表或冗余配置。
  5. **⑤ 可优化项**：F2 已并入当轮修正；无其他可优化项。
- **验证结果**：修正后 `news-briefing.test.mjs`（21/21）、`news-editorial.test.mjs`（5/5）、`personality-memory.test.mjs`（31/31）、`tools/test-reminder-checks.mjs`（12/12）全部通过。
- **遗留问题**：无。
- **连续达标轮数**：`0 / 2`（本轮有新发现）。

### 第 2 轮

- **上轮遗留**：无。
- **五项检查与发现清单**：
  1. **① Bug、缺漏和边界错误**：逐条核对仅含新闻日反复运行不误写空日记、`review` 后接 `diary` 经 `historical` 捞回、`shortDiaryReviews` + `writeLargeDiary` 离线恢复同步、新闻未启用/无报道返回 `[]`、`memory-reader.mjs` 与 `memory-refinement.mjs` 栏目正则，均无问题。
  2. **② 不合理流程**：无重复步骤、无遗漏、无走不通的路径。
  3. **③ 需求偏离**：严格对应「新闻的36小时top前5话题的一句话新闻」，无扩大、缩水或扭曲。
  4. **④ 合规性**：全程使用 `tokyoDay`（JST），零新增依赖、零库表迁移、零多余开关，符合单人自用最简设计。
  5. **⑤ 可优化项**：无。
- **验证结果**：本轮无代码改动，沿用第 1 轮通过结果。
- **遗留问题**：无。
- **连续达标轮数**：`1 / 2`。

### 第 3 轮

- **上轮遗留**：无。
- **五项检查与发现清单**：
  1. **① Bug、缺漏和边界错误**：无。
  2. **② 不合理流程**：无。
  3. **③ 需求偏离**：无。
  4. **④ 合规性**：无。
  5. **⑤ 可优化项**：无。
- **验证结果**：运行 `node tools/test-desktop-shell.mjs` 全部 7 项 `PASS`；核对改动范围无误改与临时残留文件。
- **遗留问题**：无。
- **连续达标轮数**：`2 / 2` → **自审通过**。

---

## 审核中改动与清理

- 审核中修正了第 1 轮发现的 F1（`desktop/personality-diary.mjs` + `agent/tests/personality-memory.test.mjs`）与 F2（`desktop/news-briefing.mjs`）。
- 测试均使用内存 SQLite 或临时目录并在 `t.after` 中清理，无临时文件残留。
- 未改动工作区中其他并行的未提交改动；未执行 Git 提交、推送或正式版安装。
