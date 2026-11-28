# 绯月 X 视频与长文归档 · 第二轮复审问题（G1–G7）修复与自审报告

- **审核对象与范围**：按第二轮修复复审报告 [X_VIDEO_AND_ARTICLE_FIX_THIRD_PARTY_REVIEW_2026-11-28.md](X_VIDEO_AND_ARTICLE_FIX_THIRD_PARTY_REVIEW_2026-11-28.md)（G1–G7）及交接 [HANDOFF_X_ARTICLE_REVIEW_FIX_R2_2026-11-28.md](../HANDOFF_X_ARTICLE_REVIEW_FIX_R2_2026-11-28.md) 完成修复，并按自审规则对核心代码、双窗界面、测试与文档逐轮复核。
- **Git 基线**：分支 `codex/workspace-checkpoint-20261120`，基线提交 `4df2e89`（开发改动未提交）。
- **最终核心文件基线（SHA-256 前 16 位）**：
  - `desktop/x-video.mjs`: `82dd6b69eebbfe80`
  - `desktop/x-article.mjs`: `9c6bf1b76d75eb48`
  - `desktop/x-video-host.mjs`: `78b58dbb0a39b5ab`
  - `desktop/x-video-ui.mjs`: `25797981d399ec59`
  - `desktop/x-video-quick-ui.mjs`: `431ed5eacfd51747`
  - `desktop/x-video-shared.mjs`: `5f5900dcfac3e55b`
  - `desktop/x-video.html`: `eb335cf1ac0ff861`
  - `desktop/x-video-quick.html`: `d4d40f878532a559`
  - `desktop/x-video.css`: `4a313cce37730d18`
  - `desktop/x-video-preload.cjs`: `a0b5bb349b04c7e1`
  - `agent/tests/x-video.test.mjs`: `3174f2636b41b2b4`
  - `agent/tests/x-article.test.mjs`: `1e423c727edac8f9`
  - `tools/test-x-video-electron.mjs`: `54e58acc2af36ddb`
- **审核时间**：2026-11-28 23:39 JST
- **结论**：**自审不通过**（代码与本地夹具项 G1–G7 已全部修清并验证；因**登录态下真实 X 页面结构尚未由用户带 Cookie 实机验证**，按自审规则列为遗留问题，连续达标轮数为 `0`）
- **状态**：待用户实机确认并安排复审

---

## 一、G1–G7 逐项处置清单

| 编号 | 级别 | 处置与具体修改位置 |
| --- | --- | --- |
| **G1** | 高 | **已修复**：① [x-article.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-article.mjs) 删除 `listTweets` 与就绪轮询中对裸 `<article>` 的回退，严格只认 `article[data-testid="tweet"]` 与文章正文节点；主贴无 `author` 或内容全空（正文/媒体/引用均空）时直接返回 `blocked: 'empty'`；② [x-video.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-video.mjs) `executeArticle` 落盘前再做同样强校验，失败直接抛错，不落盘、不把旧归档移入 `archive\`、不发完成提醒；③ [x-video-host.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-video-host.mjs) `submit` 拦截未导入 Cookie 的文章提交并明确提示。 |
| **G2** | 中（本地夹具已修，实机待验） | **已修复**：`x-article.mjs` 增加 `waitMore(prevCount, maxMs)`，首轮无回复先等最多 2500ms，每次滚动后等最多 2000ms，连续 2 轮无新增即停；`x-video.mjs` 当 `replies.length < repliesLimit` 时在完成提醒正文中写明 `要求 N 条，实得 M 条回复`。 |
| **G3** | 中（本地夹具已修，实机待验） | **已修复**：`x-article.mjs` `expandMore` 仅点击 `button`、`[role="button"]` 或空/`#`/`javascript:` 链接；对会导航跳页的 `a[data-testid="tweet-text-show-more-link"]` 不点击，而是在对应正文末注明 `（正文已截断，完整内容见原帖）`，彻底避免跳页混入别页子回复。 |
| **G4** | 中（本地夹具已修，实机待验） | **已修复**：`x-article.mjs` 新增 `ownTimeEl(el, quoteEl)` 排除引用框内的 `<time>`，`tweetStatusId` 与 `extractTweet` 统一从本帖自身时间戳取值与拼接 `postHref`。 |
| **G5** | 低（本地夹具已修，实机待验） | **已修复**：`x-article.mjs` `findQuote` 与 `extractTweet` 兼容纯图/纯视频引用卡片，只要 `quoteText || quoteMedia.length` 即保留引用块。 |
| **G6** | 低 | **已修复**：`x-video.mjs` 新增 `safeId`（仅限 `[A-Za-z0-9_-]{1,80}`），导入 `catalog.json` 时强制丢弃 `entry.thumb`（置 `null`）；`hasLocalCover`、`thumbnail`、`markArchived` 使用 `item.thumb` 前校验 `safeSegment`。 |
| **G7** | 低 | **已修复**：[x-video-ui.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-video-ui.mjs) 文章任务去除“断点”说法，分别改为「清理暂存」「暂停（继续时重新抓取）」「进度 X%」「重新抓取」。 |

---

## 二、逐轮自审明细（五项检查）

| 轮次 | ① Bug/边界 | ② 流程 | ③ 需求偏离 | ④ 合规/最简 | ⑤ 优化 | 当轮处置与验证 | 遗留 | 连续达标 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 第 1 轮 | 修复 G1–G7；修复过程中发现 `if (!item.author)` 误过滤了 `E3` 夹具里因 `replaceAll('N')` 变体导致的无作者回复，改为仅跳过全空回复 | 宿主拒绝无 Cookie 提交；G1 失败保留完好旧归档与空 `archive/` | 同步更新 `REQUIREMENTS.md` R19/R20 与 `DESIGN.md` §4 | 保持单人最简写法，无新增依赖或冗余存储 | 精简 `cancelButton` 与 `waitMore` | 全部代码与文档当轮修清；单测 33/33、构建、壳层 7/7、两轮复现与 Electron 全套通过 | L1：登录态真实 X 页面结构待实机验证 | **0** |
| 第 2 轮 | 0 新问题（复查 `T3`：并发同刻请求迁移缩略图时首个返回 `true`、次个返回 `false`、后续请求返回 `true`，属按需单次生成正常现象，未影响界面） | 0 新问题 | 0 新问题 | 0 新问题 | 0 新问题 | 复核最终 SHA-256 与全部实测记录 | L1：同上，登录态真实结构仍待实机确认 | **0** |

---

## 三、实际执行的验证命令与结果（均为最终代码状态）

1. **Node 单元测试**：`node --test --test-timeout=30000 agent/tests/x-video.test.mjs agent/tests/x-article.test.mjs G:\selftool\extratools\x-cookie-helper\netscape.test.mjs` → **33/33 PASS**（2.59s）。
2. **第一轮复现脚本**：
   - `repro-core.mjs` / `repro-more.mjs`：A–E、O 均为 `[未复现]`；原 `F`/`G`/`K`/`O` 与 `repro-ui.mjs` 里的模拟 `fetchArticle` 未填 `author` 或未导 Cookie，按 G1 新校验被正确拦截；补充 Cookie 与 `author` 后运行 `run-repro-ui-cookie.mjs` → `M-overwrite-stale` **`[未复现]`**。
   - `repro-electron.mjs`：`E1`–`E7` **全部 `[未复现]`**（`EXIT:0`）。
3. **第二轮复现脚本**：
   - `recheck-scraper.mjs`：`P1`、`P2`、`Q1`（2/2）、`Q2`（3/3）、`R1`、`S1` **全部 `[未复现]`**；`Q3` 按“不跳页并注明截断”执行（取原页 3 条，无别页子回复混入）；匿名 `LIVE` 3 条均明确报 `未加载到帖子内容`，不存空归档（`EXIT:0`）。
   - `recheck-timing.mjs`：`Q1` 2/2、`Q2` 3/3、`Q3` 3/3（原页 3 条且带截断说明，`EXIT:0`）。
   - `recheck-e2e.mjs`（保护空 `archive` 目录检查后）：覆盖重抓失败正常停为 `failed`、提醒为 `X文章归档失败 · 试验`、旧归档完整保留且未挪入 `archive`；`T1` **`[未复现]`**（`victim.txt` 完好）、`T2` **`[未复现]`**（`[1,0,1]`）、`T3` 迁移缩略图首个请求 `true`（`EXIT:0`）。
4. **打包、桌面壳与 Electron 回归**：
   - `node tools/build-desktop.mjs` 成功；`node tools/test-desktop-shell.mjs` **7/7 PASS**；
   - `test-x-video-electron.mjs`：**PASS**（`EXIT:0`）；
   - `test-panel-titlebar-electron.mjs`：**3/3 PASS**（`EXIT:0`）；
   - `test-menu-popup-electron.mjs`：本次实测 **PASS**（`EXIT:0`，此前第三方复审曾偶发超时，本轮未复现）；
   - `test-menu-first-show-electron.mjs`（4 组）：**4/4 PASS**（`EXIT:0`）。

---

## 四、当前遗留问题

1. **L1（待用户实机验证）**：登录态下真实 X 长文/帖子与带引用、带回复帖子的线上 DOM 结构尚未由用户导入本人 Cookie 实机抓取验证（G2–G5 当前仅通过本地夹具验证；代理不接触用户真实 Cookie）。在此之前不宣称长文线上抓取已实机闭环。
2. **未部署边界**：未改正式安装目录与 `local-rest.mjs`，未重启绯月、未登记花园、未提交 Git。
