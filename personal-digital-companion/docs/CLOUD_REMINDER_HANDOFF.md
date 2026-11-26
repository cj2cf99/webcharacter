# 云端登记提醒 · 交接

写于 2026-11-26（Asia/Tokyo）。下文中的仓库状态是写作时的快照，接手后先重新核对。

## 现在到哪了

| 阶段 | 状态 |
| --- | --- |
| 需求 | 用户已确认，经 6 轮自审通过；含九轮用户原话 |
| 设计 | 用户已确认；预览后的选定结果与默认分类已写入 |
| 界面预览 | 已选定；复验通过 |
| 开发 | **未开始**。上一条提问「按当前设计开始开发吗（不含部署）？」用户尚未回答 |
| 主站接入、花园登记、部署 | 未授权，各自需要用户单独确认 |

## 先读

1. [需求](CLOUD_REMINDER_REQUIREMENTS.md)（行为以它为准）
2. [详细设计](CLOUD_REMINDER_DESIGN.md)（接口、数据、改动文件、验证与部署顺序、界面选定）
3. 审核记录：[需求](reviews/CLOUD_REMINDER_REQUIREMENTS_REVIEW_2026-11-26.md)（历史过程）、[自审](reviews/CLOUD_REMINDER_SELF_REVIEW_2026-11-26.md)、[设计](reviews/CLOUD_REMINDER_DESIGN_REVIEW_2026-11-26.md)、[预览](reviews/CLOUD_REMINDER_PREVIEW_REVIEW_2026-11-26.md)
4. 全局框架偏好 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`，以及设计第 1 节列出的备忘录

需求审核报告里的较早结论已被后续轮次覆盖（例如自动重试、每小时重弹、全屏检测），不要照它实现。

## 一句话流程

云端专用页先建任务，再生成所选记录（三类默认全勾，`link_id` 关联）→ 绯月领取即完成任务，进「待确认」→ 满 1 小时未确认且不忙则弹清单窗，弹出即确认 → 48 小时内反馈一次，结束提醒并追加子节点，过期只结束提醒 → 失败即结束，写日志并发带链接的提醒项。

## 用户的偏好

- 最简设计。第八轮原话：「失败了就结束，自动走不通我手动，别设计的太麻烦」。不要追加用户没要的重试、状态或恢复机制，少抛解释清单。
- 唯一的重试按钮在云端录入页，当场可点。
- 菜单名称「🔖 云端提醒」是按推荐定的，用户回复「abb」只指明了前三项（专用页面 A、弹窗 B、单独页 B）。

## 开发顺序

1. **源码对齐**（设计第 3 节）：`web/chains.js`、`web/chains.css` 从提交 `118c90e` 取回；`agent/host/subscriptions.mjs` 补 `myMainStorage: env.myR2`。对齐后重新与线上副本比对。**不要运行 `tools/sync-release-sources.mjs`**，接入时只逐个复制本功能改动的文件。
2. 主站模块 `agent/host/cloud-note.mjs`、页面脚本样式、迁移 SQL，隔离 SQLite 测试。
3. 链接筛选：鱼与熊掌、随手记先在来源子项目改；事项提醒归主站。
4. 订阅 API 部分（`agent/`）。
5. 绯月桌面部分。
6. 联调与复核。

往 `G:/cloudflare/myapp` 写入属于主站接入，需用户另行指示。

## 动手前必须知道

相关仓库都有**本任务之前就存在的未提交改动**，本次会话只读过它们。保留这些改动，不回退、不混入提交。

| 仓库 | 分支／提交 | 未提交项数 | 与本功能重叠 |
| --- | --- | --- | --- |
| 本项目 | `codex/workspace-checkpoint-20261120`／见下节 | 见下节 | — |
| `G:/cloudflare/myapp` | `main`／`05c31fd` | 30 | `myapp/migrations/0034_garden_release_tenths.sql` 未跟踪，本功能用下一个编号 |
| `G:/selftool/informationManage/api-worker` | `main`／`a63983a` | 7 | `api-worker/src/index.js` 等 |
| `G:/selftool/recordanyting` | `main`／`dab8c69` | 12 | `public/app.js`、`src/api.js`；已有未跟踪迁移 `0004` |
| `G:/selftool/resourceforlater` | `main`／`a834975` | 12 | `public/resources/app.js`、`src/api.js`；已有未跟踪迁移 `0002` |

- 开发基线取工作区现状，不要只看提交。此前的差异比对也是对工作区文件做的。
- 来源子项目与主站的对应文件有内容差异（随手记前端与接口、资源接口），改之前逐个比对。
- 与本功能无关的源码漂移另有任务卡 `task_776bd4b0`（提出于 2026-11-26，未见启动；7 天后失效）。

## 实现时容易踩的点

- 主站提醒接口拒绝未知字段；用 `env.companionInsert` 在同批补写 `link_id`。
- 现有资源、随手记接口把意外错误换成笼统提示；新模块直接写库并返回原始错误。
- 订阅 API 与 `chain-page.mjs` 的笼统失败提示要附原始信息；桌面请求封装要保留网络错误原因。
- 弹窗扩展现有消息框：`desktop/message-box.mjs` 按固定字段传参，需加 `items`。弹出即确认，关窗不区分。
- 菜单「待确认」目前只在有提问时出现；改菜单按 `DESKTOP_UI_GUIDE.md` 同步测试与指引。
- GPU 读数复用 `desktop/balanced-local-model.mjs` 的 `readGpuLoad`。
- 已告知用户的风险：占用一直高于 60% 时，记录会没弹出过就过期。用户未要求改。

## 本项目的提交状态

- 用户在交接后要求提交，本任务改动随包含本文件的提交进入 `codex/workspace-checkpoint-20261120` 并推送：`docs/CLOUD_REMINDER_{REQUIREMENTS,DESIGN,HANDOFF}.md`、`docs/reviews/CLOUD_REMINDER_*`、`prototype/cloud-reminder/`，以及 `docs/DEVELOPMENT.md`、`docs/REQUIREMENT_CHANGES.md` 的指引。
- 提交前该分支位于 `6c69c67`：在基线 `6289551` 之后多了一个动画比例修正（只改 `desktop/configured-renderer.mjs`、`effect-preview.mjs`），与本功能不重叠。
- **不属于本任务，未提交**：仓库根的未跟踪文件 `=`、`docs/reviews/CURIOSITY_REQUIREMENTS_REVIEW_2026-11-25.md`
- `G:/selftool/WebCharacter/.claude/launch.json` 增加了 `cloud-reminder-preview`（该文件被 Git 忽略，只在本机）

## 预览

在项目目录运行：

```powershell
node prototype/cloud-reminder/build.mjs
```

然后启动 `cloud-reminder-preview`，地址 `http://localhost:8795/index.html`。写交接时服务仍在运行。构建会只读复制主站与桌面样式，产物 `assets/`、`web.html` 不入库。

## 给新会话的开场白

```text
接手「云端登记提醒」。先读 personal-digital-companion/docs/CLOUD_REMINDER_HANDOFF.md，核对仓库现状后告诉我下一步。
```
