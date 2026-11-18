# 第一组：任务单元存储与最小API

2026-11-18 JST。实施依据：AGENT_MINIMAL_DESIGN.md中的用户原文及最新确认。用户本次指示：“没问题就定下开发详细内容设计和验收用的测试大纲和验收标准然后交给一个子任务去处理，你去处理下一组”。本次授权设计、实现与本地自动测试，不包括部署、安装新依赖或启动供用户验收的常驻Worker。

## 参考与约束

已查阅CLAUDE.md、项目开发指南、原始V1.5与本轮最小设计、G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md；独立全局/项目备忘录未找到的情况见最小设计记录。落实单用户、最少组件、最多3项、无链式任务、无用户管理、不改桌面界面。V1.5独立常驻要求被用户最新生命周期决定覆盖。

## 三个细任务与文件边界

1. 在agent/建立原生ES Modules Worker入口及D1迁移/初始化，绑定名DB，无新增依赖。
2. 实现GET /api/tasklist、POST /api/tasks、GET /api/tasks/:id，固定类型定义存D1，参数JSON；不实现执行器或链式调度。
3. 用已有Node内置测试与SQLite验证真实SQL和HTTP Request/Response入口，记录验收与运行准备。

子任务拥有agent/下文件，但不修改agent/devices/、agent/migrations/002-devices.sql和agent/tests/devices.test.mjs（第二组保留范围）。第一组迁移允许创建最小devices表以便任务目标外键验证，具体契约如下；第二组不再建重复表。由主会话最后集成设备路由，不由子任务猜测。

## 数据与行为

devices：device_id TEXT PRIMARY KEY、computer_name TEXT NOT NULL、alias TEXT NULL UNIQUE COLLATE NOCASE、created_at TEXT NOT NULL。alias空白规范为NULL。ID为不含秘密的固定标识，不充当认证凭据。

tasklist：type TEXT PRIMARY KEY、name TEXT NOT NULL、description TEXT NOT NULL、executor TEXT NOT NULL CHECK cloud/pc、parameter_spec_json TEXT NOT NULL、procedure TEXT NOT NULL、report_spec TEXT NOT NULL。

tasks：task_id TEXT PRIMARY KEY、type TEXT NOT NULL REFERENCES tasklist(type)、target_device_id TEXT NULL REFERENCES devices(device_id)、params_json TEXT NOT NULL、status TEXT NOT NULL（PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/EXPIRED）、attempt_count INTEGER NOT NULL DEFAULT 0 CHECK 0..2、created_at TEXT NOT NULL、result_json TEXT NULL、error TEXT NULL。时间为UTC ISO字符串，显示方按东京时间显示。JSON列检查json_valid；所有SQL绑定参数。

只初始化disk.query类型（pc，L1只读）；参数定义采用简单JSON对象：{"drive":{"type":"string","required":true,"pattern":"^[A-Za-z]:$"}}。不建设通用JSON Schema引擎，按已支持类型做小型验证。流程明确“目标PC查询指定盘符容量，返回总量/可用字节，失败报告原因”。Paylog/提醒仅为设计示例，不能初始化成可执行功能。

POST请求：{"type":"disk.query","target_device_id":"pc-...","params":{"drive":"C:"}}。服务器生成UUID任务ID、PENDING及attempt_count=0，返回201与任务。请求不能自行写状态、次数、结果。拒绝不支持类型、未知目标、无效JSON/参数；cloud类型不能带PC目标。GET任务返回实际参数和关联的类型名称/说明/流程/报告要求，JSON字段以对象返回；未执行的结果为空，不能假成功。

例：同一disk.query类型创建C盘与D盘两条任务，共用说明，各自保存参数；关闭再打开本地数据库后仍能查到。设备从固定ID改名homepc后，任务仍通过ID关联到同一设备。

## 认证与错误

本轮采用一个服务端环境秘密API_TOKEN验证Bearer请求，所有/api路由未认证返回401；缺少服务端配置则失败关闭，不允许默认通过。这是单用户开发API认证，不宣称已完成Access或设备可撤销凭证；令牌不能放URL、源码、数据库、响应或日志。正式接入Access/设备认证在对应阶段处理。浏览器界面不在本轮，不把服务秘密注入浏览器。测试用一次性假令牌。

错误最少为400（JSON/参数错误）、401、404（类型/设备/任务未找到）、405、500（通用内部错误，不泄露SQL或凭据）。不要新增错误平台。

## 重试边界

本组只存储创建和查询，不执行任务。保留attempt_count并验证0..2约束；不可宣称重试功能已完成。后续执行阶段必须验证：首次成功结束；首次失败立即同任务同参数重试一次；第二次成功或失败均结束，无第三次；持久次数不因重启清零；写操作沿用幂等/核对。

## 测试大纲与验收标准

| 编号 | 测试 | 通过标准 |
| --- | --- | --- |
| A01 | 在临时SQLite执行正式迁移与种子SQL | 表和类型存在，重复初始化不破坏已有任务 |
| A02 | 通过真实Worker fetch入口列类型、创建并查询 | JSON一致，201/PENDING/次数0，流程说明齐全 |
| A03 | 关闭并重开同一临时数据库 | 任务仍可查，非纯内存模拟持久化 |
| A04 | 参数/目标/类型错误及状态注入 | 拒绝且无新增任务；正确盘符可用 |
| A05 | 无令牌、错误令牌、缺服务端配置 | 均不放行，响应无秘密 |
| A06 | 查询不存在任务、方法错误、内部错误 | 状态明确且不泄露内部错误 |
| A07 | SQL外键与JSON/次数约束 | 无效关联/JSON及次数3被拒绝 |
| A08 | 范围复核 | 无界面改动、执行器、链式表/接口、新依赖或生产操作 |

测试使用node:sqlite作D1 prepare/bind/first/all/run的薄适配，必须运行真实SQL，不用按字符串返回预设结果的假数据库。明确其不是Cloudflare D1运行时验收。若已有可用Wrangler可准备准确本地命令，但不下载依赖、不擅自启动常驻服务；未完成真实Worker/D1运行时验证须列为未验证，不以模拟替代。提供本地准备说明，启动等待用户指示。

## 交付与复核

agent/README.md记录实际命令、初始化与限制；docs/reviews/AGENT_BATCH_01_REVIEW_2026-11-18.md记录文件基线、实际测试、最多三轮复核及剩余项。先报告偏离再修正，任一轮无残留即停止。不得修改无关已有工作、不Git提交推送、不部署。验收结论区分“本地自动测试通过”和“实际Worker验收未执行”。

设计复核：单用户字段与任务单元边界一致；为避免第一组接受不存在设备而加上必要devices最小表，第二组仅提供设备识别/命名模块。不增加注册管理系统。设计首轮无待修正项。
