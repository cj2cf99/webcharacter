# 精灵临时单链三轮复核

日期 2026-11-19（JST）。主会话自审自测，待用户确认。

**结论：临时单链、提交防重和本地迁移验证通过。完整自动登记仍待正式接入及验收。**

## 复核范围

- 项目 `G:/selftool/WebCharacter/personal-digital-companion`。Git 基线为 `7af003e64652dc57c8e90a8852d6fb893b787dd3`，实际修改和复核依据为精灵子项目当前工作区和针对六个文件的审核补丁。
- 以用户最新决定「一句话的内容作为一个链条生成」「一般不会超过10个」「5个的上限是给任务模板用的」为依据。十项是典型规模。对照 `docs/AGENT_CHAIN_DESIGN.md` 的默认无前置、明确前置时维持依赖，以及 `docs/TASK_SUBMISSION.md` 和 `docs/RECORDING_CHAIN_RELEASE_DESIGN.md` 的随机提交号、东京日期、部署目标和素材包范围。
- 查阅全局 `C:/Users/asura/.codex/AGENTS.md`、项目 `AGENTS.md` 与 `CLAUDE.md`、`G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`。本次只复核精灵来源的建链、迁移及接线边界。

## 第一轮 · 对照需求和代码

发现一处需求偏离。临时链正确接受超过五项的云端登记并使用一份回执，但创建接口把「默认独立」实现为「拒绝任何显式前置」。用户原规则允许相依节点。本轮先汇报该偏离，再恢复同链的显式前置，常规任务模板仍保持五项上限。校验使用节点索引判定是否有循环，沿用现有节点和提交号结构。

主站、`subscriptions-api` 正式入口及真实云端登记原先未完成。该状态属于发布缺项，现有隔离验证的结论保持在建链范围内。

## 第二轮 · 长链、前置、防重和失败

- 隔离副本运行 `node.exe --test agent/tests/chains.test.mjs agent/tests/task-submissions.test.mjs agent/tests/hu-shi-tasks.test.mjs`，设置 `COMPANION_HU_SHI_MAIN_SOURCE=G:/cloudflare/myapp`，24 项全部通过。
- 审核补测 11 项云端登记保留跨五项的显式前置，普通节点仍独立。循环返回 400，原编号可修正后提交。同号并发只创建一链，10 项链的后段故障时任务、节点和链全部回滚。
- 本地运行 `node.exe .\work\companion-one-chain-audit\review-workerd.mjs`，真实 workerd 类型运行时和隔离 D1 通过。60 个合成节点保留一条链和原顺序，显式前置可读。应用 010 后注入一次失败，原表约束、旧关联及暂存表状态均回滚。重新迁移成功，外键检查无异常。
- 模拟解析新增将明确的前置项编号传给 Worker 的验证。接口状态只证明依赖信息和阻挡条件能保存与读取，实际云端登记执行仍待联调。

## 第三轮 · 写回、回归与合规

- 写回精灵子项目后，使用同一 `COMPANION_HU_SHI_MAIN_SOURCE` 配置运行 `agent/tests/*.test.mjs`，156 项全部通过。运行 `node.exe --test .\outputs\companion-recording-chain-mock.test.mjs`，9 项全部通过。切到正式子项目源码复跑隔离 workerd，结果一致。
- 项目配置兼容日期为 2026-11-18，本机 workerd 探针使用支持的 2026-10-30。精确目标运行日期、生产绑定和真实 Workers AI 效果仍待发布验收。本地探针仅用了合成凭据和 127.0.0.1，结束后已关闭。
- 最简性复核通过。单条链仍使用既有 D1 表、一枚随机提交号和一份回执。没有增加分链、发布素材包或引入新依赖。模板旧行为与前置判断通过回归。010 沿用本次已有的迁移，旧链、前置、跳过标记及历史轮次均保留。
- 发布合规检查：本轮停在来源项目复核，生产数据库、发布配置、Access 登录、R2 和 Git 同步均未操作。正式上线仍需完成云端执行、桌面入口和主站接线，准备本地 Worker 验收及各待发布项目的根目录审核记录，再走发布确认。Access 线上交互由用户验收。

## 复核文件指纹

| 文件 | SHA-256 |
|---|---|
| `agent/chains/api.mjs` | `C154F81E011260A244234D1C0E7B7C9B55529DA91588581D7EC015450F6D7918` |
| `agent/worker.mjs` | `0EF3CFE4D93DD40D801FCADEABAE003A956DB05083D32333C9B2A5DA78F7F712` |
| `agent/migrations/010-temporary-chain-positions.sql` | `0F394A1113A46D43F3CD4FD9EC1C9A693CAD41737FE3B679D006109607A349DB` |
| `agent/tests/chains.test.mjs` | `C44C8B3D58A91A4906431EF1A5BCB2BF59FA5462ACCAE464BDFA3CAED856B61D` |
| `companion-recording-chain-mock.test.mjs` | `2DC942AA2619755A8E3B7BFC54D6D6C07550AF342195E2430D5DBEB7213B4969` |
