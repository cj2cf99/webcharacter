## 本地复盘

展开「对话」中的提问即可查看「错误记录」。每次请求失败时先保存东京时间、耗时、问答类型、失败环节和错误码；有 HTTP 响应时记录状态，有合法 Cloudflare Ray ID 时一并记录。即使自动重试成功，首错仍保留在最终答复下。记录随对话一起加密，旧版仅保存最终提示的历史沿用原文。

右键绯月或托盘，选择「任务 → 本地复盘」，再选东京日期。「对话」显示每次提交和全文，手动重试单列；未取得最终答复会显示处理状态。提问气泡中的「对话记录」打开同一窗口。「任务」按时间列出任务名称、操作、结果和编号，登记与提醒还会显示实际内容或到期时间。云端回执延后核实时，以核实时间列出，回执带有登记时间时在详情注明。

问答文本和来源使用系统加密，保存在当前 profile 的 `conversations.sqlite`，截图不落盘。任务数据保存在同目录的 `tasks.sqlite`，其中的任务正文和操作详情可由有该文件读取权限的人读取。已有本机执行明细可以回看，旧版未记录的对话与操作无法还原。

## 本地开发热加载（2026-11-20 JST）

旧进程需要重启一次载入文件监听。之后保持绯月运行，直接编辑以下文件。

| 改动 | 操作与生效时机 |
| --- | --- |
| 所有面板的原生标题栏 | 编辑 `desktop/panel-titlebar.json` 调整按钮高度、底色及浅深色图标颜色。保存后原窗口直接更新，写错时沿用上次有效值。全部应用弹窗的月印、字体、渐变和边线由 `desktop/feiyue-surface.css` 统一控制，气泡和确认框使用紧凑版。 |
| 角色右键与托盘菜单 | 编辑 `desktop/menu-layout.json`。改 `label` 可改名，调整数组顺序可排序，用 `items` 分组，`hidden: true` 可隐藏。保留原 `action` 即可移动入口并沿用原动作。保存后再打开菜单。 |
| 本地行为、音量和屏幕锁定 | 编辑当前 profile 的 `pc-behavior-settings.json`，或使用原设置窗口。文件监听会校验后应用。运行中写错配置时保留上次有效值，修正后自动重读。 |
| 桌宠界面 | 编辑 `desktop/` 内的页面、样式和对应渲染脚本，或 `src/companion-player.ts`、`src/companion-state.ts`。样式在原窗口里更新。角色拖动和移动结束后才刷页面；设置页的动画草稿保存或重新读取后才刷。正在输入或显示回执的问答、登记和今日任务窗口可在关闭后重新打开以应用页面更新。 |
| 动画与声音 | 替换 `assets/desktop-media`、`assets/voice`、`assets/walk-20261118`、`assets/elevator-20261118` 或 `assets/attachment-human-20261118` 下已有映射的正式素材。已加载的片段继续播放，下一次播放或视频循环边界采用新文件。 |

构建产物位于 `output/desktop-bundle`。主进程逻辑、云端连接和资源目录映射的变更仍需重启，调整已有菜单动作的名称与位置可热加载。

## 问绯月与随口登记（2026-11-20）

角色右键和托盘均只保留「问绯月」一个对话入口。气泡默认自动区分问答和登记，也可以在输入框旁切换到「登记」。登记沿用 Win + H 听写、最多 6000 字、原链恢复与继续／跳过／停止。缺必要信息时点「补充登记」。天气、截图和日常问答沿用原接口。

每次只显示最近一轮。回复按字素截取，超过 50 个字时显示前 49 个字和省略号。点「看全部」打开本轮完整内容；「对话记录」默认显示东京当天，也能选择以前的日期。正文和来源以 Electron safeStorage 加密保存到本机 profile 的 `conversations.sqlite`，截图只留在当前请求内存。只有点击来源按钮才打开系统浏览器。

「上网查一下……」直接查 Yahoo! JAPAN 的公开搜索页面。普通问答在 Worker 给出无法解答的公开关键词后才查，关键词必须来自本轮提问文字。截图内容、登记原文和历史记录不作为自动搜索输入；缺关键词时请用户补充。来源页如改版或暂不可用，气泡显示可重试提示。更新桌面主进程需重启；问答的自动搜索提示需更新对应 Worker。

从「问绯月」输入登记内容，或用 Windows 听写（Win + H）生成文字。交给绯月后自动创建一条临时链、请求领取并登记，面板显示各项回执。重开面板可以恢复未完成链。恢复请求与操作号存于精灵 profile 的 `registration-submission.json`，隔离测试用临时目录。现阶段正式云端连接与自动配置仍待发布接入。

「任务 → 今日任务 → 长期计划 · 今日投入」显示本日派发的计划事项。填写实际投入（0–24 小时，支持小数）后点「登记投入时间」。绯月按提醒编号找到本人当天的主站派发，写入长期计划。刷新或重开后，已登记的条目显示主站保存的小时数，主站计划执行详情也可查看。选择其他提醒操作一并提交时，按钮显示「执行所选」。

「任务 → 任务日志」直接显示只读内容，按东京时间从新到旧查看请求、回执和本机事件。每页最多 40 条，点击「加载更早的日志」可继续读到上一份轮转日志，「刷新日志」显示新记录。AI 诊断保留各家供应商的结果、耗时与追踪号。日志在 2 MiB 后轮转。

托盘「设置与维护 → 云端连接」显示自动发布的 Worker 地址和认证方式，也可测试连接。发布的非密钥配置在 `release-connection.json`，已有 Access 凭据经 `tools/provision-cloud-access.mjs` 由授权发布流程注入 Windows 用户加密存储。旧 `task-config.json`、本机任务和素材继续保留。发布版优先使用已注入的 Access 凭据。

## 看屏幕问答（2026-11-18）

右键精灵或托盘，从「问绯月」打开同一气泡。默认发送文字；需要精灵查看画面时勾选「附上截图」。按钮和 Ctrl+Enter 使用同一设置，截图取采集时鼠标所在的显示屏。普通天气问题直接查天气服务。重试沿用原问题与提交方式，修改问题或切换勾选后重新提交。关闭气泡或隐藏精灵会取消请求并清除内存中的截图。

复用当前profile目录的task-config.json（base_url、api_token、api_prefix）；api_prefix为/api或主站集成后的/api/companion。修改配置后重启精灵。不在页面中输入或暴露令牌。问答不计入两项任务领取额度。接口见../docs/SCREEN_QA_API.md，复核见../docs/reviews/DESKTOP_SCREEN_QA_MAIN_REVIEW_2026-11-18.md。真实Cloudflare联调尚未执行，必须先有可用接口及视觉模型绑定。
# Windows 桌面宿主 · 安装前准备

2026-11-18 链式增量当前行为：每15秒只刷新清单，绝不自动领取；从托盘「任务 → 接取任务与任务链」显式选择。每终端最多两个已接取未结束任务，失败展开全链供继续/停止/跳过，强制接取新建轮次并保留终端切换历史。profile/chain-requests.json只保留尚待确认的操作，丢回执重试原请求。下方第九组自动执行已被覆盖。[链式设计](../docs/AGENT_CHAIN_DESIGN.md) / [接口交接](../docs/CHAIN_API_HANDOFF.md)。最终测试与审核状态见项目开发指南。

2026-11-18 第九组最新：有云端配置时，启动会登记原PC身份并立即获取可领取任务，扫描结束后每15秒再取；只执行已安装静态handler，默认清单仍为空。隐藏继续任务，退出确认暂停新启动、确认退出停止取任务。已有中断重做的新ID保留“继续执行”选择，不自动绕过。配置新增可选api_prefix：独立Worker默认`/api`，主站候选`/api/companion`；只是路径映射，主站Access机器通行仍待第十组。联合89项自动测试及三项桌面回归通过，未启动真实桌宠或部署。[任务获取交接](../docs/TASK_DISPATCH_HANDOFF.md)。下方第七组“不轮询”是当时范围，现仅新增取任务轮询，不是心跳。

2026-11-18 第七组非界面接线已完成：shell在启动时加载固定身份与本地任务库，退出前检查真实任务并二次确认；托盘“中断任务与补传”可重新处理遗留任务。仅用系统dialog，不改角色视觉。默认无业务handler，不轮询或自动派发任务。72/72 Agent测试及shell/priority/pc-settings回归通过，主会话第2轮复核通过；本轮未启动实际桌宠，Windows弹框效果未验收。[设计](../docs/AGENT_BATCH_07_DESIGN.md) / [审核](../docs/reviews/AGENT_BATCH_07_MAIN_REVIEW_2026-11-18.md)。

本机身份、tasks.sqlite和可选task-config.json放在已忽略的output/desktop-profile（自定义profile须由宿主管理）。配置格式为`{"base_url":"http://127.0.0.1:8795/","api_token":"替换为本地开发令牌"}`，此处仅占位，不是实际令牌；不将本机文件纳入Git。未配置时仍能查看本地中断并保存决定，云端同步明确不可用。沿用明文开发配置，不引入新认证或加密。主进程请求不将令牌交给渲染器，禁止重定向，固定超时；渲染器仍禁止外联。

可信主进程可显式调用shell.tasks.runTask(taskId)；默认agent/execution/handler-registry.mjs为空，具体任务需另行开发。退出确认终止执行线程不代表撤销已产生效果；下次启动由用户放弃/重做/稍后。重做新ID继承截止，不清零原尝试记录；已完成未回传只补传。本轮没有启动命令授权，既有启动方式不变。

最新状态（2026-11-18后续）：用户已允许安装，Electron45.3.4及运行包已装在本子项目；已看到真实透明角色并实际拖动换位。随后按要求完成性能基准与优化，当前以本地文件按需播放、小窗口副本、物理像素Canvas和减少重复IPC运行。下文“安装前/尚未安装”为历史准备记录，不代表当前状态。[性能结果](../docs/reviews/DESKTOP_PERFORMANCE_REVIEW_2026-11-18.md) / [待办](../docs/KNOWN_ISSUES.md)。

当前重建：`node tools/prepare-desktop-videos.mjs` → `node tools/build-desktop.mjs` → `node tools/run-desktop.mjs`（在独立项目根目录执行）。普通启动不采集性能；专用基准由 `FEIYUE_PERF_OUTPUT` 显式启用，运行自身待机/工作/隐藏后退出。

2026-11-18（Asia/Tokyo）。源码与本地资源已准备，Electron尚未安装，未启动实际桌宠。

用户最新要求：“还行，动画资源后面再说，可以开始后续工作了”。据此冻结当前v3四状态作为本轮开发基线，继续M0宿主；这不是M0全部验收或Agent阶段授权。

## 范围与依据

目标：透明无边框置顶小窗口、角色像素命中与背景穿透、托盘显示/隐藏/退出、复用现有四状态与共享TS渲染核心。本轮不打磨动画，不做窗口攀爬、多屏漫游、AI/云端、语音、自动启动或全套勿扰。

阅读：项目CLAUDE.md、原开发指南、独立项目状态及FOUR_STATES.md、锁定V1.5第9.3/10.1节、实施计划M0-01/03/04/05/06，重新查阅全局FRAMEWORK_PREFERENCES.md。先前项目/全局独立开发备忘录检索缺失记录继续有效，不虚构已阅读。

最简落实：保留 `src/companion-state.ts`、`src/companion-player.ts` 原文件，构建时只擦除类型；新增Electron原生宿主与有限IPC桥，不重写动画播放器，不建服务或插件框架。主站外壳、数据库等不适用于透明桌宠宿主。

## 环境与候选判断

- 本机已有Node.js 24、npm、WebView2 Runtime；dotnet仅运行时，没有SDK；未找到Electron、cargo或rustc。
- Electron可以直接复用现有Web渲染核心，提供透明窗口、setIgnoreMouseEvents与Tray，适合先做Windows最小验证。
- Tauri/WebView2仍是候选；本机缺Rust工具链，本次未安装或制作Tauri可运行spike。不能把Electron作为已完成双宿主实测后的最终选型，更不能宣称它资源占用更优。
- PySide原生渲染不符合共享Web代码首要标准，不在此轮另造渲染器。
- 参考官方：[窗口](https://www.electronjs.org/docs/latest/api/browser-window)、[鼠标穿透](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)、[托盘](https://www.electronjs.org/docs/latest/api/tray)、[安全约束](https://www.electronjs.org/docs/latest/tutorial/security)。

## 已准备的实现

- `shell.mjs`：默认右下角约243×360 DIP，透明/无边框/不抢焦点/置顶；初始穿透，基准图加载后显示。
- 用Electron的DIP鼠标坐标每50ms通知渲染器，Canvas实际Alpha判定人物区域后回报穿透开关；窗口外自动穿透。该机制仍需Win11/DPI/实际鼠标时序验证，不承诺逐像素无延迟。
- 托盘提供显示/隐藏、开始/结束工作、回到右下角、退出；隐藏暂停视频及位置轮询，退出清理IPC和托盘。
- 共享四状态完全复用当前v3素材，工作来源仍为工作三段2；动画细节不调整。
- `preload.cjs`：隔离暴露命中/就绪/事件订阅，不暴露Node或任意IPC；宿主校验消息来源主frame及布尔值。
- 本地资源运行，拒绝外联请求、远程导航、新窗口和权限请求；不修改系统设置、PATH或注册表，不自动注册开机启动。
- `build-desktop.mjs`准备本地包，`run-desktop.mjs`只检测并启动已安装的Electron，绝不会自动安装；清除继承的ELECTRON_RUN_AS_NODE，避免以Node模式误启。

## 需要用户同意的新增依赖

项目根 `CLAUDE.md` 明确：“新增依赖或构建工具先征求用户同意”。因此未加入devDependencies、未下载/安装Electron、未创建锁文件。`package.json`目前只定义本地脚本。

建议首轮安装固定版本 `electron@45.3.4`，官方稳定发布页已核对：[v45.3.4](https://releases.electronjs.org/release/v45.3.4)。这是本轮试验建议，性能与透明效果尚待实测。

拟安装位置仅为 `G:/selftool/WebCharacter/personal-digital-companion/desktop` 的开发依赖，安装必需传递依赖并下载官方Electron运行包；npm/Electron缓存也定向到本子项目忽略的output下。不全局安装，不引入Forge、打包器、Vite或Rust。

获准后再执行固定版本安装，生成锁文件，启动桌宠并核实真实透明/点击/托盘效果、离线行为及占用。此次明确许可前不运行安装命令。

## 当前可执行的检查

在独立项目目录：

```powershell
node tools/build-desktop.mjs
node tools/test-desktop-shell.mjs
node tools/test-four-states.mjs 绯月四状态测试_循环修正版.html
```

Electron安装完成后才可执行：

```powershell
node tools/run-desktop.mjs
```

实际运行/检测细节见 `../docs/reviews/DESKTOP_PREP_REVIEW_2026-11-18.md`。没有部署，本次无需创建发布审核文件或询问花园登记。

2026-11-18 声音后续：右键声音设置已接入12动画节点独立开关/音量/试听，保留总控制和旧配置兼容。按最新指令关闭基础及特殊待机，已保存并重启。统一中文台词使用指定elysia参考生成；见 ../docs/SOUND_SETTINGS.md 与节点声音复核。实际设置窗口/听感待用户确认。

2026-11-18 统一设置已真实接入本地PC：右键“动画与声音设置 · 本地 PC”，旧“声音设置”同入口。配置存output/desktop-profile/pc-behavior-settings.json，导入存media；构建不覆盖。动画保存立即应用，声音即时保存，重开/重启回读，明确云端未接入。原型URL不写桌宠。实测与限制见docs/reviews/PC_SETTINGS_REVIEW_2026-11-18.md（相对独立项目根）。

2026-11-18 Git检查点：当前在用动画、基准图和托盘图已归档到assets/desktop-media，语音保留在assets/voice。普通build-desktop从正式资源恢复，不依赖output中间产物；重做素材使用--from-intermediates。用户profile、缓存、node_modules和无关Agent开发不属于本次提交。
## 用文字修改提醒

在「问绯月」里输入“查询明天的提醒”“把周报移动到明天”或“把周报的时间改为下午三点”。点击气泡中的「待确认」，有多个匹配时先勾选一个或多个，点击「查看修改方案」。核对每项的原值和目标值后，可一次同意或放弃整组。查看清单后也可以关闭窗口，在气泡里回复“我同意”或“我不同意”。清单变化后须重新查看。

可以直接关闭窗口继续做别的事，从气泡或本地复盘再次进入「待确认」。本机加密保存选择和方案，各自从提出时起最多保留一小时。更新结果可在当天对话记录中查看。
