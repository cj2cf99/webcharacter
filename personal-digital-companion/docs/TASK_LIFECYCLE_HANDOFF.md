# 未领取任务取消与截止宽限：非界面交接

2026-11-18 JST。第六组依据AGENT_BATCH_06_DESIGN.md。只交付接口、数据及测试，不开发页面、过期服务或运行中强停。

## 取消接口

POST /api/tasks/:id/cancel，请求体必须是`{}`，沿用现有账户Bearer，不要求device_id。成功返回`{cancelled:true,task}`：

- PENDING改为CANCELLED，保留参数、类型说明与历史；不新建execution，不写task_activity。
- 已CANCELLED重复请求成功返回现状。
- RUNNING、COMPLETED、FAILED、EXPIRED返回409，不伪造终止执行。
- 未知任务404，非法JSON/额外字段400，未认证401，错误方法405。

取消与领取都用条件UPDATE，谁先改变PENDING谁成功；后到方返回当前状态对应的失败。cloud任务也可由账户取消，不需要PC身份。

例：用户在手机上发现给homepc的任务参数填错，未领取时取消原任务，再提交新任务。取消不表示homepc刚刚连接或上报，所以设备最后任务更新时间不变化。

## 可选截止字段

POST /api/tasks增加可选`deadline_at`。省略或null表示无限期。时间须为真实日历日期、四位年份和明确时区的ISO日期时间，可带秒及1..3位小数秒；接受Z或显式偏移，统一返回UTC ISO。无时区、错误日期（如非闰年2月29日）、24点、秒60等拒绝，不由服务器默认时区猜测。

日本时间输入示例：

```json
{
  "type": "已配置任务类型",
  "target_device_id": "pc-固定UUID",
  "params": { "具体参数": "由该类型定义" },
  "deadline_at": "2026-11-18T18:00:00+09:00"
}
```

存储/返回为`2026-11-18T09:00:00.000Z`。界面收集和展示均用Asia/Tokyo（JST），不得把返回UTC的09:00直接当日本时间显示；datetime-local等无时区输入需由界面明确附日本时区后提交，不隐式跟随浏览器所在时区。

允许提交截止已经过去的记录，不新增修改截止接口。是否可新领取按下述规则判断。

## 7天宽限与查询字段

只有PENDING的新领取受限制：服务端当前时刻达到`deadline_at + 7 × 24小时`时拒绝，返回409/TASK_DEADLINE_PASSED。不在截止时立即拒绝，不把过期记录批量写成EXPIRED。

例：2026-11-18 18:00 JST截止，11月25日17:59:59.999 JST仍可领取；18:00 JST起不可领取。已RUNNING的任务继续可核对、更新进度、回传和补传结果，不会因为跨过宽限被中断。

GET /api/tasks/:id及GET /api/devices/:id/tasks的任务摘要增加：

- deadline_at：规范UTC字符串或null。
- can_claim：只由状态、截止宽限与暂停类型计算。PENDING且未超宽限且非暂停类型才true；RUNNING、CANCELLED及其他终态、暂停的disk.query均false。

can_claim不是身份认证或目标设备授权；界面用于禁用新领取入口，真正领取仍须通过账户认证及原目标校验。查询不写库，不自动更改状态，也不隐藏不可领取任务。设备active_count仍表示PENDING+RUNNING总数，不能解释成可领取数。

运行中的can_claim=false仅表示不能“新领取”，不影响原claim接口的同目标RUNNING核对。现有syncTask遇到取消或过宽限的待执行任务不会运行handler；其他未设截止任务照常执行。原首次失败立即重试一次、第二次失败结束规则不变。

## 迁移与未验证

新增migrations/004-task-deadline.sql，仅执行一次ALTER TABLE；旧任务deadline_at为NULL，原数据不变。生产脚本不提供重复ALTER容错。测试初始化用PRAGMA table_info判断是否已存在该列，仅在缺列时执行正式004，避免重复初始化测试再次ALTER。

实际本地Worker准备时，先确认001至003已应用，再仅一次运行（工作目录`G:\selftool\WebCharacter\personal-digital-companion\agent`）：

```powershell
wrangler d1 execute DB --local --file migrations/004-task-deadline.sql --persist-to .local/state
```

本轮没有运行上述Wrangler命令，只在隔离SQLite验证从001至003升级、004执行一次及重复测试初始化。常驻HTTP、界面JST控件、真实D1和生产部署均未验收；不能把自动测试通过说成这些已完成。
