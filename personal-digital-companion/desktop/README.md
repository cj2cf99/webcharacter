## 看屏幕问答（2026-11-18）

右键精灵或托盘，在菜单选择“看屏幕提问（头顶气泡）”打开头顶气泡，输入问题后，把鼠标移到目标显示屏，按 Ctrl+Enter 提交；按钮提交也以采集时鼠标所在屏幕为准。成功显示回答正文，长文滚动查看。临时失败自动重发一次，再失败可点“重试原图”；重新提交问题才重新截图。关闭气泡或隐藏精灵取消请求并清除内存图片。

复用当前profile目录的task-config.json（base_url、api_token、api_prefix）；api_prefix为/api或主站集成后的/api/companion。修改配置后重启精灵。不在页面中输入或暴露令牌。问答不计入两项任务领取额度。接口见../docs/SCREEN_QA_API.md，复核见../docs/reviews/DESKTOP_SCREEN_QA_MAIN_REVIEW_2026-11-18.md。真实Cloudflare联调尚未执行，必须先有可用接口及视觉模型绑定。
# Windows 桌面宿主 · 安装前准备

2026-11-18 链式增量当前行为：每15秒只刷新清单，绝不自动领取；从托盘“主动接取与任务链”显式选择。每终端最多两个已接取未结束任务，失败展开全链供继续/停止/跳过，强制接取新建轮次并保留终端切换历史。profile/chain-requests.json只保留尚待确认的操作，丢回执重试原请求。下方第九组自动执行已被覆盖。[链式设计](../docs/AGENT_CHAIN_DESIGN.md) / [接口交接](../docs/CHAIN_API_HANDOFF.md)。最终测试与审核状态见项目开发指南。

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
