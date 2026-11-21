# 对话转录长消息复核

2026-11-22 JST。依据[原始需求和验收 C1、C2、C5、C10–C14](../../REQUIREMENTS.md#2026-11-22-jst--普通对话登记提案)、[短链路设计](../DESIGN.md#短链路和固定输出)及需求中指定的长消息样本。沿用 [任务模板设计](../TASK_TEMPLATE_PREVIEW.md) 的备忘录索引及 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md` 的最简原则。沿用同一作业和模型会话、既有登记模板和确认入口。无新增依赖、数据库迁移或安装配置。

| 复核轮次 | 结果 |
| --- | --- |
| 1 | 原版实测 19.877 秒，得到摘要但无候选。按段保留原发言时间和来源，空事项触发逐段补查，闲聊可明确跳过。 |
| 2 | 逐段补查认出候选，但通用拟稿再次生成无效格式。改为定类后直接套模板，集中复核。结果可读取，随手记仍夹带同段内容。 |
| 3 | 补查同时精简正文，原话保留在依据里。精简复测识别了晚餐事实，却把它归为常规事实。用识别出的用餐标题和原话的发生动作核对，补回吃喝专项。最终重测通过四类候选、日期、主要数量和十分钟目标。 |

## 实际验证

- `node --check desktop/conversation-transcription.mjs` 通过。
- `node --test tools/test-conversation-transcription.mjs agent/tests/balanced-local-model.test.mjs agent/tests/registration-flow.test.mjs agent/tests/personality-memory.test.mjs` 共 53 项通过。新增覆盖长消息空归纳、漏分吃喝、精简遗失数字时保留原句、随手记与同段其他话题分离及纯闲聊无候选。
- 通过 `tools/run-electron-check.mjs` 在隔离资料目录用实际 Electron、Skill 1.5 和 Qwen3.5-4B Vulkan 封存用户原文。模型载入一次，用时 5.290 秒，归纳 4.933 秒、逐段补查 14.000 秒、复核 1.512 秒。总计 **27.052 秒**，四项候选无待补字段，提醒日期取原发言东京时间的次日。写入适配器在复测中禁用，测试原文和临时资料未进入 Git。

## 边界与已知问题

本次计时从桌面转录的封存入口开始。物理关窗和勾选提交的界面验证沿用[上次隔离测试](CONVERSATION_TRANSCRIPTION_IMPLEMENTATION_REVIEW_2026-11-22.md)。本次覆盖的是三类事项均空时的补查，首轮归纳只漏一部分时仍依赖常规复核。精简仍可能把「基础问题不大」说成「基础问题已解决」。原发言可在候选来源逐句核对。未更新 Windows 正式安装或主站。
