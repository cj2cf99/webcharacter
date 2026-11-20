# 头部单击对话复核 · 2026-11-20 JST

用户原话：“让单击头部成为启动对话的启动信号，已经启动再单击头部是放弃对话，关闭气泡”。新约定已补入 REQUIREMENT_CHANGES.md。比较范围为本次增量，保留工作树内已有的任务、提醒与其他桌面功能变更。

对照既有菜单启动、主动关闭、空闲关闭保留草稿和 5 DIP 拖动约定，本次复用同一问答宿主与手动放弃路径。核对角色实际站姿、工作、坐卧、过渡和电梯素材，按当前显示素材映射头部区域，透明像素仍由原像素命中排除。头部区域数据在 desktop/screen-posture.mjs，点击识别在 desktop/configured-renderer.mjs，桥接和窗口操作在 desktop/preload.cjs、desktop/shell.mjs 和 desktop/screen-question-host.mjs。第三方自定义动画使用默认站姿头区；任意新造型的实际命中效果待对应素材确认。

首轮复核确认单击头部能打开菜单使用的同一个气泡，再次单击可关闭、丢弃未发草稿、取消等待中的普通问答；关闭后可再次打开。正文记录与已经提交的业务任务继续按原流程处理。复用了现有窗口和按需点击命中，未引入定时扫描画面或远端识别。通过后停止复核。

本地运行记录

- `node tools/build-desktop.mjs` 构建成功。
- `node tools/test-screen-posture.mjs` 通过缩放、镜像、坐卧过渡等命中检查。
- `node tools/test-desktop-shell.mjs` 通过拖拽、菜单、窗口和 IPC 回归。
- `node --test agent/tests/screen-question-host.test.mjs` 通过 9 项。
- 项目 Electron 执行 `tools/test-head-toggle-electron.cjs`：以隔离 profile、离屏窗口和模拟问答服务，向实际角色页面发送鼠标事件，验证点头打开、放弃草稿、菜单打开后点头关闭、取消在途请求、再次打开，以及点身体、点透明处和拖动不误触。
- 项目 Electron 执行 `tools/test-panel-titlebar-electron.mjs` 通过现有窗口标题栏回归。

当前运行的用户实例需要重启以载入主进程和 preload，用户桌面手感待确认。未进行远端发布。
