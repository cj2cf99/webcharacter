# 绯月本机服务器任务复核 · 2026-11-20 JST

用户要求从文字指令进入绯月本地 skill，关键词为“云端任务／服务器任务”。按已有模板在服务器创建目标为当前 PC 的任务，提交后由当前 PC 领取。用户指定 feiyue-interaction 总入口，并确认桌面接线和隔离验证，沿用提交前确认。

基线为 WebCharacter 工作树 HEAD `84688b8` 及本轮开始时已有的本地变更。本轮涉及 skills/feiyue-interaction、skills/server-pc-task、技能目录和开发指南、desktop 的文字分流、本地模型、服务器任务指令与任务宿主，以及 agent/tests/screen-question-host.test.mjs。仅更新本机应用；服务器协议、数据库和默认处理器清单均沿用现状。

第一轮：两个关键词通过问答宿主进入 PC 模板选择；隔离数据库验证取消后零提交、同号恢复、领取和回传。真实 Qwen 正确提取了目标文字，却自行添加了过期的任务领取截止时间，导致隔离任务无法领取。修正为由桌面端读取用户原文明示的任务截止时间，模型输出仅保留模板和参数或澄清问题。

第二轮：同一真实模型和同一条输入复测，本机确认框仅呈现回显模板、本机设备和原文“春天”。确认后，隔离 Worker 创建任务，真实桌面任务客户端领取，测试线程执行一次，任务库状态为 COMPLETED，回执值为“春天”。复核对照需求，确认查询不写入、目标限定本机、已有处理器过滤和原号恢复；本轮停止。

验证使用以下命令或入口。

- `python -B skills/catalog.py serverTask` 返回 server-pc-task 1.1。
- `python -B tools/test-skills.py` 通过 3 项。
- `node --test agent/tests/screen-question-host.test.mjs agent/tests/unified-conversation.test.mjs agent/tests/sync.test.mjs agent/tests/desktop-chain.test.mjs agent/tests/assistant.test.mjs` 通过 35 项。
- 使用项目 Electron 运行 `tools/test-panel-titlebar-electron.mjs`，退出码 0。
- 另以临时 Electron 验证脚本加载本机 Qwen3.5-0.8B、技能目录、实际客户端、隔离 Worker 与 SQLite，在临时 profile 中用 mock.unit 测试处理器完成上面的实机模型复测。

当前默认 PC 业务处理器表为空。真实业务需有服务器 PC 模板及匹配的本机处理器。用户正在运行的桌宠需在下次启动时加载主进程改动。线上业务及用户桌面实际效果待用户确认。

## 后续变更 · all 派发及隔离业务实写

用户明确任意电脑可抢 all，指定某台电脑的任务仅由该电脑领取。自动扫描间隔 15 分钟，仅在本机空闲时运行。只读回显供一般任务验收，本次业务验收要求在隔离运动库真实写入一条「躺平」。

首次使用原句和 Qwen3.5-0.8B 时，模型误选回显，确认参数断言阻止了提交。明确运动登记且给出引号正文的句式现在限定运动模板和正文，继续经模型、模板校验和原确认入口提交。复测使用两个隔离 profile 同时读取候选任务，一个成功领取且只执行一次，另一个领取收到 409。业务库、幂等回执和任务最终报告一致，服务端拒绝错误的运动业务回执。同号重放保持同一任务。任务库迁移 014 与 PC 模板种子需随服务端启用，高于本次隔离验收范围的生产部署未执行。

验证入口为 `tools/test-pc-exercise-electron.mjs`，隔离目录为 `output/pc-all-exercise-20261120`。Agent 回归 211 项通过、2 项跳过，技能目录 4 项通过，Electron 标题栏检查通过。同步本地 subscriptions-api 的任务相关差异后，其 33 项测试通过，集成入口读回同一任务及业务回执。
