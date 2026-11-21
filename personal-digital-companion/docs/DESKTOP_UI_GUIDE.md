# 桌宠界面开发说明

本文指导绯月桌宠右键菜单与弹出窗口的后续开发和修改。2026-11-21 JST 按此规范整理了右键菜单、全部菜单面板、问绯月气泡、此刻所想和消息框。新增或修改界面时，先读本文，再动手。

总原则沿用 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`：单人自用、最简实现、紧凑、少文字多图标、动效始终开启、时间显示东京时间。

## 1. 范围

| 界面 | 文件 | 说明 |
| --- | --- | --- |
| 托盘 / 角色右键菜单 | `desktop/menu-layout.json`、`menu-popup.mjs`、`menu.*` | 自绘菜单窗口，条目和点击仍来自原生 Menu |
| 本地复盘 | `desktop/conversation.*` | 对话、任务复盘、提醒检查、提醒、待确认、任务日志六个页签 |
| 绯月任务管理 | `desktop/task-inbox.*` | 本机执行中、云端未结束两个页签 |
| 今日任务 | `desktop/reminder-review.*` | 逾期、今天、长期计划、不可改动四组 |
| 三地天气 | `desktop/weather.*` | 每地一张卡片 |
| 新闻简报 | `desktop/news-panel*`、`news-layout.mjs` | 月印窗体内使用纸色报面、宋体报头、分栏线；报道按内容配版，点击后在本栏展开 |
| 轮询设定 | `desktop/poll-settings.*` | 每个轮询一张卡片，带开关 |
| 随口登记、询问与确认 | `desktop/registration*.html`、`registration.css` | 共用样式 |
| 消息框 | `desktop/message-box.*` | 透明无边框，`fy-compact` 紧凑标题栏 |
| 问绯月气泡 | `desktop/screen-question.*` | 透明气泡外形；本地变量 `--paper` 等只是 `--fy-*` 的别名 |
| 此刻所想 | `desktop/scene.*` | 绯月主动发起的念头卡片和回应框 |

以下界面不按本文改动：

- **节点配置**：`settings.html` 和 `sound-settings.html`，使用 `fy-workbench`，功能尚未定型，暂不改动。
- **系统文件选择器**：沿用系统外观。

## 2. 菜单

菜单结构写在 `desktop/menu-layout.json`。每一项只能引用 `desktop/shell.mjs` 中 `menu()` 的 `actions` 已有动作。`menu-layout.mjs` 负责校验，改文件后热加载生效。

当前结构：

```
问绯月
提醒（N 条未读）          ← 有未读时才显示
接着解释上次的事          ← 有待续念叨时才显示
──
今日任务
三地天气
本地复盘
──
任务 ▸        提醒检查 · 待执行（有排队时） / 绯月任务管理 / 中断任务与补传 / 任务日志 / ── / 恢复本机任务终端 ID
日记与评价 ▸  看绯月写日记 / 补写本机任务执行评价
桌宠动作 ▸    （原样）
设置与维护 ▸  动画与声音 / 轮询设定 / 登录启动 / 云端连接 / ── / 重启绯月
──
隐藏 / 退出
```

规则如下：

1. **常用入口放第一层。** 每天会打开的窗口直接放第一层，不藏进子菜单。目前包括今日任务、三地天气和本地复盘。
2. **有事时才出现。** 提醒、待执行检查、待续念叨通过动作返回 `false` 隐藏，不显示灰色的空入口。
3. **层级最多三层。** 维护、低频和危险操作放在子菜单末尾，用分隔线隔开，例如恢复终端 ID、重启。
4. **改名要同步引用。** `desktop/interaction-skills.mjs` 的 `menuGuidance` 根据菜单文字自动生成“托盘右键 → …”的指引。改名或移动后同时处理以下几处：
   - 搜索 `skills/*/source/SKILL.md` 中写死的菜单路径。技能文本有版本管理，能不动路径就不动。例如「任务 → 提醒检查 · 待执行」因此保留在「任务」下。
   - 更新 `tools/test-desktop-shell.mjs` 中的菜单标签断言和 `agent/tests/screen-question-host.test.mjs`。
   - 更新 `desktop/README.md` 中的入口说明。

### 自绘菜单

Windows 原生菜单无法设置样式，正式入口（`desktop/main.mjs` 传 `htmlMenu:true`）改用自绘菜单窗口：

- **数据仍是原生 Menu。** `shell.mjs` 的 `menu()` 照旧用 `menuTemplate` 建 `Menu`，自绘窗口（`desktop/menu-popup.mjs`）只读取它的条目来显示。点击时按可见条目的下标路径找回原 `MenuItem` 并调用 `item.click()`，勾选项的切换、`menu-will-show` / `menu-will-close` 的刷新与空闲计时都和原生菜单一致。
- **打开方式。** 角色右键和托盘右键都会打开它。托盘不再设置原生右键菜单；自绘窗口打不开时退回 `tray.popUpContextMenu`。测试默认不传 `htmlMenu`，沿用原生菜单。
- **外观。** 月印抬头、图标列、分组 `›`、分隔线渐隐，子菜单在原位展开（同层只展开一个），向上展开时底边保持在鼠标处。没有子菜单的长文字有悬停提示。
- **图标和强调写在 `menu-layout.json`。** `"icon"` 填一个字符（一般是 emoji）；`"tone"` 可选 `"hot"`（梅紫加粗、带呼吸点，用于未读提醒、待执行检查）或 `"danger"`（悬停变红，用于重启、退出）。原生菜单忽略这两个字段。
- **键盘与关闭。** 支持 ↑ ↓ 移动、→ 展开、← 收起、Esc 关闭。失去焦点或选中条目后自动关闭。
- **注意。** 隐藏窗口会迟到一个 `blur` 事件，所以只在菜单确实显示时才把它当作关闭；关闭后迟到的尺寸消息也不会重新弹出菜单。

## 3. 页面骨架

```html
<!doctype html><html lang="zh-CN" class="fy-panel"><head>…CSP…
<link rel="stylesheet" href="feiyue-surface.css">   <!-- 先共用 -->
<link rel="stylesheet" href="xxx.css"></head>        <!-- 后页面私有 -->
<body>
<header class="fy-titlebar"><div class="fy-caption"><h1>标题</h1></div>
  <button id="refresh" class="fy-icon" aria-label="刷新" title="刷新">↻</button></header>
<nav class="fy-bar">…页签 / 筛选 / 日期…</nav>
<main class="fy-scroll">…列表…</main>
<footer class="fy-foot">…主操作…</footer>
<script type="module" src="xxx-ui.mjs"></script></body></html>
```

- 建窗统一使用 `desktop/panel-window.mjs` 的 `createPanelWindow`。标题栏只保留一行，Windows 窗口按钮由原生覆盖层提供，详见 `AGENTS.md`。
- 新页面在 `desktop/source-updates.mjs` 的 `pages` 中登记依赖的样式，构建和热加载才会带上它。
- 页面私有 CSS 只写布局和本页特有元素。颜色、按钮、卡片、徽标统一使用下面的令牌和组件，不再写 `Canvas`、`AccentColor` 或自定义色板。

## 4. 设计令牌（`desktop/feiyue-surface.css` 的 `:root`）

| 令牌 | 用途 |
| --- | --- |
| `--fy-paper` / `--fy-surface` | 页面底色 / 卡片、输入框底色 |
| `--fy-ink` / `--fy-muted` | 正文 / 次要文字、时间 |
| `--fy-line` | 边框、分隔线 |
| `--fy-accent` / `--fy-on-accent` | 梅紫主色（选中、主按钮）/ 主色上的文字 |
| `--fy-gold` | 细金线、悬停边框、空状态月亮 |
| `--fy-soft` | 主色淡底，用于提示条和选中行 |
| `--fy-ok` / `--fy-warn` / `--fy-danger` / `--fy-info` | 状态色：完成 / 等待或推延 / 失败 / 进行中或发送 |
| `--fy-radius` | 卡片圆角 10px |

所有颜色都用 `light-dark()` 同时定义浅色和深色，随系统主题切换，不需要另写深色样式。

## 5. 组件

组件都限定在 `.fy-panel` 内，不会影响节点配置页。

| 类名 | 用法 |
| --- | --- |
| `.fy-bar` | 标题栏下的工具条，可放页签、筛选和日期。`.grow` 或 `.fy-grow` 占位推右 |
| `.fy-seg` | 胶囊分段页签。按钮写 `data-icon="💬"`，文字包在 `<span>` 中；选中态用 `aria-pressed="true"` 或 `aria-selected="true"` |
| `.fy-icon` | 28px 圆形图标按钮。处理中设 `aria-busy="true"` 或 `disabled`，图标自动转圈 |
| `.fy-list` + `.fy-card` | 卡片列表。左侧色条由 `data-tone` 决定，可选 `ok`、`warn`、`danger`、`info`、`accent`、`muted`；`style="--i:n"` 控制入场错峰 |
| `.fy-head` | 卡片首行：标题单行省略，右侧放徽标和时间 |
| `.fy-chip` | 状态徽标，颜色跟随所在元素的 `data-tone` |
| `.fy-dot` | 未读呼吸点 |
| `.fy-meta` | 11.5px 灰色元信息，使用等宽数字 |
| `.fy-clamp` | 最多显示 3 行，完整内容放在展开区或详情中 |
| `.fy-section` | 分组小标题，右侧带渐隐细线 |
| `.fy-pager` | `‹ 1 / 3 ›` 分页 |
| `.fy-empty` | 空状态：浮动月亮加一句短文字 |
| `.fy-toast` | 淡主色提示条，内容为空时自动隐藏 |
| `.fy-caret` | 折叠箭头 `›`，`details[open]` 时旋转 |
| `.fy-foot` | 底栏，主按钮靠右 |
| `.primary` | 主按钮，使用梅紫实底。一个界面最多一个 |

状态到色调的映射在各页脚本中按文字判断，例如 `conversation-ui.mjs` 的 `statusTone`、`task-inbox-ui.mjs` 的 `tone`：

- 失败、错误：`danger`
- 未执行、中断、等待、忙、跳过：`warn`
- 已检查、完成、成功：`ok`
- 其余：`info`

## 6. 记录类列表

用户多数只看最新几条，所以记录类列表按以下规则展示：

1. **由新到旧。** 第一页就是最新的记录。
2. **分页切换，不无限追加。** 翻页替换当前内容，按钮为 `‹ 较新` 和 `› 较早`。

   | 列表 | 每页条数 | 分页方式 |
   | --- | --- | --- |
   | 对话、任务复盘 | 6 | 当天数据一次读入，前端只为当前页建 DOM（`showLocal` / `drawLocal`） |
   | 提醒检查、提醒 | 8 | 主进程 SQL 分页（`desktop/reminder-checks.mjs` 的 `PAGE`） |
   | 任务日志 | 12 | 从文件尾部倒读（`desktop/task-traffic-log.mjs`），前端保存游标栈以便回到较新页 |

3. **首屏只渲染当前页。** 缩略图通过 `IntersectionObserver` 在进入视口时才读取。任务报告、原图、任务链节点等在展开或点击时才读取。
4. **摘要收拢。** 列表每条最多 3 行，标题单行；对话卡片折叠，展开后显示答复。
5. **改变筛选或日期时回到第一页。**

非记录类的工作清单（今日任务、云端待接取任务）需要完整看到，可以使用「加载更多」。

## 7. 动效

- 动效始终开启，**不要**写 `prefers-reduced-motion` 判断。
- 可复用的动画有 `fy-rise`（卡片入场，0.3s，按 `--i` 错峰 35ms）、`fy-pop`（页签选中）、`fy-spin`（刷新）、`fy-pulse`（未读和进行中）、`fy-float`（空状态月亮）。按钮按下统一缩放到 0.95。
- 时长保持在 0.15–0.3s，循环动画只用在表示“进行中”或“未读”的小元素上。
- **透明无边框窗口**（消息框、气泡、右键菜单）只做透明度动画，不对内容做 `transform` 动画。透明窗口加上 transform 动画，在 offscreen 渲染下会偶发 `UnknownVizError`，已在 `message-box.css` 实测。

## 8. 文字与图标

- 页签和工具按钮优先使用图标，名称放在 `title` 中。窄窗口（≤560px）下，未选中的页签只显示图标。
- 说明文字最多一行，例如轮询设定只保留一句规则。能用开关、徽标、颜色表达的，不再写文字，比如不写“已启用”。
- 时间用东京时间：列表里只写 `HH:MM:SS` 或 `M/D HH:MM`，不写 `JST` 后缀；跨天、计划时间等需要明确的位置才写完整时间加 `JST`。

## 9. 验证

```powershell
node tools/build-desktop.mjs
```

```powershell
desktop/node_modules/.bin/electron tools/capture-menu-panels-electron.mjs
```

```powershell
desktop/node_modules/.bin/electron tools/capture-menu-panels-electron.mjs --dark
```

```powershell
desktop/node_modules/.bin/electron tools/run-electron-check.mjs tools/test-panel-titlebar-electron.mjs
```

- 截图巡检（`tools/capture-menu-panels-electron.mjs`）使用隔离 profile 和模拟数据，打开全部菜单面板，截图到 `output/menu-qa/`。改样式后逐张对照浅色和深色两套截图。
  - 该入口会捕获巡检脚本及其依赖的加载错误，向标准错误输出诊断并以退出码 1 结束。其它开发巡检可用上面的 `run-electron-check.mjs` 启动，把最后一个路径换成目标脚本，并在其后追加原参数。
  - 截图窗口必须真实显示：工具把窗口放在屏幕外并以非激活方式显示。隐藏窗口不会推进动画、过渡和重绘，截出来的画面会失真，比如卡片透明、选中色滞后。
  - 主题在打开面板前设定，所以浅色和深色各运行一次。
- 标题栏测试（`tools/test-panel-titlebar-electron.mjs`）检查浅深色、360px 窄窗、按钮避让和无横向滚动。
- 截图巡检也包含问绯月气泡、此刻所想、询问与确认和消息框。前三个不接预加载，只核对静态外观。
- 右键菜单：`tools/test-menu-popup-electron.mjs` 用当前 `menu-layout.json` 核对展开、点击、勾选、Esc，并截 `menu-*.png`；`tools/test-menu-shell-electron.mjs` 核对角色和托盘右键在真实桌宠壳中打开自绘菜单并执行原动作。
- 同时运行 `node --test "agent/tests/*.test.mjs"`、`tools/test-screen-question-electron.mjs` 和 `tools/test-message-box-electron.mjs`。
- 开发工作区的改动不会自动进入已安装的桌宠，安装流程见 `AGENTS.md`「本机桌宠功能更新」。

## 10. 改动自查清单

- [ ] 使用 `.fy-panel`，`feiyue-surface.css` 在页面私有 CSS 之前引入
- [ ] 没有引入新的颜色常量或系统色，状态色走 `data-tone`
- [ ] 记录列表由新到旧并分页，没有一次渲染全天
- [ ] 详情、图片、子节点按需读取
- [ ] 浅色和深色截图都已对照，窄窗无横向滚动
- [ ] 菜单改名已同步 `menuGuidance` 测试、桌面壳测试、README 和技能文本
- [ ] 新增菜单项写了 `icon`，需要强调的写了 `tone`
- [ ] 节点配置页（`settings.html`）未受影响
