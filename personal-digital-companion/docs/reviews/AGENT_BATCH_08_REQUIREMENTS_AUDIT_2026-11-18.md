# 第八组需求审计与基线
2026-11-18 JST。先审计后开发，仅第八组。
原需求：主站现有Cloudflare接口准备扩展；第十组才做花园/随手记真实模板验证。本轮不调用真实AI/业务，不恢复disk。
已读根规则、框架偏好、最小/七组设计及八九组设计；上轮只读核对主站AGENTS、Access校验与LanguageStudy共享AI六文件哈希。独立备忘录沿用索引未找到的记录。
审计通过：现有AI生成契约是纯JS，不是通用REST；固定textProvider=cloudflare，不能省略触发默认fallback。共享模块不整套复制，通过主站工厂依赖注入；源主站不修改。
提案只读D1并校验，不写tasks、不执行。非UI客户端必须显式确认后调用既有任务创建；模型输出不能触发确认。
主站候选使用真实authorizer及COMPANION_DB，同源写检查，缺依赖失败关闭。默认本地Bearer保持回归，真实Access机器接入留第十组。
只修改agent/assistant/*、agent/host/*、worker及专属测试/文档，不改desktop或devices/api；pending路由模块由主会话提供。
## 修改前SHA256
- agent/worker.mjs 9D0525794FBAFEDE278B54286F1029600A71F84037B9A14A5ABCD3D5285248AB
- docs/AGENT_BATCH_08_09_DESIGN.md BB6872CA867345024A4D5973DAE4250A96A25A1B055E7B0E3487EF2424233831
