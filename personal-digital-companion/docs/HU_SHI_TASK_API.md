# 「我也是胡适」登记任务

2026-11-19 JST。

> 我新增了吃喝运动撸管记录的我也是胡适模块，再任务里追加这三个的模板并追加对应接口
>
> 及其相关改动

依据项目 CLAUDE.md、开发指南、任务模板与提交号设计、全局 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`，以及随手记来源项目 `G:/selftool/recordanyting/docs/hu-shi/DESIGN.md` 和主站 `G:/cloudflare/myapp/docs/design/records/hu-shi.md`。文档索引未找到独立设计备忘录。沿用固定分类、服务器登记时间、同账户跨终端共享任务及静态适配表。通过 [D1 批处理](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) 一起保存任务结果和尝试记录。

## 入口和参数

| 任务类型 | params | 复用的主站 POST |
| --- | --- | --- |
| `hu-shi.food.create` | `body` 必填，`reflection`、`tag_ids`、`photos` 可选 | `/api/records/hu-shi/food/entries` |
| `hu-shi.exercise.create` | 同吃喝，Tag 和图片使用运动分类 | `/api/records/hu-shi/exercise/entries` |
| `hu-shi.event.create` | `{}`，由主站生成登记时间 | `/api/records/hu-shi/event/entries` |

正文 1–4000 字，感想最多 4000 字。Tag 填当前类别已有 ID，最多 50 个；照片填该分类已上传的 HTTPS 地址，最多 20 张。目标模块继续检查分类内 ID 与图片目录。任务只登记，照片上传和 Tag 管理继续走原模块。固定类别无需提交分类参数；三个模板均不接受自填登记时间。

共用一套任务入口。先 `POST /api/companion/task-submissions` 取无有效期提交号，再 `POST /api/companion/tasks`。用户明确确认执行后向 `POST /api/companion/tasks/:id/execute` 提交空对象，执行使用任务已保存的参数。详情仍通过 `GET /api/companion/tasks/:id`。子项目 Worker 不带 `/companion` 前缀。

例。手机创建 `{"submission_id":"已签发的号","type":"hu-shi.exercise.create","params":{"body":"晚饭后步行 30 分钟","reflection":"鞋子很舒服"}}`，电脑可查看同一任务。执行成功返回原任务详情，`status` 为 `COMPLETED`，`result` 为 `{record_id,created_at}`。时间保留主站 UTC 毫秒格式，展示按东京时间。任务为云端执行，独立于 PC 领取的两个名额。

## 状态与接线

- 执行入口先过原账号认证和同源写入校验，再按提交号的账号归属核对任务。只有已登记的这三种独立云端任务可以从 PENDING 启动。并发只能有一次启动，已保存的终态重复调用只回读。
- 主站明确拒绝时沿用最多两次尝试的规则；一键事件继续由主站实施十秒冷却。两次拒绝会在任务中保存失败及说明。连接、服务端异常或回执无效时无法确认是否已写入，返回 202，任务保留 RUNNING 并标记登记结果待核对；重复执行请求拒绝，用户可到主站对应分类核对。目标端支持按任务标识查原回执后，才适合自动恢复这一分支。
- 主站集成时由现有路由把 `handleRecords` 与已有 `authorizeMarket`、`createEnvAiClient` 一起传给 `createCompanionMount`。原随手记处理器校验同源与类别，使用主站 `mymaindb` 写记录，精灵任务表继续用 `COMPANION_DB`。无主站处理器时执行返回 503，任务仍待执行。三个类型通过 `agent/seeds/tasklist-hu-shi.sql` 安装至任务库，重复加载保留原定义。

## 验证与复核

在 personal-digital-companion 目录：

```powershell
$env:COMPANION_HU_SHI_MAIN_SOURCE = 'G:/cloudflare/myapp'
node --test agent/tests/*.test.mjs
```

新增四项专项覆盖模板加载与参数、共用入口和业务回执、身份与隔离、并发与回执丢失。指定主站源码路径时，使用主站真实随手记路由、胡适 API 和 0030 SQL，另建内存库读回三个类别，同时验证错误分类 Tag 和冷却不会写入记录。常规回归在没有这个环境变量时跳过源码联调一项。首轮复核对照用户原话、主站字段和任务提交约定通过。仅修改精灵子项目，未写入主站仓库、生产数据库或部署。
