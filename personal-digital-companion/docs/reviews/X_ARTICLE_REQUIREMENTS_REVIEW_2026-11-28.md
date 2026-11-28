# 补充需求复审报告：X 长文与媒体本机归档

- **审核对象与范围**：`c:\Users\asura\.antigravity-profiles\work\home\.gemini\antigravity\brain\323909a3-e6e8-405e-9ca2-80412f2ea287\REQUIREMENTS.md`（全 55 行，《X 长文与媒体本机归档 · 需求文档》），对照绯月现有「X 视频下载与管理」体系：[X_VIDEO_DOWNLOAD_REQUIREMENTS.md](../X_VIDEO_DOWNLOAD_REQUIREMENTS.md)、[X_VIDEO_DOWNLOAD_DESIGN.md](../X_VIDEO_DOWNLOAD_DESIGN.md)、[desktop/x-video.mjs](../../desktop/x-video.mjs)、[desktop/x-video-quick.html](../../desktop/x-video-quick.html)、[desktop/x-video.html](../../desktop/x-video.html)、[desktop/x-video-shared.mjs](../../desktop/x-video-shared.mjs) 及全局框架偏好 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`。
- **基线**：
  - 绯月仓库：`G:\selftool\WebCharacter\personal-digital-companion`，分支 `codex/workspace-checkpoint-20261120`，Git 基线提交 `4df2e89`（工作区包含尚未提交的 `x-video` 完整开发实现与设计文档）。
  - 被审文档：外部路径共 55 行；在终端沙盒内执行 `Get-FileHash` 返回 `PermissionDenied`（受终端沙盒对工作区外路径的访问控制限制，未绕过），已通过 `read_file` 完整读取 1–55 行核对。
- **审核方式**：只读通读被审需求文档全文，逐条对照绯月已落地 `x-video` 需求、详细设计、实现代码与单人最简原则，核查架构冲突、目录与数据对齐、双窗交互闭环、边界缺漏及全局规范合规性。
- **实际执行的命令与原样摘要**：
  - `git rev-parse --short HEAD` → `4df2e89`
  - `git status --short` → 确认仓库已含 `desktop/x-video.mjs`、`desktop/x-video-host.mjs`、`desktop/x-video-quick.html`、`desktop/x-video.html`、`docs/X_VIDEO_DOWNLOAD_DESIGN.md`、`agent/tests/x-video.test.mjs`、`tools/test-x-video-electron.mjs` 等已开发文件。
  - `Get-FileHash -Algorithm SHA256 -Path "c:\Users\asura\.antigravity-profiles\work\home\.gemini\antigravity\brain\323909a3-e6e8-405e-9ca2-80412f2ea287\REQUIREMENTS.md"` → `Resolve-Path : Access is denied`（如实标注，未伪造 SHA-256）。
  - 构建/单测：**未执行**（本次为纯需求文档复审，未改动任何代码或现有需求文档）。
- **结论**：**有条件通过**（极简边界方向合理，但须先补齐并解决以下 6 项与绯月现存体系的冲突与缺口后再进入详细设计与开发）。
- **审核中是否改动及临时文件清理**：未改动被审文档、原有需求文档或任何项目源码，仅新增本审核报告，无临时文件残留。
- **状态**：待用户确认

---

## 一、可保留的优秀设计（肯定部分）

1. **方案 A 分工清晰**：确定性脚本只负责抓取与规范化落盘，不内置大模型，总结/标签/登记留在绯月侧读取 `article.md` 处理，符合单人最简与职责分离原则。
2. **明确反过度设计边界**：不做云端适配、不做重复 `meta.json`、不多套 `media/` 子目录、不做双轨解析、不向上追溯祖先贴、不绕过验证码与风控、AI 检索只读 `article.md` 纯文本并按需读图——均与个人自用最简原则高度一致。

---

## 二、发现清单与修改建议

| 编号 | 级别 | 具体定位 | 问题描述与对照证据 | 影响 | 可落地修改建议 |
| --- | --- | --- | --- | --- | --- |
| **F1** | **高** | `REQUIREMENTS.md` 第 2 节 L16、L18「运行环境 / 抓取路径」 | 提出「Playwright / 挂接本机 Chrome」；但绯月本体已是 Electron 45（内置完整 Chromium），且工作区已落地 Chrome 插件提取 + `safeStorage` 加密存本地的 `x.com` Cookie（`desktop/x-video.mjs` L52–L72）。 | 引入 Playwright 会增加几十 MB 重型依赖与额外浏览器二进制；挂接本机 Chrome 在 Windows 上无默认调试端口、受用户目录锁与 Cookie 加密保护限制极易失败，破坏两套登录态统一性。 | **改用绯月主进程内置 Electron 隐藏 `BrowserWindow` + 独立 `session`**，直接注入既有的加密 `x.com` Cookie 抓取页面 DOM；零新依赖、与视频下载共用同一套 Cookie 导入体验。 |
| **F2** | **高** | `REQUIREMENTS.md` 第 2 节 L22–L23、第 4 节 L46；对照 `X_VIDEO_DOWNLOAD_REQUIREMENTS.md` R2/R3/R7/R12 与 `desktop/x-video.mjs` | ① 既有视频直接平铺在 `F:\Xdownload\<名称>.mp4`（支持自定义名或 JST 精确到秒），本文按 `status_id` 建目录，未说明存放根路径与命名衔接；② 同一 `status_id` 重复提交或调大 `replies` 重抓的行为未定义；③ 缺少「仅归档无删除」对接（现有 `x-video.mjs` 仅按单文件移至 `archive\`）；④ 若直接复用现有视频入队逻辑，会把文章内嵌视频/GIF 重复写入视频管理列表并触发双提醒。 | 直接落地会导致根目录目录/文件混杂、丢失用户自定义命名能力、重复重抓冲突、无法归档整篇文章，以及出现内嵌视频重复入库与双提醒 Bug。 | ① 文章目录统一放 `F:\Xdownload\`（或统一约定 `F:\Xdownload\articles\`），目录名采用 `<名称>_<status_id>`（或先按 `<status_id>`、在管理面板映射名称），兼顾自定义/JST 命名与按 `status_id` 去重；② 同 `status_id` 重复提交默认提示已存在并可直达查看，用户明确重抓/调大 `replies` 时覆盖更新原目录；③ 文章归档将整个文章目录原子移入 `F:\Xdownload\archive\` 并脱离管理（保持无删除）；④ 从 `desktop/x-video.mjs` 抽离底层 `yt-dlp` 下载能力供文章内嵌视频/GIF 落入同一文章目录，不生成重复视频条目。 |
| **F3** | **高** | `REQUIREMENTS.md` 第 2 节 L15、第 5 节 L52–L55；对照 `desktop/x-video-quick.html`、`desktop/x-video.html`、`desktop/x-video.mjs` L23 | ① 同一条 X 链接既可能是视频下载也可能是长文归档，未定义「登记下载」小窗如何区分模式与传递 `replies`；② 未定义文章条目在管理面板卡片的缩略图来源、主操作按钮与 `notices` 提醒卡片形态；③ 文章渲染抓取若直接套用视频的「最大并行 3 + 1 小时超时」，会同时开 3 个隐藏渲染窗吃内存且触发风控；④ `desktop/x-video.mjs` 的 `parseXUrl` 当前只认 `status/<id>`，未覆盖可能出现的 `/i/article/<id>` 链接。 | UI 入口无法提交文章与 `replies` 参数；管理界面与提醒系统无法展示文章卡片；并发 3 路渲染窗口易卡顿触发风控；部分 X Article 链接会被直接判为无效链接。 | ① 「登记下载」小窗增加极简模式切换：`🎬 视频`（默认）/ `📄 文章`（选中文章才展示 `回复数` 输入框，默认 `2`）；② 共用「X视频管理」窗口与每页 8 条分页，文章卡优先用首图/首视频首帧（无媒体用 📄 占位），操作按钮为 `📖 打开`（系统默认打开 `article.md`）、`📂`、`📦 归档`，提醒记录对应展示「首图/占位 + `📖 打开文章`」；③ 文章抓取独立限制为最多 1 路并发，页面渲染设短超时（如 2–3 分钟）；④ 扩展 `parseXUrl` 支持 `/i/article/<id>` 形态。 |
| **F4** | **中** | `REQUIREMENTS.md` 全文 L1–L55、L24、L36、L41–L48 | ① 缺少原样保留的用户原话与 `原`/`解` 来源标注（不符合 `FRAMEWORK_PREFERENCES.md` 第 3 节要求）；② `published_at`、`saved_at` 未明确按东京时间（`Asia/Tokyo`，`+09:00`）输出；③ 第 3 节的「风控/登录失效中止」无对应验收要点，且未定义文章中多张图片或内嵌视频**部分下载失败**的降级策略。 | 若一张配图网络失败就使整篇已抓取长文失败丢弃，极不合理；时区口径不统一也会与绯月全盘 JST 约定冲突。 | 并入 `docs/X_VIDEO_DOWNLOAD_REQUIREMENTS.md` 时补齐原话区与 `原`/`解` 标注；frontmatter 时间统一写带 `+09:00` 的 ISO 8601；补充「风控/登录失效立即中止并报错」「纯文字无图帖」「媒体部分失败时仍落盘 `article.md` 并在失败媒体位置保留原 URL 与告警说明」三条验收要点。 |
| **F5** | **中** | `REQUIREMENTS.md` 第 2 节 L19–L20、第 4 节 L43、L45 | ① `replies` 范围写死 `1-10`，无法只抓纯净长文/主贴不带路人回复（`0` 被拒绝）；② X 长推文默认折叠「显示更多（Show more）」，需求未明确自动展开点击，直接抓取会拿到截断残文；③ X 回复区底部常有折叠的「显示可能包含冒犯内容的回复」，未明确跳过。 | 无法纯存档文章本身；长推文内容容易被截断；若意外点开折叠垃圾区会把无关回复混入前 `N` 条。 | 建议将 `replies` 可调范围放宽为 **`0-10`（默认仍为 `2`）**；明确抓取主贴与前 `N` 条回复时自动展开其「显示更多」正文按钮，且**不展开**垃圾/折叠回复区。 |
| **F6** | **低** | `REQUIREMENTS.md` 第 3 节 L32–L33、第 5 节 L52–L55 | 第 5 节仍写着「当前工作区 `minitools` 中不包含该项目，待确认技术栈/目录/索引」；且第 3 节留了「除非现有视频下载强依赖 `meta.json` / `media/`」的未定尾巴。实际现有视频下载项目已在 `personal-digital-companion`（Electron + Node.js ESM）落地，仅在 `profile/x-video/state.json` 保存轻量面板列表索引，不需要文章目录内再建 `meta.json` 或 `media/` 子目录。 | 留在文档中会误导后续设计或开发阶段重新寻找仓库或摇摆目录格式。 | 删除第 5 节过时待对接项及第 3 节「除非…」悬置条件，直接明确合入绯月 `personal-digital-companion` 体系。 |

---

## 三、待用户确认的 3 个关键决策

1. **抓取载体**：是否确认直接采用**绯月内置 Electron 隐藏窗口 + 已导入加密 `x.com` Cookie**（零新依赖），取代另装 Playwright 或挂接本机外部 Chrome？
2. **目录与命名规范**：文章目录统一放 `F:\Xdownload\`（或 `F:\Xdownload\articles\`），目录名采用 `<名称>_<status_id>`（保留自由命名与 JST 精确到秒默认命名，同时按 `status_id` 去重），归档时整目录移入 `F:\Xdownload\archive\`，是否认可？
3. **纯净长文与覆盖策略**：`replies` 范围是否放宽为 **`0–10`（默认 `2`）**，以便传 `0` 只保存纯文章；以及对同一 `status_id` 再次提交（如调大 `replies`）时，选择**更新原目录**还是提示跳过？
