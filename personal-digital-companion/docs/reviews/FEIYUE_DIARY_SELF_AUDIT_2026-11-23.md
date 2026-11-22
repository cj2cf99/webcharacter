# 绯月手记首问自审

2026-11-23 JST。用户指令「自审」。范围为当前交付的手记首问。依据[原话、后续决定与实现口径](../FEIYUE_PERSONALITY_MEMORY.md#手记首问的来源与未决信息)、[对话线来源设计](../FEIYUE_CONVERSATION_THREADS_DESIGN.md#4-来源与界面)、[上轮自检](FEIYUE_DIARY_SEMANTIC_REVIEW_2026-11-23.md)及全局框架偏好。起点为该次自检后的工作区，原 14 个真实模型用例 14/14，专项 70/70。新增边界用例使用隔离临时资料，同一模型与既有 `output/initiative-real-model-recheck.mjs`。正式安装和线上记录不参与本次自审。

## 第一轮 · 发现并修正

| 检查 | 发现与修正 |
| --- | --- |
| Bug、缺漏与边界 | 绑定原文在同篇出现两次后，旧流程因匹配重复而清空后文。实模因此未看到已补记的项目更新页，错误新增了待确认。改为从已绑定原话在该篇首次出现处后读取。 |
| 流程合理性 | 撰写阶段会额外生成开口评价。旧模型实测写出「指尖轻轻摩挲」，材料无此动作。撰写阶段只生成问句，开口理由由已核对的缺项状态产生。 |
| 需求偏离 | 同篇后文有答案就该结束核对，前情重复与回答无关。关心、已答及无出处不进待确认，原题仍缺的才用自然措辞问一句。保留旧记录和既有引用绑定规则。 |
| 合规与最简 | 仅改 `desktop/personality-nags.mjs` 和相应专项断言。使用既有 SQLite、来源与调度。无新增模型阶段、词语相似度判断、数据表或跨项目依赖。 |
| 可优化项 | 避免额外生成评价，把模型输出缩到本轮实际需要的问句。补测后文的答案处于重复摘录之前或之后两种顺序。 |

连续无问题轮数归零。首轮修正用 `node --test agent/tests/personality-memory.test.mjs agent/tests/diary-audit.test.mjs agent/tests/emotion-initiative.test.mjs agent/tests/autonomous-idle.test.mjs` 验证，70/70。真实 Aggressive 9B CPU 针对补记位于重复摘录前后、查原记录、查开门时间复验，4/4。对照过程见 `output/diary-audit-repeated-before.stdout.log` 和 `output/diary-self-audit-r1.stdout.log`。

## 第二轮 · 发现长句边界并修正

| 检查 | 发现与修正 |
| --- | --- |
| Bug、缺漏与边界 | 首轮遗留已复核。新增长句样例中，核对正确选择了原句，但取前 150 字丢失句尾缺项。真实撰写耗尽 220 token 后失败，未能入队。 |
| 流程合理性 | 改为编号前对过长原句按停顿拆段。没有停顿的长段按字符边界保留原始顺序，当前问句使用模型选定的完整原段，避免核对与撰写看到不同内容。 |
| 需求偏离 | 气泡必须展示发生提问的来由。实测修复后在气泡显示「术语表更新的原记录在哪个页面目前还没告诉我」，并正常入队。仍只问原题那项缺失。 |
| 合规与最简 | 保留 150 字简短引用及现有展开入口。短句保持原有分段。引用取自本机原文，无字符串相似判断，无新模型调用。 |
| 可优化项 | 原文片段已完整，保留原推理额度，无需提高预算或追加重试。增加长句及无自然停顿的回归。 |

复测真实模型长句 1/1，专项 70/70。输出见 `output/diary-self-audit-long-before.stdout.log` 与 `output/diary-self-audit-long-after.stdout.log`。本轮有新问题并已修正，连续无问题轮数为 0。

## 第三轮 · 完整回放

| 检查 | 复核结果 |
| --- | --- |
| Bug、缺漏与边界 | 复核上轮长句与首轮重复摘录，真实 Aggressive 9B CPU 严格回放 17/17。气泡引用完整原段，补记出现在重复摘录前后均不会重复发问。 |
| 流程合理性 | 五条确需补充的场景写入临时 SQLite 待确认，其余十二条没有进入问句撰写。已有答复、无绑定出处和无关事实分流符合预期。 |
| 需求偏离 | 原 11 个场景全部通过，其中三条真问题正确呈现出处，已约好同行的题未改问开门时间。保留自然问句、旧记录和返回原出处路径。 |
| 合规与最简 | `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs` 和隔离 Electron 浅色、深色、360 像素布局与标题栏检查通过。只使用同一台机器和隔离资料。 |
| 可优化项 | 短原句仍用原先的切分法，只在超出引用长度时继续拆段，问答链仍至多两个模型调用。未发现需要新增步骤的场景。 |

无新问题、无本次范围内遗留，连续无问题轮数为 1。本轮未改代码。真实回放及界面日志为 `output/diary-self-audit-r3.stdout.log`、`output/diary-self-audit-ui-{light,dark,titlebar}.stdout.log`。

## 第四轮 · 独立复查

| 检查 | 复核结果 |
| --- | --- |
| Bug、缺漏与边界 | 新进程与新临时资料目录实跑 6/6。无出处的旧标题、已知页面、补答后再引旧话、明确否定均未入队，换词表达和长句真正缺项仍能正常发问。 |
| 流程合理性 | 核对打开气泡前的稳定队列状态、按编号取引用和中断分支，未发现重复写入或跳过原题核对。实际只写入两条应该询问的记录。 |
| 需求偏离 | 对照用户原话检查依据、问题和来由。上轮没有遗留，复验输出仍只问关联答复项。长句引用保留原文末尾指出缺项的片段。 |
| 合规与最简 | `git diff --check` 通过。保持本机单人方案，没有引入新依赖、数据表或发布。全量 Node 回归 458/459，已知失败仍在本次范围外。 |
| 可优化项 | 复核最终路径，未见可删除的独立流程或需要扩展的功能。测试后未作代码调整。 |

无新问题、无本次范围内遗留，连续无问题轮数为 2，于第四轮结束，**自审通过**。Windows 正式安装版未更新。

### 验证记录与范围外问题

- 在子项目根目录用 Electron 运行 `tools/run-electron-check.mjs output/initiative-real-model-recheck.mjs --verify`。第三轮包含前次的 14 个样例，加 `repeatedAnswer repeatedAfterAnswer longOpeningEvidence`。第四轮参数为 `screenshot knownPage repeatedAfterAnswer negativeAnswer paraphrase longOpeningEvidence`，运行日志分别为 `output/diary-self-audit-r3.stdout.log`、`output/diary-self-audit-r4.stdout.log`。两轮退出码均为 0。
- R4 全量命令为 `node --test --test-concurrency=2 'agent/tests/*.test.mjs'`，设定 `COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp`。已有新闻摘要用例在 `desktop/news-editor.mjs:79` 读取缺少的 `reports.length`，和前两次验证相同，未纳入修正。日志为 `output/diary-self-audit-node-final.log`。
