# 网页终端登记/认领：非界面交接

2026-11-18 JST。本轮实现API与普通浏览器适配函数，未实现弹窗、终端管理页面、真实登录或手机验收。需求审计、设计和实际测试分别见reviews/TERMINAL_REQUIREMENTS_AUDIT_2026-11-18.md、TERMINAL_REGISTRATION_DESIGN.md、reviews/TERMINAL_IMPLEMENTATION_2026-11-18.md。

## 接线顺序与例子

1. 宿主确认用户已登录，再调用client.check()。返回registration时展示“是否接受新终端登记”；此时D1未新增。
2. 用户接受才调用client.accept(可选浏览器说明)；返回ready后显示terminal.display_name。用户拒绝则调用client.decline()，返回management和devices，页面展示已有终端供认领。
3. 用户选择并确认后调用client.claim(device_id)，成功返回ready；未选择时停留管理状态，不调用accept。

例：手机清空站点数据后登录，check返回registration；用户不新登记，decline返回含myphone的列表；claim原web-ID恢复关联。原名称、创建时间、任务归属不改变。

## 浏览器适配契约

```js
import { createTerminalClient } from './terminals/client.mjs';

// authenticatedRequest来自宿主的同源登录接线，不是内嵌API_TOKEN。
const client = createTerminalClient(authenticatedRequest);
const state = await client.check();
// 页面根据state.state显示提示、列表或关联结果；点击后才调用accept/decline/claim。
```

request(path, options)须返回标准Response。适配传入credentials:'same-origin'、mode:'same-origin'和cache:'no-store'；由浏览器管理HttpOnly cookie。它不直接访问cookie、localStorage或服务端秘密。开发Worker仍需Bearer验证，因此尚未接宿主的浏览器不能直接使用这份适配完成真实登录流程。

| 方法 | 成功返回 | 页面职责 |
| --- | --- | --- |
| check() | {state:'registration'}或{state:'ready',terminal} | 登录后检查，按状态展示 |
| accept(browserLabel?) | {state:'ready',terminal} | 只有明确接受后调用 |
| decline() | {state:'management',devices} | 展示已有终端，不自动选择或登记 |
| claim(deviceId) | {state:'ready',terminal} | 用户选择确认后调用 |

所有方法失败时Promise拒绝。HTTP错误带status/code，401交给宿主登录处理；网络异常、500或响应格式错误提示重试，不跳ready。同一动作连点返回同一个在途Promise；不同动作在前一个尚未结束时拒绝，由页面决定禁用按钮，不自动排队或重试。

## API细节

- GET /api/terminal：{terminal:null,registration_required:true}或有效终端与false。读取不写D1；非法/不存在cookie清除关联。
- POST /api/terminal/register：只接受accepted:true及可选browser_label，成功201并Set-Cookie；已有有效cookie时200返回原记录。不接受额外ID、别名或其他字段。
- POST /api/terminal/claim：只接受device_id，存在则200并Set-Cookie；未知404、不改变旧cookie，无D1写入。
- PATCH /api/devices/:id：现兼容web-ID；沿用原64字符别名/空白取消/ASCII大小写重名409规则。
- PUT /api/devices/:id：仍仅允许pc-ID。POST /api/tasks的PC任务目标必须为已登记pc-ID；网页认领pc-ID不改变认证或产生执行行为。

终端API错误为{error:{code,message}}。既有devices接口保留{error:message}兼容形式；适配可处理两者，不为此增加错误框架。所有devices和terminal响应no-store。

浏览器说明不是硬件设备名：未填写时为“网页终端”，填写时1..255 Unicode字符、去首尾空白、无控制字符。服务端分配web-UUID；cookie的ID不是凭据，所有API仍先认证。cookie为HttpOnly/SameSite=Lax/Path=/，一年有效期，HTTPS添加Secure；本地HTTP不添加Secure。

## 数据与未完成项

复用原devices表，无迁移、新表或生产写入。tasklist/tasks不因认领修改；任务来源字段及链式任务另批处理。本次不提供设备删除/合并、PC凭据、登录、页面或桌面接线。

自动测试通过真实Worker fetch入口和SQLite；模拟cookie传递只验证协议，不是浏览器实际cookie验收。常驻HTTP Worker未启动，实际手机/桌面浏览器、宿主登录与Access线上效果待对应阶段验收。启动命令沿用agent/README.md，需用户明确启动指令。
