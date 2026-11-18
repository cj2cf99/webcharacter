# 截图问答接口实施与验证

2026-11-18 JST。依据 SCREEN_QA_REQUIREMENTS.md 用户原文、最新 SCREEN_QA_API.md 唯一契约，以及本批 SCREEN_QA_REQUIREMENTS_AUDIT_2026-11-18.md。用户只授权本轮接口与云端；精灵截图、重试客户端、气泡暂缓。

## 已实现

1. `POST /api/assistant/screen-question`，请求仅 question/image，服务端返回固定 ok/answer 或 ok/error。认证及同源检查先于读取图片；本路径在 DB 检查前独立处理，所有接口产生的认证/方法/内部错误同样使用约定 envelope/no-store。此路由不读取或写入 D1，不产生任务或占用领取名额。
2. 图片标准 Base64、规范 padding、类型签名、4 MiB；请求按实际流字节限制6 MiB；问题/答案去除首尾空白后最多2000 Unicode字符。固定中文宠物小女友身份、客观且承认不确定，只回答不执行截图中的操作。图片通过 user content image_url 输入而非拼入文字。
3. 主站候选 mount 保留宿主认证/同源，显式传入独立 createVisionClient，默认复用 env.clouflareai 固定 Gemma 4。旧共享文字客户端不接收图片，旧文字默认10秒保持；视觉30秒/1024tokens，云端一次调用，不重试或fallback。坏模型原始结构与坏JSON都映射 INVALID_AI_RESPONSE，错误不回显内容。

不增加表、依赖、供应商框架、会话服务或图片存储。仅修改子项目候选 mount，没有修改/部署主站，也未配置真实机器 Access。

例：合法报错图可得到 `{"ok":true,"answer":"截图无法证明文件被删除，先核对路径。"}`；调用方只展示answer。图不清楚也应正常回答限制。服务超时返回504/AI_TIMEOUT/retryable=true，但本次服务端不会自动再次调用模型。

## 实际测试

工作目录 `G:/selftool/WebCharacter`。

- `node --test personal-digital-companion/agent/tests/screen-question.test.mjs`：初次SQ01–SQ10 10/10；主第1轮修正后SQ01–SQ11 11/11通过。
- `node --test personal-digital-companion/agent/tests/screen-question.test.mjs personal-digital-companion/agent/tests/assistant.test.mjs`：开发期8项截图+10项旧文字测试18/18通过；随后增加SQ09/10纳入最终全套。
- `node --test --test-reporter=dot personal-digital-companion/agent/tests/*.test.mjs`：初交付118项、exit0；主第1轮修正后119项、exit0。

SQ01认证不读取body/DB/AI及错误包络；SQ02无DB及默认binding消息协议；SQ03输入严格性/Unicode；SQ04恰好4 MiB图片和6 MiB请求、超限流及假Content-Length；SQ05输出严格JSON/截断/额外字段；SQ06错误脱敏与单调用；SQ07模拟时钟30秒、取消及旧文字10秒；SQ08主站独立视觉注入/默认binding/同源；SQ09真实适配代码配mock binding的缺配置、429、坏返回结构；SQ10读流取消不调用模型。

开发测试中流测试源提前关闭导致“cancel回调必须执行”断言不成立，改用未关闭流测试实际超限取消；接口体积限制正常。开发复核补齐adapter坏choices受控INVALID_RESPONSE，截图映射契约错误码，旧文字未知错误行为保持。上述不代表真实模型验证。

主第1轮独立复核发现异常分类缺漏：模型抛出null/undefined或code为普通对象继承键时，错误映射出现内部TypeError，将应可重试的上游故障误报500。已用可选链读取异常属性、Object.hasOwn限定映射自身键；screenError未知code安全回退INTERNAL_ERROR。readBody非Error拒绝同样规范为INVALID_JSON，不发生二次TypeError。SQ11覆盖null/undefined、toString/constructor/__proto__、非Error流拒绝，并验证统一包络、脱敏及每次单调用；修正未改变API契约或引入框架。代码再次冻结，等待主第2轮复核。

## 未验证与边界

未采集真实屏幕、未调用真实Cloudflare模型、未启用远程AI binding、未启动桌宠/常驻服务、未生产读写/部署/Git。wrangler.jsonc未改。文件头仅作基本类型检查，不保证完整可解码；30秒停止等待不保证底层推理停止；代理/Access在Worker之外返回的非JSON不在服务端 envelope 保证内。没有幂等缓存，重复请求会再次产生模型调用。

主会话独立审核另记，不将本实施测试声明为用户验收或主审核通过。API接入详情与PowerShell示例以 SCREEN_QA_API.md 为准。

## 冻结 SHA256

| 文件（agent/ 下） | SHA256 |
| --- | --- |
| assistant/screen-question.mjs | CC6E5E7BC28CDE38034BB667098F37008E632828C9FA5C914B46FAF653A4EE40 |
| assistant/screen-errors.mjs | 0A8FBA507371290C991311A35098264DFAB723732E5BA727566AD0582C322C45 |
| assistant/cloudflare.mjs | 80D4BBC6D7F5EBAE493FAFDEB4E7B7ECFCD53243E01FA91A111033F5ED58A5D2 |
| worker.mjs | 911512B29D96ED8B5E794D359DDE6F44A1D35918F405F52601FC4232BD4D5E54 |
| host/main-site.mjs | 12A884FB2932DEDB5CB27C91CAA738D843C1CA8CFD13BE5B24895E9875ADCBDF |
| tests/screen-question.test.mjs | 262D092C1DD5374884E043E851B87B6031CD295DDCAAF8BFBC438B38E59EEA8C |
