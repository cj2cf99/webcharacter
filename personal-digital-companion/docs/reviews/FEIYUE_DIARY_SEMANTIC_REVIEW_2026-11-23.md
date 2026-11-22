# 绯月手记首问按原题核对的三轮自检

2026-11-23 JST。依据[续修原话与验收口径](../FEIYUE_PERSONALITY_MEMORY.md#续修--按原题核对答复)和[上一版四个失败](FEIYUE_DIARY_OPENING_REVIEW_2026-11-23.md#第三轮--验证接线与合理性)。范围为手记候选、原题答复核对、首次待确认和气泡。对照当前工作树的上一版首问实现，复用同一批 11 个隔离手记样例。正式资料未用作夹具。详细来源和保留历史的约定见既定[对话线设计](../FEIYUE_CONVERSATION_THREADS_DESIGN.md#4-来源与界面)，框架偏好和项目备忘录索引以[手记设计末节](../FEIYUE_PERSONALITY_MEMORY.md#续修--按原题核对答复)所列为准。

## 修正与首次回放

`desktop/personality-nags.mjs` 使用独立的原题答复核对和问句撰写，删除上一版关键词、分词及缺项说法匹配。只有核对为同一项尚缺且来源行有效才生成首问。同篇存在唯一的已绑定原话时，一并读取其后文。引文按行号从本机材料取回。`desktop/personality-diary.mjs` 限制核对阶段的状态和出处行号类型。`agent/tests/personality-memory.test.mjs` 检查无来源、有答复、无效出处、写问句前抢占、无相同词组的请托句，以及气泡仍显原话。

最初实跑原 11 个场景及同篇补记。3 条未决被卡在出处接口，因为模型把行号写成了 JSON 对象。将行号改为受范围约束的整数，并明确缺少来源与缺少答案的含义。

## 第一轮

| 检查 | 发现、修正与实测 |
| --- | --- |
| Bug、缺漏与边界 | 核对首次回放遗留。整数行号修正后，原 11 个样例的实际队列全部正确，三条可问样例均写出了问题和对应引用。 |
| 流程 | 无引用时不调用模型。其他可核对来源先进入答案检查，真实缺项才进入措辞阶段。同篇补记已有回答，未生成问句。 |
| 需求偏离 | 关心和原记录项目页均未入队。「是否一起去取新钥匙」已有答复，未改问开门时间。发现无关聚餐材料的内部状态仍写成「已有答复」，实际未入队。 |
| 合规及最简 | 复用同一模型队列和 SQLite。关联的完整来源参与检查，原话和旧线可按原入口回读，无分词相似度、数据库迁移或依赖。 |
| 可优化项 | 决策提示先抽取真正可回答原题的原话，再判状态，避免把「已有答复」当答案。复核补入明确否定和同义措辞场景。 |

本轮有新的判因问题，连续无问题轮数为 0。

## 第二轮

| 检查 | 发现、修正与实测 |
| --- | --- |
| Bug、缺漏与边界 | 尝试让模型先填答案原话，结果误把「页面还没告诉你」「开门时间还不知道」抄成已有答复，三条真问题未入队。恢复先定原题答复项、再定答案状态与实际内容的顺序。 |
| 流程 | 程序只有在明确未答且有有效出处时才调用撰写。补测两次调用之间的中断，未写气泡、未入队。 |
| 需求偏离 | 「是否同行」的答案始终只针对同行。第二轮的字段顺序导致真正未决项被拦，按原需求恢复。 |
| 合规及最简 | 核对同篇补记以后文作答。没有增加第三个模型阶段、词语比对或数据写入。已知的新闻摘要回归失败来自本轮范围以外。 |
| 可优化项 | 增加明确否定及跨措辞样例，第三轮用同一实际模型复查，核对决定、是否调用撰写及实际队列。 |

本轮发现字段顺序回归，连续无问题轮数归零。

## 第三轮

| 检查 | 发现、修正与实测 |
| --- | --- |
| Bug、缺漏与边界 | 核对前轮两类遗留。真实 Aggressive 9B CPU 最终严格回放 **14/14**，原 11 个场景和同篇补记、明确否定、同义措辞三个补测均通过。检查中断或无效索引不会进入撰写，也不会产生待确认。 |
| 流程 | 实际读取隔离 SQLite 队列和气泡。原 11 个仅有三个真问题入队，其他八个均未调用撰写。已答或无可靠来源时提前停止。四条真正出题的两阶段模型耗时约 18.5–34.2 秒。 |
| 需求偏离 | 两条找术语表原记录及一条问物业开门时间都生成单项问句并带上原话。同行已约定的题保持已答，未替换成开门时间。聚餐材料判为无关。「目前还没找到新钥匙」作为明确的否定答复，未重复询问。 |
| 合规及最简 | 通过桌面构建、桌面壳、隔离浅色与深色对话窗及 360 像素布局、七个面板标题栏检查。沿用现有原话存储与读取、问答队列和两步推理，无新依赖、额外数据表或发布动作。 |
| 可优化项 | 引文由程序按行号取回。模型可以用不同措辞自然发问。实测将「报价单原件到哪儿看」按手记改问「报价单原件到底是从哪个工作台打开的呀？」出处即所选原句。未增加额外模型阶段。 |

原 11 个结果为三个待答、八个跳过。第三轮本次范围内无新问题、无遗留，连续无问题轮数为 1。正式安装版未改动。已知工作区外部回归仍是新闻摘要缺 `reports`，不影响本次手记场景，保留现状。

### 实际验证命令与证据

- 在 `G:/selftool/WebCharacter/personal-digital-companion` 用本机 Electron 执行 `tools/run-electron-check.mjs output/initiative-real-model-recheck.mjs --verify` 加场景编号。此前原始 11 个编号为 `screenshot resolved knownPage grounded bodyOnly bound otherGap laterAnswer planning keyTime longAnswered`，补测为 `appendedAnswer negativeAnswer paraphrase`。隔离记录位于 `output/diary-semantic-{initial,round1,round2,round3}.stdout.log`。最终进程退出码 0。
- `node --test agent/tests/personality-memory.test.mjs agent/tests/diary-audit.test.mjs agent/tests/emotion-initiative.test.mjs agent/tests/autonomous-idle.test.mjs` 通过 70 项。
- `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs`、隔离 Electron 的 `test-conversation-threads-electron.mjs`（浅色、`--dark`）和 `test-panel-titlebar-electron.mjs` 通过。
- 全量回归按 `COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp` 运行 `node --test --test-concurrency=2 'agent/tests/*.test.mjs'`。457 项通过，1 项在 `news-editor.mjs` 读取 `current.reports.length` 时失败，和前一次相同。日志为 `output/diary-semantic-node-final.log`。
