# 绯月菜单七罪周期头像复核

2026-11-22 JST。用户指定截图中菜单标题头像的位置，并要求用工具提示展示本周期的属性和强度。原话见[需求](../../REQUIREMENTS.md#2026-11-22-jst--菜单标题头像)。候选以 Windows 正式版的自绘菜单、情绪存储和原布局为基线。

## 实现

- `desktop/shell.mjs` 从既有情绪存储读取东京周的七面骰结果与当前情绪档位。每次打开菜单重新读取，复用 `inclinations` 的实际标签。强度取已保存档位绝对值，1～2 低、3 中、4～5 高。原七罪状态及强度结算沿用既有规则。
- `desktop/menu-popup.mjs` 与 `menu-preload.cjs` 沿菜单显示事件给渲染端传倾向与档位。`menu.html`、`menu.css`、`menu-ui.mjs` 在标题左侧渲染头像。资源复用 `assets/desktop-media/feiyue-faces/sins/`，同一时间只载入对应头像。悬停和键盘聚焦显示标题行里的提示。状态、档位或图片不可用时回到月印。
- 已查阅 `FEIYUE_EMOTIONS.md`、`DESKTOP_UI_GUIDE.md`、`TASK_TEMPLATE_PREVIEW.md` 备忘录索引及 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`。复用紧凑菜单和已有存储。按既有索引未找到独立开发设计备忘录。

## 三轮复核

1. 验证实际 SQLite 周倾向与七张对应头像。首次复测发现菜单重开后遗留焦点会影响悬停显示。重开时清理头像的上次焦点，保留 Tab 可查看工具提示。
2. 验证浅色和深色的「高强度色欲」、移开隐藏、键盘焦点、低强度及月印回退。截图发现浮层有遮挡首项的情况，改到标题行右侧。旧通用菜单测试的固定列表少了现有的「新闻简报」，在未修改的正式版隔离基线中复现。仅在隔离测试脚本中补齐既有标签。
3. `node tools/build-desktop.mjs` 完成并验证 16 张 PNG 与两条 WAV 实际进入桌面构建。隔离 Electron 从真实菜单窗口验证七种映射、强度变化、深浅主题、悬停和键盘提示，另核对提示的几何位置高于菜单列表。对照正式版和候选采用相同现行标签断言，两边均通过展开、点击、勾选及 Esc。结果和截图见 `work/feiyue-cycle-avatar/`。正式进程及生产资料未更改，未安装。
