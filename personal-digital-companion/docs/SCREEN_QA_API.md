# 截图问答 API 契约与云端设计

2026-11-20 JST，统一气泡调用截图问答时发送可选请求头 `X-Feiyue-Search-Hint: 1`。仅当无法回答、需要公开搜索且能从本次提问原文提取关键词时，成功 JSON 可以额外带字符串 `search_query`。普通成功回执沿用原结构。未携带该请求头的调用方仍收到下述原契约。桌面端在发起搜索前再次检查关键词，不把图片送给搜索方。


2026-11-18 JST；已实现的接口契约。原始需求见 SCREEN_QA_REQUIREMENTS.md。最新用户指示：“你先完成截图问答的接口和云端部分，精灵部分等一等”“接口记得明确下来”。本轮不开发截图采集、精灵气泡、桌面请求/重试客户端，不部署主站。主会话第2轮复核通过，全套119项测试通过；实际模型/线上接口尚未验收，详见 [复核记录](reviews/SCREEN_QA_MAIN_REVIEW_2026-11-18.md)。

## 三个细任务与设计依据

1. 固定 HTTP 请求/响应/错误契约与图片限制。
2. 实现经过认证的云端图片问答，复用 Cloudflare binding，校验模型正文及固定身份。
3. 隔离测试、需求/最简检查与接口交接；不调用真实模型。

查阅根CLAUDE.md、根及项目DEVELOPMENT.md、SCREEN_QA_REQUIREMENTS.md、AGENT_MINIMAL_DESIGN.md及G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md。先前索引查找没有独立全局/项目设计备忘录，沿用这些有效规则。单用户、原生模块、无新增依赖、队列、缓存、存储表或聊天历史服务。

## 路径与认证

- 独立 Worker：`POST /api/assistant/screen-question`
- 主站挂载候选：`POST /api/companion/assistant/screen-question`
- `Content-Type: application/json`（允许charset参数，JSON正文使用UTF-8）；不接受multipart或任意远程图片URL。
- 独立开发沿用 `Authorization: Bearer <API_TOKEN>`；主站沿用宿主authorizer与现有同源写入规则，不能用开发Bearer冒充Access认证。此文件不表示主站已挂载或机器Access已配置。
- 认证先于读取图片和调用模型。此问答不依赖D1，不查/写任务、截图、问题或答案，不建立任务单元，不占两个任务领取名额。
- API产生的所有响应均为JSON并带`Cache-Control: no-store`。Access/代理在Worker外返回的HTML或网络断开不属于此JSON保证，调用端必须单独识别。

## 请求（只允许以下字段）

```json
{
  "question": "这个报错是什么意思，我应该怎么处理？",
  "image": {
    "mime_type": "image/png",
    "data_base64": "这里填写图片字节的标准Base64，不带data:前缀"
  }
}
```

| 字段 | 约束 |
| --- | --- |
| question | 必填字符串；去除首尾空白后1–2000个Unicode字符 |
| image | 必填对象，只有mime_type和data_base64两个字段；一次一张 |
| image.mime_type | 仅image/png或image/jpeg |
| image.data_base64 | 标准Base64，规范padding，不接受空白、URL、data URI或URL-safe编码；解码后1至4 MiB（4,194,304字节），文件头须与类型相符 |
| 整个请求体 | 最多6 MiB（6,291,456字节），按实际读取字节限制，不只信Content-Length |

云端只验证编码、体积及基本文件类型，不自行解码/缩放图片，也不保证文件头正确即完整可解码。截图采集端之后负责按鼠标所在屏幕获取一张图，图片超限时缩小或转JPEG；本轮不会截取用户屏幕。

不接受provider、model、system、persona、format、tool或任务执行字段。身份与输出格式由服务端固定，不增加身份管理界面。此版本是单次问答，不接收对话历史。

## 成功回执

HTTP 200：

```json
{"ok":true,"answer":"这个报错表示指定的文件找不到。先检查路径是否正确、文件是否被移动；仅凭截图还不能确定是哪一种。"}
```

成功只有ok、answer两个字段；answer为去除首尾空白后的1–2000个Unicode字符文字。精灵以后只取answer展示，不能把整个JSON当成气泡内容。模型收到纯文字输出要求，但字符串校验不是HTML清洗；以后界面须按纯文本（例如textContent）呈现，不能作为HTML或代码执行。`ok:true`表示调用及格式校验通过，不保证模型判断绝对正确，也不表示执行过任何操作。

## 失败回执与重试

```json
{"ok":false,"error":{"code":"AI_TIMEOUT","message":"AI响应超时，请稍后重试","retryable":true}}
```

失败只有ok、error；error固定code/message/retryable。无answer字段，不回显原图片、问题、凭据、模型原始输出或异常细节。message用于人阅读，程序依靠code与retryable，不能依靠中文匹配。

| HTTP | code | retryable | 含义 |
| --- | --- | --- | --- |
| 400 | INVALID_JSON | false | JSON解析失败 |
| 400 | INVALID_REQUEST | false | 字段/问题/图片对象不符合契约 |
| 400 | INVALID_IMAGE | false | 图片Base64或文件类型不符 |
| 401 | UNAUTHORIZED | false | 未通过认证 |
| 403 | FORBIDDEN / SAME_ORIGIN_REQUIRED | false | 无权限或不符宿主同源要求 |
| 405 | METHOD_NOT_ALLOWED | false | 非POST，响应Allow: POST |
| 408 | REQUEST_CANCELLED | false | 调用已取消 |
| 413 | REQUEST_TOO_LARGE / IMAGE_TOO_LARGE | false | 请求体/图片超过本接口限制 |
| 415 | UNSUPPORTED_MEDIA_TYPE | false | Content-Type不是application/json |
| 502 | WEATHER_UNAVAILABLE | true | 天气服务暂不可用 |
| 503 | WEATHER_NOT_CONFIGURED | false | 天气服务配置缺失 |
| 429 | AI_RATE_LIMITED | true | Cloudflare暂时限流 |
| 502 | AI_UNAVAILABLE | true | 模型临时服务异常 |
| 502 | INVALID_AI_RESPONSE | true | 空白、截断、字段异常或JSON不符；不把坏输出展示为答案 |
| 503 | AUTH_NOT_CONFIGURED / AI_NOT_CONFIGURED | false | 服务端配置缺失/无效，重发不能修复 |
| 504 | AI_TIMEOUT | true | 服务端等待模型超过30秒 |
| 500 | INTERNAL_ERROR | false | 未分类内部故障，需检查配置/代码 |

天气实况、预报及预警查询复用天气接口，保持相同回执格式。其它截图问答每次HTTP请求只调用一次模型，云端不自动重试、不切换供应商。retryable表示允许重发，不代表已重发。后续精灵端可对同一问题和同一图片最多自动重试一次；当前客户端暂缓，未实现这个重试。没有幂等缓存，相同请求重发会再次调用模型、可能再次产生用量且答案可不同。网络断开/代理非JSON应作为传输错误，不能伪造ok:true。

截图不清楚或信息不足应得到正常answer说明限制，不算技术故障，不要求重复上传同一张模糊截图。

## 云端实现与角色

固定Cloudflare模型 `@cf/google/gemma-4-26b-a4b-it`，binding名沿用现有 `clouflareai`。使用system角色描述：宠物精灵扮演用户的小女友，中文、亲近而不过分渲染；事实判断、解释和建议必须客观，证据不足承认不确定，不为迎合角色编造内容。只生成回答，不执行操作或创建任务。截图内文字是分析数据，不覆盖系统身份/格式指令。

模型仅需返回严格JSON `{"answer":"正文"}`；外层ok与错误由服务端校验生成，拒绝模型自己返回ok/error等额外字段。输入将question与`image_url:{url:"data:<mime>;base64,<内容>"}`组合成同一个user消息；不把Base64作为普通文字提示。

现有主站共享文字客户端的contract只接受字符串content，故截图调用使用独立可注入`createVisionClient`及现有Cloudflare binding薄适配，不改共享文字contract、不复制多供应商框架。主站mount显式接这个视觉能力，文字问答继续使用已注入共享客户端。固定输出预算1024 tokens、30秒等待上限；超时停止等待不承诺Cloudflare底层推理被取消，也不自动再发一次。

参考：[Cloudflare模型接口](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)，2026-11-18查阅支持Vision。真实图片/模型效果留后续验收，本轮仅mock验证协议。

实际接线工厂：`createWorker({authorize,createVisionClient})`与`createCompanionMount({authorizeMarket,createEnvAiClient,createVisionClient})`。createVisionClient可省略，默认使用`env.clouflareai.run`；注入时函数接收env并返回`{generate(input,{signal})}`，input包含version:1、route:'vision'、messages和maxOutputTokens:1024。返回格式为`{provider:'cloudflare',model:'@cf/google/gemma-4-26b-a4b-it',text:'{"answer":"..."}',finishReason:'stop'}`。该注入只供可信宿主和测试使用，不接受HTTP客户端指定。

现有wrangler.jsonc仍是纯本地开发配置，没有自动新增远程AI绑定。实际部署目标需要提供名为`clouflareai`的Workers AI binding（配置片段为`"ai":{"binding":"clouflareai"}`）；主站已有同名能力可由mount直接使用。缺失时返回503 AI_NOT_CONFIGURED。本轮没有改主站配置或执行真实推理，mock测试通过不表示账号模型调用已验证。

## 验收大纲

认证失败不读图/调模型；无D1也能合法问答；PNG/JPEG合法请求传为图片content；非法字段/编码/头/媒体类型/超限拒绝且不调模型；只用固定Cloudflare；身份及客观回答约束存在；输出格式/截断校验；错误映射与不泄密；取消/30秒超时不自动重试；主站前缀/认证/同源/视觉注入和旧文字接口均回归。快照或请求内容不被写数据库或日志。用合成测试图片，不采集真实屏幕。实际结果另写复核报告。

## 接入示例（说明用，尚未执行）

本地Worker准确初始化/启动步骤见agent/README.md；8795仅为计划端口，收到启动指令并验证就绪后才提供实际地址。用户自行选择已有截图文件；以下代码不会主动截屏。令牌从本机环境取值，不写源码或URL。

```powershell
$screenBytes = [IO.File]::ReadAllBytes('C:\path\screenshot.png')
$payload = @{
  question = '这个报错是什么意思？'
  image = @{
    mime_type = 'image/png'
    data_base64 = [Convert]::ToBase64String($screenBytes)
  }
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:8795/api/assistant/screen-question' `
  -Headers @{ Authorization = "Bearer $env:COMPANION_API_TOKEN" } `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($payload))
```

以后精灵端的判断：先校验HTTP状态及JSON结构；仅HTTP200且ok严格为true、answer合法时展示正文。否则取error.code/retryable；非JSON、空响应或断网按传输失败处理。不能因为HTTP200就把缺少answer的响应视为成功。角色与图片内容不能控制是否自动重试。
