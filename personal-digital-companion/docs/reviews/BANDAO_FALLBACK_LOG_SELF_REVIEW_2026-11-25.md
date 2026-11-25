# 自审明细报告：DeepSeek 触发兜底流程日志说明（2026-11-25）

- **审核对象与范围**：`personal-digital-companion/desktop/ai-gateway.mjs`、`personal-digital-companion/desktop/shell.mjs`
- **基线**：分支 `codex/workspace-checkpoint-20261120`，提交 `39048e0`
- **审核方式**：逐行代码审查、对照用户原始需求、最简化设计检查及本地测试验证
- **结论**：**自审通过**（共 3 轮，第 2、3 轮连续无新问题、无遗留问题）
- **状态**：已就绪，按用户指令继续部署到正式安装版并推送 Git（免花园登记）

---

## 一、实际执行命令与结果摘要

1. 语法检查与兜底日志断言测试：
   - 命令：`node --check desktop/ai-gateway.mjs`、`node --check desktop/shell.mjs` 及 `requestBandao` 3 场景内联断言测试
   - 结果：通过（`ALL_PASSED 3`，验证 Gemini 兜底成功、AGY CLI 兜底成功、兜底全失败均能写入预期字段）
2. 相关自动化测试套件：
   - 命令：`node --test --test-timeout=15000 agent/tests/bandao-fallback.test.mjs agent/tests/agy-bandao-fallback.test.mjs agent/tests/ai-gateway-guard.test.mjs agent/tests/cloud-lane.test.mjs agent/tests/task-log-reader.test.mjs`
   - 结果：**26/26 全部通过**（`fail 0`，耗时 `883.32ms`）

---

## 二、逐轮自审记录

### 第 1 轮
1. **① Bug、缺漏和边界错误**：发现 1 项问题——在 `requestBandao` 与 `askBandaoJson` 兜底全失败时，`logCloudFallback` 原先将 `error` 设为 `primaryError?.code`，这会与主请求 `DeepSeek` 日志中的同错误码在 `task-traffic-log.mjs` 的 `inspectRecent()` 中被重复计数一次。
   - **修正**：在 `ai-gateway.mjs` 第 335 行、第 395 行改为 `error: 'DEEPSEEK_FALLBACK_FAILED'`（同时保留 `primary_error` 记录原始主请求错误码）。
   - **验证**：重新运行 `node --check` 与 3 场景断言测试，通过（`ALL_PASSED 3`）。
2. **② 不合理流程**：无。
3. **③ 需求偏离检查**：对照用户原话「这种触发了兜底流程的失败，需要在日志上予以说明」，主请求失败并触发兜底时均记录 `route: "DeepSeek 兜底"` 说明行，无偏离。
4. **④ 合规性与最简化设计**：仅新增 `setCloudFallbackLog` 与共用 `logCloudFallback`，无冗余抽象。
5. **⑤ 可优化项**：同第 1 项，已当轮修正。
- **连续达标轮数**：`0`

### 第 2 轮
1. **① Bug、缺漏和边界错误**：复核 `logCloudFallback` 判空、`primaryError` 兜底取值、`signal` 取消不误记失败、兜底成功不带 `error` 字段、兜底失败使用 `DEEPSEEK_FALLBACK_FAILED`，无问题。
2. **② 不合理流程**：无。
3. **③ 需求偏离检查**：无。
4. **④ 合规性与最简化设计**：符合。
5. **⑤ 可优化项**：无。
- **连续达标轮数**：`1`

### 第 3 轮
1. **① Bug、缺漏和边界错误**：核对 `shell.mjs` 第 9 行 import 与第 117 行 `setCloudFallbackLog(tasks.traffic?.write)`，与 `setLiveWarningLog` 写法一致且安全，无问题。
2. **② 不合理流程**：无。
3. **③ 需求偏离检查**：无。
4. **④ 合规性与最简化设计**：符合。
5. **⑤ 可优化项**：无。
- **连续达标轮数**：`2`（达到连续两轮无新问题、无遗留问题条件，自审结束）

---

## 三、发现清单与遗留

- **发现项**：1 项（已修复，见第 1 轮）。
- **审核中临时文件清理**：无临时文件产生。
- **当前遗留问题**：无遗留问题。
