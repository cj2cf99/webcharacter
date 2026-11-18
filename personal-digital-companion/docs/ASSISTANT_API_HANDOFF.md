# 第八组AI接口与主站接线准备

后续独立接口：截图问答使用 `POST /api/assistant/screen-question`，精确字段、统一成功/失败回执、图片限制、认证与重试含义见 [SCREEN_QA_API.md](SCREEN_QA_API.md)。该路由不读写D1，独立createVisionClient默认复用Cloudflare binding，图片不送入下方原共享文字contract。原文字接口及确认任务行为不变。精灵截图/客户端/气泡按用户决定暂缓。

2026-11-18 JST。按用户“按照准备扩展接口的前提”实施；主站未修改、未部署。真实机器Access接入、真实模型及花园/随手记任务模板验证留第十组。非UI模块，无聊天页面，默认tasklist/handlers仍为空，disk.query继续暂停。

## 已实现接口

独立Worker：`POST /api/assistant/message`。使用既有开发Bearer；认证先于D1/AI访问。只接受：

```json
{
  "messages": [{"role":"user","content":"请说明当前可用任务"}],
  "target_device_id": "pc-完整UUIDv4"
}
```

target_device_id可省略；提供时须为D1已登记PC。messages最多20条，只允许user/assistant和非空content，最后须user；合计6000字符，请求体最多32768字节。不接受客户端system、provider/model、工具、URL或已登录标记。

服务端读取D1未暂停tasklist和PC设备，固定system规则，说明类型流程与历史是数据。合成上下文最多16000字符，超出直接拒绝，不静默截断任务定义。一次Cloudflare调用，固定`@cf/google/gemma-4-26b-a4b-it`和512输出token，不自动重试或切换供应商。

响应：

```json
{"reply":"当前业务类型尚未接入。","proposal":null}
```

有建议时proposal只含type、target_device_id、params以及可选deadline_at。类型必须存在且未暂停；参数复用任务创建的validateParameters；PC必须存在且匹配用户选定目标，cloud目标为null。截止必须明确时区并规范UTC。模型缺参数应询问；坏JSON、未知类型、非法参数、伪目标、被截断输出或错误provider/model返回502，tasks不增加。普通对话和缺参数询问同样不写任务。

## 用户确认客户端

`agent/assistant/client.mjs`导出`createAssistantClient(request,{prefix:'/api'})`，request由完成认证的宿主提供。浏览器调用使用same-origin credentials/mode，不接收、读取或注入API_TOKEN。

```js
const client = createAssistantClient(authenticatedRequest);
const suggestion = await client.message({messages:[{role:'user',content:'...'}]});
// 页面先展示建议，只有用户另行明确确认后调用：
const task = await client.confirm({accepted:true});
```

confirm 在用户明确接受后，先从 POST /api/task-submissions 取提交号，再用它调用 POST /api/tasks。相同在途确认共用一个请求；成功后缓存回执，核对提交号、参数、目标和截止。回执未确认时，显式再次确认仍用原号和原参数。API 不接受模型发起的确认动作，返回的建议是副本。详见 [提交号契约](TASK_SUBMISSION.md)。

提交断网、500、坏 JSON 或回执不符时保留当前建议和原提交号，避免换号后重复创建。用户再次确认可核对原任务；确认结果未知时暂停替换建议。助手客户端只在当前实例内保存原提交号，宿主如需跨重启继续核对，应保存原号和请求数据。

## 主站挂载候选

`agent/host/main-site.mjs`导出`createCompanionMount({authorizeMarket,createEnvAiClient})`。未来主站接线时传入它现有的真实函数；缺任一函数直接失败，不能用请求字段或开发Bearer替代Access登录。

- 处理`/api/companion/*`，映射本模块`/api/*`；其他路径返回null。
- 独立任务库绑定必须为COMPANION_DB，不回退主站DB，不混用主站业务表。
- createEnvAiClient固定传`{textProvider:'cloudflare'}`；不得省略导致默认跨供应商/付费fallback。
- 主站写请求要求Origin与请求源一致，拒绝cross-site。身份校验使用主站authorizeMarket的JWT验签和owner逻辑；没有新造认证或复用浏览器Cookie/会话。
- 前端client挂载时用`{prefix:'/api/companion'}`。桌面到主站的Access机器通行与此前独立Worker的Bearer是不同边界，第十组再接入，不宣称当前桌面可直连主站。

主会话第3轮集成补充：桌面原请求固定`/api/*`，主站挂载是`/api/companion/*`。第九组已增加ignored profile中task-config.json的`api_prefix`选项，仅`/api`（默认）或`/api/companion`，在宿主映射内部请求；base_url仍为源根地址。主会话已用P07 fakefetch验证，本代理只读确认映射与白名单一致，无残留问题。不能把前缀可映射等同于Access机器身份已完成。

复用来源：`G:/selftool/LanguageStudy/server/ai/runtime.mjs`；主站对应`G:/cloudflare/myapp/src/features/ai-check/ai/runtime.mjs`。共享模块未整套复制。既有生成契约为version/route/messages/maxOutputTokens，当前接线工厂依赖该真实接口。来源client/runtime/catalog/contract/adapters/credentials六文件此前已核对与主站哈希一致。

独立Worker备用`agent/assistant/cloudflare.mjs`仅对env.clouflareai.run做固定模型、非流式、10秒超时和结果形状归一化；取消/超时结束等待不保证底层binding未执行。不复制多供应商平台、不新装SDK。当前wrangler.jsonc未增加AI绑定，缺配置返回503，不自动访问远程模型。

## 第九组接线与当前验证

worker在设备路由前调用主会话提供的handlePendingRequest。第九组具体取任务/桌面逻辑由主会话负责，本文件不改变其归属。

第八组自身第2轮审核通过；前缀补充前本代理联合88/88隔离测试及主会话三桌面脚本通过。主会话第3轮修正前缀后，独立相关19/19和最终全套89项通过，复核无残留并停止；最终联合审核为第3轮。另实际导入LanguageStudy真实runtime模块，用注入mock binding完成一次generate兼容验证；未调用真实模型。接口测试使用真实Worker.fetch和SQLite，不代表真实HTTP服务、Cloudflare生产、Access机器登录或UI验收。没有新增迁移、生产数据操作、服务启动、安装、部署或Git同步。
