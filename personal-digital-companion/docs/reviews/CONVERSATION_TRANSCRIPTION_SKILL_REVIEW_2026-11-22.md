# 绯月对话内容转录 Skill 与任务模板复核

2026-11-22 JST，待用户确认。对象为[流程与模板补充需求](../../REQUIREMENTS.md#2026-11-22-jst--普通对话登记提案)、[短链路设计](../DESIGN.md#短链路和固定输出)、`skills/conversation-transcription`、技能目录接线与专项校验。Git 基线 `codex/workspace-checkpoint-20261120`，`067bfd570ef4e74136241c8e4dc98f6b26a3f267`。以当前工作区相关文件与 HEAD 比较，有关专聊的在制改动保留。

| 轮次 | 发现及处理 |
| --- | --- |
| 1 | R1，高。普通交互指令包含云端候补，且原方案以闲时整理可抢占处理。新增独立本机路由和不可打断策略。`balanced-local-model.mjs` 可按工作会话复用现有模型，但当前每次调用结束允许其他请求取得模型。因此需在正式接线时实现跨阶段占用，当前 Skill 数据已标明。R2，中。日记图片和带时分提醒在当前桌宠适配中尚未齐备，将其作为有能力条件的草稿字段。 |
| 2 | R3，中。来源明确的字段、模型建议及模板默认值需要分开，业务 ID 和图床引用应由宿主提供。补齐三阶段结构、字段来源和七目标的模板校验，保留未配分类的候选。核对个人日记确认和绯月自主手记分别处理。 |
| 3 | 复核阶段入口、固定输出、空结果、时限、自动释放及确认后使用同版草稿。既有菜单覆盖测试发现工作区专聊菜单 `privateChat` 没有相应技能映射；比对基线证实本次只新增转录 hint，原映射一致。转录资产内未发现其余待改问题。 |

### 实际验证

- 在绯月目录运行 `node --test tools/test-conversation-transcription.mjs`，3 项通过。验证技能目录两次读取同一快照、输出结构和七目标枚举、隔离 SQLite 载入现有任务种子并用实际适配器构造七个虚构请求。没有提交请求。
- 运行 `node --test agent/tests/registration-flow.test.mjs agent/tests/balanced-local-model.test.mjs`，21 项通过。登记测试宿主输出既有 `panel.setTitleBarOverlay is not a function` 警告。
- 运行 `python -B tools/test-skills.py SkillTests.test_publication SkillTests.test_coverage SkillTests.test_diary_template`，2 项通过，菜单覆盖一项报 `KeyError: 'privateChat'`。使用 `git show HEAD:personal-digital-companion/skills/feiyue-interaction/source/routes.json` 与当前路由比对，确认同一缺项已存在。
- `git diff --check` 与新增资产尾部空白检查通过。本机技能快照为 `conversation-transcription` 1.0、`feiyue-interaction` 3.1。未读取私人对话，未调用真实模型，未写主站数据。

### 结论

资产准备通过，桌面接线待确认。需续验完整会话在同一模型会话连续处理、期间其他请求排队、10 分钟内提供结果，以及用户确认后批量提交的实际表现。当前测试证明现有业务参数兼容和技能目录可读，真实模型输出及桌面操作尚未实测。
