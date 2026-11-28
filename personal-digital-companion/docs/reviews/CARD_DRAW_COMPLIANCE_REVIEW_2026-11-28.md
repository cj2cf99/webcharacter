# 绯月抽卡 · 独立复审与合规性检查报告（2026-11-28 JST）

状态：**待用户确认**  
结论：**有条件通过**（开发区代码、需求一致性、最简设计与项目规范合规性检查通过；正式版未安装，真实 OpenAI 密钥出图与实机回收站/气泡等尚未验证，需在安装阶段完成实机验收与 `RELEASE_REVIEW.md`）

---

## 1. 审核对象与范围

- **依据入口**：[HANDOFF_CARD_DRAW_2026-11-28.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/HANDOFF_CARD_DRAW_2026-11-28.md)
- **对照基线文档**：
  - 需求：[CARD_DRAW_REQUIREMENTS.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/CARD_DRAW_REQUIREMENTS.md)（用户原话 1–12 及 R1–R21、不包含项、验收要点）
  - 设计：[CARD_DRAW_DESIGN.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/CARD_DRAW_DESIGN.md)
  - 项目规范：[AGENTS.md](file:///G:/selftool/WebCharacter/personal-digital-companion/AGENTS.md)
  - 历史复核：[CARD_DRAW_DEV_REVIEW_2026-11-28.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/reviews/CARD_DRAW_DEV_REVIEW_2026-11-28.md)
- **代码与接线范围**：
  - 核心与宿主：`desktop/card-draw.mjs`、`desktop/card-draw-host.mjs`、`desktop/card-draw-preload.cjs`、`desktop/card-draw.html`、`desktop/card-draw.css`、`desktop/card-draw-ui.mjs`、`desktop/card-draw-words.json`
  - 接线与测试：`desktop/shell.mjs`、`desktop/menu-layout.json`、`desktop/source-updates.mjs`、`agent/tests/card-draw.test.mjs`

---

## 2. Git 基线

- **仓库**：`G:\selftool\WebCharacter`
- **分支**：`codex/workspace-checkpoint-20261120`
- **功能提交**：`b54640074d2fb3b8084ab8f50c415f1942532949`（`feat(desktop): 抽卡功能（开发版，未安装）`）
- **交接提交（当前 HEAD）**：`3bf0629`（`docs: 抽卡功能交接记录`）
- **工作区未入库状态**：`?? ../=`（仓库根原有未跟踪文件，未改动）

---

## 3. 审核方式

1. **文档与需求对照**：逐条核对 R1–R21、不包含项、设计第 1–11 节及交接文档第 1–9 节，验证实现无功能偏离或过度设计。
2. **代码与安全审查**：人工逐行审阅 `card-draw.mjs`、`card-draw-host.mjs`、`card-draw-preload.cjs`、`card-draw.html`、`card-draw.css`、`card-draw-ui.mjs` 及 `shell.mjs` 接线。
3. **合规性检查**：核对单人最简设计、月印标题栏与窗口规范、动效常开、东京时间（`Asia/Tokyo`）展示、懒加载与失败重试、CSP 与 IPC 隔离、密钥加密与日志脱敏。
4. **实测复跑**：在 `G:\selftool\WebCharacter\personal-digital-companion` 下独立复跑单元测试、构建、桌面壳测试、Electron 抽卡/标题栏/菜单首击测试，以及静态正则检索。

---

## 4. 实际执行的命令与原样摘要

| 命令 | 结果 | 原样摘要 |
| --- | --- | --- |
| `node --test --test-timeout=30000 agent/tests/card-draw.test.mjs` | 通过 | `tests 12 / pass 12 / fail 0 / duration_ms 410.95` |
| `node tools/build-desktop.mjs` | 通过 | `已从Git正式资源构建：G:\selftool\WebCharacter\personal-digital-companion\output\desktop-bundle` |
| `node tools/test-desktop-shell.mjs` | 通过 | 7 项 `PASS`（桌面壳、托盘、权限、导航、外联拦截等） |
| `node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-card-draw-electron.mjs` | 通过 | `PASS：抽卡窗口隔离检查，截图在 G:\selftool\WebCharacter\personal-digital-companion\output\card-draw-qa`（附 `safeStorage` 同步接口弃用提示） |
| `node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-panel-titlebar-electron.mjs` | 通过 | `PASS：七个面板通过深浅色、原生标题栏和热加载检查` |
| `node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-menu-first-show-electron.mjs card tray drop-first` | 通过 | `PASS card tray drop-first { created: 1, loads: 1, shows: 2 }` |
| 静态检索（`prefers-reduced-motion` / `localStorage` / `innerHTML` / 硬编码 `sk-` / 非 JST 时间格式化） | 通过 | 源码无违规命中（仅 `test-card-draw-electron.mjs` 断言页面 `innerHTML` 不含测试密钥） |

**未执行项及原因**：
- 全量 Agent 测试（`agent/tests/*.test.mjs`）：交接文档已记录既有 31 项失败/取消与本次无关；本次未重复全量跑批。
- 真实 OpenAI API 出图与计费、`gpt-image-2.6-sunburst` 的 2048×2048 实测、真实回收站（`shell.trashItem`）、头顶气泡实机观感：按规则代理不使用用户真实密钥，待安装后由用户实机验收。

---

## 5. 发现清单

| 编号 | 级别 | 类别 | 描述与证据 | 影响 | 建议 |
| --- | --- | --- | --- | --- | --- |
| C-1 | 低 | 边界/输入校验 | [card-draw-ui.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/card-draw-ui.mjs#L100) 校验 `^image\/(png\|jpeg\|webp)$`。部分系统拖放或剪贴板场景下 `file.type` 可能为空字符串，此时会直接拒绝并提示读不了。 | 极少数拖入/粘贴无 MIME 文件时会失败；有清晰错误提示，不影响已有图。 | 可保留现状，或后续按文件扩展名/直接交由 `createImageBitmap` 解码兜底。 |
| C-2 | 低 | 规范/截图覆盖 | [AGENTS.md](file:///G:/selftool/WebCharacter/personal-digital-companion/AGENTS.md#L13) 约定改完面板用公共工具 `capture-menu-panels-electron.mjs` 截浅深色图。当前由独立脚本 `test-card-draw-electron.mjs` 截图（设计第 2 节已说明原因），且浅色 360px 窄屏未单独截图（[开发复核](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/reviews/CARD_DRAW_DEV_REVIEW_2026-11-28.md#L71) 已记录）。 | 深色 360px 与浅色常规宽度均已验证，样式共用令牌，实际风险很低。 | 维持现状即可，必要时可在安装验收时目视确认浅色窄窗。 |
| C-3 | 低（提醒） | 安装与发布合规 | 当前仅在开发区提交，正式安装版尚未更新。交接文档第 8 节已明确需以安装版目录为基线合入，避免 `shell.mjs` / `menu-layout.json` 整文件覆盖导致旧进程与热加载菜单动作冲突。 | 若直接整文件覆盖或未同步重启，点击菜单「抽卡」将找不到 `cardDraw` 动作。 | 安装时严格按交接文档第 8 节与 `AGENTS.md` 执行：合入基线、写 `RELEASE_REVIEW.md`、取得用户确认、退出等待 5 秒后独立进程启动，并在验收后向 `http://127.0.0.1:8765` 提交花园登记。 |

### 合规性专项核对结果

- **需求一致性（R1–R21）**：全部对应实现，未擅自添加“不包含”列表中的功能（如多配置、Tag、图鉴、自动降级 1024 等），也未擅自增加未确认的“全部停止”按钮。
- **最简设计**：无新增 npm 依赖、无数据库、无缩略图缓存、无复杂状态管理框架；核心调度逻辑与 Electron 宿主解耦以便纯 Node 单测。
- **安全与隐私**：
  - CSP 限制为 `default-src 'self'; img-src 'self' file: data:; object-src 'none'; base-uri 'none'`。
  - IPC 校验了发送方 `webContents` 与 `mainFrame`；文件操作限定为 `^\d{8}-\d{6}-\d{3}\.png$`，无路径穿越风险。
  - 密钥仅在首次请求成功后经 `safeStorage` 写入 `key.bin`（`0o600`），401 时立即清除；错误信息对 `used` 及 `sk-*` 模式做了打码脱敏，不落盘进 `state.json` 或日志。
- **UI 与时区规范**：
  - 沿用 `createPanelWindow`、`feiyue-surface.css`、`fy-titlebar` 并在 `source-updates.mjs` 登记。
  - 动效常开（无 `prefers-reduced-motion` 关闭动效）；列表支持 `loading="lazy"`、骨架屏、空状态、失败提示与重试按钮。
  - 列表展示与文件名均使用东京时间（`Asia/Tokyo`，UTC+09:00）。

---

## 6. 审核结论

**有条件通过**：抽卡功能开发区实现与设计、需求、全局规范及项目约定高度一致，所有可离线执行的单元测试、构建及 Electron 集成检查全部通过。

**后续放行条件（安装阶段）**：
1. 确认待决事项（是否准备安装、是否新增“全部停止”按钮等）。
2. 以正式安装版为基线合入改动，编写 `RELEASE_REVIEW.md` 并取得部署确认。
3. 更新并受控重启后，使用真实密钥完成 1 张无参考图、1 张带参考图、1 张 2048 高清图的实机出图、计费与回收站验收，随后向本机绯月 API 提交花园登记。

---

## 7. 审核中是否改动及临时文件清理

- **代码与配置改动**：**无**。本次仅新增本审核报告 `docs/reviews/CARD_DRAW_COMPLIANCE_REVIEW_2026-11-28.md`。
- **运行产物说明**：执行 `build-desktop.mjs` 与 `test-card-draw-electron.mjs` 刷新了 `output/desktop-bundle/` 与 `output/card-draw-qa/`（均属本地检查产物，不入库），且 Electron 测试会在系统临时目录留下 `feiyue-card-*` 临时目录，未污染项目源码与用户真实图片目录。
