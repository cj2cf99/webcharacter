# 绯月 WSL2 独立 AGY CLI 迁移与 RESOURCE_EXHAUSTED 熔断自审报告（2026-11-25）

- **审核时间**：2026-11-25（Asia/Tokyo）
- **审核类型**：功能实现与环境迁移多轮自审（共 5 轮，连续 2 轮零新问题、零遗留）
- **状态**：待用户确认
- **结论**：通过（自审通过）

---

## 1. 审核对象与范围

本次自审覆盖「以 E 盘集中目录的 WSL2 独立容器替代第二 Windows 账号运行 `agy` CLI、改造绯月本地 AGY 调用层，以及新增 `RESOURCE_EXHAUSTED` 20 分钟全局跳过熔断规则」的全部交付物：

1. **代码改动（开发工作区）**：
   - `desktop/agy-cli-client.mjs`（WSL2 隔离容器调用、集中工作目录 `E:\wsl-agy\temp`、子进程优雅回收 `stopChild`、`RESOURCE_EXHAUSTED` 20 分钟全局熔断与期满恢复）
   - `desktop/agy-local-model.mjs`（熔断期跳过 AGY 会话与一次性调用、按访问失败走原有兜底/返回流程、跳过态不写入 AGY 错误日志）
   - `desktop/ai-gateway.mjs`（`agyVision` 熔断期前置校验与零写盘直达备用视觉）
   - `agent/tests/agy-cli.test.mjs`（WSL2 隔离切换、工作目录导出及 `RESOURCE_EXHAUSTED` 熔断全链路单测）
2. **宿主与集中目录配置**：
   - `E:\wsl-agy\distro\ext4.vhdx`（Debian 13 独立发行版 `agy-wsl`，`appendWindowsPath=false`，独立用户 `agy` 与 `/home/agy/.local/bin/agy`）
   - `E:\wsl-agy\temp\`（集中工作目录兼识图临时目录）
   - `E:\wsl-agy\README.md` 与 `C:\Users\asura\.wslconfig`
3. **不在本次范围**：
   - Windows 正式安装版替换与花园发布登记（未执行，待用户后续指令）；
   - Windows 原版 `agy.exe` 卸载/清理（保留未动，待用户确认）；
   - 工作区既有未提交文件 `agent/tests/agy-bandao-fallback.test.mjs`（已通过 `FEIYUE_AGY_WSL_DISTRO=off` 对照证实其第 1 条失败与本次改动无关，未越界修改）。

---

## 2. 基线信息

- **Git 分支**：`codex/workspace-checkpoint-20261120`
- **Git HEAD 提交**：`62087cbd1c7a16706feeeefc279001bf3e80a35d`（`docs(feiyue): 补记全屏截图遮罩修复的花园登记回执`）
- **自审结束时最终文件 SHA-256**：
  - `desktop/agy-cli-client.mjs`：`E737276BC9B7AFCBD97E16B931CF316B58058907C996642F4549BC65A68A2AA4`
  - `desktop/agy-local-model.mjs`：`D9D82968789FF240FA546A2D80C8CC11B4DBD71720A890C8006EB95B3DA53AF1`
  - `desktop/ai-gateway.mjs`：`05FA7C24955C4C9A604C4329BDF1ED3DD0E2C74C914E55B52590961108EAE4E8`
  - `agent/tests/agy-cli.test.mjs`：`043DDB6FA13CE0722AC6CDA4F9106B0644801F5F93392186B2FB002EF810876F`

---

## 3. 审核方式

每轮均完整执行五项核查：
1. ① Bug、缺漏和边界错误；
2. ② 不合理流程（重复步骤、遗漏、不可达或阻塞路径）；
3. ③ 对照用户原话与已确认决定检查需求偏离；
4. ④ 合规性（单人最简设计、模块分层守卫、不越界修改与无敏感信息泄漏）；
5. ⑤ 有实际收益且在当前范围内的可优化项。

结合逐行源码静态审查、单元测试、桌面壳/构建校验，以及真实 Windows → WSL2（`agy-wsl`）端到端实测与残留进程/临时文件核验。

---

## 4. 实际执行的命令与原样摘要

| 阶段 | 执行命令 | 原样结果摘要 |
| --- | --- | --- |
| 第 1 轮修正后验证 | `node --test agent/tests/agy-cli.test.mjs agent/tests/agy-standby.test.mjs agent/tests/ai-gateway-guard.test.mjs agent/tests/scene-curiosity.test.mjs agent/tests/desktop-screen-question.test.mjs agent/tests/thread-ready-notice.test.mjs` + `node tools/test-desktop-shell.mjs` + `node tools/build-desktop.mjs` | `tests 38 / pass 38 / fail 0`；桌面壳 7 项 `PASS`；构建成功；`R1_VERIFY: TESTS=0 SHELL=0 BUILD=0` |
| 第 2 轮修正后初跑 | 同上命令 | `agy-cli.test.mjs` 新增断言捕获测试顺序写入 1 条取消日志（`2 !== 1`），调整测试断言顺序后复测 |
| 第 2 轮复测验证 | 同上命令 | `tests 38 / pass 38 / fail 0`；桌面壳 7 项 `PASS`；构建成功；`R2_REVERIFY: TESTS=0 SHELL=0 BUILD=0` |
| 第 3 轮真机 WSL2 回归（发现 F7） | Node 调用 `checkAgyAvailable` + `startAgyStandby` + `runAgyPrompt` + `stopAgyStandby` + 等待 1.5s 检查 `wsl -d agy-wsl -- ps -ef` | `AVAIL: available=true, version=1.5.17`；`PROMPT: success=true, warm=true, ok=true`；`LEFTOVER: 1`（定位到 1.5s 宽限早于新预热进程 4–5s 初始化完毕） |
| 第 3 轮修正后全量回归 | 6 组单测 + 桌面壳 + 构建 + 真机 WSL2 排水回归 | `tests 38 / pass 38 / fail 0`；`UNIT=0 SHELL=0 BUILD=0`；`AVAIL: 1.5.17`；`PROMPT: ok=true`；`LEFTOVER: 0 DRAIN_MS: 1817 TEMP_FILES: []` |
| 第 4 轮终审基线与洁净检查 | `Get-FileHash` + `E:\wsl-agy\temp` 计数 + `wsl -d agy-wsl -- ps -ef` + `scratch` 检查 | 4 个改动文件 SHA-256 固化；`E:\wsl-agy\temp count=0`；`WSL leftover agy procs=0`；`Scratch temp files=0` |

---

## 5. 发现清单

| 编号 | 级别 | 类别 | 描述与证据 | 影响 | 建议与处置 |
| --- | --- | --- | --- | --- | --- |
| F1 | 中 | Bug / 边界 | `desktop/agy-cli-client.mjs` 的 `startSpare` 原按单个 `stderr` chunk 匹配 `RESOURCE_EXHAUSTED`，若被流式分块切开会漏判；且 `rl.on('line')` 未检查 `event.event === 'error'` 顶层事件。 | 偶发分包或独立 error 事件时无法触发 20 分钟熔断。 | **已修正（第 1 轮）**：增加 512 字符滑动窗口 `errTail` 拼接检测，并在 `rl.on('line')` 中补充 `event.event === 'error'` 检测。 |
| F2 | 中 | Bug / 流程 | `desktop/agy-local-model.mjs` 中 `conversation.ask` / `batch.ask` 首次真实访问触发 `RESOURCE_EXHAUSTED` 后，进入 `runWithFallback` 被一并标为 `skipped: true`，导致该次首次触发错误日志也被吞掉。 | 首次真实触发熔断时缺少触发日志，不利于事后判断何时进入 20 分钟熔断。 | **已修正（第 1 轮）**：区分 `triggeredExhausted`（首次真实触发，不补冷启动、保留该次 1 条错误日志）与后续 20 分钟内的 `skipped: true`（零访问、零错误日志），并补充单测断言。 |
| F3 | 低 | 流程 / 优化 | `desktop/ai-gateway.mjs` 的 `agyVision` 处于 20 分钟熔断期时，仍会先进入 `vision-client.mjs` 创建临时目录、落盘写图再调用 `runAgyPrompt` 短路后删图。 | 熔断期内频繁自动看屏会产生无意义的临时文件写删。 | **已修正（第 1 轮）**：在 `agyVision` 中对默认 `runAgyPrompt` 且 `isAgyResourceExhausted()` 时直接跳过落盘，按失败走备用视觉（或返回失败文案），单测验证 `never-created` 目录不被创建。 |
| F4 | 低 | 流程 / 边界 | `desktop/agy-cli-client.mjs` 在 20 分钟熔断期满后，若首条请求走 `createAgyConversation`（对话会话）而非冷启动 `runAgyPrompt`，此前被熔断停掉的待命进程 `spare` 不会恢复预热。 | 熔断恢复后任务类调用退回冷启动，响应变慢。 | **已修正（第 1 轮）**：在 `createAgyConversation` 成功返回结果后，若 `standbyOn && (!spare || spare.dead)` 同步调用 `startAgyStandby(standbyModel)` 恢复预热。 |
| F5 | 中 | Bug / 边界 | 第 1 轮新增的 `agyVision` 熔断短路分支未校验 `signal?.throwIfAborted?.()` 与空图片/缺 `data_base64` 参数，会直接把空图或已取消请求传给备用视觉。 | 与 `createAgyVision` 前置校验语义不一致，可能误调云端视觉。 | **已修正（第 2 轮）**：补齐 `signal?.throwIfAborted?.()`、`rejectCutoutQuestion` 与 `normalizeImageList` 参数校验，并补充单测断言。 |
| F6 | 低 | Bug / 边界 | `desktop/agy-local-model.mjs` 的 `runWithFallback` 熔断分支在 `signal?.aborted` 时返回 `{success: false, error: 'ABORTED'}` 而非与 `runAgyPrompt` 一致地调用 `signal?.throwIfAborted?.()`，会导致 `work()` 路径未抛取消异常并误写一条失败日志。 | 熔断期内主动取消工作任务时行为与非熔断期不一致。 | **已修正（第 2 轮）**：改为调用 `signal?.throwIfAborted?.()`，与非熔断期保持一致，并补充 `analyze` / `work` / `agyVision` 取消单测。 |
| F7 | 中 | Bug / 边界 | 第 3 轮真机 WSL2 回归实测发现：`runStandby` 刚预热新备用进程后立即 `stopAgyStandby()` 时，`stopChild` 原默认 `1500ms` 宽限短于新进程初始化时间（约 2–5 秒），会提前强杀 `wsl.exe` 包装进程，造成容器内 `agy` 短时脱管（1.5s 时刻测得 `LEFTOVER: 1`）。 | 快速停机/重启期间可能产生短时脱管进程。 | **已修正（第 3 轮）**：将 `stopChild` 默认优雅宽限调整为 `6000ms`（已就绪进程仍约 0.7s 退出，初始化中进程初始化完即读到 EOF 自然退出）；真机回归验证 `LEFTOVER: 0`（`DRAIN_MS: 1817`）。 |

---

## 6. 逐轮自审记录

### 第 1 轮
- **上轮遗留**：无（首轮）。
- **五项检查**：
  - ① Bug/边界：发现 F1、F2、F4。
  - ② 不合理流程：发现 F2（首次触发被吞日志）、F3（熔断期识图无效写删盘）。
  - ③ 需求偏离：核心能力吻合，F2 偏离“报 `RESOURCE_EXHAUSTED` 后”的时间边界语义，已纳入修正。
  - ④ 合规性：通过，符合单人最简设计与 `ai-gateway-guard` 分层约束。
  - ⑤ 可优化项：F3、F4 均具明确实际收益且在范围内。
- **本轮修正**：修复 F1、F2、F3、F4，补充对应单测。
- **本轮验证**：6 组单测 38/38 通过，`test-desktop-shell` 通过，`build-desktop` 通过。
- **遗留问题**：无。
- **连续达标轮数**：`0`（本轮有新发现）。

### 第 2 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug/边界：发现 F5（`agyVision` 熔断短路缺少取消与空图校验）、F6（`runWithFallback` 熔断分支取消语义与 `runAgyPrompt` 不一致）。
  - ② 不合理流程：无其他问题。
  - ③ 需求偏离：无。
  - ④ 合规性：通过。
  - ⑤ 可优化项：无新增。
- **本轮修正**：修复 F5、F6，并在 `agy-cli.test.mjs` 中补齐空图不调兜底、临时目录不创建及 `analyze`/`work`/`agyVision` 取消断言。
- **本轮验证**：6 组单测 38/38 通过，`test-desktop-shell` 通过，`build-desktop` 通过。
- **遗留问题**：无。
- **连续达标轮数**：`0`（本轮有新发现）。

### 第 3 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug/边界：真机 WSL2 回归发现 F7（`stopChild` 1.5s 宽限过短，初始化中预热进程提前被杀 `wsl.exe` 导致短时 `LEFTOVER: 1`）。
  - ② 不合理流程：无其他问题。
  - ③ 需求偏离：无。
  - ④ 合规性：通过。
  - ⑤ 可优化项：无新增。
- **本轮修正**：将 `stopChild` 默认优雅宽限调整为 `6000ms` 并补注释。
- **本轮验证**：6 组单测 38/38 通过，`test-desktop-shell` 通过，`build-desktop` 通过；真机 WSL2 回归通过（`AVAIL: 1.5.17`，`PROMPT: warm=true, ok=true`，`LEFTOVER: 0`，`DRAIN_MS: 1817`，`TEMP_FILES: []`）。
- **遗留问题**：无。
- **连续达标轮数**：`0`（本轮有新发现）。

### 第 4 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug/边界：逐行复查最终代码、边界条件、哈希与环境状态，无新问题。
  - ② 不合理流程：各路径衔接顺畅，无重复、遗漏或死路。
  - ③ 需求偏离：与用户全部原始要求及后续变更完全一致。
  - ④ 合规性：符合单人最简设计、模块分层守卫与安全规范。
  - ⑤ 可优化项：范围内无进一步有实际收益项。
- **本轮修正**：无。
- **本轮验证**：4 个目标文件 SHA-256 固化；`E:\wsl-agy\temp` 空（0 项）；WSL 容器内残留 `agy` 进程 0 个；`scratch` 临时脚本 0 个。
- **遗留问题**：无。
- **连续达标轮数**：`1`。

### 第 5 轮
- **上轮遗留**：无。
- **五项检查**：
  - ① Bug/边界：复核 F1–F7 全部闭环及全部入口行为，无新问题。
  - ② 不合理流程：无。
  - ③ 需求偏离：无。
  - ④ 合规性：无违规、无敏感数据泄露、未越界改动正式安装版或非范围文件。
  - ⑤ 可优化项：无。
- **本轮修正**：无。
- **本轮验证**：代码与第 4 轮固化基线一致，未再发生改动，所有自动化测试、桌面构建及真机 WSL2 回归结果持续有效。
- **遗留问题**：无。
- **连续达标轮数**：`2`（达成连续两轮无新问题、无遗留问题条件，自审结束）。

---

## 7. 审核中改动与临时文件清理

- **审核中是否改动**：是。第 1–3 轮共修复 7 项发现（F1–F7），涉及 `desktop/agy-cli-client.mjs`、`desktop/agy-local-model.mjs`、`desktop/ai-gateway.mjs`、`agent/tests/agy-cli.test.mjs`，并全部复测通过；第 4–5 轮零改动。
- **临时文件清理**：已核验 `E:\wsl-agy\temp` 文件数为 `0`、会话 `scratch/` 临时脚本为 `0`、WSL2 容器内残留 `agy` 进程为 `0`。

---

## 8. 结论与状态

- **自审结论**：**自审通过**（共执行 5 轮，第 4、5 轮连续两轮无新问题、无遗留问题）。
- **当前状态**：**待用户确认**。
