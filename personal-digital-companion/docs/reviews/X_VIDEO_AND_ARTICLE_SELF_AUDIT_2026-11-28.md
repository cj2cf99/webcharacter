# 绯月 X 视频与长文归档 · 全量合并自审与最简化设计审核报告

- **审核对象与范围**：合并审核绯月桌面端「X 视频下载与管理」「X 长文与媒体本机归档」「便携目录索引 `catalog.json` 与移动自动同步」及配套 Chrome 插件（[x-video.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-video.mjs)、[x-article.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-article.mjs)、[x-video-host.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-video-host.mjs)、[x-video-ui.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-video-ui.mjs)、[x-video-quick-ui.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/x-video-quick-ui.mjs)、`x-video-shared.mjs`、`x-video*.html`、`x-video.css`、`x-video-preload.cjs`、提醒与菜单/壳层接线、`docs/X_VIDEO_DOWNLOAD_REQUIREMENTS.md`、`docs/X_VIDEO_DOWNLOAD_DESIGN.md`、`desktop/README.md`、`docs/DEVELOPMENT.md`、测试套件与 `G:/selftool/extratools/x-cookie-helper/`）。
- **Git 基线**：仓库 `G:\selftool\WebCharacter\personal-digital-companion`，分支 `codex/workspace-checkpoint-20261120`，基线提交 `4df2e89`（开发改动未提交）。
- **最终核心文件基线（SHA-256 前 16 位）**：
  - `desktop/x-video.mjs`: `3a917eebcf859a7e`
  - `desktop/x-article.mjs`: `dd15c0df59b78a04`
  - `desktop/x-video-host.mjs`: `d5b56511645920fe`
  - `desktop/x-video-ui.mjs`: `5debb155c1b11f3d`
  - `desktop/x-video-quick-ui.mjs`: `f8b4cc03543a5b33`
  - `desktop/x-video-shared.mjs`: `5f5900dcfac3e55b`
  - `desktop/x-video.html`: `eb335cf1ac0ff861`
  - `desktop/x-video-quick.html`: `d4d40f878532a559`
  - `desktop/x-video.css`: `4a313cce37730d18`
  - `desktop/x-video-preload.cjs`: `a0b5bb349b04c7e1`
  - `agent/tests/x-video.test.mjs`: `3174f2636b41b2b4`
  - `agent/tests/x-article.test.mjs`: `aef63106ebd2bc15`
  - `tools/test-x-video-electron.mjs`: `54e58acc2af36ddb`
  - Chrome 插件：`manifest.json` `4f8b2931a407bf0e`、`netscape.mjs` `8dc26041a7f05a83`、`popup.mjs` `7519f1027e0259d8`
- **审核时间**：2026-11-28 JST
- **审核方式**：对照用户原话 1–11、需求 R1–R24、详细设计及单人自用最简化设计原则执行 5 轮五项检查（① Bug/缺漏/边界、② 流程合理性、③ 需求偏离、④ 合规与最简化设计、⑤ 有实际收益的可优化项），同步修正并执行 Node 单元测试、打包构建、桌面壳回归与 Electron 端到端/菜单首击回归验证。
- **结论**：**自审通过**（第 4、5 轮连续两轮 0 新问题、0 遗留问题）
- **状态**：待用户确认

---

## 一、全部轮次实际修正汇总

### Bug 修正
1. **文章 3 分钟全流程超时失效修复**（`desktop/x-video.mjs`）：`runYtDlpToDir` 改为局部 `stepTimer` 管理自身超时，`limitMs: 0` 时不再清除外层 `executeArticle` 设置的 3 分钟计时器；移除 `fetchArticle` 结束即 `clearTimeout(run.timer)` 的过早清理，确保“抓取 + `t.co` 还原 + 图片与内嵌视频下载 + 缩略图生成”全程受 `articleLimit` 保护。
2. **文章无 Cookie 抓取 `ReferenceError` 修复**（`desktop/x-article.mjs:281`）：移除 `createElectronArticleFetcher` 冗余参数 `readCookies` 后，清理残留表达式 `readCookies?.()` 为 `cookiesText || ''`，并补充 `FakeWin` 零 Cookie 单测防回归。
3. **文章重试目录清理与覆盖重抓原子交换**（`desktop/x-video.mjs`）：`executeArticle` 开始前先 `removeDir(task.id)` 清除上次失败/暂停遗留文件；`overwrite: true` 更新已有文章时先将原目录移作临时备份，移动失败自动回滚恢复原目录，防止误删旧文。
4. **`buildExtractionScript` 三个 DOM 提取缺陷修复**（`desktop/x-article.mjs`）：
   - 公开 X Article 页眉含 `Log in`/`Sign in` 时不再误判登录失效或风控（将内容存在检测扩展至 `twitterArticleReadView` / `article-content`）；
   - 提取主贴正文 `cloneText(el, quoteEl)` 排除引用框内 `tweetText`，防止无正文引用贴重复写入引用正文；
   - 垃圾回复拦截改为回溯兄弟与同层 `cellInnerDiv` 文本，修复 X 时间线中独立分隔单元 `Show probable spam` 无法截断后续回复的问题。
5. **`t.co` 截断文本误直映修复**（`desktop/x-article.mjs`）：`extractLinks` 与 `resolveTcoLinks` 校验直映候选必须为完整 `http(s)://` URL 且不含省略符 `…` / `...`，截断链接回退走 HTTP 302 重定向解析。
6. **`catalog.json` 从 `archive/` 移回恢复与外部拷入 `files` 对齐**（`desktop/x-video.mjs`）：手工将归档文章目录移回根目录时，`syncCatalog()` 自动清除 `archivedAt`/`archivedDir` 恢复管理；外部拷入文章目录的 `files` 列表补齐首位 `article.md`；查询提醒卡片 `card()` 在条目/文件缺失时触发一次 `syncCatalog()` 以准确返回归档状态。
7. **文章重抓后前端缩略图缓存过期修复**（`desktop/x-video-ui.mjs`）：缩略图内存缓存键从 `item.id` 改为 `item.id + ':' + item.finishedAt`，`overwrite: true` 更新文章后列表立即刷新新版封面。
8. **小窗剪贴板回填抑制回归与文章列表细节修正**（`desktop/x-video-quick-ui.mjs`、`desktop/x-video-ui.mjs`）：
   - 提交后 `submitted` 恢复记录 `result.url || ''`，仅抑制刚提交链接而不误杀剪贴板中的新链接；
   - 修复文章缺失徽标在 `x-video-ui.mjs` 中错用视频段数计算、文章超时/续跑提示写死“1 小时”、及缩略图加载失败占位符写死 `🎞` 的问题；同步搜索框/空态/Cookie 提示文案覆盖文章。

### 合规与需求偏离修正
1. **设计文档与使用说明全面同步（清理前次自审遗留 L2）**：更新 `docs/X_VIDEO_DOWNLOAD_DESIGN.md`（依据 `R1–R24`、统一接口名 `enqueue()`、补齐文章字段/单并发/3 分钟超时/`catalog.json` 双向同步/固定槽位与继续前版本检查）、`desktop/README.md` 与 `docs/DEVELOPMENT.md`。
2. **Cookie 文本与空态界面一致性**（`desktop/x-video.html`、`desktop/x-video-ui.mjs`）：统一使用 `--fy-*` 语义色与 JST 东京时间；明确文章无依赖 `yt-dlp` 时小窗隐藏缺失引擎横幅。

### 流程与最简化优化
1. **按需写入 `catalog.json`**（`desktop/x-video.mjs`）：新增 `catalogRevision`，仅当 `libraryRevision` 变化或 `catalog.json` 缺失时写盘，消除进度刷新、暂停与版本检查期间的无谓磁盘写入。
2. **贴入 `/article/` 自动切换与重复文章直达「已下载」**（`desktop/x-video-quick-ui.mjs`）：自动/手工粘贴或输入 `/article/\d+` 链接时自动切至文章模式；返回 `exists` 时引导按钮文案与跳转目标改为「查看已下载 →」（直达 `library` 页签）。
3. **消除重复逻辑与多余配置**：抽取 `ensureVersionChecked()` 复用版本检查、`articleCover()` 复用本地图片封面检查、`markArchived()` 合并文章/视频归档收尾、清理 `enqueue()` 冗余命名表达式，并移除 `BrowserWindow` 中可能导致真实页面渲染异常的 `offscreen: true`。

---

## 二、逐轮审核明细

| 轮次 | ① Bug/边界 | ② 流程 | ③ 需求偏离 | ④ 合规/最简 | ⑤ 优化 | 当轮处置与验证 | 遗留 | 连续达标 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 第 1 轮 | 发现文章超时被清、DOM 误判与垃圾拦截失效、引用重复、`t.co` 截断、原子重抓、目录移回、`card` 同步、回填抑制、UI 文章适配等 | 发现重复文章跳转进度、`/article/` 未自动切模式 | 发现设计文档与 README 滞后（L2） | 发现 `catalog.json` 高频冗余写、重复代码与 `offscreen: true` | 抽共用 helper 降复杂度 | 全部 14 项当轮修正；单测 32/32、构建、壳层 7/7、4 套 Electron 全部 PASS | 无 | **0** |
| 第 2 轮 | 发现文章 `overwrite` 后 `x-video-ui.mjs` `thumbs` 按 `id` 缓存致旧图不刷新 | 无新问题 | 无新问题 | 无新问题 | 缓存键加 `finishedAt` | 当轮修正；重建 + 壳层 7/7 + `test-x-video-electron` + `test-panel-titlebar-electron` PASS | 无 | **0** |
| 第 3 轮 | 发现 `x-article.mjs:281` 残留 `readCookies?.()` 在无 Cookie 时报 `ReferenceError` | 无新问题 | 无新问题 | 无新问题 | 补零 Cookie 抓取单测 | 当轮修正；单测 32/32 + `test-x-video-electron` PASS | 无 | **0** |
| 第 4 轮 | 0 新问题 | 0 新问题 | 0 新问题 | 0 新问题 | 0 新问题 | 全量复读 `x-video.mjs`、`x-article.mjs`、`x-video-host.mjs`、`x-video-quick-ui.mjs` 与设计/需求 | 无 | **1** |
| 第 5 轮 | 0 新问题 | 0 新问题 | 0 新问题 | 0 新问题 | 0 新问题 | 核对最终 SHA-256 基线、工作区干净无临时文件、全部自动化验证均为最后一次编辑后通过 | 无 | **2** |

---

## 三、实际执行的验证（均为最终代码状态下通过）

1. **Node 单元测试（视频 + 文章 + 插件，含 30s 单测超时保护）**：
   - 命令：`node --test --test-timeout=30000 G:\selftool\WebCharacter\personal-digital-companion\agent\tests\x-video.test.mjs G:\selftool\WebCharacter\personal-digital-companion\agent\tests\x-article.test.mjs G:\selftool\extratools\x-cookie-helper\netscape.test.mjs`
   - 摘要：`tests 32, suites 0, pass 32, fail 0, cancelled 0, skipped 0`（耗时 `1813.28ms`）。
2. **桌面资源打包与桌面壳回归**：
   - 命令：`node tools/build-desktop.mjs` & `node tools/test-desktop-shell.mjs`
   - 摘要：构建成功；7 个壳层套件全部 `PASS`。
3. **Electron X 视频/长文全链路 E2E 回归（含 `buildExtractionScript` 真实 DOM 夹具测试）**：
   - 命令：`electron.exe tools/run-electron-check.mjs tools/test-x-video-electron.mjs`
   - 摘要：`PASS：登记小窗、3 路队列、分页缩略图、归档、提醒播放卡片、Cookie、更新门禁、浅深色与 360 宽`，`errors = []`，`EXIT:0`。
4. **Electron 标题栏、自绘菜单与冷启动首击回归**：
   - `test-panel-titlebar-electron.mjs`：`3/3 PASS`，`EXIT:0`。
   - `test-menu-popup-electron.mjs`：`PASS`，`EXIT:0`（运行于第 1 轮代码修正后，其间未改菜单源码）。
   - `test-menu-first-show-electron.mjs`（`xadd tray normal`、`xmanage tray normal`、`xadd companion drop-first`、`xmanage companion drop-first`）：`4/4 PASS`，`EXIT:0`（同上，期间未改菜单接线）。

---

## 四、当前遗留问题与未验证边界

- **代码与设计遗留问题**：**无遗留问题**。
- **待用户实机验收与未部署边界**（受环境、登录凭据与规则约束未由代理代测）：
  1. 真实 `x.com` 账号 Cookie 在线上 X 页面执行 `createElectronArticleFetcher` DOM 提取与真实 `yt-dlp.exe` 视频下载；
  2. 真实 `F:\Xdownload` 磁盘读写与系统默认播放器 / Markdown 阅读器打开效果；
  3. 绯月正式安装目录（`G:\selftool\.release-feiyue-handbook-desktop-20261120\personal-digital-companion\desktop`）更新、受控重启、正式安装版菜单首击验收、`RELEASE_REVIEW.md` 撰写及本机 API（`8765`）花园登记；
  4. 开发仓库 Git 提交与远端推送。

---

## 五、改动与清理

- 仅修改 `G:\selftool\WebCharacter\personal-digital-companion` 内规划文件与本文档，未修改 `g:\selftool\minitools`，未触碰正式安装目录或系统临时测试目录之外的配置，无会话遗留临时脚本，所有敏感凭据/Cookie 均未写入代码、日志或本报告。
