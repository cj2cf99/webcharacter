# 绯月 AI 调用入口盘点（2026-11-24 JST）

目的：为“短输入、短输出、判断/简单评价/初步审核留本地，其余统一走半岛 `deepseek-v4.1-flash`（`reasoning_effort:"low"`）”做整合前摸底。状态：待用户确认。本次只读代码，未改任何文件，未发送任何请求。

对照：用户原话（本轮）、`bandao_api_guide.md`。抽样阅读了下列文件，未逐个读完所有调用点的函数体，调用点清单来自全目录搜索，提示词长度来自 `skills/*/source/local-ai.json` 的实际统计。

## 1. 入口总览

| 类 | 入口 | 文件 | 现状 |
|---|---|---|---|
| A 云端直连 | DeepSeek 共用客户端 | `desktop/deepseek-client.mjs` | 唯一出口。`https://api.deepseek.com/chat/completions`，读 `DEEPSEEK_API_KEY`，含任务日志审计、密钥脱敏、超时、取消 |
| A | 对话回复（本地审核被拒后转云） | `chat-deepseek.mjs` `writeDeepSeekReply` | `deepseek-flash` + `thinking:enabled` + `reasoning_effort:low`，45 秒 |
| A | 手记整批成稿 | `diary-deepseek.mjs` | 同上，JSON 模式，10 分钟 |
| A | 对话转录补拟 | `transcription-deepseek.mjs` | 同上，JSON 模式，60 秒 |
| A | 公开问答 | `public-search.mjs` `askDeepSeek` | `FEIYUE_DEEPSEEK_MODEL` 可覆盖模型，`max_tokens:600`，未设思考参数 |
| B 本地大模型 | 队列与分道 | `ai-workflow-model.mjs`、`ai-request-queue.mjs` | `kindFor` 判定 judgment/review/draft/task，`laneFor` 分 main(4B/9B GPU)、assist(2B/0.8B CPU)、review、judgment；draft→check→finalize 多步，检查点加密落盘可续办 |
| B | 模型调度 | `balanced-local-model.mjs`、`local-model.mjs`、`local-model-process.mjs` | Qwen3.5 0.8B/2B/4B/9B，按 GPU 占用选档；会话提示词 `reviewPrompt`、`rewritePrompt`、`draftPrompt`、`responseInstruction` 内嵌在进程文件 |
| B | 视觉 | `local-vision.mjs` | 本机 llama-server 多模态，截图问答。DeepSeek 不收图，无法整合 |
| C 云端服务器 | 主站 Worker 供应商链 | `agent/assistant/provider-chain.mjs`、`agent/host/registration-ai.mjs`、`agent/assistant/cloudflare.mjs` | Cloudflare Gemma 问答，随口登记走 Sakura/OpenAI/DeepSeek 池，半小时心跳探测。由服务器维护，不属桌面本地接口 |
| D 非 LLM | ComfyUI 生图、语音转写 | `tools/comfy_job.py`、`bubble-voice-worker.py` | 不在整合范围 |

环境：本机用户变量 `bandao_api_key` 与 `DEEPSEEK_API_KEY` 均已存在（只检测是否存在）。

## 2. 按“留本地 / 上云”归类（建议，待你定）

### 留本地（短入短出的判断、简评、初审）

| 业务 | 位置 | 说明 |
|---|---|---|
| 行动补评、来源补评、短手记短评 | `diary-writing` `reviewAction/reviewSource/shortDiary`，`ai-workflow-model.mjs` `shortRating` | 已是 CPU 2B，原文≤120/240 字 |
| 手记悬念复核、悬念回答 | `diary-writing` `reviewThread/answerThread` | judgment |
| 支出分类、是否已说明、念叨开头检查 | `personal-conversation` `classifyExpense/explained`，`personality-nags.mjs` `diaryOpeningCheck` | judgment |
| 手记核对 | `diary-audit` `verify` | judgment |
| 候选图片挑选、学习脚本评分 | `public-search.mjs` `public-image-choice`，`study-host.mjs` `study-script-verdict` | judgment，短 |
| 各类“初审/复核”步骤 | `news-editorial` `reviewTitle`、`memory-refinement` `review`、`conversation-transcription` `review`(assist)、`interaction-work.mjs` 候选裁决(160 token) | kind=review |
| 视觉问答 | `local-vision.mjs` | 云端模型无图能力，保留 |

规则可直接沿用现有 `kindFor`：返回 `judgment` 或 `review` 的留本地，其余走云。

### 上云（统一到半岛接口）

| 业务 | 位置 | 备注 |
|---|---|---|
| 以上 A 类 4 条 | 见第 1 节 | 只需改出口与参数 |
| 普通对话、纠错重答、直连回答 | `local-model-process.mjs` hint=`auto/direct`，`screen-question-host.mjs` 571/613 行 | 现为本地 9B 起草→审核→重写，被拒后才转云。改后直接云端单次，本地审核链可删 |
| 新闻标题/摘要/风向/关键词/翻译 | `news-editorial.mjs`、`news-editor.mjs`、`news-panel-host.mjs` | 摘要已有“本地被拒转云”分支 |
| 记忆修订起草与规划 | `memory-refinement.mjs` draft/plan | 长材料 |
| 手记叙述、批量叙述 | `personality-diary.mjs` narrate/batchNarrate，`writeLargeDiary` | 复杂批次已走 DeepSeek |
| 念叨开头撰写 | `personality-nags.mjs` `diaryOpeningWrite` | |
| 情绪评估、主动发起 | `emotion-service.mjs`、`emotion-initiative.mjs`，`initiative-decision` | 输出较长，可议 |
| 好奇心、专题记忆综合 | `scene-curiosity.mjs`、`topic-memory.mjs` | |
| 转录整理/恢复/分类、对话线摘要 | `conversation-transcription.mjs`、`conversation-thread-replies.mjs` | |
| 联网摘要 | `public-search.mjs` `public-web-summary` | |
| 服务器任务规划、图像规划 | `server-task-command.mjs`、`image-tasks.mjs` | 图像规划是文本，可上云 |
| 专聊、互动工作、听写润色 | `private-chat.mjs`、`interaction-work.mjs`、`dictation-host.mjs`、`knowledge-runtime.mjs` | 见第 4 节隐私 |

## 3. 整合落点（最简方案）

1. 唯一出口仍是 `deepseek-client.mjs`：改端点为 `https://sub.bandaoapi.com/v1/chat/completions`、读 `bandao_api_key`、默认模型 `deepseek-v4.1-flash`、只传 `reasoning_effort:"low"`，删去 `thinking` 字段（指南未提及该字段）。审计、脱敏、超时、取消原样保留。四个云端入口因此自动切换。
2. 本地大模型的“主力道”入口接同一个出口：在 `ai-workflow-model.mjs` 的 `memory/work/analyze` 前按 `kindFor` 分流，judgment/review 走本地队列，其余调用 `requestDeepSeek`。调用方签名不变，不必逐个改业务文件。
3. 云端路径不再需要的部分：GPU 占用调度（`balanced-local-model.mjs` 主力档）、起草→检查→定稿多步循环、`local-model-process.mjs` 会话审核/重写循环。可在确认稳定后再删，先不动。

需同步改的测试断言：`agent/tests/conversation-threads.test.mjs:489`、`diary-narration.test.mjs:81`、`local-first-interaction.test.mjs:52` 校验旧端点和 `thinking` 字段；`README.md`、`docs/DEVELOPMENT.md` 的 DeepSeek 说明；任务日志里的“DeepSeek”标签可保留。

## 4. 需要你决定的事

1. 隐私边界。目前不少本地任务是因为内容私密才留本地（`knowledgePrivate`、`aiPrivate`、专聊、知识库、手记原文）。云端入口已有闸门（`mayShareChatMessage`、`publicQuery`、脱敏）。上云后这些私密类是否仍禁止外送，还是整合后一并放行？这是影响面最大的一项。
2. 离线/失败兜底。云端失败时是否回退本地大模型，还是沿用手记现有“留待办稍后续”。选后者可以删掉大量本地调度代码，更符合最简设计。
3. 公开问答现在是用户显式“问 DeepSeek”才发。整合后是否仍保持“显式才发”。
4. 服务器侧（类 C）是否一并改，还是保持现状。

## 5. 提示词改造方向（下一步）

提示词散在三处：`skills/*/source/local-ai.json`（13 个技能、约 19 KB）、各 `desktop/*.mjs` 内联常量（如 `chat-deepseek.mjs` 两段、`diary-deepseek.mjs` 一大段、`news-editor.mjs`、`scene-curiosity.mjs`）、`local-model-process.mjs` 的审核与重写提示。

上云的提示词当前为 0.8B–9B 模型调过：字数上限、JSON 语法约束、“自审/核对三遍”、分步骤的 check/finalize 话术。改写原则：单次调用，删分步与自审话术，输出用 `response_format:{type:"json_object"}` 加字段说明，保留人设、事实不编造、材料内指令无效等安全条款。留本地的判断类提示词不动。

## 6. 本次未做 / 未验证

- 未向半岛接口发请求，`deepseek-v4.1-flash` 是否接受 `thinking` 字段、`response_format`、`max_tokens` 未测。
- 未逐个核对每个调用点的 token 预算与超时。
- 未统计各路径实际调用频次，分类依据是代码与提示词长度，不是运行数据。
- 未修改任何代码、数据或配置；未提交 Git。
