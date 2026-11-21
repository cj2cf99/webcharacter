# AI 接口心跳轮询设定开发复核（2026-11-21 JST）

需求原文见 [REQUIREMENT_CHANGES.md](../REQUIREMENT_CHANGES.md)。用户先要求把 AI 接口心跳加到轮询设定，再明确默认频率为 3 小时。开发基线为 `ab3ac36`，比较范围为本次桌面调度、设置卡片和对应测试的工作区差异。

详细设计查阅全局 [FRAMEWORK_PREFERENCES.md](G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md)、项目 [TASK_TEMPLATE_PREVIEW.md](../TASK_TEMPLATE_PREVIEW.md) 的备忘录索引、[开发指南](../DEVELOPMENT.md) 和 [界面规范](../DESKTOP_UI_GUIDE.md)。索引与对应文档目录未找到独立的全局或项目设计备忘录。复用紧凑卡片、东京时间、原 SQLite 表及既有请求入口。首次启用按 180 分钟计时，保存间隔或恢复启用后重新计时。沿用上一轮在途则跳过的行为，所以新卡片只提供启用和间隔，无待执行排队。

## 第 1 轮复核

- 对照原话核对 UI、默认值和实际请求发出时机。`poll-scheduler.mjs` 保存并调度新条目，`poll-settings-ui.mjs` 复用原表单和 JST 格式，`shell.mjs` 与 `task-lifecycle.mjs` 复用既有心跳入口并移除原独立计时器。禁止并发、新请求避让退出、退出取消在途请求均有验证。云端模型选择、收费接口逻辑及手动轮询保持原行为。本机设置库只新增一条轮询配置，无结构迁移。
- `node --test tools/test-poll-settings.mjs agent/tests/pending-poller.test.mjs agent/tests/registration-ai-log.test.mjs agent/tests/provider-test.test.mjs`，38 项通过、2 项既有跳过。`node --test agent/tests/autonomous-idle.test.mjs agent/tests/diary-audit.test.mjs agent/tests/personality-memory.test.mjs agent/tests/screen-question-host.test.mjs`，49 项通过。`node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs`、`git diff --check` 通过。
- Electron 执行 `tools/run-electron-check.mjs tools/test-panel-titlebar-electron.mjs`，七面板、窄窗口、启停与保存后重开通过。运行 `tools/capture-menu-panels-electron.mjs` 及 `--dark`，人工查看两张轮询设定截图，180 分钟、开关、保存按钮和队列可正常显示。使用隔离资料和模拟服务。
- 未发现本次范围内残留问题，依规则结束复核。正式安装、真实供应商调用及用户验收未执行，待用户确认。
