# 绯月远端同步后全量集成自审报告（2026-11-25）

- **审核时间**：2026-11-25（Asia/Tokyo）
- **审核类型**：代码同步后多轮全量自审（共 5 轮，第 4、5 轮连续两轮无新问题、无遗留问题）
- **状态**：待用户确认
- **结论**：通过（自审通过）

---

## 1. 审核对象与范围

本次审核覆盖从远端 `origin/main` 同步至本地 `1b759fe76957a26de6f1d3f4818c4151bcfffe49`（`merge: 同步远端 main 并合入全部今日工作区改动`）后，绯月开发工作区（`personal-digital-companion/`）正在交付的全部合并实现与全量回归测试，包括：
1. WSL2 独立 AGY CLI、20 分钟 `RESOURCE_EXHAUSTED` 熔断、即用即预热与半岛兜底（`desktop/agy-cli-client.mjs`、`desktop/agy-local-model.mjs`、`desktop/ai-gateway.mjs`）；
2. 截图、多图附件与此刻所想识图改走本机 AGY CLI 及右键菜单「线上测试 · 多屏截图内容确认」（`desktop/vision-client.mjs`、`desktop/screen-question-client.mjs`、`desktop/screen-question-host.mjs`、`desktop/scene-curiosity.mjs`、`desktop/shell.mjs`、`desktop/menu-layout.json`）；
3. 清单生成即结束对话（`desktop/conversation-threads.mjs`、`desktop/conversation-transcription.mjs`）及候选包一致性校验；
4. 新闻编辑提示词与全量守卫/业务测试套件（`skills/news-editorial/source/local-ai.json`、`agent/tests/*.test.mjs`、`tools/test-conversation-transcription.mjs`、`tools/test-desktop-shell.mjs`、`tools/build-desktop.mjs`）。

**不在本次改动范围**：并行会话写入的 `RELEASE_REVIEW.md`、`docs/releases/wsl-agy-combined-20261125/`、`docs/reviews/COMBINED_DEPLOY_SELF_REVIEW_2026-11-25.md`（完整保留未触碰）；Windows 正式安装版替换、重启、花园登记与 Git 推送（待用户后续指令）。

---

## 2. 基线信息

- **Git 分支**：`codex/workspace-checkpoint-20261120`（与 `origin/main`、`origin/codex/workspace-checkpoint-20261120` 同步，`0 ahead / 0 behind`）
- **Git HEAD 基线提交**：`1b759fe76957a26de6f1d3f4818c4151bcfffe49`
- **自审修正后核心文件 SHA-256**：
  - `personal-digital-companion/desktop/vision-client.mjs`：`073F9514469B8A5FB02196DE020B7FCFD97ABAE90DDD88C2885DB9316533C9D2`
  - `personal-digital-companion/desktop/screen-question-client.mjs`：`DCABE7FC90E4912CADB03634D1FAD6FFF9E0BA749179E9B86716726C65FDDE32`
  - `personal-digital-companion/desktop/screen-question-host.mjs`：`6A4A4EF0A3276BEF5F06E493E29B0AFE17558F4C3D7F60FE90E31E1E42014F26`
  - `personal-digital-companion/skills/news-editorial/source/local-ai.json`：`4772BF4242CEC93073C8B5A6EDDAF56823358D5A9512A6714FF48F49681960B6`
  - `personal-digital-companion/skills/news-editorial/latest.json`：`6AE49B27AE82B9B980681D3E737DCAAD116CA05ADF1E98EF76C15FA897E3CFD8`

---

## 3. 审核方式

每轮完整执行五项核查：
1. ① Bug、缺漏和边界错误；
2. ② 不合理流程（重复步骤、遗漏、不可达路径、副效应污染）；
3. ③ 对照 `REQUIREMENTS.md`、`docs/DESIGN.md` 与用户最新明确决定检查需求偏离；
4. ④ 合规性（单人最简设计、模块分层守卫、技能版本历史不可变、不越界修改他人文件、无凭据泄露）；
5. ⑤ 有实际收益且符合当前需求的可优化项。

审核结合远端同步核验、源码逐行阅读、全量 Node 单元测试（清空云端密钥环境变量以避免真实外网请求）、桌面壳检查与桌面构建实测。

---

## 4. 实际执行的命令与原样摘要

| 阶段 | 执行命令（均在 `personal-digital-companion` 下清空云端密钥） | 原样结果摘要 |
| --- | --- | --- |
| 同步核验 | `git fetch --all --prune` + `git rev-list --left-right --count HEAD...origin/main` | `0 0`（本地与 `origin/main`、`origin/codex/workspace-checkpoint-20261120` 完全同步，指向 `1b759fe`） |
| 初始基线全量测试 | `node --test --test-concurrency=4 agent/tests/*.test.mjs`（不含 `news-briefing`）+ 单独运行 `news-editorial.test.mjs` & `news-briefing.test.mjs` | 全量 575 项：569 通过、3 跳过、**3 失败**（`prompt-rules.test.mjs:39`、`ai-workflow.test.mjs:491`、`emotion-initiative.test.mjs:14`）；新闻 25/25 通过 |
| 第 1 轮修正后全量验证 | `node --test --test-concurrency=4 agent/tests/*.test.mjs` + `node tools/test-desktop-shell.mjs` + `node tools/build-desktop.mjs` | `tests 595 / pass 592 / fail 0 / skipped 3`；桌面壳 7 项 `PASS`；构建成功；`R1_VERIFY: ALL_TESTS=0 SHELL=0 BUILD=0` |
| 第 2 轮修正后全量验证 | `node --test --test-concurrency=4 agent/tests/*.test.mjs tools/test-conversation-transcription.mjs` + `node tools/test-desktop-shell.mjs` + `node tools/build-desktop.mjs` | `tests 606 / pass 603 / fail 0 / skipped 3`；桌面壳 7 项 `PASS`；构建成功；`R2_VERIFY: ALL_TESTS=0 SHELL=0 BUILD=0` |
| 第 3 轮修正后回归验证 | `git checkout -- personal-digital-companion/skills/news-editorial/versions/news-editorial-v2-3/local-ai.json` + `node --test agent/tests/prompt-rules.test.mjs agent/tests/news-editorial.test.mjs agent/tests/desktop-screen-question.test.mjs agent/tests/cloud-lane.test.mjs` | `tests 29 / pass 29 / fail 0`；`R3_VERIFY: TESTS=0` |
| 第 4–5 轮终审核对 | `git diff` + `Get-FileHash` + `Compare-Object`（核对 `generate-ends-20261125` 候选一致性） | 差异干净、无敏感信息、候选一致、无临时残留 |

---

## 5. 发现清单

| 编号 | 级别 | 类别 | 描述与证据 | 影响 | 建议与处置 |
| --- | --- | --- | --- | --- | --- |
| F1 | 中 | Bug / 需求偏离 | `desktop/news-editorial.mjs:260` 向 `title` 阶段传入了 `previousTitle`，但 `skills/news-editorial/source/local-ai.json:4` 在 v2-3 升级时遗漏了 `previousTitle` 说明，触发 `agent/tests/prompt-rules.test.mjs:39` 失败。 | 提示词与实际输入字段不对齐，违反“提示词说明全部动态字段”的守卫规则。 | **已修正（第 1 轮）**：在 `source/local-ai.json` 的 `title` 提示词补齐 `previousTitle` 说明（并自动热发布为 `v2-4`），`prompt-rules.test.mjs` 通过。 |
| F2 | 中 | 需求对齐 / 测试过期 | `REQUIREMENTS.md:23` 与 `docs/DESIGN.md:23` 已于 2026-11-25 确认保留 5 分钟单任务累计推理上限（`taskLimitMs = 5 * 60_000`），但 `agent/tests/ai-workflow.test.mjs:491` 仍模拟单条 61 分钟并断言不超时丢弃，导致全量测试失败。 | 测试断言与已确认现行需求冲突。 | **已修正（第 1 轮）**：更新用例为验证“超旧 120s 但未超 5 分钟（4 分钟）仍保存、超 5 分钟（6 分钟）按现行规则丢弃、再扫不重复推理”，全量回归通过。 |
| F3 | 中 | 测试过期 / 语义变化 | 提交 `016bfd1` 将 `desktop/emotion-service.mjs:146` 改为 `interrupt(immediate = false)`（默认优雅让行，传 `true` 才立即中止），`agent/tests/emotion-initiative.test.mjs:30` 未传 `true`，导致用例失败。 | 无法通过测试验证立即中断保留原事件路径。 | **已修正（第 1 轮）**：将测试中 `service.interrupt()` 更新为 `service.interrupt(true)`，全量回归通过。 |
| F4 | 中 | Bug / 流程污染 | `desktop/screen-question-host.mjs:1147` 的右键菜单测试入口 `testScreenQuestion` 调用 `api.captureAndAsk` 时，会经 `desktop/screen-question-client.mjs:136` 将测试截图写入用户的正式记忆归档目录；另第 164、168 行残留 `payload.attachedImage` 死分支。 | 每次执行菜单多屏截图测试都会污染正式记忆归档。 | **已修正（第 1 轮）**：为 `screen-question-client.mjs` 增加 `archive = true` 选项并在 `testScreenQuestion` 中传入 `archive: false`，同步清理死分支。 |
| F5 | 中 | Bug / 边界 | `desktop/vision-client.mjs:171` 中 `createAgyVision` 在未校验 `signal?.throwIfAborted?.()` 与图片有效性（`!images.length \|\| images.some(img => !img?.data_base64)`）前就因 `!isAvailable?.()` 调用 `fallback`。 | 未安装 AGY 时可能把已取消请求或无效图片发往云端视觉，且与 `ai-gateway.mjs` 熔断分支行为不一致。 | **已修正（第 1 轮）**：前置 `signal?.throwIfAborted?.()` 与图片参数校验，与熔断短路分支保持一致。 |
| F6 | 低 | 测试覆盖 | 第 1 轮修复 F4（`archive: false` 不落盘）与 F5（未安装 AGY 时无效图/已取消不调 `fallback`）缺少对应单元测试锁住回归。 | 后续修改可能无意回退上述边界修复。 | **已修正（第 2 轮）**：在 `desktop-screen-question.test.mjs` 与 `cloud-lane.test.mjs` 补充回归断言，全量 606 项通过。 |
| F7 | 中 | 合规性 | 第 1 轮直接修改了已发布的不可变历史技能快照 `skills/news-editorial/versions/news-editorial-v2-3/local-ai.json`，而在运行测试时 `readInteractionSkill` 已依据 `source/local-ai.json` 自动发布出 `v2-4` 与 `latest.json`。 | 违反技能历史版本不可变原则。 | **已修正（第 3 轮）**：`git checkout` 还原 `v2-3` 保持历史原样，仅保留 `source/local-ai.json` 与新发布的 `v2-4` / `latest.json`，29 项专项复测通过。 |

---

## 6. 逐轮自审记录

### 第 1 轮
- **上轮遗留**：无（首轮）。
- **五项检查**：
  - ① Bug/边界：发现 F1、F4、F5；全量测试暴露 F1、F2、F3。
  - ② 不合理流程：发现 F4（菜单测试截图污染正式记忆目录、死分支残留）。
  - ③ 需求偏离：F1 提示词漏字段；F2、F3 测试滞后于 `016bfd1` 已确认规则。
  - ④ 合规性：通过，符合单人最简设计。
  - ⑤ 可优化项：F4 清理死分支 `payload.attachedImage`。
- **本轮修正**：修复 F1–F5。
- **本轮验证**：全量测试 595 项（592 通过 / 3 跳过 / 0 失败）、桌面壳 7/7 通过、桌面构建成功。
- **遗留问题**：无。
- **连续达标轮数**：`0`（本轮有新发现）。

### 第 2 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug/边界：核查 `screen-question-host.mjs` 多图附件入口与 `generate-ends-20261125` 候选一致性，无代码 Bug；发现 F6（F4/F5 缺回归单测）。
  - ② 不合理流程：无。
  - ③ 需求偏离：无。
  - ④ 合规性：通过。
  - ⑤ 可优化项：补充 F6 回归单测。
- **本轮修正**：修复 F6，在 `desktop-screen-question.test.mjs` 与 `cloud-lane.test.mjs` 补充断言。
- **本轮验证**：全量测试（含 `tools/test-conversation-transcription.mjs`）606 项（603 通过 / 3 跳过 / 0 失败）、桌面壳 7/7 通过、桌面构建成功。
- **遗留问题**：无。
- **连续达标轮数**：`0`（本轮有新发现）。

### 第 3 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug/边界：无。
  - ② 不合理流程：无。
  - ③ 需求偏离：无。
  - ④ 合规性：核查 `git status` 时发现 F7（第 1 轮误改历史技能快照 `v2-3`，而系统已自动发布 `v2-4`）。
  - ⑤ 可优化项：无。
- **本轮修正**：还原 `skills/news-editorial/versions/news-editorial-v2-3/local-ai.json`，保留 `source/local-ai.json` 与 `v2-4` / `latest.json`。
- **本轮验证**：`prompt-rules.test.mjs`、`news-editorial.test.mjs`、`desktop-screen-question.test.mjs`、`cloud-lane.test.mjs` 共 29/29 通过。
- **遗留问题**：无。
- **连续达标轮数**：`0`（本轮有新发现）。

### 第 4 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug/边界：逐行复查最终 `git diff` 与全部修改文件，无新问题。
  - ② 不合理流程：无。
  - ③ 需求偏离：与 `REQUIREMENTS.md`、`docs/DESIGN.md` 完全一致。
  - ④ 合规性：历史版本已还原、未触碰并行会话文件、无凭据泄露、最简实现。
  - ⑤ 可优化项：无。
- **本轮修正**：无。
- **本轮验证**：最终 `git diff` 干净，核心 5 文件 SHA-256 固化。
- **遗留问题**：无。
- **连续达标轮数**：`1`。

### 第 5 轮
- **上轮遗留**：无。
- **五项检查**：
  - ①–⑤ 全面复核 F1–F7 闭环、基线哈希、测试结果与需求一致性，无新问题、无遗留问题。
- **本轮修正**：无。
- **本轮验证**：代码与第 4 轮一致，全量测试、桌面壳、桌面构建与专项复测结果持续有效。
- **遗留问题**：无。
- **连续达标轮数**：`2`（达成连续两轮无新问题、无遗留问题条件，自审结束）。

---

## 7. 审核中改动与临时文件清理

- **审核中是否改动**：是。第 1–3 轮共修正 7 项（F1–F7），涉及 `desktop/vision-client.mjs`、`desktop/screen-question-client.mjs`、`desktop/screen-question-host.mjs`、`skills/news-editorial/source/local-ai.json`（及自动生成的 `latest.json`、`versions/news-editorial-v2-4/`）和 4 个测试文件；第 4–5 轮零改动。
- **临时文件清理**：本次审核未产生未清理的临时文件或脚本；并行会话写入的 `RELEASE_REVIEW.md`、`docs/releases/wsl-agy-combined-20261125/`、`docs/reviews/COMBINED_DEPLOY_SELF_REVIEW_2026-11-25.md` 保持原样未动。

---

## 8. 结论与状态

- **自审结论**：**自审通过**（共执行 5 轮，第 4、5 轮连续两轮无新问题、无遗留问题）。
- **当前状态**：**待用户确认**。
