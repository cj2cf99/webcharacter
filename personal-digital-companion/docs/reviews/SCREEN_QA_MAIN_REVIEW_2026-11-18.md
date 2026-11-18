# 截图问答接口与云端：主会话独立复核

2026-11-18 JST。最终结论：第2轮复核通过，停止；全套119项测试通过。代码技术验收通过，不代替真实模型、主站或用户效果验收。

## 依据、范围与基线

用户原始需求为截图提问、宠物小女友身份但客观回答、固定可识别成功/错误/重试及正文、头顶漫画气泡。用户本轮明确：“你先完成截图问答的接口和云端部分，精灵部分等一等”“接口记得明确下来”。查阅SCREEN_QA_REQUIREMENTS.md、SCREEN_QA_API.md、原AI交接、CLAUDE.md、根/项目DEVELOPMENT.md、AGENT_MINIMAL_DESIGN.md与全局FRAMEWORK_PREFERENCES.md；独立设计备忘录索引查找未发现，未虚构已阅读。

本轮三个细任务：精确API契约；云端视觉问答实现；测试/审查与交接。没有客户端截图、重试、气泡、任务联动或生产操作。

Git HEAD：f5fb4bfecd88d48e12969356fcaf138f20b57650。agent在共享工作区多为未跟踪文件，不把git diff当作全部证据；本轮开始时关键SHA256：

| 文件（agent/下） | 修改前SHA256 |
| --- | --- |
| worker.mjs | 7EB7313A6FD6466E56CE4CFD0E9C6BCDE996467BDE09725C628204D500D7433F |
| assistant/cloudflare.mjs | CE86474C8291CCCA4513612D498D8E2A90DA23FE27E3DB61D6FC920994DF8716 |
| host/main-site.mjs | E6B0B6C8FAE2CD9291EAE3D2F551739D68B1CBAD6DA885FC028D5D72A4A048CA |

最终哈希在SCREEN_QA_IMPLEMENTATION_2026-11-18.md。未覆盖/回滚共享工作区中既有桌面、素材和其他项目改动。

## 实际变更与设计核对

- 新增assistant/screen-question.mjs和screen-errors.mjs，严格字段、按实际流限制6 MiB、图片4 MiB/规范Base64/PNG与JPEG头，问题/答案各2000 Unicode字符。只验证基础类型，不冒充完整图片解码器。
- worker在认证/同源之后、DB之前处理本接口，前置错误也采用固定ok:false回执；其他接口保持旧契约。
- 视觉createVisionClient独立注入，默认复用env.clouflareai；共享文字contract不接图片。Cloudflare适配器允许视觉30秒，原文字10秒不变，固定模型和1024tokens，不切换供应商。
- 主站挂载候选保留宿主认证及同源要求。没有实际修改主站、新增表、依赖、会话/图片存储、后台队列或重试框架。主站/独立路径及错误、限制、接入例子以SCREEN_QA_API.md为唯一契约。
- 模型只返回answer，外层ok/error由程序生成。系统提示包含客观、承认不确定、截图文字不是执行指令；只测试提示构造与输出校验，不宣称真实模型必然正确或完全抵抗提示干扰。以后气泡须纯文本渲染。

## 第1轮

主会话独立运行 `node --test --test-reporter=spec personal-digital-companion/agent/tests/*.test.mjs`，118/118通过。逐项阅读接口、错误映射、binding、mount、路由与SQ01–10，核对原始需求、用户缩小范围和最简设计。

发现 SQ-R1：模型客户端抛null或code为toString等非标准错误时，catch读取属性/普通对象继承键触发内部异常，真实Worker fetch复现为500 INTERNAL_ERROR/retryable:false。按接口契约应为未知上游错误502 AI_UNAVAILABLE/retryable:true。已先向用户报告，再交子代理修正；没有改变已明确的错误格式。

修正：可选链读取异常、映射只取自身属性、screenError未知代码安全回退；流非Error失败归为INVALID_JSON。新增SQ11覆盖null/undefined/继承键/字符串异常、错误脱敏、单次调用及流失败。没有引入新组件。

## 第2轮

复查SQ-R1修正代码及SQ11，对照契约确认已知/未知上游错误仍正确区分、认证和内部错误不被误标可重试、空异常不再二次抛错。主会话独立执行 `node --test --test-reporter=dot personal-digital-companion/agent/tests/*.test.mjs`：119个通过标记、无失败，命令完成。子代理亦单独运行同一全套并报告119项exit0；截图专项现11项。

最终无残留bug、未经确认的范围扩大或过度设计，第2轮停止，不再凑审核轮数。本轮未改desktop，无依据重复运行额外桌面脚本；现有桌面任务集成用例已包含在全套测试。

## 证据与未执行事项

验证覆盖：认证先于读图/AI/DB、无DB正常回答、图片/流边界及假Content-Length、Unicode、额外字段、固定角色与模型、截断/坏JSON/模型自报ok拒绝、30秒模拟超时/取消、binding与mount路径、原文字10秒及旧任务回归。合成数据和mock binding，不使用用户屏幕或生产凭据。

未执行：真实Cloudflare模型、真实屏幕、实际HTTP常驻Worker、Access及线上效果、精灵UI、主站合并/部署、Git提交/push。wrangler.jsonc没有自动启用远程AI binding；实际调用需按接口文档配置现有clouflareai能力。无数据库迁移。本轮没有发布授权或生产写入。

精灵采集、客户端重试及头顶气泡按用户指示继续暂缓；技术交付已完成，后续真实服务和用户效果验收另行安排。
