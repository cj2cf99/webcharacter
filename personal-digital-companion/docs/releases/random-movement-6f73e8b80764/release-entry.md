# Windows 本机发布审核 · 随机移动 6f73e8b80764

**需求与验收。** 用户要求「给绯月的随机移动加个开关，经常找不到人了」，随后要求「不用检查，快速跟新」。角色右键和托盘右键的「桌宠动作」应显示「随机移动」。旧配置默认开启，关闭时立即停止自动走动，重启后保持。重新开启从当前时间重新等待空闲。手动拖拽、移动到、回到右下角及特殊待机仍可用。

**目标与基线。** Windows 正式绯月，安装根目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。正式基线为 44b422e8c3e2，安装工作树 Git HEAD 39fd098，实际文件以安装字节摘要为准。已核实 REST v7、PID 15628、JST 09:49 启动、原资料目录、桌面快捷方式和 Windows 登录入口的目标一致。来源子项目为 `G:/selftool/WebCharacter/personal-digital-companion`，开发 Git HEAD 0394246 上的本次未提交改动。用 `git diff --no-index` 逐一对比下列四个正式版文件和开发文件，差异全部属于本次开关。候选与回退字节及逐文件 SHA-256 在 `G:/selftool/WebCharacter/personal-digital-companion/output/random-movement-20261123` 的 `manifest.json`、`candidate/` 和 `before/`。清单 SHA-256 为 `6f73e8b807643e13ec55f9fb2df2980fa91307f87cfbd126c127bc7e4f43348a`。

| 文件 | 旧行为与候选变化 |
| --- | --- |
| `desktop/menu-layout.json` | 只有手动移动入口，现于「回到右下角」后加入共享勾选项。 |
| `desktop/settings-store.mjs` | 在现有本机行为设置增加 `randomMovement`，兼容字段缺失的旧资料，经切换写入布尔值。 |
| `desktop/settings-host.mjs` | 共用现有保存与通知逻辑，主进程菜单可用同一入口保存，并处理文件重读。 |
| `desktop/shell.mjs` | 空闲移动受开关控制，关闭立即中止正在进行的自动路线。菜单同步勾选，手动动作路径保持原样。 |

**数据库、配置与兼容性。** 无业务库变更、迁移、数据回填、远端部署、依赖或快捷方式改动。只有用户操作开关时通过已有本机 JSON 写入设置，兼容旧资料。纯代码安装无数据库备份。回退旧代码后会恢复旧版的自动移动行为。

**实际验证。** 开发版已执行 `node tools/build-desktop.mjs`、`node tools/test-walk.mjs`、`node tools/test-desktop-shell.mjs`，通过。隔离 Electron 已执行 `tools/run-electron-check.mjs tools/test-menu-shell-electron.mjs --capture`（分别指定浅色和深色）、`tools/test-pc-settings-electron.mjs`、`tools/test-panel-titlebar-electron.mjs`，以及浅深色 `tools/capture-menu-panels-electron.mjs`，均通过并核对菜单截图。开发阶段首次菜单断言早于保存与渲染完成，修正等待时序后两色通过。依用户要求不重复功能测试。正式安装及正式菜单实操尚未发生。已知问题无。独立第三方审核未执行。

**安装与回退。** 重点审核四文件差异范围、旧资料缺字段、只停止自动路线及菜单入口一致性。确认后核对目标进程和四项基线摘要，通过应用的正常退出流程等待在途任务。在目标目录逐文件替换，再以原程序及参数启动。仅核实新进程、原目录、REST 就绪与安装摘要，不补跑功能测试。原实例未正常退出则不替换文件。更新或启动失败时，从 `before/` 恢复四文件并以原入口启动。最终补记安装版本、东京时间、实际结果及 Git 状态。

**授权与花园。** 用户已要求快速更新并省略重复检查。本审核完成后的本次正式安装确认尚待取得。按默认规则保留花园登记，拟归「网页角色组件 → 绯月（桌面精灵）」。具体清单需依据实际发布结果及线上现值制备后确认；当前无线上写入、SQL 执行或批次。成功版本从实际旧值加 0.1。Git 尚未提交或推送。
