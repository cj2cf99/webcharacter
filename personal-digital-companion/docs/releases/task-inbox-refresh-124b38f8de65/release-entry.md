## 2026-11-23 JST · Windows 绯月任务管理取消定时刷新 · 124b38f8de65

**用户需求及验收。** 用户报告任务管理里的卡片闪烁，确认不需要该自动刷新，并要求「不用检查，快速更新」。取消「本机执行中」每 1.5 秒的页面刷新，保留页面初次读取、切换页签、手动刷新及操作结果更新。任务后台继续运转。

**目标、来源及基线。** 只发布至 Windows 正式安装目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。现有安装审核记录的最近实装为 `44b422e8c3e2`。来源是 WebCharacter 子项目 `personal-digital-companion`，Git 基线 `03942463b3de924c380ae45a0c29a30bfbbee1c6` 加上述工作区单行变更。以实际安装目标文件的 SHA-256 和逐字节比较为准。包目录 `G:/selftool/WebCharacter/work/feiyue-task-inbox-refresh-20261123` 下保留 `before/`、`candidate/`、`windows.patch`、`windows-files.json`。清单 SHA-256 为 `124b38f8de652d042aef538d5011326a80168b02e10ef35cffb966480c4edebd`。

**文件与行为。** `desktop/task-inbox-ui.mjs` 及 `output/desktop-bundle/task-inbox-ui.mjs` 均移除末行 1.5 秒定时器。此前本机页反复重建卡片并播放淡入动画，现在等明确的读取操作再更新列表。审核重点是两个候选完全一致且各只删除同一行，以及右上角刷新仍可读取当前状态。

**数据、配置及兼容性。** 业务数据库修改、迁移、回填、配置修改、远端部署影响均无。沿用现有任务记录和 IPC。纯代码发布无需数据库备份。打开窗口期间的后台状态变化需手动刷新查看。

**实际验证和待办。** 上一轮开发构建 `node tools/build-desktop.mjs` 和 `node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-panel-titlebar-electron.mjs` 已通过。模拟转录状态变化时，等待 1.75 秒列表状态未变，手动刷新后显示新状态。浅深色截图及 `tools/test-menu-first-show-electron.mjs inbox pet` 已检查。按最新要求不重复运行功能测试。准备阶段仅确认安装文件和候选字节差异。正式版页面效果及独立第三方审核未执行。

**安装、风险及恢复。** 获明确许可后核对启动入口和实际进程状态，使用正常退出及原入口受控重启，只替换清单两件。核对实际进程和安装文件摘要作为安装回读。出现安装错误时用 `before/` 恢复对应原文件，通过原入口恢复运行。正式页面由用户自行观察。

**许可、花园与 Git。** 用户已要求快速更新。按全局规则，本记录落地后针对这两件明确确认安装。花园默认登记，具体清单、旧值及实际结果待核对确认，未写入。实际安装时间、回读、Git 提交与远端状态在发布后补记。
