# 绯月 X 视频与长文归档 · 复审问题修复与多轮自审报告

- **审核对象与范围**：按第三方复审报告 [X_VIDEO_AND_ARTICLE_THIRD_PARTY_REVIEW_2026-11-28.md](X_VIDEO_AND_ARTICLE_THIRD_PARTY_REVIEW_2026-11-28.md)（F1–F19）、修复交接 [HANDOFF_X_ARTICLE_REVIEW_FIX_2026-11-28.md](../HANDOFF_X_ARTICLE_REVIEW_FIX_2026-11-28.md) 与用户对 F1/F6/F16/F18 的四项确认，完成修复后对全部核心代码、双窗界面、测试与文档执行多轮自审。
- **Git 基线**：分支 `codex/workspace-checkpoint-20261120`，基线提交 `4df2e89`（开发改动未提交）。
- **最终核心文件基线（SHA-256 前 16 位）**：
  - `desktop/x-video.mjs`: `2ab075ecd8eaed8b`
  - `desktop/x-article.mjs`: `d8b0c0d1caa98bda`
  - `desktop/x-video-host.mjs`: `d5b56511645920fe`
  - `desktop/x-video-ui.mjs`: `0663ec5d1b616f4e`
  - `desktop/x-video-quick-ui.mjs`: `431ed5eacfd51747`
  - `desktop/x-video-shared.mjs`: `5f5900dcfac3e55b`
  - `desktop/x-video.html`: `eb335cf1ac0ff861`
  - `desktop/x-video-quick.html`: `d4d40f878532a559`
  - `desktop/x-video.css`: `4a313cce37730d18`
  - `desktop/x-video-preload.cjs`: `a0b5bb349b04c7e1`
  - `agent/tests/x-video.test.mjs`: `3174f2636b41b2b4`
  - `agent/tests/x-article.test.mjs`: `0ca1e248a12c9c30`
  - `tools/test-x-video-electron.mjs`: `54e58acc2af36ddb`
- **审核时间**：2026-11-28 23:09 JST
- **审核方式**：逐项核对 F1–F19 处置；运行复现脚本 `repro-core.mjs` / `repro-more.mjs` / `repro-electron.mjs` / `repro-ui.mjs`；全量单测与 Electron 回归；对照原话 1–11、R1–R24 及最简化设计原则进行 3 轮五项自审。
- **结论**：**自审通过**（第 2、3 轮连续两轮 0 新问题、0 遗留问题）
- **状态**：待用户安排复审

---

## 一、F1–F19 处置清单（含用户确认与减法项）

| 编号 | 级别 | 处置方式 | 修改位置与说明 |
| --- | --- | --- | --- |
| **F1** | 高（用户收口） | **按登录态收口 + 保留回退选择器** | 用户确认日常 X 均在登录态。`x-video-quick-ui.mjs` 与 `x-video-ui.mjs` 明确提示长文归档需登录态 Cookie；`x-video.mjs` 无 Cookie 抓取失败补充引导导入 Cookie；`x-article.mjs` 保留 `<article>` 回退选择器。**实机登录态首次抓取仍待用户带自己 Cookie 实测。** |
| **F2** | 高 | **采纳修复** | `x-video.mjs` `executeArticle` 覆盖重抓时将旧目录移入 `archive\`（保留用户文件与旧图，不删除）；部分媒体失败时提醒标题标明 `（部分媒体失败）`。 |
| **F3** | 高 | **采纳修复** | `x-article.mjs` `tweetStatusId(el)` 从时间链接或非引用状态链接精确提取编号；带 `statusId` 且无 `articleView` 找不到目标帖时直接返回 `blocked: 'not_found'`，不回退抓他人首帖。 |
| **F4** | 高 | **采纳修复** | `x-article.mjs` 改为边滚动边按 `tweetStatusId` 去重收集紧邻前 N 条非广告回复（最多 12 轮、连续 2 轮无新增即停）。 |
| **F5** | 中 | **采纳修复** | `x-video.mjs` 增加 `catalogReady`/`catalogError`：损坏 `catalog.json` 原样保留并提示错误而不覆盖；晚接入磁盘在 `enqueue()` 时先 `syncCatalog()` 再落盘。 |
| **F6** | 中（用户确认） | **按确认修复** | 用户接受改 `.local-tools.json` `xDownloadRoot` 后重启。`x-video.mjs` 增加 `lastRoot` 换根过滤与 `thumbPending` 搬迁视频懒生成缩略图（同时保证原 `ffmpeg` 失败测试 `hasThumb=false` 不回归）；`DESIGN.md` 与 `README.md` 同步注明 `xDownloadRoot` 需重启生效。 |
| **F7** | 中 | **采纳修复** | `x-article.mjs` `findQuote(el)` 优先 `quoteTweet` 或含 `tweetText`/`time` 的 `role=link` 跳过链接卡片；`extractMedia` 排除引用框内图文与视频。 |
| **F8** | 中 | **采纳修复** | `x-video-quick-ui.mjs` 新增 `resetOverwrite()`，改地址、剪贴板填入或切换模式时立即隐藏「更新重抓」并重置跳转页签。 |
| **F9** | 中 | **采纳修复** | `x-article.mjs` 兼容日语 `プロモーション`/`広告`/`不適切な可能性のある返信` 等标识，并支持 `a[data-testid="tweet-text-show-more-link"]` 与 `a[href="#"]` 形式“显示更多”。 |
| **F10** | 中 | **采纳修复** | `x-video.mjs` `syncCatalog()` 外层加 `try/catch` 并用 `statSync().isDirectory()` 校验，目录异常记 `catalogError` 不影响绯月启动。 |
| **F11** | 低（减法） | **采纳删除** | 删除 `x-video.mjs` `syncCatalog()` 中按同名推断视频归档的分支，避免误标新视频为已归档。 |
| **F12** | 低 | **采纳修复** | `x-video.mjs` 新增 `freeArchiveDirName()` 归档文章时不经 `sanitizeName` 100 字截断，保留完整 `_<status_id>`。 |
| **F13** | 低 | **采纳修复** | `x-video.mjs` 文章超时提醒去掉“已保留断点”，注明“继续时重新抓取”；`resolveTcoLinks` 与 `resolveOneTco` 透传 `run.abort.signal` 响应中止。 |
| **F14** | 低 | **采纳修复** | `x-video.mjs` 文章内嵌视频下载失败时清理本次 `v-<seq>-` 前缀的 `.part`/`.ytdl` 残留。 |
| **F15** | 低 | **采纳修复** | `x-video.mjs` 新增 `safeSegment()` 拦截导入或读取含 `..` / 路径分隔符的异常相对路径。 |
| **F16** | 低（用户确认） | **按确认改文档** | 用户确认不做视频移出 `archive\` 自动恢复，仅更新 `REQUIREMENTS.md`、`DESIGN.md` 与 `README.md` 口径。 |
| **F17** | 低 | **采纳修复** | `x-article.mjs` 临时会话调用 `setPermissionRequestHandler` 一律拒绝权限，隐藏窗设置 `setAudioMuted(true)`。 |
| **F18** | 低（用户确认） | **按确认改文档** | 用户确认文章内嵌视频不触发当日 `yt-dlp` 版本检查，已在 `REQUIREMENTS.md` R5/R21 与 `DESIGN.md` 注明。 |
| **F19** | 低 | **采纳修复** | 更新 `REQUIREMENTS.md` 顶部状态与第 2 节目标范围。 |
| **减法项** | — | **采纳简化** | `x-article.mjs` 移除对 `x-video.mjs` 的 `parseCookies` 循环引用，直接按行过滤并注入已清洗 Cookie。 |

---

## 二、全部轮次实际修正与自审明细

### 修正汇总
- **Bug 修正**：修复 F2–F5、F7–F10、F12–F15、F17 全部代码缺陷，并在首轮单测发现 `hasLocalCover` 破坏原 `ffmpeg` 失败占位测试后，改为内存 `thumbPending` 标记精确区分“新迁移未生成缩略图”与“本机已提取失败”。
- **合规与需求偏离修正**：按用户确认更新 F1、F6、F16、F18、F19 涉及的提示文案、需求文档与设计文档，消除“改配置不必重启”“视频移出 `archive` 自动恢复”等前后矛盾。
- **最简化与减法**：删除 `F11` 同名推断视频归档分支、删除 `x-article.mjs` 对 `x-video.mjs` 的反向导入、复用 `resetOverwrite()` 与 `freeArchiveDirName()`。

### 逐轮明细
| 轮次 | 五项检查 | 处置与验证 | 遗留 | 连续达标 |
| --- | --- | --- | --- | --- |
| 第 1 轮 | ①–⑤ 发现并处理 F1–F19；初跑单测发现 1 项回归（`x-video.test.mjs:249` `hasThumb` 预期 `false`） | 修复 `thumbPending` 后重跑全部 33 项单测、复现脚本与全套 Electron 回归全部通过 | 无 | **0** |
| 第 2 轮 | ①–⑤ 全面走读代码与文档，核对 F1–F19 与需求 R1–R24 | 0 新问题，0 遗留 | 无 | **1** |
| 第 3 轮 | ①–⑤ 核对最终 SHA-256 基线与测试结果 | 0 新问题，0 遗留，**自审通过** | 无 | **2** |

---

## 三、实际执行的验证（均为最终代码状态下通过）

1. **复审复现脚本**：
   - `repro-core.mjs`（注：原脚本第 65 行在 `saved===true` 时会对损坏原文做 `JSON.parse`，通过仅保护该打印表达式的临时运行器执行后）：`A`–`K` **全部 11 项 `[未复现]`**（其中 `B-catalog-corrupt` 损坏原文件完好保留、`I-path-escape` 导入即被拦截）。
   - `repro-more.mjs`：`O-tco-after-timeout` **`[未复现]`**；`N-video-unarchive` 按用户 F16 决定仅改文档，按预期仍 `[复现]`。
   - `repro-electron.mjs`：`E1`–`E7` **全部 `[未复现]`**（`EXIT:0`）。
   - `repro-ui.mjs`：`M-overwrite-stale` **`[未复现]`**（`EXIT:0`）。
2. **Node 单元测试**：`node --test --test-timeout=30000 agent/tests/x-video.test.mjs agent/tests/x-article.test.mjs G:\selftool\extratools\x-cookie-helper\netscape.test.mjs` → **33/33 PASS**（`fail 0, cancelled 0`, `3083ms`）。
3. **打包与桌面壳层**：`node tools/build-desktop.mjs` 成功；`node tools/test-desktop-shell.mjs` → **7/7 PASS**。
4. **Electron 全套回归**：
   - `test-x-video-electron.mjs`：`PASS`，`EXIT:0`；
   - `test-panel-titlebar-electron.mjs`：`3/3 PASS`，`EXIT:0`；
   - `test-menu-popup-electron.mjs`：本次实测 1/1 `PASS`，`EXIT:0`（此前第三方复审曾见偶发波动，本轮未复现）；
   - `test-menu-first-show-electron.mjs`（`xadd`/`xmanage` × `tray`/`companion` 4 组）：`4/4 PASS`，`EXIT:0`。

---

## 四、遗留问题与待用户实机验证边界

- **代码与设计遗留问题**：**无遗留问题**。
- **待用户实机验收项（未由代理代测）**：
  1. 在带用户真实 X 登录态 Cookie 的环境中实机抓取一篇公开长文/帖子，确认线上 DOM 与抓取效果（F1）；
  2. 真实 `yt-dlp.exe` 视频下载与 `F:\Xdownload` 默认播放器 / Markdown 阅读器打开效果；
  3. 正式安装版更新、重启、花园登记与 Git 提交/推送（均未执行）。
