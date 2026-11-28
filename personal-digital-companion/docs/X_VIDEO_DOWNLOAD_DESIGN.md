# 绯月 X 视频与长文下载管理 · 详细设计

状态：2026-11-28 JST 随全量自审同步更新；正式版安装与花园登记未执行。

依据：[需求](X_VIDEO_DOWNLOAD_REQUIREMENTS.md) R1–R24、[交接记录](HANDOFF_X_VIDEO_DOWNLOAD_2026-11-28.md)、[复审报告](reviews/X_ARTICLE_REQUIREMENTS_REVIEW_2026-11-28.md)、[HTML 原型](../prototype/x-video/index.html)。

## 1. 查阅的备忘录与约定

仓库与全局没有独立的开发设计备忘录（交接记录第 8 节第 5 条，本次复查一致）。适用约定如下。

| 来源 | 本次如何遵循或回避 |
| --- | --- |
| `AGENTS.md`、[桌宠界面说明](DESKTOP_UI_GUIDE.md) | 两个窗口走 `createPanelWindow` + `showPanel`，`.fy-panel` 与月印标题栏，页面在 `source-updates.mjs` 登记，颜色只用 `--fy-*`，动效常开 |
| [开发指南](DEVELOPMENT.md)「菜单弹窗首击可见性」 | 页面载入后 `showPanel`；用正式自绘菜单冷启动首击验证 |
| 全局 `FRAMEWORK_PREFERENCES.md` | 最简、东京时间、分页替换、缩略图懒加载 |
| 交接记录第 8 节 | 不改 `local-rest.mjs`；更新前等下载进程退出；结束整棵进程树；提醒卡片放 `noticeDetail`，列表行内不嵌按钮 |

## 2. 结构

| 文件 | 职责 |
| --- | --- |
| `desktop/x-video.mjs` | 纯 Node 核心：链接与命名、队列（视频 3 路/文章 1 路）、yt-dlp 进程、超时、收尾、归档、`catalog.json` 同步、更新门禁、Cookie、提醒写入 |
| `desktop/x-article.mjs` | 纯 Node + Electron 隐藏窗文章抓取：`replies` 校验、JST ISO、`t.co` 还原、原图规范化、`article.md` 渲染/解析、独立 `session` 注入 Cookie 抓 DOM |
| `desktop/x-video-host.mjs` | 两个窗口、IPC、剪贴板、文件选择、系统播放器与资源管理器 |
| `desktop/x-video-quick.html` / `-ui.mjs` | 「登记下载」小窗，不读列表和缩略图 |
| `desktop/x-video.html` / `-ui.mjs` | 「X视频管理」：已下载、队列与进度、Cookie、更新 |
| `desktop/x-video-shared.mjs`、`x-video.css`、`x-video-preload.cjs` | 两页共用的小工具、更新对话框、样式和预加载 |
| `desktop/shell.mjs`、`menu-layout.json` | 菜单「本地复盘」正下方分组「X视频下载与管理」（登记下载、X视频管理），退出时清理 |
| `desktop/conversation-details.mjs` / `conversation-ui.mjs` | `x-download` 提醒显示缩略图+播放键，`x-download-alert` 提供「查看队列」 |
| `G:/selftool/extratools/x-cookie-helper/` | Chrome MV3 插件（独立目录，不进绯月运行时） |

## 3. 数据

均在绯月资料目录 `x-video/`：`state.json`（任务、成品记录、更新检查结果、Cookie 导入时间；临时文件加改名写入）、`thumbs/<id>.jpg`、`cookies.bin`（`safeStorage` 加密）、运行时的 `.tmp-cookie-<id>.txt`。进度只在内存，状态变化时随任务一起落盘；同时维护递增版本号 `libraryRevision`，成品记录变动时刷新界面并在需要时写回目录索引。`state.json` 读不出时保留原文件，界面提示并拒绝写入。

- 任务：`id, kind(video|article), statusId?, replies?, replaceId?, url, name, state(queued|running|paused|failed|confirm), low, reason, error, progress, enqueuedAt, attempts, source`。
- 成品：`id, kind(video|article), statusId?, name, url, dir?, finishedAt, files[{name,duration}], repliesCollected?, mediaCount?, failedMediaCount?, thumb, archivedAt, archivedDir?`。归档只打标记，旧提醒仍能说明去向；列表不再显示。`state.json` 另记 `lastRoot`，换根启动时自动剔除仅属旧根的失效条目。

磁盘：`F:\Xdownload\`（视频成品与 `<名称>_<id>` 文章目录）、`F:\Xdownload\catalog.json`（仅含安全相对文件名/目录名与非敏感元数据；仅在成品变动或索引缺失且已安全读取后写入，损坏时原样保留并界面报错不覆盖；启动或磁盘晚接入后自动同步）、`F:\Xdownload\.downloading\<id>\`（断点/文章暂存）、`F:\Xdownload\archive\`。盘符不存在直接报错，下载目录异常不影响绯月启动。隔离资料目录（测试）默认用资料目录下的 `Xdownload`；非隔离实例在 `.local-tools.json` 配置 `xDownloadRoot`（或环境变量 `COMPANION_X_DOWNLOAD_ROOT`）指向迁移后目录，**修改 `xDownloadRoot` 需重启绯月生效**。

## 4. 流程

**提交** `enqueue({url,name,source='ui',decision,kind='video',replies=2,overwrite=false})`：校验链接（支持 `status/<id>`，文章模式亦支持 `article/<id>`；按帖子编号识别同类型重复）→ `replies` 校验（0–10 整数）→ 引擎（仅视频强要求）与磁盘检查 → 在途同类型同链接阻止（失败任务改为重试）→ 文章同 `statusId` 未归档条目返回 `exists` 提示（传 `overwrite: true` 时标记原地覆盖重抓）→ 视频当天首次时检查版本（单例，8 秒超时，失败不阻断）→ 有新版且未决定时，界面返回 `update` 等用户选择；非界面来源建 `confirm` 任务并写提醒 → 入队。选「同意更新并下载」时先入队再执行更新；选「取消」不建任务，同日再次提交仍会询问。视频下载过的链接照常入队并轻提示。名称清理非法字符、保留名与结尾点号，限 100 字，空则视频用东京时间 `YYYY-MM-DD_HHmmss`，文章先暂记 `帖子 <id>` 抓取后改取标题。小窗打开或获得焦点且地址栏为空时，剪贴板里的帖子/文章链接自动填入（`/article/` 链接自动切到文章模式），不自动启动下载。

**调度**：最多 3 路固定槽位（`0/1/2`，中途结束不换位，避免误点暂停/取消）；文章抓取最多占 1 路（与视频共用 3 槽）。普通优先于最低，同级按入队时间。更新待执行或进行中时不启动新任务；从队列或提醒卡片继续/全部继续paused 视频任务时，先走同一每日更新门禁。仍占槽的进程或抓取退出前，同一任务不重启。

**执行（视频）**：`yt-dlp --ignore-config --no-update --newline --progress --no-quiet --no-simulate`，进度模板 `XVP|…`，完成行 `XVF|序号|时长|路径`，输出固定为 `part-<序号>.<扩展名>`，合并为 mp4。子进程临时目录指到任务目录内。续传复用同一任务目录，yt-dlp 会重新打印已完成段的完成行。进度按「段序号＋视频流 90%／音频流 10%」估算，只增不减。

**执行（文章）**：界面提交前先核验已导入 Cookie，未导入直接拒绝；先清理该任务残留暂存目录后建立独立目录 → 用绯月内置 Electron 隐藏 `BrowserWindow`（静音并拒绝权限请求）+ 临时内存 `session` 按行注入已加密 Cookie 抓取主贴/X Article（只认 `data-testid="tweet"` 与文章正文节点）、引用（排除链接卡片干扰，保留纯图/纯视频引用）与边滚动边等待的紧邻前 `N` 条可见非广告回复（跳过会跳页的显示更多链接并注明截断；本帖时间与链接排除引用框；精准校验 `statusId` 找不到或作者/内容全空即报错中止不落盘；遇登录失效/风控中止不绕过）→ 还原非截断 `t.co` 短链（响应中止信号）→ 图片按 `name=orig` 下载，内嵌视频/GIF 复用 `runYtDlpToDir`（不走当日更新检查、不覆盖外层 3 分钟计时器、不生成重复视频条目，失败时清理残留 `.part`），媒体部分失败降级保留正文并在提醒标题注明（回复不足 N 条时正文注明实得数）→ 渲染 JST `+09:00` frontmatter 与 `article.md` → 抽/拷封面 → 原地覆盖重抓时先将旧目录完整移入 `archive\` 保留（绝不删除用户已有媒体或批注），否则分配 `<名称>_<statusId>`。

**超时**：单次运行视频满 60 分钟（保留断点）、文章（含正文与全部媒体下载）满 3 分钟（重置暂存、继续时重新抓取），中止进程树与抓取请求，状态 `paused`、`low=true`，写提醒，让出槽位。手动继续清零计时，保持最低优先级。

**收尾**：视频退出码 0 且有完成行 → `ffmpeg` 抽首帧（30 秒超时，失败用占位）→ 在成品目录里选不重名的基名（单段 `名称.mp4`，多段 `名称-1.mp4`…，冲突追加 ` (2)`）→ 全部移动，任一失败则移回并记失败 → 写记录、删任务目录、写提醒。

**暂停、取消、退出**：都结束进程树并中止抓取信号。取消在退出后删任务目录，界面二次点击确认。退出时同步结束全部下载/抓取与更新进程，未完成任务（排队、运行）存为 `paused`；启动时也把残留的排队、运行状态转为暂停，并清扫临时 Cookie。

**更新门禁**：版本来自 GitHub 官方 `releases/latest`，本地用 `yt-dlp --version`。只有「同意更新」才运行 `yt-dlp -U`，且等运行中任务全部退出；等待期间可取消。更新后版本仍旧或进程失败，提示并按原版本继续。手动检查按钮随时可用。

**归档与目录同步**：盘可用时视频将现存文件移到 `archive`（同名追加序号，失败回滚）、文章将整篇目录移到 `archive`（保持完整原目录名不截断，同名追加序号）；文件/目录缺失的条目也可归档脱离。归档后删缩略图并打归档标记。搬迁或新装后支持目录内 `catalog.json` 自动合并恢复，视频缺失缩略图于查看时按需懒生成；文章目录另支持手工改名自愈、手工移入或移出 `archive\` 自动同步、外部拷入自动收编（视频移出 `archive\` 不自动恢复，且不做按同名推断视频归档）。

**提醒**：完成写 `x-download`（目标为成品编号）；超时、失败、待确认更新写 `x-download-alert`（正文带次数，重复发生仍能出现）。

**Cookie**：只保留 `x.com` / `twitter.com` 行，要求未过期的 `auth_token` 与 `ct0`。系统加密不可用时拒绝保存。页面只能看到是否配置和导入时间；粘贴框用掩码显示，导入后清空；选文件由主进程读取。

## 5. 界面

以原型为准（去掉原型切换条与演示抽屉）。补充：队列页有暂停任务时给「全部继续」；等待更新时横幅给「取消更新」；多段成品在卡片上给分段播放按钮；登记小窗改地址或切模式时自动清除「更新重抓」状态。列表每页 8 条，缩略图进入视口才读取（缺缓存时对本地视频按需懒生成）；读取失败给重试。

路径配置：环境变量 `COMPANION_YTDLP`，否则 `.local-tools.json` 的 `ytDlp`；`ffmpeg` 沿用 `COMPANION_FFMPEG` 或 `.local-tools.json`（均每次使用时读取，改配置不必重启）。`xDownloadRoot` / `COMPANION_X_DOWNLOAD_ROOT` 于绯月启动时读取，修改后需重启绯月生效。

## 6. 不做

需求第 5 节全部内容；系统气泡通知（沿用菜单未读与提醒记录）；断点自动重试和停滞检测（以 1 小时超时和 yt-dlp 自带重试覆盖）。

## 7. 验证安排

| 层次 | 内容 |
| --- | --- |
| 单元测试 `agent/tests/x-video.test.mjs`、`x-article.test.mjs` | 用模拟引擎与抓取器核对链接、命名、调度（视频 3 路/文章 1 路）、超时、续传、更新门禁、归档、`catalog.json` 移动同步、文章渲染与部分失败降级、Cookie、重启恢复 |
| 实机核心 | 真实 yt-dlp、ffmpeg、`F:\Xdownload`，公开测试帖（单段与多段、中断续传、错误帖、长文归档） |
| Electron | 两个窗口和提醒卡片的浅深色、360 宽、交互；标题栏、菜单、桌面壳回归 |
| 插件 | 隔离资料目录的 Chrome 加载插件，用假 Cookie 核对提取与导入格式 |
| 用户验收 | 真实 X 登录 Cookie 下载敏感视频与 X 长文；正式版安装后的菜单冷启动首击与默认播放器/编辑器 |
