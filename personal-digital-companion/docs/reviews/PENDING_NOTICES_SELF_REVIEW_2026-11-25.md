# 待确认内容挂入提醒 · 自审明细报告（2026-11-25 JST）

- **审核对象与范围**：`personal-digital-companion` 中「待确认内容挂入提醒」功能（方案 A）的需求文档、设计文档、桌面实现与测试：
  - `REQUIREMENTS.md`、`docs/DESIGN.md`
  - `desktop/reminder-checks.mjs`、`desktop/shell.mjs`、`desktop/screen-question-host.mjs`
  - `desktop/conversation-details.mjs`、`desktop/conversation-preload.cjs`、`desktop/conversation-ui.mjs`、`desktop/conversation.html`、`desktop/conversation.css`
  - `tools/test-reminder-checks.mjs`
- **基线**：分支 `codex/workspace-checkpoint-20261120` @ `40efa94`（工作区增量；正式安装版基线核对 8 个目标文件均与 `HEAD` 一致）
- **审核方式**：多轮代码走查（对照原始需求、已确认设计、最简原则与正式安装版结构）+ 自动化测试与桌面构建实测。
- **状态**：待用户确认

## 实际执行的命令与结果摘要

1. `node --test tools/test-reminder-checks.mjs` → **12/12 通过**（含新增「待确认提醒去重、自动消未读且不混入天气日记」用例）
2. `node --test tools/test-conversation-transcription.mjs` → **11/11 通过**
3. `node tools/test-desktop-shell.mjs` → **全部 7 组 PASS**
4. `node tools/build-desktop.mjs` → 成功构建 `output/desktop-bundle`
5. 正式安装版基线核对（PowerShell `git show HEAD:...` 对比）→ 全部 8 个目标文件 `HEAD == installed` 为 `True`；确认 `output/desktop-bundle/` 含 `conversation.{html,css}` 与 `conversation-ui.mjs`。

## 逐轮自审记录

### 第 1 轮（连续达标：0/2）

- **核对上轮遗留**：无（首轮）。
- **① Bug、缺漏和边界错误**：
  - **[F1 / 中]** `desktop/screen-question-host.mjs` 中 `syncReminderEditNotice()` 在 `attachScreenQuestion` 构造期同步调用；若启动时恰好存在需消除的过期提醒，会同步触发 `checks.changed()`，而 `desktop/shell.mjs:400` 在回调内访问尚未返回赋值的 `const screenQuestion`，引发 TDZ `ReferenceError`。
  - **修正**：改为 `queueMicrotask(() => { if (!disposed) syncReminderEditNotice(); });`，延后至 `attachScreenQuestion` 返回后再同步。
  - **验证**：复跑 `test-reminder-checks.mjs`（12/12）、`test-conversation-transcription.mjs`（11/11）、`test-desktop-shell.mjs`（全过）与 `build-desktop.mjs` 通过。
- **② 不合理流程**：无新发现。
- **③ 需求偏离**：无新发现。
- **④ 合规性与最简化设计**：无新发现。
- **⑤ 可优化项**：无。
- **本轮遗留**：无。

### 第 2 轮（连续达标：1/2）

- **核对上轮遗留**：F1 已修正并复测通过，无遗留。
- **① Bug、缺漏和边界错误**：逐行复核 `notices` 兼容迁移、`upsertNotice`/`resolveNotice`/`resolveNoticesExcept`、`weatherDiary` 过滤、`shownNotices` 会话期累加白名单、`openTranscript` 延迟闭包与 `editNoticeSeq` 竞态保护，未发现新问题。
- **② 不合理流程**：转录待确认/待核查、提醒修改草案的写入 → 菜单未读 → 复盘详情直达处理 → 处理/过期后自动消未读链路完整闭环，无断路。
- **③ 需求偏离**：对照用户原话「把待确认内容挂进提醒，要不然我得看好几个地方」及确认的方案 A，范围严格一致，绯月主动提问保持原入口。
- **④ 合规性与最简化设计**：复用现有 `notices` 表与「本地复盘 → 提醒」页签，仅增 2 个可空列与 1 个受限 IPC，无冗余组件。
- **⑤ 可优化项**：无。
- **本轮遗留**：无。

### 第 3 轮（连续达标：2/2）

- **核对上轮遗留**：无。
- **① Bug、缺漏和边界错误**：复核 `output/desktop-bundle` 产物同步与正式安装版文件映射，确认部署时同步 8 个 `desktop/` 文件及 3 个 `output/desktop-bundle/` 文件，不混入工作区其他无关改动，无新问题。
- **② 不合理流程**：无。
- **③ 需求偏离**：无。
- **④ 合规性与最简化设计**：无。
- **⑤ 可优化项**：无。
- **本轮遗留**：无。

## 结论

- **自审结论**：**自审通过**（连续 2 轮无新问题、无遗留问题）。
- **审核中改动与清理**：仅修正 F1 一处代码并重新构建 `output/desktop-bundle`，无残留临时文件。
