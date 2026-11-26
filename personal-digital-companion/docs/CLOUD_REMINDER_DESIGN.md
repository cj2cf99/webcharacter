# 云端登记提醒 · 详细设计

日期：2026-11-26（Asia/Tokyo）。依据 [需求](CLOUD_REMINDER_REQUIREMENTS.md)。状态：设计已确认，界面已选定；未开发、未部署。

## 1. 依据与备忘录

| 查阅 | 适用条目与处理 |
| --- | --- |
| `G:/cloudflare/myapp/docs/design/development.md` | Node 通过不代表 workerd 通过：用双 Worker 本地预览验收；改入口须点击回归；Worker 请求不用 `redirect:'error'`（本设计不新增外部请求） |
| [DESKTOP_UI_GUIDE.md](DESKTOP_UI_GUIDE.md)、本项目 `AGENTS.md` | `createPanelWindow` 建窗、`fy-panel` 组件、记录列表由新到旧分页、菜单改动同步测试与指引 |
| `G:/selftool/recordanyting/docs/DESIGN.md`、`G:/selftool/resourceforlater/docs/DESIGN.md` | 页面改动先在来源子项目完成并实测，再接入主站；SQL 留痕与隔离迁移演练 |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | 无适用条目 |
| 全局 `FRAMEWORK_PREFERENCES.md` | 单人最简、不引入框架和队列、东京时间。未找到单独的全局开发设计备忘录 |

## 2. 链路

```text
浏览器专用页 ─┬─ 现有任务接口（经 myapp → subscriptions-api → 任务库）
              └─ 主站新接口 → 业务库（三类记录）
绯月 ── 现有自动接取 → 本地表
绯月 ── subscriptions-api /api/companion/cloud-note/close
          → COMPANION_HOST.closeCloudNote（myapp）→ 业务库
```

## 3. 开发前置：源码对齐

当前分支部分源码落后于线上副本，整套运行 `tools/sync-release-sources.mjs` 会覆盖线上较新的内容。

| 文件 | 现状 | 本功能处理 |
| --- | --- | --- |
| `web/chains.js`、`web/chains.css` | 停在旧版；线上等于提交 `118c90e` | 从该提交取回 |
| `agent/host/subscriptions.mjs` | 少一处 `myMainStorage: env.myR2` | 补上 |
| 其他有差异的文件（`reminder-review.mjs`、`memory-*.mjs`、`personality-memory.mjs`、`txt-files.mjs`、`tasks/actions.mjs`） | 与本功能无关 | 不改，只记录 |

接入时逐个复制本功能改动的文件，不运行整套同步。开工前重新核对差异。

## 4. 数据

主站业务库一个迁移（编号取接入时的下一个，目前为 0035），来源子项目各加对应的本地迁移：

```sql
ALTER TABLE reminders ADD COLUMN link_id TEXT;
ALTER TABLE rl_resources ADD COLUMN link_id TEXT;
ALTER TABLE ra_records ADD COLUMN link_id TEXT;
INSERT OR IGNORE INTO rl_categories(id,name) VALUES ('whimsy','奇思妙想');
```

分类名称唯一，已有同名分类时不新增。页面按名称选中两类记录的默认分类。

任务库在 `tasklist-pc.sql` 加一行类型 `pc.note.remind`（执行方 `pc`）。参数：`link_id`、`title`、`note`、`url`（字符串），`reminder`、`resource`、`record`（布尔）。`link_id` 等于任务提交号。

## 5. 主站

新模块 `agent/host/cloud-note.mjs`，接入到 `src/features/companion/vendor/`，页面脚本与样式为 `web/cloud-note.js`、`web/cloud-note.css`。鉴权、同源检查、启用开关与现有任务页一致。

| 入口 | 用途 |
| --- | --- |
| `GET /companion/note` | 专用页面 |
| `POST /api/companion/note-records` | 生成一类记录：`{link_id, kind, title, note, url, deadline?, category_id?}`，返回 `{id}` |
| `CompanionHost.closeCloudNote(input)` | 收尾：`{link_id, reminder, resource, record, feedback}`，逐项返回 `done`／`skipped`／`failed` 与原始错误 |

**生成**（`kind` 为 `reminder`、`resource`、`record`）：

- 先按 `link_id` 查原记录，已存在直接返回，保证重试不重复。
- 提醒调用现有 `handleReminders` 的新增，经 `env.companionInsert` 在同一批次补写 `link_id`。内容为说明与网址。
- 资源和随手记直接插入：资源为内容 ← 标题、备注 ← 说明、网址；随手记正文为三者分行拼接。
- 任何异常返回 `{error:{message}}`，内容是原始错误信息。

**收尾**（三项互不影响）：

- 提醒：查 `link_id` 且未完成的提醒，用现有 `handleReminders` 标记完成；查不到记 `skipped`。
- 资源和随手记：仅在 `feedback` 非空时处理。查无父节点的原记录；不存在记 `skipped`；已有带该 `link_id` 的子节点记 `done`；否则插入子节点，沿用原分类。

接入改动：`companion-entrypoint.js` 增加 `closeCloudNote`，`features/companion/page.js` 在任务页处理之前接上新模块。

**专用页面**：字段与默认值按需求第 2 节，「绯月本地提醒」显示为已勾选且禁用。分类用现有两个目录接口，设备用现有设备接口。提交顺序：

1. 领提交号，建任务。失败显示错误并结束；再次点提交沿用同一提交号。
2. 逐类生成。每行显示成功（带链接）或「步骤 · HTTP 状态 · 原始信息」加「重试」按钮。
3. 任务建成后提交按钮禁用。

现有页面改动：单条任务区加「登记提醒」入口（`chain-page.mjs`）；转发失败提示附上原始信息。

**按链接查看**：三个页面读取网址参数 `link`，作为列表筛选条件，列出原记录和反馈子节点。

| 页面 | 链接 | 改动 | 开发位置 |
| --- | --- | --- | --- |
| 事项提醒 | `/reminders?link=` | 列表接口加条件，页面带参数且查全部状态 | 主站 |
| 鱼与熊掌 | `/resources/?link=` | 列表接口加一组条件，页面带参数 | `resourceforlater` 后接入 |
| 随手记 | `/records/?link=` | `searchSQL` 加条件，页面带参数 | `recordanyting` 后接入 |

## 6. subscriptions-api（源码在 `agent/`）

- `subscriptions.mjs`：`POST /api/cloud-note/close` 转给 `COMPANION_HOST.closeCloudNote`，异常时返回原始信息。浏览器白名单不加此路径。
- `worker.mjs`：任务清单与模板总览不返回 `pc.note.remind`，通用建单、任务链选择和绯月「服务器任务」随之看不到它。浏览器调用领号和建任务出现意外错误时返回原始信息。
- `assistant/message.mjs`：任务提案目录排除该类型。
- `tasks/pc-types.mjs`：导出类型常量。

## 7. 绯月桌面

### 领取

`task-lifecycle.mjs` 仿照生图处理器登记 `pc.note.remind`（风险级 L1）：写本地表后返回 `{stored:true}`。同一任务号只插入一次。该类型不弹「自动任务汇报」。

### 本地存储与定时

`desktop/cloud-note.mjs`，库文件 `cloud-note.sqlite`，一张表：

`task_id`（主键）、`link_id`、`params`、`claimed_at`、`confirmed_at`、`feedback`、`closed_at`、`synced_at`。

| 状态 | 判断 |
| --- | --- |
| 待确认 | `confirmed_at`、`closed_at` 均空 |
| 待反馈 | 已确认，`closed_at` 空 |
| 已反馈 | 已关闭且有 `feedback` |
| 已过期 | 已关闭且无 `feedback` |

启动任务处理完成后执行一次，之后每 5 分钟一次：

1. 领取满 48 小时的未关闭记录置为关闭。
2. 对已关闭且 `synced_at` 空的记录收尾一次。
3. 有领取满 1 小时的待确认记录、没有在退出、本功能弹窗未打开且不忙时，写入全部待确认记录的 `confirmed_at`，弹出清单弹窗（见「界面」），唯一按钮「全部确认」。

提交反馈时检查记录处于待反馈、未超过 48 小时、内容 1 至 1000 字，写 `feedback`、`closed_at`，立即收尾。

**忙碌**：CPU 取 1 秒两次 `os.cpus()` 的差值；内存为 `1 - freemem/totalmem`；GPU 用现有 `readGpuLoad()`，读不到按 0。任一超过 60% 即忙。

**收尾**：过期时请求只带 `reminder`，有反馈时带全部所选类别。没有要处理的类别时直接置 `synced_at`。请求结束后无论成败都置 `synced_at`；进程中途退出则下次再发，由服务端查重。同一记录收尾进行中不重复发起。

### 失败

- 逐项失败或整个请求失败时，写任务日志（时间、任务号、`link_id`、对象、原始错误），并生成一条提醒项：正文写原始错误，`kind='cloud-note'`，`target_id` 记 `link_id` 与失败类别。
- 现有请求封装把网络错误换成固定提示，改为保留原因（`cause`）并写进上述内容；收尾请求超时放宽到 15 秒。

### 界面

- 弹窗：现有消息框增加可选的 `items`（标题、说明）并显示为卡片清单，带依次落下的入场动画；`message-box.mjs` 传递该字段，原生退回时用文字列表。不另建窗口。
- 「待确认」：本地复盘的「待确认」页签增加一个区块，列出待确认标题和「全部确认」。
- 右键菜单「待确认（N）」计入待确认记录；有待确认记录时点击打开该页签，否则行为不变。
- 单独页：新窗口（`cloud-note-host.mjs` 与页面文件），分「待反馈」「已结束」两个页签，各自每页 20 条、由新到旧；卡片显示剩余时间，待反馈项可展开输入反馈，已反馈项分开显示原说明与反馈。菜单项「云端提醒」，图标 🔖。
- 提醒页签：`cloud-note` 提醒项为每个失败类别显示一个链接按钮，由主进程打开主站链接。主站地址作为 `site_url` 写入 `release-connection.json`。
- 在 `source-updates.mjs` 登记新页面，`menu-layout.json` 加菜单项。

## 8. 开发与验证

| 步骤 | 验证 |
| --- | --- |
| 源码对齐 | 逐文件比对线上副本 |
| 主站模块与迁移 | 隔离 SQLite：生成查重、各类字段、收尾的完成／跳过／失败、提前完成不改完成时间 |
| 三页链接筛选 | 来源子项目测试与浏览器点击 |
| 订阅 API | 清单排除、收尾路由、原始错误 |
| 桌面 | 假时钟测试 1 小时、忙碌、48 小时、只反馈一次、失败提醒；Electron 截图浅深色与标题栏测试 |
| 联调 | `tools/release-preview.mjs` 双 Worker：登记 → 领取 → 确认 → 反馈 |

对应需求验收 A1 至 A8。部署顺序：业务库迁移 → myapp → subscriptions-api（含类型种子）→ 绯月安装版；旧版绯月没有处理器，任务保持待领取。迁移与发布按主站流程备份、审核并单独确认。

## 9. 最简检查

- 复用现有任务、自动接取、提醒接口、消息框、提醒页签、任务日志和 GPU 读数。
- 新增：业务库三列、任务类型一行、主站一个模块和一页、桌面一张本地表和一页。
- 不做：云端新表、重试队列、状态同步、通用扩展框架。

## 10. 界面选定

| 项目 | 选定 |
| --- | --- |
| 专用页面 | A 单卡纵排 |
| 弹窗 | B 卡片清单 |
| 单独页 | B 两个页签 |
| 菜单名称与图标 | 甲 🔖 云端提醒（用户未指明，按推荐） |
| 入口按钮、待确认区块、失败提醒项 | 预览中的唯一方案 |

预览已于 2026-11-26 生成：`prototype/cloud-reminder/`，运行 `node prototype/cloud-reminder/build.mjs` 后启动 `.claude/launch.json` 的 `cloud-reminder-preview`（http://localhost:8795）。选定结果待用户确认后写入本节。
