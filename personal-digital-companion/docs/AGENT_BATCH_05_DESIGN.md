# 第五组：设备凭据与在线状态

**已停止/不再适用（2026-11-18用户修订）**：设备凭据/撤销/专门心跳方案不再推进；加密后置。其后代理建议的“接收新任务开关”也被用户明确删除。保留本文仅为历史，现行开发依据为AGENT_BATCH_05_REVISED_DESIGN.md，需求删除留痕见REQUIREMENT_CHANGES.md。

2026-11-18 JST。用户原话：“继续第五组”。依据原始V1.5 M1-03/DEV-01/AG-06/4.4-2：PC独立可撤销凭据、Windows加密保存、心跳和在线状态。单用户不建用户/角色体系；此为执行端最小认证，不是业务任务。磁盘查询、Paylog/提醒、链式任务继续排除。

已读项目CLAUDE/开发指南、AGENT_BACKLOG、第四组实现、原实施计划M1-03及全局FRAMEWORK_PREFERENCES；独立备忘录缺失记录不变。按用户既定流程：子代理先需求审计，主会话最多4轮查bug/偏移/最简，无问题即停；4轮后接手最多2轮仍有问题报告。用户本轮授权开发/测试，不包括启动已有精灵、常驻Worker、生产操作或新依赖。

## 三个细任务

1. 子代理：云端设备凭据签发/撤销、设备认证与任务归属约束、心跳和在线状态。
2. 主会话：Windows主进程加密凭据存取及受限地址请求适配；不改现有界面/桌面入口，不自动配对或重启。
3. 双方：认证隔离/撤销/密文存储/心跳与前四组回归；主会话独立审核，交付接线说明。

## 意图举例

主人通过受保护的管理接口为homepc签发随机凭据，Windows主进程加密保存。homepc以后只使用自己的凭据领取/回传自己的任务，不保存主人的开发API_TOKEN。撤销homepc后，其心跳、任务读取、领取和回传全部拒绝，其他PC不受影响。网页认领homepc不产生或传递该凭据。

目前主人管理认证仍是API_TOKEN开发边界，真实宿主登录/Access接线尚未实现，不能称为生产认证已完成；设备执行凭据是本轮实际新增。凭据签发响应仅向已认证管理调用者返回一次，不落日志/URL；本轮只用临时测试凭据，不给真实设备发放。

## 云端数据与接口

新增迁移003-device-credentials.sql：device_credentials一设备一行，device_id主键/外键、token_hash（可空、唯一）、created_at（当前签发时间）、revoked_at（可空）、last_seen_at（可空）、capabilities_json（默认[]、有效JSON）。不改旧devices/tasks，设备始终以pc-ID识别。

token使用Web Crypto 32随机字节，加固定pcd_前缀、hex编码；D1仅保存SHA-256摘要，认证时摘要查询且未撤销才允许。随机高熵凭据不需要密码KDF。重签覆盖同设备旧摘要、重置心跳/能力，旧token立即失效；无需凭据历史表或自动轮换服务。

- POST /api/devices/:id/credential：仅主人；body为空或{}；仅已有pc-ID可签发；返回201 {device_id,token}。web-ID拒绝。重签也是用户/宿主显式操作，本轮无后台自动重签。
- DELETE /api/devices/:id/credential：仅主人；摘要置空、记录撤销时间，重复撤销可返回成功；无记录404。
- POST /api/device/heartbeat：仅有效设备凭据；body {capabilities:字符串数组}，内容为静态处理函数类型名（无默认业务），校验格式并去重；记录服务端UTC时间，返回{device_id,last_seen_at}。不接受请求体自报device_id或时间。
- GET /api/devices：保持原资料，增加connection:{credential_status:'not_issued'|'active'|'revoked',last_seen_at,online,capabilities}。没有凭据或无心跳、已撤销均offline；最后心跳距服务端现在<=120秒且非未来才online。心跳建议60秒一次，但本轮不启动定时器。离线不自动把任务判失败。

设备token只允许：GET /api/tasks/:id（只读自己目标）、POST同任务claim/result（body.device_id必须与认证设备一致）、POST心跳。其它接口如类型维护/创任务/设备列表和改名/网页登记认领/凭据签发撤销一律403。错误目标403，不用请求体或cookie作为认证身份；撤销后401。主人仍可使用现有管理/测试接口，不建立复杂权限矩阵。认证模块须避免散落未保护路径。

响应no-store；列表、任务、错误不能含摘要/明文token。开发API_TOKEN缺失不允许主人访问，但已经签发的有效设备凭据可独立认证；设备认证DB异常统一500不泄露内部信息。

## Windows加密保存与请求适配

复用现有Electron45.3.4主进程safeStorage异步API：isAsyncEncryptionAvailable/encryptStringAsync/decryptStringAsync；Windows底层DPAPI，不新装依赖/不启动PowerShell。官方依据：[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。同步API已弃用，不新写同步实现。

agent/devices/credential-store.mjs：createCredentialStore({directory,deviceId,safeStorage,platform})返回异步save({device_id,token})、load()、remove()。默认platform为process.platform，非win32拒绝。调用方在Electron app.whenReady后注入safeStorage；所有文件只存密文字节，凭据JSON在内存内加解密。校验pc-ID及token格式，load缺失返回null、损坏或无法解密明确失败，不静默新建/明文降级。先加密再写临时密文、rename替换，失败保留旧凭据；不创建明文临时文件。不暴露到preload/renderer、localStorage或任务SQLite。

DPAPI保护磁盘静态数据，不承诺防止同一Windows账户下已运行的恶意程序读取；凭据仍须不暴露给页面。文件目录由宿主显式提供，不擅自读已有登录会话/秘密。

agent/devices/request.mjs：createDeviceRequest({baseUrl,deviceId,credentialStore,fetchImpl})返回供createTaskSync复用的request(path,options)。仅允许HTTPS或环回HTTP；拒绝跨源/绝对URL/重定向、URL中用户名密码，始终以本机load的token设置Bearer而不使用调用者提供的认证头。凭据设备ID不匹配即失败；401/403不自动重签、不清空记录、不重跑任务。提供显式heartbeat(capabilities)调用，无自动循环。fetchImpl仅测试注入，不保存业务Token或API_TOKEN。

## 测试大纲与验收标准

- F01：主人才能签发/撤销，web-ID不可签发；D1不含明文，列表/任务/错误无hash/token；重签使旧token失效。
- F02：设备只能读取/领取/回传自己任务；伪造body设备、读取别人的任务、修改终端/签发凭据等403；cookie无执行权限；原主人接口回归。
- F03：撤销后心跳/读取/领取/回传401；未知token401；合法设备不依赖主人API_TOKEN配置。
- F04：心跳由服务端记录时间及去重能力；active且120秒内online；无心跳/超时/未来/撤销offline，任务状态不变化；不运行真实定时循环。
- F05：安全存储只写密文，重新读取正确；缺失、损坏、加密不可用、设备不匹配/非Windows失败，不能明文降级或覆盖旧值。
- F06：请求只把设备token发给配置同源服务，redirect:error，拒绝跨源/非环回HTTP；保存和错误路径无明文落盘/输出。
- F07：复用现有Electron运行包的独立无窗口进程、临时userData，验证真实safeStorage写入和跨进程重开解密；不启动角色壳、不复用其用户目录、不下载软件。若环境阻断则明确未验证，不用mock冒充DPAPI成功。
- F08：设备token驱动第四组mock全链路成功；撤销后的补传保留本地结果但不执行第三次。所有旧测试继续通过（增加connection字段时更新精确断言，不削弱覆盖）。

测试均使用临时模拟设备/随机假凭据/SQLite；不打印token、ciphertext或真实用户数据。第三方平台/具体工具不接入。迁移准备与代码验证不等于部署/实际登录/桌面接线通过。

## 分工文件

子代理拥有agent/auth/*、worker.mjs、devices/api.mjs的必要接线、003迁移、tests/device-auth.test.mjs、tests/sqlite-d1.mjs及必要旧测试适配；先写AGENT_BATCH_05_REQUIREMENTS_AUDIT_2026-11-18.md，完成写分工实施报告。主会话拥有credential-store.mjs/request.mjs及其测试、第五组最终审核/README/DEVELOPMENT。不改桌面UI/原图/其他项目。
