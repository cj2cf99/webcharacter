# 陪我学习返回导航与界面复核（2026-11-27 JST）

- 对象与范围：`desktop/study-ui.mjs`、`study.css`、`study-host.mjs`（`leave` 接口、默认最大化），`tools/test-study-electron.mjs`。
- 对照：[需求 N1～N5](../../REQUIREMENTS.md#陪我学习页面返回导航界面美化与默认铺满)、[设计](../STUDY_DESIGN.md#返回导航默认铺满与界面2026-11-27-jst)。
- 基线：`bb887c9` 加开发区未提交的「语言对练精简」改动（快照见 `docs/releases/study-trim-20261127/`）。本次改动叠加其上，未提交。
- 方式：主会话代码对照、隔离 Electron 实点与截图检查、单元测试。

## 发现与处理

| 轮 | 发现 | 级别 | 处理 |
| --- | --- | --- | --- |
| 1 | 从复盘记录打开复练场次时，返回会跳到来源作答，偏离「上一级」。 | 中 | 只有本页内发起的复练才返回来源作答，其余返回列表，底栏保留来源入口。 |
| 1 | 场内每次重绘都重建导航，页签动画反复播放。 | 低 | 仅进入场次或状态变化时重建。 |
| 1 | 底部渐变与提示条处出现硬边；复盘按钮被拉满宽；时间副标题换行。 | 低 | 去掉底部渐变，按钮靠左，卡片最小宽 260px。 |
| 2 | 复跑测试，无新问题。 | — | — |

## 实际执行

- `node tools/build-desktop.mjs`：通过。
- `electron tools/run-electron-check.mjs tools/test-study-electron.mjs`：通过（默认最大化、逐级返回、功能归属、语言场次返回即结束、浅深色 360px 导航不换行）。模型为替身。
- 临时脚本（渲染层接口替身，位于会话临时目录）：来源目录分页 → 材料 → 返回、历史复练返回层级，通过。
- `tools/test-panel-titlebar-electron.mjs`：通过。
- `node --test agent/tests/study.test.mjs agent/tests/study-voice-generate.test.mjs`：20 项通过。
- `git diff --check`：仅换行符提示。
- 截图在 `output/menu-qa/study-*.png`。最后一次样式微调（卡片宽度、按钮靠左）后未再逐张看图。

## 未执行与遗留

- 全量 Node 测试、日语样本、本机 Workerd 联调未跑（本次未改相关链路）。
- 正式安装版未更新，实际观感待用户确认。
- 生成对话进行中仍不能返回，只能关窗。

## 结论

有条件通过（开发树），待用户确认。临时脚本只在会话临时目录。
