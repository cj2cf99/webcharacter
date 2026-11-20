# 绯月桌面精灵项目约定

所有新增和修改的应用弹窗都沿用现有月印标题栏。正常面板通过 `desktop/panel-window.mjs` 的 `createPanelWindow` 建窗，页面使用 `feiyue-surface.css`、`fy-titlebar` 和 `fy-caption`，仅保留一行窗口标题。Windows 窗口按钮复用原生覆盖层，为按钮预留空间，业务控件可以独立点击。

头顶气泡和消息确认框保留透明外形与原有交互，同样走共用建窗入口，使用 `fy-compact` 紧凑标题栏。新页面在 `desktop/source-updates.mjs` 登记共享样式，确保构建与热加载均可用。文件选择器等操作系统提供的界面沿用系统外观。

修改后运行 `tools/test-panel-titlebar-electron.mjs`，核对浅深色、窄窗口、标题栏数量和按钮避让。
