# 交接记录：绯月 X 视频下载与管理（2026-11-28 JST）

用户原话：“handoff”。接续时从本文读起；内容为当日快照，动手前先核对仓库与实际安装版的最新状态。

## 1. 现在停在哪

**2026-11-28 20:49 JST 快照**：已完成需求整理、**4 轮需求自审通过**、并完成第 2 版**简化双窗可交互 HTML 原型**及 Electron 无头实测。

- 尚未开始：正式详细设计文档（`docs/X_VIDEO_DOWNLOAD_DESIGN.md`）与设计审核、正式功能开发、安装到正式版及花园登记。
- 未做 Git 提交：所有新增文档与原型当前均留在工作区未提交状态，未改动任何 `desktop/` 或其他既有源码。

## 2. 功能一句话

在绯月右键菜单「本地复盘」正下方增加独立入口「X视频下载与管理」，将轻量**「登记下载」小窗**（仅填 X 链接与选填名称，提交后不跳转管理界面）与**「X视频管理」窗口**分离；由绯月主进程代行调用本机 `yt-dlp.exe`（复用 `.local-tools.json` 已有 `ffmpeg`），支持本地**最大并行 3 个下载任务**，省略名称按东京时间（JST）精确到秒自动命名；每天最多自动检查一次 `yt-dlp` 更新并保留手动检查，发现新版须用户明确同意才更新；单任务超过 1 小时自动暂停（保留断点）并**自动降至最低优先级**，释放槽位继续其他任务；成品集中保存在 `F:\Xdownload\`，自动提取第 1 帧缩略图，复用绯月现有 `notices` 提醒记录展示**「缩略图 + 播放键」**点击呼出系统默认本地播放器；管理界面**只有归档没有删除**（移入 `F:\Xdownload\archive\` 脱离管理）；配套 Chrome MV3 插件一键提取 X 登录 Cookie 复制粘贴导入绯月加密存储，并预留后续云端任务下发与插件一键生成云端任务扩展点。

## 3. 仓库与基线

| 项 | 值 |
| --- | --- |
| 仓库 | `G:\selftool\WebCharacter`（子项目目录 `personal-digital-companion/`） |
| 分支 | `codex/workspace-checkpoint-20261120` |
| 基线提交 | `4df2e89` |
| 本次新增（未入库） | `docs/X_VIDEO_DOWNLOAD_REQUIREMENTS.md`、`docs/reviews/X_VIDEO_DOWNLOAD_REQUIREMENTS_SELF_AUDIT_2026-11-28.md`、`prototype/x-video/{index.html,x-video.css,x-video.js}`、`docs/HANDOFF_X_VIDEO_DOWNLOAD_2026-11-28.md` |
| 勿动项 | 仓库根目录 `G:\selftool\WebCharacter\=` 为原有未跟踪文件，保持不动 |

## 4. 入口

均位于 `G:\selftool\WebCharacter\personal-digital-companion\`：

| 内容 | 位置 |
| --- | --- |
| 需求文档（含 9 条用户原话与 R1–R17） | `docs/X_VIDEO_DOWNLOAD_REQUIREMENTS.md` |
| 需求自审明细报告（4 轮通过） | `docs/reviews/X_VIDEO_DOWNLOAD_REQUIREMENTS_SELF_AUDIT_2026-11-28.md` |
| 简化双窗版可交互 HTML 原型 | `prototype/x-video/index.html`（配套 `x-video.css`、`x-video.js`） |
| 本机外部工具配置 | `.local-tools.json`（已配 `ffmpeg`，`yt-dlp` 尚待安装配置） |
| 本交接文档 | `docs/HANDOFF_X_VIDEO_DOWNLOAD_2026-11-28.md` |

## 5. 已验证与本机环境

1. **原型静态语法检查**（在 `personal-digital-companion/`）：
   - `node --check prototype/x-video/x-video.js` → 退出码 `0`。
2. **原型 Electron 离屏布局与交互实测**（`desktop/node_modules/electron/dist/electron.exe` + `tools/run-electron-check.mjs`，非沙盒模式且清除 `ELECTRON_RUN_AS_NODE`）：
   - 分别实测「登记下载小窗」「视频管理 → 已下载」「视频管理 → 队列与进度」在 `760×820` 与 `360×740`、浅色与深色共 6 组视口/主题下**零横向溢出**（`overflow: false`）、控制台零报错（`errors: 0`）、零删除按钮（`deleteButtons: 0`）；
   - 交互实测通过：登记小窗提交不跳管理窗、同链接防重复占槽、3 路并行通道满载 + 排队顺位展示、模拟 `#1` 超 1h 自动暂停降级并补满 3 路、归档减 1、提醒缩略图+播放键预览及已归档提示、更新强同意门禁与文件锁提示、Chrome 插件复制导入 Cookie 校验保存。
3. **本机 CLI 工具检查实测**：
   - `ffmpeg`：已通过 `.local-tools.json` 配置就绪（`G:/DevTools/audio-venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe`）；
   - `python`：`G:\DevTools\Python\python.exe`；`winget` / `curl.exe` 可用；
   - **`yt-dlp`：`NOT_FOUND`（本机尚未安装）**。

## 6. 待用户确认与未验证

1. **待用户确认**：简化双窗版原型（[prototype/x-video/index.html](../../prototype/x-video/index.html)）的视觉简洁度、双窗分离及「3 路并行通道 + 待处理顺位」队列展示是否定稿。
2. **未验证（留待开发与实机验收）**：
   - 本机获取 `yt-dlp.exe` 并验证真实 X 公开/敏感视频（含 Cookie）与多段视频下载；
   - `F:\Xdownload\` 及 `F:\Xdownload\archive\` 实际磁盘读写、断点续传、首帧 `ffmpeg` 抽取；
   - 调用 Windows 默认本地视频播放器（`shell.openPath`）拉起播放；
   - Chrome 插件 `extratools/x-cookie-helper` 加载后在真实登录态 X 页面提取 `auth_token` / `ct0`。

## 7. 接续步骤

1. 向用户确认当前简化双窗版原型是否定稿（若有微调继续改原型）。
2. 编写详细设计文档 `docs/X_VIDEO_DOWNLOAD_DESIGN.md` 及设计三轮审核报告 `docs/reviews/X_VIDEO_DOWNLOAD_DESIGN_REVIEW_2026-11-28.md`。
3. 获准开始开发后：
   - 新增核心调度 `desktop/x-video.mjs`（纯 Node.js，导出统一 `enqueue({ url, name, source })` 供未来云端任务复用）、宿主 `desktop/x-video-host.mjs` 与双窗页（登记下载小窗 + X视频管理窗）；
   - 在 `desktop/shell.mjs`、`desktop/menu-layout.json`、`desktop/source-updates.mjs` 接线；
   - 在 `desktop/conversation-details.mjs` / `conversation-ui.mjs` 对接 `notices`（`kind: 'x-download'`）在 `noticeDetail` 渲染「第一帧缩略图 + 播放键」并呼出 `shell.openPath`；
   - 新增本地 Chrome MV3 插件 `extratools/x-cookie-helper/`（预留后续云端任务提取扩展位）。
4. 运行单测、构建、桌面壳与隔离 Electron 检验（标题栏、浅深色、360 宽、冷启动首击）并完成开发三轮复核。
5. 安装前按项目 `AGENTS.md` 以正式安装版为基线合入、写 `RELEASE_REVIEW.md`、取得授权后更新重启并默认登记花园（归属「网页角色组件 → 绯月（桌面精灵）」）。

## 8. 开发时要知道的事（防踩坑）

1. **`local-rest.mjs` 安全护栏**：`desktop/local-rest.mjs` 第 102 行拒绝一切带 `Origin` 头的请求。用户已确定本期采用 Chrome 插件一键复制 → 绯月粘贴导入（或选 `cookies.txt`），因此**本期不改 8765 接口安全契约**（后续如确需插件直传再按用户授权扩展受限路由）。
2. **并行 3 路与 Windows 文件锁**：
   - 更新 `yt-dlp -U` 前必须暂停拉起新任务并等待运行中最多 3 个 `yt-dlp.exe` 进程全部退出，否则 Windows 会因文件占用覆写失败；
   - 超 1 小时暂停或绯月退出时使用 `taskkill /PID <pid> /T /F` 结束整棵进程树（避免残留子进程 `ffmpeg` 锁住 `.part` 文件）；
   - 临时下载与断点按任务隔离在 `F:\Xdownload\.downloading\<taskId>\`，运行中临时 Cookie 隔离为 `.tmp-cookie-<taskId>.txt`（`0o600`，`finally` 删除，启动时清扫残留；持久化使用 `safeStorage` 加密存 `cookies.bin`）。
3. **提醒 UI 勿嵌套按钮**：`desktop/conversation-ui.mjs` 现有提醒列表每一行外层已经是 `<button class="notice">`，缩略图+播放键卡片必须放在右侧/下方 `noticeDetail` 区域内，不能嵌套进列表行的 `<button>`。
4. **Electron 校验运行方式**：在终端沙盒内直接启动 `electron.exe` 会触发 `-2147483645` 退出码；运行 Electron 巡检脚本时须清除 `ELECTRON_RUN_AS_NODE` 并在非沙盒模式下运行。
5. **备忘录核对状态**：已对照检索 `*MEMO*` / `*备忘*` 及 `docs/CARD_DRAW_DESIGN.md`、`docs/MEDIA_TOOLS.md`，确认仓库与全局均不存在独立开发设计备忘录（设计文档需如实记录缺失）。
