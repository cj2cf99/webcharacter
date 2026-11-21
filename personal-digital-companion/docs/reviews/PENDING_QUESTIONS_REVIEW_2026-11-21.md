# 绯月主动确认实现复核 · 2026-11-21 JST

状态：待用户确认。开发验证通过，正式安装与云端发布待授权。

## 范围与依据

对照[用户原始需求和两次追加决定](../FEIYUE_PERSONALITY_MEMORY.md#2026-11-21-jst--绯月主动确认)、原七天手记设计、[界面指南](../DESKTOP_UI_GUIDE.md)和[备忘录索引](../TASK_TEMPLATE_PREVIEW.md)。比较基线为 Git `067bfd5` 与当前工作区中本次主动确认相关差异。工作区开始时已有语音、听写等在途修改，本轮保留其内容。

范围覆盖桌宠的手记质问、念叨、专题恢复、自主确认与场景发问，兼及日记悬念写入和服务端最终收笔协议。入口与队列在 `desktop/shell.mjs`、`personality-nags.mjs`、`diary-audit.mjs`、`pending-questions.mjs`。资料按需展示及续答走 `conversation-details.mjs`、`conversation-ui.mjs` 和现有问答气泡。排序及同步由 `desktop/personality-diary.mjs`、日记写作技能 1.4 和 `agent/assistant/personality-memory.mjs` 处理。无新表、依赖或配置项。

「所有确认」按用户所述主动提问场景落地。用户发起的登记授权和前台问答补充材料继续走相应业务流程。过往已登记的悬念保留编号、状态和原文，最多三条适用于新增和追加日记。为保证被引用的编号稳定，追加时保留已有悬念，并在剩余名额内择优。专题恢复及用户选择不记录的场景使用本机收笔。

## 复核发现与处理

| 轮次 | 发现 | 处理与证据 |
| --- | --- | --- |
| 1 | 中。旧链在显示问题前先写线上，长回答也先生成摘要。准备或摘要中断会留下线上半成品，或丢失已经提交的本机回答。 | 待确认仅落本机，原文先保存。隔离请求记录证明未答、拒绝、追问中和重启前后的不完整问答没有新增服务端行。终态回读同一编号及附件；离线重试同一条。 |
| 2 | 中。除了手记和念叨，场景、专题求助以及主动分享的输出都可能绕过队列直接提问。 | 接入同一队列。验证场景队列满时保留同一问题和画面，自主分享产生需回答的内容时只登记一条。专题复用原编号及恢复流程。 |
| 3 | 低。隔离 Electron 的两套主题中，等待和中断状态徽标的对比度不足。 | 等待使用信息色，中断使用提醒色。复查实际渲染、选择题目、稍后、文字答复、追问与拒答。 |

同对象按类型和编号去重；同一日记主篇与其中的某个悬念可分别排队。20 条上限与每次只生成一条均由隔离测试覆盖。旧时间限制已退出主动提问链路，10 分钟由原闲置轮询调度器控制，答题过程不计时。用 6 条合成候选验证排序结果为 5、4、3 分，低分和零分未登记，旧客户端追加无法新增第四个。

## 实际检测

- `node --test --test-timeout=45000 'agent/tests/*.test.mjs'`：完成全量隔离回归。沙箱的本机端口限制曾使四个既有花园 REST 测试返回 `EACCES`，获准在隔离模拟服务上复测通过。三项依赖外部配置的可选检查跳过。
- `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs`、`git diff --check`：通过。
- 隔离 Electron 运行 `tools/test-panel-titlebar-electron.mjs`、`tools/test-screen-question-electron.mjs --diary-audit`、`tools/capture-menu-panels-electron.mjs` 和加 `--dark` 的截图巡检：通过。待确认截图保留在 `output/menu-qa/review-pending-light.png` 和 `output/menu-qa/review-pending-dark.png`。
- 排序与问答链使用合成事实、模拟本机模型输出和临时 SQLite，未使用正式资料。真实模型评分质量、Windows 通知的实际送达、正式安装和线上 Worker：未执行。正式生效需要配套发布服务端版本和升级桌宠。仅验证了协议及流程，未宣称生产验收或第三方审核通过。

复核修改了本次代码、技能、测试及说明。生成的构建与截图位于忽略目录。生产数据、配置和安装目录未修改。
