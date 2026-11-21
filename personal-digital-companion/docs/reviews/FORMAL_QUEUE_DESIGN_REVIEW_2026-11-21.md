# 正式工作队列 · 需求与设计三轮自审（2026-11-21 JST）

状态：待用户确认。本报告是开发会话内的自审，没有第三方审核。

## 审核对象与范围

- **审核对象**：`docs/FORMAL_WORK_QUEUE.md`（需求与设计稿）。
- **不在范围**：代码实现（尚未开始）、安装与花园登记。

## 对照依据

- 用户在本次会话中的原话，共五条，已引在设计稿 §1 开头。
- `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`：最简设计、三轮审核、懒加载与分页约束。
- 项目 `AGENTS.md`：本机更新与花园登记流程。

## 基线

开发区 Git 为 `codex/workspace-checkpoint-20261120`，工作区另有大量未提交改动。读代码时逐文件比较过开发区与安装版（`G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`），忽略换行差异：

- 以下文件两边一致：`local-rest.mjs`、`task-lifecycle.mjs`、`task-poller.mjs`、`chain-client.mjs`、`task-inbox-ui.mjs`、`task-inbox-host.mjs`、`agent/execution/runner.mjs`、`docs/LOCAL_GARDEN_API.md`、`agent/tests/local-rest-garden.test.mjs`。
- `local-task-pool.mjs` 有 2 行差异。
- `shell.mjs` 有分歧，开发区含未发布的情绪、此刻所想等功能。

## 审核方式

- 阅读了 `desktop/shell.mjs`（`memoryJob`、`memoryIdle`、`isBusy`、`localPool` 的 `canWork`、`onResult`）、`desktop/local-task-pool.mjs`、`desktop/local-rest.mjs`、`desktop/task-lifecycle.mjs`（`canPoll`、`tasksIdle`、`runTaskOperation`、`chainClient` 名额）、`desktop/task-poller.mjs`、`desktop/poll-scheduler.mjs`（入队与顺延）。
- 只读本机 `GET /infoguide`（v3）。
- 未执行测试，未触碰任何用户资料或生产数据。

## 发现清单

| 编号 | 轮次 | 类型 | 级别 | 问题 | 处理 |
|---|---|---|---|---|---|
| 1 | 一 | 缺陷 | 高 | 轮询调度里 `tasks` 这一项的忙碌判断包含 `tasks.activeCount()>0`。只改 `canPoll` 的话，正式工作一忙任务轮询就会顺延，达不到“有空位就接”。 | 已修正：§2.3 补上“`tasks` 一项只看 `canPoll()`” |
| 2 | 一 | 需求偏移 | 中 | 初稿把写日记、补评价、轮询、问答、生图都列为正式工作，与用户第二条原话不符。 | 需求阶段已改；设计稿 §1.2 按原话列为非正式工作 |
| 3 | 一 | 需求偏移 | 中 | 初稿写了“服务器也可放宽到 20”的选项，用户已选只改本地。 | 设计稿只改本地，服务器保持 2 个名额，写入 §1.1 与 §1.5 |
| 4 | 二 | 最简 | 低 | 新增 `GET /v1/status` 与已有的 `queue` 信息重复。 | 已删除：当前状态并入 POST 和 GET 回执的 `queue.running` |
| 5 | 二 | 最简 | 低 | `ack` 要求附带 reviewHash，对单人本机接口属于多余保护。 | 已删除：ack 无需正文，只限 done 的批次 |
| 6 | 二 | 缺陷 | 中 | 旧库升级后，历史批次没有取回记录，会全部涌进待回执清单。 | 已在 §2.4 写明：历史批次视为已取回 |
| 7 | 三 | 缺陷 | 中 | 已接取的两个云端任务现在可能同时执行（`inFlight` 上限 2），与“逐个处理”不符。 | §2.2 改为串行执行，第二个等第一个结束 |
| 8 | 三 | 风险 | 低 | 正式工作不再等问答、生图，两者可能同时占用 GPU。服务器生图（正式）与气泡生图（非正式）都经 ComfyUI，由 ComfyUI 自己的队列排序，不会冲突。 | 不改，记录在案 |

第三轮复查前两轮的修正，没有新的问题。

## 待用户决定（不擅自定）

1. 开始工作模式下，登记批次是否照常执行。建议照常执行。
2. 暂停（blocked）的批次是否占用 20 个名额。建议占用。

## 结论

有条件通过：用户确认上面两项及设计稿全文后即可开发。

## 修改与临时文件

- 新增 `docs/FORMAL_WORK_QUEUE.md` 与本报告。
- 未修改代码、数据或配置，没有临时文件。
