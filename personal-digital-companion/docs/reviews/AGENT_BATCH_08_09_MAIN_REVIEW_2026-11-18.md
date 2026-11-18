# 第八九组主会话审核

2026-11-18 JST，状态：第8组第2轮通过；联合接线第3轮修正API前缀后通过，无残留即停止。仅接口准备，不是第十组真实环境验收。

依据AGENT_BATCH_08_09_DESIGN.md及REQUIREMENT_CHANGES：用户只做8/9接口准备，Cloudflare使用主站共享能力；花园/随手记真实模板验证明确第10组，磁盘仍暂停。单用户同账户、最多3细任务、最简，不恢复心跳/独立凭据/链式/加密。

第8组子代理先审计再开发，记录AGENT_BATCH_08_REQUIREMENTS_AUDIT_2026-11-18.md；主会话负责第9组及两组独立复核，子代理也独立检查第9组。最多4轮，无残留即停。

## 第1轮

主会话读取assistant/message/client/cloudflare、host/main-site与worker接线。发现confirm的POST tasks提交已落库但回执丢失时，再次点击可重复提交。已先向用户说明，再要求最简“提交结果未知、先查任务列表”状态阻止原提案重复POST；不新增幂等表/框架。成功回执须同样核对截止字段。等待修正与新增测试。

第9组新增pending API、task-poller与desktop task-lifecycle/shell接线；已运行新增5项通过，包括真实线程领取/回传、105条跨页不漏、长任务不阻塞、同ID在途不重复、退出/断网与未知handler。中间全套77/77通过（尚不含第8组新测试，不能记成最终结论）。自行检查补充task_id严格字符串校验，防正则隐式转换；等待子代理独立审核。

## 未验证边界

只在子项目准备，未修改/部署主站，未读取/使用生产凭据，无真实模型请求，无花园/随手记写入，无真实Worker服务或Windows弹框验收。主站注入工厂不是已启用登录或机器Access配置。第10组仍待明确安排。

## 第2轮：实现复核

子代理修正confirm未知提交：网络错误、500、坏JSON及回执不一致均标为SUBMISSION_UNKNOWN，不重复POST，新message也不解除该状态；提示先看任务列表再重新打开确认流程。成功回执核对截止；明确4xx允许后续用户操作。AI10实际SQLite先创建再丢回执等四情形只产生1次POST/1条任务。没有引入新表或幂等平台。

主会话重读AI消息/客户端、固定Cloudflare薄适配、主站注入工厂/Worker接线及10项AI测试：认证前不读DB/不调模型，只服务端system，类型/参数/目标来自D1且严格校验，提案不创建任务，确认复用旧接口，不自动重试或fallback。主站authorizer及AI为可信代码注入，COMPANION_DB缺失失败关闭，不回退业务库；原主站源码未改。结果符合当前“准备扩展”而非已完成生产登录的范围。

子代理独立只读检查第9组pending、poller、runtime、shell及P01–P06：未发现bug/偏移/过度设计。确认无任务上限、无心跳/在线推断，重做继续入口不被自动绕过，退出检查能暂停与恢复，长任务不阻塞扫描。

主会话实际执行根目录`node --test personal-digital-companion/agent/tests/*.test.mjs`，当时88/88通过；子项目目录`node tools/test-desktop-shell.mjs`、`node tools/test-desktop-priority.mjs`、`node tools/test-pc-settings.mjs`均通过。子代理另实际导入LanguageStudy共享runtime并注入mock binding验证固定Cloudflare契约（无网络），结果通过，详见其实施记录。

## 第3轮：跨组路径修正与最终停止

整理交接发现桌面配置base_url只能为根源，内部固定/api路径无法请求主站候选/api/companion挂载。先向用户报告，再在configuredRequest增加仅允许/api或/api/companion的api_prefix映射，默认不变，不改变鉴权。新增P07用fakefetch检查登记及pending两条路径，无生产请求。

实际执行pending/recovery/desktop-quit相关19/19通过；最终执行`node --test --test-reporter=dot personal-digital-companion/agent/tests/*.test.mjs`，89个通过点、exit 0，无失败。复核映射仅在可信本机配置中启用，不接受任务/模型提供任意端点，无新增依赖/表/后台服务。原API路径默认兼容；Access机器身份仍明确未准备，不伪造可直连结论。第3轮修正后无残留问题，停止，不用后续轮次。
