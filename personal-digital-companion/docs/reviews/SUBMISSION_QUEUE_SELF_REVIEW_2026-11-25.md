# 提交队列与取号机制自审报告（2026-11-25 JST）

状态：自审通过（连续两轮无新增问题、无遗留问题）。

## 审核对象与范围

- **审核对象**：
  - `personal-digital-companion/desktop/local-task-pool.mjs`（队列管理、取号判定、准入检查）
  - `personal-digital-companion/tools/prepare-garden-registration.mjs`（制单与草稿准备 CLI）
  - `personal-digital-companion/agent/tests/local-rest-garden.test.mjs`（REST API 与队列契约测试）
  - `personal-digital-companion/docs/LOCAL_GARDEN_API.md`（接口规范与流程说明）
- **依据与准则**：
  - 用户当次要求：“至少把这个罗里吧嗦的严格等待去掉，对号码的占据应该是再提交前一刻决定的，不是提前做好了恶心人”
  - `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`（单人自用、最简设计、两轮无问题终止自审规范）
  - 项目 `CLAUDE.md` 与 `docs/DEVELOPMENT.md`

---

## 第一轮 · 完整五项检查与即时修正

### 检查情况
1. **Bug、缺漏和边界错误**：
   - 【发现】`local-task-pool.mjs` 中的 `claimTurn` 原条件为 `invariant(prior||(!poll&&!review),'原排队已取消，请重新准备')`。当调用方在草案阶段未提前登记、直接在提交前一刻首次调用并传入 `reviewHash` 时，`prior` 为空且 `review` 非空，导致表达式为 false 抛错拒绝。
   - 【修正】改为 `invariant(prior||!poll,'原排队已取消，请重新准备')`，仅在显式长轮询查询（`poll=true`）时要求前置草案，允许提交前一刻直接传入摘要占号定稿。
2. **不合理流程与阻断**：
   - 【发现】`prepare-garden-registration.mjs` 中保留了 `while(turn.state==='waiting') await wait(1500)` 的死循环轮询和 `call('/cancel')` 异常撤回，制单阶段强占全局号位，导致后续并发草案被动死锁。
   - 【修正】拔除制单时的长轮询等待与异常取消逻辑，让 `prepare` 成为纯粹的本地快照计算与落盘工具，随时准备、即刻返回。
3. **需求偏离确认**：
   - 对照原话检查：“把严格等待去掉”、“号码占据在提交前一刻决定”。改动将草稿生成与号码占据彻底解耦，完全符合原话，无扩大，无缩水。
4. **合规性与最简化设计**：
   - 移除了草稿期无必要的分布式锁握手，删减无用状态；代码保留既有事务幂等性与 SQLite 兼容性，无新增依赖。
5. **可优化项**：
   - 制单命令在遇到异常时不再发出额外的取消 HTTP 请求，避免网络故障时报出次生错误掩盖真实问题。

- **实测验证**：运行 `node --test personal-digital-companion/agent/tests/local-rest-garden.test.mjs`，17 项测试全部通过（耗时 6.7 秒）。
- **连续达标轮数**：0（本轮存在修正，计数归零）。

---

## 第二轮 · 完整五项复查与边界走查

### 检查情况
1. **Bug、缺漏和边界错误**：
   - 复查 `waitingTurn` 过滤条件：`review IS NOT NULL AND review<>'' AND NOT EXISTS (...)`。验证未定稿的草稿（`review` 为 null）绝对不会进入排队列表，也不会影响 `position` 计算；已提交入库的批次因 `EXISTS in batches` 自动退出等待，无幽灵占坑。未发现 Bug。
2. **不合理流程**：
   - 走查全流程：`inspect` -> `prepare`（瞬时完成无锁）-> 用户查看清单并确认 -> Git 提交 -> `submit` 入队执行。全链路无阻塞、无死锁分支。未发现流程缺陷。
3. **需求偏离确认**：
   - 严格对照用户原话，未发现需求偏离。
4. **合规性**：
   - 符合单人自用、最简设计、原生 ES Modules 约束。
5. **可优化项**：
   - 无。

- **实测验证**：运行 `node --test personal-digital-companion/agent/tests/local-rest-garden.test.mjs` 17 项全过；运行 `personal-digital-companion/agent/tests/garden-first-use.test.mjs` 全流程端到端测试通过。
- **连续达标轮数**：1。

---

## 第三轮 · 终审与状态机闭环复核

### 检查情况
1. **Bug、缺漏和边界错误**：
   - 复查重启恢复机制：模拟桌面应用退出重启，`batches` 表与 `garden_turns` 表持久化数据一致，草稿未定稿前重启依然保持 `ready`，已定稿但未提交批次保留原状态，未出现状态漂移。
   - 复查 `allowSubmit` 边界：当没有批次定稿时，`head` 为 null，直接放行合法提交；当且仅当有批次已定稿且处于提交窗口时，校验摘要匹配。未见漏洞。
2. **不合理流程**：
   - 复核并发草案场景：Draft A 与 Draft B 同时执行 `prepare`，两者互不影响；先提交者先入队执行并推升数据库版本；后提交者如基线发生演进，由既有 `canRefresh` 在提交前平滑刷新版本，无需人工介入排队。
3. **需求偏离确认**：
   - 无偏离，严格按指示收敛。
4. **合规性**：
   - 文档 `docs/LOCAL_GARDEN_API.md` 已同步修正；无测试夹具泄漏；无生产数据影响。
5. **可优化项**：
   - 无。

- **实测验证**：本地 REST 契约全量测试 17 项无报错，零警告。
- **连续达标轮数**：2（达成“连续两轮无新增问题、无遗留问题”标准）。

---

## 汇总与结论

- **Bug 修正**：修复了 `claimTurn` 中若未在草案期登记则禁止在提交前一刻单步定稿的断言边界缺陷（`invariant(prior || !poll)`）。
- **流程与需求修正**：彻底拔除 `prepare` CLI 中的长轮询死等与提前锁号，将排位与号码占有严格收缩至提交前一刻；移除了失败时的多余取消握手。
- **当前遗留问题**：无遗留问题。
- **结论**：自审通过。
