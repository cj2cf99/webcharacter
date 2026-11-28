# 绯月抽卡 · 详细设计

状态：2026-11-28 JST 用户回复“开始开发”，开发区已实现，**正式版未安装**。依据[需求](CARD_DRAW_REQUIREMENTS.md)（下称 R 编号）。实现与验证见[开发复核](reviews/CARD_DRAW_DEV_REVIEW_2026-11-28.md)。

## 1. 参考依据

| 来源 | 本次遵循或回避 |
| --- | --- |
| `docs/DEVELOPMENT.md`「Windows 重启后菜单弹窗首击可见性」 | 用 `createPanelWindow` + `showPanel`，冷启动首击单独验收；不用定时重试或重新建窗掩盖 |
| `docs/DEVELOPMENT.md`「对话、摘要与待确认的开发注意事项」之“验证正式入口加载的文件” | 安装清单包含构建产物与新增运行文件，从正式菜单验收；该节其余内容针对对话语义，不适用 |
| `AGENTS.md`、`docs/DESKTOP_UI_GUIDE.md` | 月印标题栏、`fy-*` 令牌、动效常开、记录分页、`source-updates.mjs` 登记、菜单改名同步项 |
| `docs/KNOWN_ISSUES.md` | 无直接相关项 |
| 备忘录索引 `docs/TASK_TEMPLATE_PREVIEW.md` | 索引记录未发现独立的全局或桌宠设计备忘录；本次检索结果相同，记为缺失 |
| 全局 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md` | 单人最简、紧凑、JST、懒加载含失败重试、每页 20 |
| OpenAI 官方文档（2026-11-28 经抓取工具读取）：生图指南、images generate / edit 参考、错误码、价格、下线页 | 请求与响应字段、错误码、模型与价格；部分内容为摘要，标“待实测”的以实测为准 |

## 2. 架构与目录

主进程常驻一个调度器，窗口只是它的界面。无新增依赖、数据库或本机服务。

| 文件（`desktop/`） | 职责 |
| --- | --- |
| `card-draw.mjs` | 状态、提示词拼接、调度、请求、错误归类、花费、清理。不引用 Electron，时钟、`fetch`、目录、密钥存取、回收站由调用方注入 |
| `card-draw-host.mjs` | 建窗、IPC、`safeStorage`、`shell.trashItem`、气泡回调 |
| `card-draw-preload.cjs` | 暴露 `run(action,args)` 与 `onChanged` |
| `card-draw.html` / `.css` / `card-draw-ui.mjs` | 页面，由原型移植 |
| `card-draw-words.json` | 随机词库，每次抽卡时读取，改文件即生效 |

修改既有文件：

- `shell.mjs`：`attachCardDraw`；菜单动作 `cardDraw`；热加载窗口清单加 `card-draw.html`；气泡链在 `pollThought` 前加一条 8 秒的抽卡提示；`cleanup` 时关闭。
- `menu-layout.json`：「动画生成器」子菜单末尾加 `{"action":"cardDraw","label":"抽卡","icon":"🎴"}`。
- `source-updates.mjs`：`pages` 加 `card-draw.html`。
- `desktop/README.md`（入口说明）、`docs/DESKTOP_UI_GUIDE.md`（菜单结构）、`tools/test-desktop-shell.mjs`（子菜单标签断言）、`tools/test-menu-first-show-electron.mjs`（加 `card` 入口）。问答里的菜单指引由菜单文字自动生成，技能文本中没有写死本路径。
- 新增 `tools/test-card-draw-electron.mjs`：抽卡窗口隔离检查（交互与流程）。公共截图巡检 `tools/menu-panel-capture.mjs` 按项目约定纳入抽卡面板，浅色、深色各跑一次，含默认宽度与 360 宽。

测试与基准模式：`benchmark` 时不启动调度器；图片根目录与资料目录由调用方传入，目录到第一次保存时才创建，隔离测试一律指向临时目录，不碰真实“图片”文件夹。

## 3. 本机数据

不涉及 D1、KV。

| 位置 | 内容 |
| --- | --- |
| `<资料目录>/card-draw/state.json` | 开关、暂停原因、提示词、累计花费、卡片标记。临时文件写完后改名 |
| `<资料目录>/card-draw/refs/{who,wear,act}.png` | 三张参考图，文件在即该项有内容 |
| `<资料目录>/card-draw/key.bin` | `safeStorage.encryptString` 后的密钥 |
| `<图片文件夹>/绯月抽卡/抽卡/` | 抽卡图 |
| `<图片文件夹>/绯月抽卡/高清/` | 高清图 |

图片文件夹取 `app.getPath('pictures')`（解释，待确认）。文件名为保存时刻的东京时间 `YYYYMMDD-HHmmss-SSS.png`；高清图用自己的完成时刻，不含原卡信息（R13）。列表直接读目录，按文件名倒序，不建索引。

```json
{"on": false, "paused": "", "resumeOn": false, "prompt": "", "totalUsd": 0,
 "marks": {"20261128-213000-123.png": {"sel": true, "st": "queued", "after": 1795868000000}}}
```

- 只有勾选过的卡有标记。`st`：`queued`、`running`、`done`、`fail`。`after` 之前为可撤回期，勾选顺序即 `after` 先后。
- 取消勾选：`done` 保留为 `{sel:false, st:"done"}`，其余删除标记。`running` 不可取消。
- 启动时：`running` 改为 `fail`（R17）；文件已不存在的标记删除。状态文件损坏时改名保留，按默认值启动并显示提示。

## 4. 调度（R8、R9、R16、R17）

启动时设 `nextAt = 现在 + 60 秒`，1 秒定时器检查：

1. 有请求在途、已暂停、无密钥或未到 `nextAt` → 返回。
2. 取 `after` 已过且最早的 `queued` → 做高清。
3. 否则开关开着 → 抽卡。
4. 否则什么也不做。

真正发起请求时才把 `nextAt` 设为 现在 + 60 秒。请求超过 60 秒则完成后下一次检查即可开始下一轮。休眠后不补抽。关闭绯月时中止在途请求，不拦截退出。与本机模型任务互不占用。

暂停：记原因和原开关值，开关置关。“继续”恢复原开关值并清零失败计数；点失败卡的“重试”会重新排队（无撤回期），处于暂停时同时继续。任一成功也清零失败计数。

气泡（R19）沿用头顶提示窗：绯月隐藏或处于工作模式时不显示，暂停原因在抽卡窗口里常驻。

## 5. 外部接口

基址 `https://api.openai.com/v1`，`Authorization: Bearer <key>`，JSON 请求，Node 全局 `fetch`（与 `cloud-connection.mjs` 一致；默认会话拦截 http(s)，不能用 `net.fetch`），超时 300 秒，`redirect:'error'`。

| 场景 | 地址 | 主要字段 |
| --- | --- | --- |
| 抽卡，无参考图 | `POST /images/generations` | `model:"gpt-image-2.6-flare"`, `prompt`, `size:"1024x1024"`, `quality:"low"`, `n:1` |
| 抽卡，有参考图 | `POST /images/edits` | 同上，加 `images:[{image_url:"data:image/png;base64,…"}]`，顺序为 人物、服装、动作中存在的项 |
| 高清 | `POST /images/edits` | `model:"gpt-image-2.6-sunburst"`, `images:[原卡]`, 固定提示词, `size:"2048x2048"`, `quality:"high"`, `n:1` |

结果取 `data[0].b64_json`。高清提示词固定为：“按参考图原样重绘为高清版本：保持构图、人物、服装、姿势、配色和画风不变，只提高清晰度与细节。”

### 提示词拼接（R6）

按行拼接，仅含适用的行：

```
第1张参考图是人物，保持其外貌特征。          ← 有人物图
第2张参考图是服装，让人物穿这套服装。        ← 有服装图（序号按实际顺序）
第3张参考图是动作，参考其姿势。              ← 有动作图
人物：…／服装：…／动作：…                    ← 该图为空且提示词为空时，从词库各取一条
补充要求：<提示词>                            ← 提示词非空
画风：…；构图：…；光影：…。与参考图或补充要求冲突时，以参考图和补充要求为准。
```

词库为 `{who,wear,act,style,frame,light}` 六个字符串数组，每组初版约 12 条，内容为全年龄向。读不出时本次按失败计。

### 花费（R18）

`(文字输入×5 + 图片输入×8 + 输出×30) / 1,000,000` 美元。取 `usage.input_tokens_details.text_tokens`、`image_tokens` 与 `usage.output_tokens`；缺明细时输入全部按图片价。单价写在代码常量里（2026-11-28 官方价目页，两个模型相同）。累计值落盘，本次值只在内存。这是按单价的推算，以 OpenAI 账单为准。

### 错误归类（R3、R16）

| 返回 | 处理 |
| --- | --- |
| 401 | 删除已存密钥，暂停“密钥无效” |
| 403 | 暂停“无权限（可能需组织验证）”，附接口 `message` |
| 429 且 `error.type` 为 `insufficient_quota`，或 `error.code` 为 `credit_balance_exhausted`、`organization_spend_limit_exceeded`、`project_spend_limit_exceeded`、`organization_usage_limit_exceeded` | 暂停“额度不足或超限” |
| `error.code` 为 `moderation_blocked` | 本张失败，计入连续失败 |
| 其他 429、5xx、4xx、网络错误、超时、无图片数据、写盘失败 | 本张失败，计入连续失败；3 次暂停并附最后一次原因 |

高清失败的卡标 `fail`。日志只记路由、状态码、错误码和 `message`，不记请求头、提示词和图片。

### 密钥（R3）

填写后先放内存；第一次成功时写 `key.bin`。成功前重启需重填。系统加密不可用时只放内存，界面显示未保存。密钥只从页面单向传给主进程，状态快照只回传“无 / 待验证 / 已保存”。

## 6. 页面接口

IPC `card-draw:action`，仅接受本窗口发起；状态变化经 `card-draw:changed` 推送快照。

| 动作 | 参数 | 结果 |
| --- | --- | --- |
| `state` | — | 开关、暂停原因、密钥状态、倒计时、本轮类型、排队数、花费（本次、累计）、提示词、三张参考图地址、卡数与高清数、启动提示（如状态文件损坏） |
| `setPrompt` | 文字 | 停止输入约 0.7 秒后调用 |
| `setRef` | 槽位、PNG data URL 或空 | 写入或移除；超过 8 MB 或非 PNG 拒绝 |
| `setKey` / `power` / `resume` | 值 | — |
| `pick` / `retry` | 文件名（、是否勾选） | — |
| `list` | `cards` 或 `hd`、页码、当前列表上界文件名 | 本页文件名、时间、地址、标记、总数、新卡数 |
| `unchecked` | — | 当前未勾选卡的文件名，用于清理确认时清点 |
| `clean` | 确认时清点的文件名列表 | 仅处理其中仍未勾选的；返回移走数与失败数 |

文件名参数一律校验为上述时间戳格式。图片以 `file:` 地址给页面，`<img loading="lazy">`，不经主进程解码；参考图固定文件名，地址带修改时间参数，换图后不显示旧缓存。CSP：`default-src 'self'; img-src 'self' file: data:; object-src 'none'; base-uri 'none'`。

## 7. 界面

以定稿原型 `prototype/card-draw/` 为准。窗口默认 760×800，最小 360×480。移植差异：

- 去掉 🧪 演示控制、示意画和内存模拟；数据来自第 6 节接口。
- 原型的内联事件改为脚本绑定（配合 CSP）。
- 花费显示真实推算值。
- 清理移走失败时显示失败数，卡片保留。
- 页面数据读取失败显示“加载失败 / 重试”。

确认框和密钥框沿用原型的页内弹层，不另开窗口。

## 8. 安装与登记

开发区验证后按 `AGENTS.md`「本机桌宠功能更新」：以安装版为基线准备候选，写 `RELEASE_REVIEW.md`，取得本次确认后安装；含主进程改动，需退出绯月、等待 5 秒再启动。花园默认登记到「网页角色组件 → 绯月（桌面精灵）」，清单另行确认。无数据迁移；恢复方式为还原改动文件，本机图片和 `card-draw` 目录保留。

## 9. 开发验证计划

| 层次 | 内容 |
| --- | --- |
| `agent/tests/card-draw.test.mjs`（假时钟、假 `fetch`、临时目录） | 拼接与接口选择的输入组合；60 秒节奏、高清优先、不并发；撤回期；重启恢复；各类错误与连续失败；花费；首次成功才存密钥、401 删除、密钥不落状态与日志；清理只动清点且未勾选的文件、拒绝非法文件名 |
| 构建与既有测试 | `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs`、`node --test "agent/tests/*.test.mjs"` |
| 隔离 Electron（假接口） | 标题栏测试；截图巡检浅深色与 360 宽；真实选择、拖放、粘贴；菜单冷启动首击 |
| 用户实机（真实密钥，会计费） | 无参考图一张、带三张参考图一张、2048 高清一张；看花费、组织验证、直连网络、三张图是否各按用途参考 |

代理不使用用户密钥做测试。

## 10. 风险与未决

| 项 | 说明 |
| --- | --- |
| 2048 输出 | 参考页列出的任意尺寸型号不含 2.6，指南称支持；超过 2560×1440 像素量标为实验性。**待实测**，失败照实显示 |
| 网络 | Node `fetch` 不走系统代理；若本机需代理才能访问 OpenAI，首次实测会失败，再决定处理 |
| 费用 | 参考图输入费未知；退出时中止的请求仍可能计费且不计入显示 |
| 图片目录 | 默认系统“图片”文件夹，是否改到别处请确认 |
| 审核拒绝 | 计入连续失败，同一套配置反复被拒 3 次即暂停，请确认 |
| 磁盘 | 每小时最多 60 张，靠一键清理控制 |

## 11. 最简检查

一个调度器、一个状态文件、两个图片目录；不建数据库、缩略图缓存、重试队列、配置页或多服务商抽象。核心与宿主分两个模块只为能在不启动 Electron 时测试调度和错误处理。
