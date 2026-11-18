# 链任务核心实施与测试记录

依据：AGENT_CHAIN_DESIGN.md、AGENT_CHAIN_REQUIREMENTS_AUDIT_2026-11-18.md、后续主会话确认的协议与旧轮历史确认规则。范围是子代理负责的 agent 核心、迁移、sync 和测试；desktop 与 pending-poller.test 由主会话负责，不把其实现冒充本分工。

## 实现与最简检查

1. 新增 006 迁移及 chains/rules、claim、api；复用现有 tasklist/tasks/executions，稳定节点指向新 task_id；少量 SQL 表保存用户决定、旧轮归档，不增加调度平台、锁服务、租约、队列或凭据。
2. Worker 认证后路由，普通领取与强制/继续/恢复用相同祖先和名额条件；SQL batch 中再次检查。force/continue 写 activity；旧轮未知 abandon 仅存恢复快照。sync.executeClaimed 避免回执重放导致第二次执行。
3. 增加真实 SQLite 测试，调整旧测试中已被最新要求覆盖的无限名额、重复普通领取成功假设。没有削弱截止、旧记录、参数及鉴权测试。

开发中主会话指出旧轮中断无法确认、force 缺 activity；均在交付前修正并覆盖 CH04/CH03。第一版保留当前轮 abandon 取消但不跳过的既有语义并报告衔接问题。用户随后明确确认“视为跳过该节点，后续可继续”：本次仅修订 recover，使当前轮 abandon 同一事务保存 CANCELLED、未知快照和 skipped_task_id；被 force 替代旧轮的放弃不动当前轮。此为明确需求变更，不从实现倒推需求。

## 实际验证

工作目录 `G:/selftool/WebCharacter`。

- `node --test personal-digital-companion/agent/tests/chains.test.mjs`：初次 CH01–CH09 9/9；用户确认放弃语义后 CH01–CH11 11/11 通过。
- `node --test personal-digital-companion/agent/tests/task-lifecycle.test.mjs personal-digital-companion/agent/tests/task-actions.test.mjs personal-digital-companion/agent/tests/sync.test.mjs`：开发期发现旧 SQLite row 的 null prototype 断言问题，已规范对象比较；重复领取及两名额断言已按最新需求更新。
- `node --test --test-reporter=dot personal-digital-companion/agent/tests/*.test.mjs`：初交付 105 项，exit 0；用户确认放弃语义修订后的最终 108 项，exit 0。包括主会话当时已落盘的桌面链/发现测试及其新增回归；不是原生 UI 实机验收。

CH01 验证节点数量/循环/事务回滚；CH02 验证重复请求与跨独立任务共用名额；CH03 验证 continue/skip/stop 与 history/activity；CH04 验证跨终端 force、旧未知确认与归档；CH05 验证所有祖先及已领取后继仍执行；CH06 验证 force 截止/名额与回滚；CH07 验证恢复祖先限制、当前 abandon 明确跳过并保存未知快照；CH08 注入读后祖先变化、验证条件更新及迁移不可重复；CH09 验证旧轮 sync 补传与回执重放不重复 handler；CH10 验证放弃节点后后继仍等待其他祖先，祖先完成才可领取；CH11 验证读后 force 不会被旧 abandon 跳过，以及跳过 SQL 失败令恢复快照和取消状态一并回滚。

SQLite 适配执行实际 SQL 和实际事务；未应用真实 Cloudflare D1、未生产请求、未启动 UI/常驻 Worker、未部署或 Git 同步。主审核最多四轮由主会话独立记录，此文件不代替主审核结论。

## 交付哈希 SHA256

基线见需求审计。交付关键文件：

| 文件（agent/ 下） | SHA256 |
| --- | --- |
| chains/api.mjs | AB01E9A7B6DDCF517B72E633DACA58EAAC2F1152CE6FD5021ACAD46043ABAB1A |
| chains/claim.mjs | 12748CC01B9822BB74B26DED01218ED888C275ECE972290FF2D9322D4CCC3BE7 |
| chains/rules.mjs | AED046A77C61C47523EF4658CE21CA2ED2D566711FBC72BB81EB17E8D12A3C8C |
| migrations/006-chains.sql | 93AD210CFA6ECD9C21D09B1D5B28C41B0ACE98841BD25E18AB90C3E43F66359B |
| worker.mjs | 7EB7313A6FD6466E56CE4CFD0E9C6BCDE996467BDE09725C628204D500D7433F |
| tasks/recover.mjs | CD2C668729D08B00BEE847C7FA66289BDCE808438B6B71560351FA72AB61A421 |
| execution/sync.mjs | 63554B89EBD4B6820F6887B9E99186734806DA8BFBBDB88B9978838CEE4E6BC2 |
| tests/chains.test.mjs | 42947F8DB31A1714CE0F9F8862F100EC8A3B21C2CD72018A2EA2B71C7877879A |

完整接口与例子见 `docs/AGENT_CHAIN_API_HANDOFF.md`。迁移 006 必须在现有 001–005 后单次执行，测试 helper 的检测不意味着生产迁移可重复应用。
