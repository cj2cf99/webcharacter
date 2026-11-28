# 绯月 X 视频与长文归档 · 第三方独立复审 Handoff

- **生成时间**：2026-11-28 22:16 JST
- **适用阶段**：开发与多轮自审通过（[自审报告](reviews/X_VIDEO_AND_ARTICLE_SELF_AUDIT_2026-11-28.md)），**待第三方独立复审**；尚未安装到正式目录、未重启绯月、未登记花园、未提交 Git。
- **开发工作区**：`G:\selftool\WebCharacter\personal-digital-companion`
- **配套 Chrome 插件目录**：`G:\selftool\extratools\x-cookie-helper`

---

## 一、复审对象与边界

### 本次包含
1. **X 视频下载与管理**：`yt-dlp` 调用、3 路固定槽位并行、超 1 小时自动暂停降级最低优先级、每日一次检查与强同意更新门禁、独立临时目录、首帧缩略图、只归档不删除（移入 `archive\`）、加密 Cookie 与提醒播放器卡片。
2. **X 长文与媒体本地归档**：`desktop/x-article.mjs`、`x-video.mjs` 与双窗扩展——隐藏 Electron `BrowserWindow` + 独立临时内存 `session` 注入 Cookie 抓取、扁平 `<名称>_<status_id>/article.md + 01.jpg/02.mp4`、内嵌视频复用 `yt-dlp`（不生成重复视频条目与双提醒）、`replies` `0–10`（默认 `2`）、`name=orig` 原图、`t.co` 还原、JST `+09:00` frontmatter、部分媒体失败降级、单并发与 3 分钟全流程超时、同 `status_id` 去重与原子覆盖重抓、风控/登录失效中止不绕过。
3. **便携目录文件 `catalog.json` 与自动同步**：下载根目录维护 `catalog.json`（只存相对路径与非敏感元数据，仅在成品变化或索引缺失时写入），支持整体搬迁目录（配 `.local-tools.json` `xDownloadRoot` 或 `COMPANION_X_DOWNLOAD_ROOT`）、手工改名、手工移入或移出 `archive/` 及外部拷入文章目录自动同步。
4. **配套 Chrome 插件**：`G:\selftool\extratools\x-cookie-helper\`（MV3，一键校验并复制 Netscape 格式 Cookie 或导出 `cookies.txt`）。

### 本次不包含（请勿越界改动）
- 不触碰正式安装目录 `G:\selftool\.release-feiyue-handbook-desktop-20261120\personal-digital-companion\desktop`；
- 不改动 `desktop/local-rest.mjs`（8765 本机接口）；
- 不触碰 `g:\selftool\minitools` 及 `G:\selftool\WebCharacter\=`；
- 不执行正式发布审核（`RELEASE_REVIEW.md`）、安装、绯月重启、花园登记或 Git 提交/推送（`奥星` Windows 账户下亦不测 `agy` CLI）。

---

## 二、Git 与文件基线

- **仓库与分支**：`G:\selftool\WebCharacter\personal-digital-companion`，分支 `codex/workspace-checkpoint-20261120`，基线提交 `4df2e89`（改动全部未提交）。
- **改动与新增文件清单**：
  - 核心与宿主：`desktop/x-video.mjs`、`desktop/x-article.mjs`、`desktop/x-video-host.mjs`、`desktop/x-video-preload.cjs`、`desktop/x-video-shared.mjs`
  - 双窗界面与样式：`desktop/x-video-quick.html`、`desktop/x-video-quick-ui.mjs`、`desktop/x-video.html`、`desktop/x-video-ui.mjs`、`desktop/x-video.css`
  - 壳层与提醒集成：`desktop/shell.mjs`、`desktop/menu-layout.json`、`desktop/source-updates.mjs`、`desktop/conversation-details.mjs`、`desktop/conversation-preload.cjs`、`desktop/conversation-ui.mjs`、`desktop/conversation.css`、`desktop/screen-question-host.mjs`
  - 测试与夹具：`agent/tests/x-video.test.mjs`、`agent/tests/x-article.test.mjs`、`tools/test-x-video-electron.mjs`、`tools/test-desktop-shell.mjs`、`tools/test-menu-popup-electron.mjs`、`tools/test-menu-first-show-electron.mjs`、`tools/test-panel-titlebar-electron.mjs`
  - 原型与文档：`prototype/x-video/*`、`desktop/README.md`、`docs/DESKTOP_UI_GUIDE.md`、`docs/DEVELOPMENT.md`、`docs/X_VIDEO_DOWNLOAD_REQUIREMENTS.md`、`docs/X_VIDEO_DOWNLOAD_DESIGN.md`、`docs/reviews/*`
- **关键文件 SHA-256 前 16 位（便于复审核对一致性）**：
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

---

## 三、需求依据与已确认决策（审阅必读）

- [需求文档](X_VIDEO_DOWNLOAD_REQUIREMENTS.md)：包含完整用户原话 1–11 及已确认规则 `R1–R24`。
- [详细设计](X_VIDEO_DOWNLOAD_DESIGN.md)：架构、数据结构、`enqueue()` 调度、文章执行、`catalog.json` 双向同步与边界。
- [补充需求复审报告](reviews/X_ARTICLE_REQUIREMENTS_REVIEW_2026-11-28.md)：用户已明确接受 F1–F3 全部 3 项提议：
  1. 用绯月内置 Electron 隐藏窗 + 独立临时 `session` 复用加密 Cookie 替代 Playwright/Chrome 调试端口；
  2. 文章统一保存至 `downloadRoot` 下 `<名称>_<status_id>/article.md` 与平铺媒体（不建 `media/` 子目录与冗余 `meta.json`），归档移整目录入 `archive\`；
  3. `replies` 允许 `0–10` 整数（默认 `2`），同 `status_id` 默认提示已存在并支持按钮触发 `overwrite: true` 原位覆盖重抓。
- [全量自审报告](reviews/X_VIDEO_AND_ARTICLE_SELF_AUDIT_2026-11-28.md)：记录 5 轮自审及各轮修清的 Bug（包括 `runYtDlpToDir` 计时器覆盖、无 Cookie `ReferenceError`、X Article/垃圾回复分隔单元 DOM 提取、`t.co` 截断直映、原子重抓、目录双向自愈、`thumbs` 缓存刷新与 `catalog.json` 按需写盘）。

---

## 四、复审可复跑验证命令与最近实测结果

在 `G:\selftool\WebCharacter\personal-digital-companion` 下执行（均设超时；运行 Electron 前需清除 `ELECTRON_RUN_AS_NODE` 环境变量）：

1. **Node 单元测试（最近实测：`32/32 PASS`，耗时 `1813ms`）**：
   ```powershell
   node --test --test-timeout=30000 agent/tests/x-video.test.mjs agent/tests/x-article.test.mjs G:\selftool\extratools\x-cookie-helper\netscape.test.mjs
   ```
2. **正式资源打包与桌面壳层回归（最近实测：构建成功 + `7/7 PASS`）**：
   ```powershell
   node tools/build-desktop.mjs
   node tools/test-desktop-shell.mjs
   ```
3. **Electron X 视频与长文双窗/DOM 夹具/提醒卡片 E2E（最近实测：`PASS`，`errors = []`，`EXIT:0`）**：
   ```powershell
   Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
   .\desktop\node_modules\electron\dist\electron.exe tools/run-electron-check.mjs tools/test-x-video-electron.mjs
   ```
4. **Electron 标题栏、自绘菜单与菜单冷启动首击回归（最近实测：全部 `PASS`，`EXIT:0`）**：
   ```powershell
   .\desktop\node_modules\electron\dist\electron.exe tools/run-electron-check.mjs tools/test-panel-titlebar-electron.mjs
   .\desktop\node_modules\electron\dist\electron.exe tools/run-electron-check.mjs tools/test-menu-popup-electron.mjs
   foreach ($r in @(@('xadd','tray','normal'),@('xmanage','tray','normal'),@('xadd','companion','drop-first'),@('xmanage','companion','drop-first'))) {
     .\desktop\node_modules\electron\dist\electron.exe tools/run-electron-check.mjs tools/test-menu-first-show-electron.mjs $r[0] $r[1] $r[2]
   }
   ```

---

## 五、建议独立复审重点与输出要求

### 重点核查方向
1. **正确性与边界漏洞**：
   - `desktop/x-video.mjs` 中 `runYtDlpToDir`、文章 3 分钟整体超时与内嵌视频的交互、`executeArticle` 原子重抓回滚、`syncCatalog()` 对目录搬迁/改名/移入移出 `archive/` 的幂等性；
   - `desktop/x-article.mjs` 的 DOM 抓取逻辑（主贴/X Article/引用去重/广告与垃圾折叠区截断/风控与未登录中止/临时 `session` 销毁与 Cookie 注入）；
   - 双窗与提醒卡片（`x-video-quick-ui.mjs`、`x-video-ui.mjs`、`conversation-ui.mjs`）的状态竞态、防重复点击、缩略图懒加载/刷新与 360px 窄宽自适应。
2. **单人自用与最简化设计审核**：检查是否存在过度抽象、不必要配置、冗余写盘或可删减分支。
3. **需求一致与安全规范**：逐条核对 R1–R24 及原话 1–11；确认加密 Cookie 不进入快照、`catalog.json`、日志或明文回显；确认时间统一东京时间（`Asia/Tokyo` / `+09:00`）。

### 未实机验证项（由用户在实机验收，复审报告需如实保留标注）
- 真实 `x.com` 账号 Cookie 线上 DOM 抓取与真实 `yt-dlp.exe` 视频下载；
- 真实 `F:\Xdownload` 读写与系统默认播放器 / Markdown 阅读器调起；
- 正式安装目录更新、受控重启与本机 `8765` 花园登记。

### 复审报告规范（全局规则三.4 & 三.5）
- 请将独立复审明细报告写为新文件（例如 `docs/reviews/X_VIDEO_AND_ARTICLE_THIRD_PARTY_REVIEW_2026-11-28.md`），**勿覆盖历史审核文件**；
- 发现问题请明确指出文件与位置，并给出可落地的修改建议；只做审核结论、不擅自改动待部署目录或提交 Git。
