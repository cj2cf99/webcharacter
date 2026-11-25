# 半岛文字通道 Gemini + AGY CLI 兜底与全局超时规则自审报告

- **审核日期（JST）**：2026-11-25
- **审核对象与范围**：
  - `desktop/ai-gateway.mjs`（半岛统一入口 `requestBandao`、`askBandaoJson` 的两级兜底、单步超时自动中止并跳过、`createBandaoFallback` 防环、测试隔离）
  - `agent/tests/bandao-fallback.test.mjs`（新增 8 项单测）
  - `agent/tests/cloud-lane.test.mjs`（补齐测试环境隔离）
  - 全局规则同步：`C:\Users\asura\.gemini\GEMINI.md` 与 `C:\Users\Public\UNIFIED_RULES.md`（新增二.7 命令与测试执行超时监控与自动停止规则）
- **基线**：
  - Git 分支：`codex/workspace-checkpoint-20261120`
  - Git 提交：`f23a026229b5d1f54eaf4dae3c6ebf227ee4f97b`
  - 全局规则同步 SHA-256：`95DE70635AFB5FE615E8F00D60316B52015140321C1F1B849A069DF6FCEF0DBF`（两文件一致）
- **审核方式**：按用户原话与全局自审规则（2–9 轮、连续两轮无新问题且无遗留通过）逐轮审查代码、调用链、边界条件、单测与全局规则一致性。
- **对照原始需求**：
  1. 「给bandao加兜底，兜底对象分别是gemini和agy cli两条线，先问gemini」
  2. 「没有监控到超时自动停止并跳过的要求吗」 / 「修正这两处」

---

## 实际执行的验证命令与原样摘要

1. 核心网关与兜底单测（第 1 轮修正后）：
   ```powershell
   cd G:\selftool\WebCharacter\personal-digital-companion; node --test --test-timeout=15000 agent/tests/bandao-fallback.test.mjs agent/tests/agy-bandao-fallback.test.mjs agent/tests/ai-gateway-guard.test.mjs agent/tests/cloud-lane.test.mjs agent/tests/task-log-reader.test.mjs
   ```
   摘要：`tests 26 / pass 26 / fail 0 / cancelled 0 / skipped 0 / duration_ms 799.671`

2. 全局规则跨账号同步校验与变更范围核对：
   ```powershell
   cd G:\selftool\WebCharacter\personal-digital-companion; git diff --stat -- desktop/ai-gateway.mjs agent/tests/cloud-lane.test.mjs; (Get-FileHash "C:\Users\asura\.gemini\GEMINI.md").Hash; (Get-FileHash "C:\Users\Public\UNIFIED_RULES.md").Hash
   ```
   摘要：`2 files changed, 146 insertions(+), 19 deletions(-)`；两份全局规则文件 SHA-256 均为 `95DE70635AFB5FE615E8F00D60316B52015140321C1F1B849A069DF6FCEF0DBF`。

> 未执行项说明：本次仅审核源码改动，未向 Windows 正式安装版执行发布/重启，也未向线上发起真实付费模型联调（由单测替身覆盖全路径；线上实际效果待部署后由用户确认）。

---

## 逐轮自审记录

### 第 1 轮
- **上轮遗留**：无（首轮）
- **五项检查与发现**：
  - ① Bug、缺漏和边界错误：
    - **[F-01 / 中] `requestBandao` 的 Gemini 兜底在 `json_object` 模式下未校验返回内容是否为合法 JSON 对象**：当调用方（如 `diary-deepseek.mjs`、`transcription-deepseek.mjs`）要求 `response_format: {type: 'json_object'}` 且半岛失败切 Gemini 后，若 Gemini 返回 HTTP 200 但正文是非 JSON 或带 ```` ```json ```` 代码块包裹，原实现直接把原文返回给调用方，导致上游 `JSON.parse` 报错且错失第二兜底 AGY CLI 的救场机会；同时 `json_object` 分支未限定结果为非数组 JSON 对象。
    - **[F-02 / 低] `askBandaoJson` 的 Gemini 兜底未兼容外层 ```` ```json ```` 代码块**：Gemini 返回带代码块包裹的合法 JSON 对象时直接 `JSON.parse` 失败，额外消耗一次重试。
  - ② 不合理流程：无。
  - ③ 需求偏离：无。
  - ④ 合规性：无违规（符合最简设计、架构守卫与全局规则同步要求）。
  - ⑤ 可优化项：无额外必要项。
- **本轮修正**：
  - 在 `desktop/ai-gateway.mjs` 新增 `parseJsonObject`（限定纯 JSON 对象并兼容代码块剥离）与 `stripCodeFence`：
    - `requestBandao` 在 `jsonMode` 下校验 Gemini 与 AGY 兜底结果必须为合法 JSON 对象并统一序列化返回；若 Gemini 返回非 JSON 或非 `stop`，自动落到 AGY CLI 兜底。
    - `askBandaoJson` 在 Gemini 兜底分支启用 `allowFence=true` 剥离外层代码块后校验 Schema。
  - 在 `agent/tests/bandao-fallback.test.mjs` 新增「`json_object` 模式下 Gemini 返回非 JSON 时自动继续切 AGY CLI，返回代码块 JSON 时自动剥离」用例。
- **验证结果**：运行 5 份核心单测 **26/26 通过**（799ms）。
- **遗留问题**：无。
- **连续达标轮数**：0（本轮有新发现并已修正，计数归零）。

### 第 2 轮
- **上轮遗留**：第 1 轮 F-01、F-02 已修正并验证通过，无遗留。
- **五项检查**：
  - ① Bug、缺漏和边界错误：逐行复查 `ai-gateway.mjs` 第 207–356 行（取消信号穿透、非兜底错误码、防环 `allowAgyFallback: false`、单步 30s 超时中止与跳过、对象/数组 `input` 处理、测试 `fetcher` 与 `globalThis.fetch` 隔离），无新问题。
  - ② 不合理流程：无。
  - ③ 需求偏离：对照用户原话完全一致，无偏离。
  - ④ 合规性：符合单人最简设计、架构守卫与跨账号规则同步要求。
  - ⑤ 可优化项：无。
- **遗留问题**：无。
- **连续达标轮数**：1。

### 第 3 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug、缺漏和边界错误：无。
  - ② 不合理流程：无。
  - ③ 需求偏离：无。
  - ④ 合规性：核对 `git diff --stat` 与全局规则 SHA-256，改动边界干净、无敏感信息、无临时文件残留、未触碰正式安装版或他人工作。
  - ⑤ 可优化项：无。
- **遗留问题**：无。
- **连续达标轮数**：2（连续两轮无新问题、无遗留问题，结束自审）。

---

## 审核结论与状态

- **结论**：**自审通过**（共 3 轮，第 2、3 轮连续无新问题、无遗留问题）。
- **审核中是否改动及临时文件清理**：第 1 轮在授权范围内修正了 `desktop/ai-gateway.mjs` 与 `agent/tests/bandao-fallback.test.mjs` 并通过单测验证；单测使用的临时目录均由 `t.after` 自动清理，无残留临时文件。
- **当前状态**：**待用户确认**。
