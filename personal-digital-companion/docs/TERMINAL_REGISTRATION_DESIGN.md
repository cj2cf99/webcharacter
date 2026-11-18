# 第二组增量：网页终端登记与认领详细设计

日期：2026-11-18 JST。状态：用户授权设计与子代理开发，需求审计须先于代码。原始需求和最新变更见AGENT_MINIMAL_DESIGN.md；本文件只细化已确认流程。

## 用户本次原话与审核流程

> 第二个我觉得没啥问题了，你可以按流程走然后交给子代理开发，子代理拿到需求后需要先做需求审计，确认功能设计正常，没偏离需求，也没有过度设计。子代理完成后你需要进行审核，审核做多持续4轮，每轮需要检查bug，需求偏移，是否符合最简化设计，有问题就改，没有问题就验收通过。4论下来还有问题就你自己改，改完你自己审核，如果你自己2轮都没改对，需要向我汇报。

本轮覆盖旧“最多三轮”上限：子代理先审需求，发现偏离先报告；完成后主会话最多4轮复核，每轮检查bug、需求偏移、最简设计，有问题交回修正，无残留即通过并停止。4轮后仍有问题由主会话接手，最多2轮自修自审仍有问题就报告，不无限循环。该授权不包括生产部署、启动常驻Worker或新增依赖。

## 依据与简化

已查阅仓库CLAUDE.md、docs/DEVELOPMENT.md、子项目开发状态、AGENT_MINIMAL_DESIGN.md、AGENT_BATCH_01/02_DESIGN.md、既有Worker与devices模块，沿用已读G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md的单人自用、最少组件原则。独立全局/项目备忘录缺失记录仍有效。本次不接主站，不创建用户表、登录系统、设备凭证平台或消息总线。

本线是非界面线：交付真实API、与UI无关的小型浏览器流程适配模块和界面接线说明，不绘制登记弹窗或终端管理页面。真实登录仍由已有/后续宿主完成；当前Worker单用户开发Bearer认证保持，不把API_TOKEN写进浏览器、cookie、文档或数据库。测试通过认证后的请求模拟接口；不能宣称已完成真实登录或手机页面验收。

## 三个细任务

1. 审计本文件与用户原文，记录需求映射、偏离/过度设计检查；审计通过后实现当前终端读取和用户接受后新登记。
2. 实现认领已有终端、别名兼容和独立于页面的流程适配；补齐网页入口不能充当PC执行目标的约束。
3. 真实SQL/Worker入口及浏览器流程单元测试、回归、接口交接和验收记录。

## 存储与关联

复用D1 devices表，无新增表/迁移。网页新ID由服务端生成web-UUIDv4；Windows固定ID继续pc-UUIDv4。新网页记录computer_name使用可选浏览器说明（如“手机浏览器”），未提供则“网页终端”，不假装获取了系统设备名称。alias沿用现有标注规则，未标注display_name为固定ID。

浏览器关联只保存一个非秘密终端ID cookie（建议名companion_terminal），D1保存名称与记录。cookie设置HttpOnly、SameSite=Lax、Path=/、Max-Age=31536000，HTTPS时加Secure；本地HTTP不加Secure。cookie不是登录或执行凭据，不用设备指纹、MAC、固定书签或localStorage。因所有入口属于同一用户，认领不需要签名令牌、验证码或关联中间表。

cookie清空后视为未关联，不删除D1记录。cookie格式错误或记录不存在同样视为未关联并清除过期关联。不会仅凭cookie跳过现有认证。

实现依据已核对：[MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)、[MDN Request credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)。HttpOnly关联由浏览器处理，界面脚本不读取cookie；适配请求显式same-origin，未实现跨域认证共享。

## API契约（均在现有认证之后）

| API | 请求/响应与行为 |
| --- | --- |
| GET /api/terminal | 不写D1；返回{terminal:设备对象或null, registration_required:布尔}，未关联提示由适配层返回登记状态 |
| POST /api/terminal/register | 仅接受{accepted:true, browser_label?:字符串}；未明确true拒绝且不写库。服务端生成web-ID并保存，Set-Cookie建立关联，201；如果当前已关联且记录有效则返回原终端200，不重复登记 |
| POST /api/terminal/claim | {device_id:已有pc或web-ID}；存在才设置关联cookie，返回原终端200，D1不新增/改名，不复制历史，不授予PC执行凭据；不存在404，不修改原关联 |
| GET /api/devices | 复用原接口，给管理界面提供已有终端及display_name |
| PATCH /api/devices/:id | 兼容web-ID，沿用原alias校验与唯一约束；PUT仍只用于Windows pc-ID登记，不能绕过接受登记接口创建web记录 |

输入严格接受本接口字段；browser_label只做1..255字符及控制字符检查，空缺用默认值。错误返回统一{error:{code,message}}和400/401/404/405/500，不泄露内部错误。所有终端响应Cache-Control:no-store。已有devices历史错误格式是否统一由实现按最小修改选择，不扩为错误框架。

createTask中PC任务必须引用pc-ID，web-ID不得成为磁盘查询的执行目标。网页入口认领homepc只表示来源/展示关联，不表示网页具备Windows执行能力；既有tasks不改归属、不回填来源字段，任务来源设计以后另批处理。

## 非界面浏览器适配（少量普通函数，不建框架）

采用调用方注入的已认证request/fetch函数，不读取或保存服务端API_TOKEN。提供登录后的检查、接受登记、拒绝登记/进入管理、认领动作；返回简单状态供界面使用：registration（提示）、management（列表）、ready（已关联终端）。

拒绝登记：只读取设备列表并返回management，不调用register、不写库；没有选择时保持该状态。认领成功返回ready。请求失败需让UI拿到错误，不能假成功、跳到ready或自动降级为新登记。未登录401交回宿主处理，不显示成可登记成功。是否disable按钮由页面处理，必要时小型适配避免同一动作重复提交，不建设重试/排队系统。

例：清理手机站点数据后重新登录→GET当前关联为null→显示登记询问→选择不接受→读取列表→选择myphone→认领原web-ID→名称和历史不变。接受登记则生成一条新记录，不必先填写名称；以后再标注。

## 测试大纲与验收标准

| 编号 | 场景 | 验收标准 |
| --- | --- | --- |
| T01 | 无cookie读取当前终端 | registration_required=true，D1设备条数不变 |
| T02 | 明确接受新登记 | 服务端web-UUID、D1新增一条、正确cookie属性、默认显示ID；再次带cookie请求沿用且不重复创建 |
| T03 | false/缺accepted/非法JSON/标签/伪造ID字段 | 不登记，不改变D1或关联 |
| T04 | 拒绝登记 | 适配返回management及已有列表，无POST/register调用和DB新增 |
| T05 | 认领已有终端 | 原ID/名称/created_at/任务归属不变；cookie关联后读取可识别；认领不增加记录 |
| T06 | 清理cookie/失效cookie/错误编码/记录删除 | 回到登记询问，不自动新增；认领未知记录失败不改原关联 |
| T07 | 未认证与方法错误 | 所有新路由401/405；cookie本身不能认证，错误无秘密 |
| T08 | 网页与PC区别、改名 | 网页可标注，不能PUT绕过登记；web-ID不能接PC任务；认领pc-ID不产生凭据或执行行为 |
| T09 | 适配失败路径与正常全流程 | 401/网络/服务错误不假ready、不偷偷注册，能由调用方重试；请求使用同源cookie |
| T10 | 既有回归与持久化 | 原11项继续通过；正式SQL真实SQLite，关闭重开仍保留登记及标注；不新增依赖、表、链式或UI |

实际执行node --test agent/tests/*.test.mjs（工作目录personal-digital-companion）或等价准确命令。测试必须涵盖真实Worker fetch入口和SQLite，非只测试stub。浏览器适配可注入fetch并接真实Worker模拟cookie来验证流程，但明确非实际手机/浏览器验收。未启动真实HTTP Worker、未接宿主登录与页面，最终留未验证项，不声称整体验收完成。

## 交付文件与边界

实现建议agent/terminals/api.mjs、agent/terminals/client.mjs、agent/tests/terminals.test.mjs，必要修改worker.mjs与devices/api.mjs；复用现有SQL与测试适配。更新agent/README.md和docs/TERMINAL_REGISTRATION_HANDOFF.md。先在docs/reviews/TERMINAL_REQUIREMENTS_AUDIT_2026-11-18.md落审计，再开发；完成写docs/reviews/TERMINAL_IMPLEMENTATION_2026-11-18.md。主会话独占最终审核报告及DEVELOPMENT.md。不改现有桌面/角色/动画文件，不操作生产库、不启动常驻、不提交推送或部署。
