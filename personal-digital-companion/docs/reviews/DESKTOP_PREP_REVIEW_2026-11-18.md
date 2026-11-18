# Windows 宿主准备复核

2026-11-18（JST）。状态：源码准备完成，待用户同意新增Electron依赖；没有第三方审核。

## 依据与范围

原话“还行，动画资源后面再说，可以开始后续工作了”，与V1.5 M0展示/穿透/托盘、共享渲染代码要求对照。保留动画当前状态，不把这句话视为Windows壳/M0全部验收或M1启动授权。

已读规则、候选取舍与实现解释详见 `desktop/README.md`；本次不改变既有四状态/工作剪辑，不开发其他业务。Git基线仍为 `9ccdf3a147c302ca23092d9596d4958db28f6719`，无关工作区改动不处理。

## 实际产物与检测

新增 `desktop/{package.json,main.mjs,shell.mjs,preload.cjs,index.html,style.css,renderer.mjs,README.md}`、`tools/{build-desktop.mjs,run-desktop.mjs,test-desktop-shell.mjs}`。package.json无依赖声明，未安装或下载任何新依赖。

- 环境检查：Node/npm存在，Electron/cargo/rustc未找到；WebView2 Runtime目录存在，dotnet没有SDK。Tauri未做实际spike，不宣布最终选型。
- 官方文档查阅：BrowserWindow透明窗、setIgnoreMouseEvents穿透和forward、Tray、隔离安全规则；官方发布页可查electron45.3.4。计划固定此版本，安装待许可。
- `node personal-digital-companion/tools/build-desktop.mjs`：通过，资源写入忽略的 `output/desktop-bundle`；共享TS擦除类型后复用，基准/托盘图与六片段本地映射完成。
- `node --check` 对shell.mjs、renderer.mjs、preload.cjs执行：通过；启动器后续加入清理ELECTRON_RUN_AS_NODE环境变量，仍须安装后实际验证。
- `node personal-digital-companion/tools/test-desktop-shell.mjs`：通过。注入最小Electron替身，执行真实shell实现，检查透明无框参数、Node隔离、初始穿透、来源与类型校验、角色命中切换、托盘工作/显隐/退出、隐藏停轮询、禁止网络/导航/权限及退出清理。
- `node personal-digital-companion/tools/test-four-states.mjs '绯月四状态测试_循环修正版.html'`：通过，原状态核心与页面生命周期回归无退化。
- `node personal-digital-companion/tools/run-desktop.mjs`：未启动，明确输出“Electron尚未安装。按CLAUDE.md需用户先同意新增依赖”。不是可运行验证成功。

shell.mjs SHA-256：`DC6EA293F5BFD4FE22CC1702B805D701D27A1D3B005806771C929017424B0BBC`。
renderer.mjs SHA-256：`3A4B5BC555D88EBC28958BD3211B5C8E9055C396C64F43DC52F565CE0F38A7F9`。

## 第一轮复核与停止

需求对照：共享核心未重写，平台能力放桌面壳；后台隐藏停绘制，托盘独立可操作；没有因动画待改而停滞，也未扩展窗体攀爬、Agent、自动启动或复杂框架。最简检查保留必要IPC和状态回归，未引入额外依赖。

源码/模拟执行范围无残留阻断，首轮停止；实际运行被“新增依赖先经用户同意”的明确规则约束。本次只提供具体可审查的源码及安装方案，不将依赖缺失说成实现已通过实机验证。

补充安装前检查发现根仓库仅忽略根node_modules，尚未覆盖desktop子目录；已先向用户报告并在独立项目.gitignore加入 `/desktop/node_modules/`。`git check-ignore personal-digital-companion/desktop/node_modules/electron/index.js` 复查已命中。没有实际安装依赖。

## 未验证与风险

- Electron真实运行、透明无黑底、鼠标命中/穿透时序、DPI、托盘图标、离线冷启动、CPU/内存/GPU基线：全部未执行。
- 50ms光标采样和渲染回报可能产生短暂穿透切换延迟，需实测；不要把单元/模拟执行结果当成原生Win32效果证据。
- Electron额外运行时占用未经测量，Tauri未对照运行，不能承诺低功耗达标或已完成M0-01双候选验证。
- 本地资源表包含全量编码数据，视频按需解码；实际启动负载未测。不额外创建预热池。
- 未部署、提交/push、安装依赖、修改系统或用户登录会话。测试资源保留在忽略output，动画待后续处理。

用户许可后执行固定版本的项目内安装及真实验证；未许可前停止安装阶段，已授权源码准备与留痕完成。
