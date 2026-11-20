# 精灵临时登记任务链三轮重审

日期 2026-11-19（JST）。本次为主会话复核，待用户确认。

**结论：本地建链防重复通过。完整的「输入一句话后自动登记」尚未通过验收。** 正式桌面接线、云端任务执行和业务回执仍有缺口。验证全程使用隔离数据库和合成凭据。

## 范围与依据

- 精灵来源项目 `G:/selftool/WebCharacter/personal-digital-companion`。仓库基线 `7af003e64652dc57c8e90a8852d6fb893b787dd3`。审查以当前子项目工作区文件和上一轮六文件补丁为依据，HEAD 用于定位仓库基线。
- 对照用户原始要求，将一段自然语言拆成吃喝、运动、一键事件、提醒、日记及随手记登记。样例预期五条，其中运动为零条。随手记资源分类由实际目录匹配。
- 保留后续明确决定。使用临时任务链，由 AI 解析；本阶段模拟 AI，正式接入 Cloudflare Workers AI 免费额度。桌面精灵经 `subscriptions-api` 使用已有 Access Service Token。对照 `docs/AGENT_CHAIN_DESIGN.md` 的每链最多五节点、默认无前置、失败由用户决定和 `docs/TASK_SUBMISSION.md` 的随机提交号约定。
- 参考 `C:/Users/asura/.codex/AGENTS.md`、WebCharacter 的 `AGENTS.md` 和 `CLAUDE.md`、`G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`、主站 `docs/design/development.md` 的运行时验证要求，以及会员 API 与精灵的接线代码。审核范围包括提交号、建链、重试、迁移和本轮模拟入口。

## 第一轮 · 需求与入口

| 编号 | 发现与证据 | 状态 |
|---|---|---|
| R1-01 | 上一轮模拟先领取提交号，再并发提交，覆盖了服务端同号重放，但漏测领号响应前连点。依据输出脚本原有 `prepareSubmission` 调用顺序。 | 本轮修正模拟入口，将领号过程合并为同一次提交共享的 Promise，并冻结同一份请求数据。 |
| R1-02 | 计划能建五节点链，但正式执行入口还没有连通。`agent/chains/rules.mjs` 将云端任务标记为 `EXECUTOR_UNAVAILABLE`，`agent/tasks/hu-shi-execution.mjs` 只允许独立的胡适任务。实测临时链节点未执行。 | 高，完整流程的实施缺项。 |
| R1-03 | 正式入口未挂载。桌面目前没有临时登记链的建链调用与提交快照持久化，`subscriptions-api` 源码和配置内也未接入精灵路由。旧交接曾把挂载目标写为 `myapp`，本轮以用户最新明确的 `subscriptions-api` 为验收依据。 | 高，正式接线缺项。 |
| R1-04 | 旧设计明确每链最多五个节点。模拟对六节点返回 422，要求拆分。用户的五条样例满足该上限，六类同批的处理方式尚未经确认。 | 待决定。保留既有链上限。 |

五条样例的目标分类和东京日期均符合预期。模拟输出支持运动单节点、资源分类缺失时只挂起该条，以及拒绝未配置类型和伪造分类。模型提供结构化计划，服务器按既有任务模板校验参数。

## 第二轮 · 并发、重试与失败

- 重新运行 `node.exe --test .\outputs\companion-recording-chain-mock.test.mjs`，7 项全部通过。新用例在提交号尚为零时并发触发同一次提交，确认只签发一号、只建一链。回执丢失后重发获取原链，显式重新发起的操作可以创建另一条链。
- 在精灵子项目用 Node 24 跑 `agent/tests/*.test.mjs`，并设置 `COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp`，152 项全部通过。覆盖同号异参返回 409、错误账户或伪造编号拒绝、普通任务与任务链互斥占号、节点失败回滚及复用原号。
- 运行 `node.exe .\work\companion-chain-submission\review-workerd.mjs` 实测精灵 Worker 加隔离 D1。六个并发请求获得一个 201 和五个 200，数据库只有一条对应的链和一个节点。回执重放、异参冲突、无效认证、普通任务与链竞争同号均符合预期。
- 本机 workerd 支持的最新兼容日期为 2026-10-30，第一次以项目日期 2026-11-18 启动失败。隔离脚本改用支持的日期。默认沙箱拦截回环访问，批准后仅在 `127.0.0.1` 运行并自动关闭。项目的 Wrangler 兼容日期保持 2026-11-18，精确目标日期尚无本地运行证据。

## 第三轮 · 迁移、合规与交付

- 隔离 D1 先跑 001–008、插入一条旧链，再应用 009。旧链仍在，新增摘要列为 NULL，外键检查无异常。009 只增加可空列。正式接入需要先迁移再更新 Worker。
- 服务端复用既有 UUID 签发、链主键和事务，只保存规范化请求摘要，无队列、额外运行服务或新依赖。旧调用仍可省略提交号，防重保证适用于携带提交号的新流程。
- `node.exe tools/test-desktop-shell.mjs` 通过。这个结果覆盖桌面壳的既有回归，正式登记界面与系统级交互仍待验证。
- 建链防重与业务写入防重各有自己的回执。链内执行尚未接通，完整流程仍需验证逐条结果、部分失败、跨重启继续使用原提交号，以及写入成功但回执丢失时避免再次登记。
- 本轮改动为隔离模拟脚本、workerd 复测脚本及审核记录。精灵业务源码与发布配置未改动。生产迁移、部署、Git 同步、真实 AI、受控项目登录或线上效果验证均未执行。生产操作按既有确认规则处理。

## 复核文件指纹

| 文件 | SHA-256 |
|---|---|
| `agent/chains/api.mjs` | `277372F503BBF9FBF1AAC0B6D77DCD1E0594407EC385996EFB4092D1E6456BE7` |
| `agent/worker.mjs` | `D66BE8020776B529531D5E5D476295FB9C0C3671EF27C1311F3F8B8BE19F1EB4` |
| `agent/migrations/009-chain-submissions.sql` | `08EA490ECAEBDC74A6544F1F12C8270FB88BFA221455676D1AB9BE871C60C821` |
| `agent/tests/chains.test.mjs` | `3331BDE4E5601B65C3C31807BD2410ED97FE238BB7B20BD36B052F6DEE13B397` |
| `companion-recording-chain-mock.test.mjs` | `12CE7198C75A082B502E87418151261F0C7726CE535AA75C49F181E2500D6133` |
| `review-workerd.mjs` | `20F67BB8005B1F5798707FDD286EB8526FB647C78065DA387A2A7603C80D4859` |
