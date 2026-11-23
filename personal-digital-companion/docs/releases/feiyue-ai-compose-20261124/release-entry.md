## 2026-11-24 JST · 绯月本机 AI 简化与跨对话合并发布

用户原始要求是本机只处理简短描述和简单判断，由现有 DeepSeek 兜底，解除本机推理时限。随后要求把另外两个开发对话并入。本次验收覆盖本机推理取消和迟到回复隔离、复杂聊天或问答及公开查阅审核后补答、手记保留最多四件未处理事项、已登记措辞补齐和待确认流程。没有新建调度池。本机仍按已有资源队列处理任务，保留显式取消、模型装卸与正常任务状态。

发布目标为 Windows 正式安装 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion` 和配套 Cloudflare `subscriptions-api`。来源为 WebCharacter 开发目录及「确认模型 Token 长度限制」「排查转录未生效原因」的最新交付。准备时开发 Git HEAD 为 `03942463b3de924c380ae45a0c29a30bfbbee1c6`，工作树另有并行开发。按运行进程、登录启动入口和本机 REST 核实正式安装实例。以实际安装文件摘要为比较基线，在 `G:/selftool/WebCharacter/work/feiyue-local-ai-simplify-20261123` 保留 `before/`、`candidate/`、`windows.patch`、`windows-files.json`。32 项替换、5 项新增，清单 SHA-256 `9a049dd5788750c078048c7c84fabc94d0d47cfeaa7d500914f6dc86859994cb`，补丁 SHA-256 `c0c20377d5d8bdc1972192d41f0d39c3a14e83d6275097106e3ffa285b252e5b`。精确文件归属和前后摘要见清单。Worker 的生产基线、冻结输入和验证见 `api-worker/RELEASE_REVIEW.md`。

### 逐项变化和审核重点

- 本机任务原有推理等待上限被移除。请求主动取消后，迟到回复不得写回任务。保留基础资源调度、进程生命周期和任务日志。检查 `desktop/ai-execution-round.mjs`、`ai-request-queue.mjs`、`ai-workflow-model.mjs`、`balanced-local-model.mjs`、`local-model-process.mjs`、`local-model.mjs`、`local-vision.mjs`、`task-lifecycle.mjs` 及各调用点。
- 简单闲聊跳过复杂审核。普通复杂对话、问答和公开资料、新闻摘要在本机审核后按条件交 DeepSeek，补答最多使用五轮对话。检查对话线程、明细、公开查阅和新闻宿主，以及 `chat-deepseek.mjs` 和共享 `deepseek-client.mjs`。新闻现有编辑输出格式保留。
- 手记由 DeepSeek 优先按第一人称整理，最多四件未处理事项。本机、截图和附件历史补档走 DeepSeek 与自动转录。检查 `diary-audit.mjs`、`diary-deepseek.mjs`、`diary-narration.mjs`、`personality-diary.mjs`、`personality-nags.mjs`、`memory-archive.mjs` 及两处 `memory-refinement.mjs`。同时在配套 API 将追加上限从三件调至四件。
- 转录原先依赖本机提取候选，现按原句补齐明确登记请求，保留类别、规则及撤回语义。普通转录先本机分类，空结果、无效结果或符合既有超时条件时调用 DeepSeek 补拟。最终只生成待确认草稿。DeepSeek 调用时间、请求及响应在任务明细按既有加密机制存取。检查 `conversation-transcription.mjs`、`transcription-deepseek.mjs`、`task-traffic-log.mjs`、对话明细和构建产物的对应关系。
- 业务库迁移、现有数据回填、生产配置改动均无。桌宠重启时为 Electron 子进程传递已有 Windows 用户级 DeepSeek 配置。现有本机资料路径、登录入口、密钥和队列沿用。花园拟登记见同目录 `garden-review.md`，待实际发布结果和用户确认。

### 实测与待办

- 在隔离桌面候选运行 `node tools/build-desktop.mjs` 和 `node tools/test-desktop-shell.mjs`，均通过，重建对话 bundle 的摘要与冻结候选一致。合并回归发现裁剪旧批处理时误删共用的追问筛选规则，已恢复。`personality-memory.test.mjs` 29 项中 26 项通过，包括四件及追问规则。干净安装候选仍有三项旧用例未通过，一项要求未纳入的旧本机跨日批处理，两项需要桌面隔离树未挂载的网页和 TXT 接口。独立的 Workerd 已覆盖本次变更的手记写入接口。
- 在隔离桌面候选 `desktop-qa` 运行 `node --test --test-timeout=7000 --test-force-exit agent/tests/conversation-threads.test.mjs agent/tests/balanced-local-model.test.mjs agent/tests/diary-narration.test.mjs agent/tests/local-first-interaction.test.mjs agent/tests/memory-archive.test.mjs agent/tests/news-briefing.test.mjs agent/tests/registration-ai-log.test.mjs agent/tests/registration-flow.test.mjs agent/tests/task-log-reader.test.mjs`，118 项通过、0 项失败、1 项真实供应商联调跳过。模拟云端采用已发布 Worker 同版的 JST 时分种子，修正了旧桌面测试夹带的日期限定。该种子未进入本次桌面清单，无生产模板更新。
- 在发布包运行 `pwsh -NoProfile -File ./install.ps1 -Mode Preflight`，核对正式路径、进程和登录入口，37 项基线、8 个既有 SQLite 库完整性通过，检查时无执行中任务。运行 `pwsh -NoProfile -File ./install.ps1 -Mode Rehearse`，隔离验证中途失败恢复和全量恢复通过。上述命令未安装或重启正式桌宠。
- 延后处理真实 DeepSeek 完整手记的质量验收、24 条历史样本复放，以及遗留项清理后的连续两轮自审。既有八项本机 REST 测试在当前沙盒网络条件下未通过验证。合并后真实模型及人工场景、线上效果、独立第三方审核均待完成。Access 受控线上效果待用户截图。

### 发布、恢复与状态

待用户明确授权后，先按 Worker 根目录审核记录发布并核对版本、流量和绑定。再重新核对正式安装前像与活动状态，执行 `pwsh -NoProfile -File ./install.ps1 -Mode Install`。完成后核对新进程、资料目录、本机 REST、37 项文件摘要和业务状态，再由用户验证实际交互。正式安装失败时恢复受影响文件和原进程。若联合发布须撤回，先恢复桌宠，再恢复 Worker 生产基线并核对可能已存在的第四件事项。

当前仅准备候选，正式部署与安装待确认。花园按实际结果编制精确清单和 SQL ，确认后一次登记。实际发布版本、东京时间、后检、登记回执及相关 Git 提交和远端核对待补记。
