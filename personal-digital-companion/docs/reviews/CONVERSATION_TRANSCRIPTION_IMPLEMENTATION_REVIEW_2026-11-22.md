# 绯月关窗转录实现复核

2026-11-22 JST，开发版已接线，待用户确认。对照[原始需求及追加变更](../../REQUIREMENTS.md#2026-11-22-jst--普通对话登记提案)和[短链路设计](../DESIGN.md#短链路和固定输出)。基线为 `codex/workspace-checkpoint-20261120`、HEAD `067bfd570ef4e74136241c8e4dc98f6b26a3f267` 加当时工作区的专聊与转录资产。按文件和本次增量复核，保留工作区其他改动。

## 实现范围

- `desktop/screen-question-host.mjs` 和 `conversation-transcription.mjs` 将本窗口的新发言归入同一会话，关窗后入本机队列。阶段输出、候选以及确认状态保存在本机 SQLite，正文走 Electron `safeStorage`，列表按独立摘要读取。重新启动可恢复未完成作业。超时或生成失败显示待重试。
- `shell.mjs`、`task-lifecycle.mjs`、`balanced-local-model.mjs` 和 `local-model.mjs` 接入正式工作及跨阶段模型占用。首次模型调用选档，随后在同一会话继续。普通模型调用等到会话释放。绯月正常退出或重启会等待已开始的转录完成。
- `task-inbox.*` 在本机任务列表展示原作业与检查结果，复用月印标题栏。通知和列表打开同一份清单。支持逐项、全选生成和全不生成，逐页保留选择。
- `registration-flow.mjs` 为已确认的一批保存原提交号，继续使用旧登记链和业务回执。目录读取仅在确认后执行。Worker 侧新增资源分类目录的可选读取能力，更新日级提醒模板允许已支持的 JST 时分。实时目录缺项、时刻过期或旧模板无法接收时，清单保留并显示原因。未改主站安装或数据库。
- 转录 Skill 更新至 1.2。加入原话引用核对和明显情形的确定性补提。普通对话归档继续提供给绯月的自主手记，用户的登记确认与绯月自主取材各自执行。

## 三轮复核

| 轮次 | 发现及处理 |
| --- | --- |
| 1 | Windows 受限进程启动 Electron 时被 AppContainer 拒绝，改用权限审查通过的隔离运行命令。真实模型第一次归纳返回空数组，清单没有候选。增加短来源编号、用户原句核对和明确行为、委托的补提。 |
| 2 | 真实模型能识别并拟出兴趣网址，但归纳先前漏给原话编号，候选被宿主校验丢弃。给明确兴趣或项目想法补来源，并按类型过滤字段，清除未经用户提供的感想、ID 和分类。模型原始摘要与草稿仍由本机处理。 |
| 3 | 确认回执改用真实登记链和隔离 Worker，证明勾选范围；补回归证明同一批次重放不重复写入。在没有转录的旧桌面流程中避免多余的异步等待，原退出断言恢复。核对深浅色窄窗口、类型、依赖、模板与进度，检查本机首屏只读取摘要。 |

## 实际验证

- 在绯月目录执行 `node tools/build-desktop.mjs` 和 `node tools/test-desktop-shell.mjs`，通过。
- `node --test tools/test-conversation-transcription.mjs agent/tests/balanced-local-model.test.mjs agent/tests/registration-flow.test.mjs agent/tests/personality-memory.test.mjs`，51 项通过。包含跨阶段竞争模型请求排队、一次会话保持同档、时分与分类预检、同号复用及旧登记回归。
- 以项目 Electron 运行 `tools/run-electron-check.mjs tools/test-conversation-transcription-electron.mjs`。三个合成用户轮次，实际气泡关窗到清单可读取 **25.584 秒**。Qwen3.5-4B Vulkan，加载 4.230 秒，归纳 2.773 秒、拟稿 16.909 秒、复核 1.446 秒。记录到一次模型就绪。清单包含个人日记、运动、提醒、资源各一条。确认前没有登记请求，勾选运动和提醒后只发一条任务链，隔离 Worker 返回两项业务回执。日志为 `output/transcription-e2e.stdout.log`。
- 隔离运行 `test-panel-titlebar-electron.mjs` 和 `capture-menu-panels-electron.mjs` 的浅深色截图。使用 `test-conversation-transcription-electron.mjs --mock` 及 `--mock --dark` 检查转录清单和勾选操作，截图保存在 `output/transcription-review-light.png` 与 `output/transcription-review-dark.png`。
- `git diff --check` 和修改模块语法检查通过。原有模拟标题栏警告与新版 Electron `safeStorage` 同步 API 弃用提示仍在运行日志中。

## 结论及未验收范围

普通文本链路开发版通过，测试所用会话低于十分钟。模型归纳的结构化输出曾漏项，本次对明确句型使用宿主校验及补提。更长、含混会话的提取质量及已占用设备的总耗时待后续数据覆盖。原图登记继续走既有图文登记入口；自主手记整篇精简仍沿用对应独立设计范围。未安装或重启 Windows 正式版，未访问受控线上页面，未作生产目录写入、服务部署或 Git 推送。正式目录类别以及线上提醒时分能力须在其适用发布阶段核实。
