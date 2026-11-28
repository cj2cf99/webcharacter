# 交接记录：绯月抽卡（2026-11-28 JST）

用户原话：“先提交和push git，然后handoff”。接续时从本文读起；内容是当日快照，动手前核对仓库与安装版的实际状态。

## 1. 现在停在哪

**2026-11-28 13:21 JST 更新：已安装到正式版并重启**（回执见根目录发布审核 `RELEASE_REVIEW.md` 同名节末尾）。待办：用户实机验收（填密钥、试抽、高清、花费、回收站、气泡）与花园登记（清单需用户确认）。“加全部停止按钮”用户未决定。

下文第 3、6、8 节是安装前的快照，提交号与“未安装”等表述以发布审核为准。安装前功能代码最新提交 `aa6ca71`。

用户的时间要求（原话）：“就是奔着4天以内花光去的，而且我也只有晚上能用”（2026-11-28 提出）。

## 2. 功能一句话

绯月菜单「动画生成器 → 抽卡」：人物、服装、动作参考图加提示词（均可空），开关打开后每分钟用 OpenAI 抽一张低画质 1024 图；勾选的卡下一轮优先重绘为 2048 高画质；未勾选的可一键移到回收站。关窗后继续执行。

停止方法：关窗口里的开关停抽卡；排队的高清要到「挑卡」页取消勾选；已发出的请求停不了。

## 3. 仓库与提交

| 项 | 值 |
| --- | --- |
| 仓库 | `G:\selftool\WebCharacter`，远端 `cj2cf99/webcharacter`（**公开**） |
| 分支 | `codex/workspace-checkpoint-20261120` |
| 功能提交 | `b546400`，推送后回读远端一致；本文随后单独提交 |
| 未入库 | 根目录未跟踪文件 `=` 原本就有，不要动；`output/` 为检查产物 |

## 4. 入口

在 `personal-digital-companion/` 下：

| 内容 | 位置 |
| --- | --- |
| 需求（含用户原话与 R1–R21） | `docs/CARD_DRAW_REQUIREMENTS.md` |
| 详细设计 | `docs/CARD_DRAW_DESIGN.md` |
| 复核记录 | `docs/reviews/CARD_DRAW_{PROTOTYPE,PROTOTYPE_CHANGE,DESIGN,DEV}_REVIEW_2026-11-28.md` |
| 定稿原型 | `prototype/card-draw/index.html`（之后正式页面改过徽标颜色等，以 `desktop/` 为准） |
| 核心逻辑 | `desktop/card-draw.mjs`（不引用 Electron） |
| 宿主与页面 | `desktop/card-draw-host.mjs`、`card-draw-preload.cjs`、`card-draw.html`、`card-draw.css`、`card-draw-ui.mjs`、`card-draw-words.json` |
| 接线改动 | `desktop/shell.mjs`、`menu-layout.json`、`source-updates.mjs` |

## 5. 测试与最近结果

在 `personal-digital-companion` 目录：

```powershell
node --test agent/tests/card-draw.test.mjs
```

```powershell
node tools/build-desktop.mjs
```

```powershell
node tools/test-desktop-shell.mjs
```

```powershell
node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-card-draw-electron.mjs
```

```powershell
node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-menu-first-show-electron.mjs card tray drop-first
```

单测 12/12，桌面壳、抽卡 Electron、标题栏、菜单检查、菜单首击 4 种组合通过。Electron 检查用假接口和临时目录。

全量 Agent 测试要加 `--test-force-exit --test-timeout=45000`，否则多个文件不结束（超过 10 分钟）：

```powershell
node --test --test-force-exit --test-timeout=45000 "agent/tests/*.test.mjs"
```

结果 637 项：603 通过、27 失败、4 取消、3 跳过。31 项失败/取消在改动前代码（`git archive` 导出，同参数）上同样失败，本次没有新增失败项；这些既有失败未排查，按项目约定只记录。

## 6. 未验证

- 真实密钥出图、实际花费、组织验证。
- `gpt-image-2.6-sunburst` 是否接受 2048×2048（官方页面说法不一致；失败照实显示，不自动降级）。
- 三张参考图模型能否各按用途参考；带参考图的单张费用（此前口头估算的约 $0.006/张不适用）。
- 真实回收站、头顶气泡、真实拖放与剪贴板、动画观感。
- 不带密钥访问 `api.openai.com` 返回 401，说明开发当时本机 Node 可直连。

## 7. 待用户决定

1. 是否开始准备安装。
2. 是否加“全部停止”按钮（连高清队列一起停）。
3. 设计第 10 节的默认项：图片放系统“图片”文件夹 `绯月抽卡\`；审核拒绝计入连续 3 次暂停。这些随“开始开发”按文档实现，用户未逐项表态。

## 8. 接续安装时要做的

1. 按本项目 `AGENTS.md`「本机桌宠功能更新」：先核实实际安装目录与加载路径。
2. **以安装版为基线合入改动**，不要拿开发区的 `shell.mjs`、`menu-layout.json` 等整文件覆盖（会丢掉安装版独有的内容）。主程序、菜单与新增的 `card-draw*` 文件要一起更新后再重启：
   - 旧进程运行时只换 `menu-layout.json`：热加载因不认识 `cardDraw` 动作而失败，保留旧菜单，看不到「抽卡」。
   - 新菜单配旧 `shell.mjs` 启动：整个菜单退回只剩「重启绯月」「退出」。
   - 新主程序配旧菜单：正常启动，但没有「抽卡」项。
   - 页面样式与脚本依赖 `source-updates.mjs` 登记，构建产物要一并核对。
3. 在实际待发布目录写 `RELEASE_REVIEW.md`，取得用户本次确认。
4. 更新文件 → 退出绯月 → 等 5 秒 → 以独立进程启动（清除 `ELECTRON_RUN_AS_NODE`）。
5. 用户实机验收：无参考图一张、带参考图一张、高清一张（会计费），看花费显示。
6. 花园默认登记到「网页角色组件 → 绯月（桌面精灵）」，清单先给用户确认，再经重启后的绯月本机 API 提交。

## 9. 开发时要知道的事

- 默认会话拦截所有 http(s)，主进程请求用 Node 全局 `fetch`，不能用 `net.fetch`。
- 隔离实例（传了 `profile`）的图片写到资料目录下 `card-draw-pictures`，不碰系统“图片”文件夹。
- OpenAI 认证报错可能回带部分密钥，进日志前已打码，改请求代码时保留。
- `safeStorage` 同步接口在当前 Electron 有弃用提示（学习模块同样使用），升级时一起迁移。
- 代码里的模型与单价是 2026-11-28 官方页面的值：抽卡 `gpt-image-2.6-flare`，高清 `gpt-image-2.6-sunburst`。
