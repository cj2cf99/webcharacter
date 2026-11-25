# WebCharacter 部署审查报告 (RELEASE_REVIEW.md)

## 2026-11-25 绯月高优优雅让位、念叨非错结案、7件批量提醒核对、多线程AI网络池、5分钟超时上限与去转义展示 · 已部署

状态：**用户已明确许可（「开始部署，登记。」），已于 2026-11-25 11:42 JST 成功部署至 Windows 正式安装版并完成 14/14 哈希核验与脱离重启（PID `14456`，本机接口版本 7）；花园登记已于 2026-11-25 11:46 JST 完成并回读确认（批次 `feiyue-graceful-yield-batch-20261125`，Git 提交 `d133ce8d`，D1 revision `178 → 181`）。** 第三方审核：无。

### 1. 需求与验收
- **用户需求**：
  1. 修改高优打断处理逻辑：从立即中止改为处理完当前内容后停止、不再新开任务，再进入高优任务响应；
  2. 将“没有取得可用念叨”与执行错误分开，是否能生成交由云端判断，不再直接抛错；放宽句中自然连问的 `？` 拦截；
  3. 新增 `/api/reminder-review/batch` 服务端批量查询接口（每次最多 7 件），客户端 `reconcile()` 分批核对；
  4. 将云端 AI 网络访问拆分为 `worker_threads` 多线程异步处理，主进程负责进度与协调，高优回执优先投递；
  5. 全局单次 AI / 网络超时增加 5 分钟（`300_000 ms`）上限；
  6. 「本地复盘 → 任务日志」全量消息与快照细节取消 `\n` / `\"` JSON 转义展示。
- **验收标准**：
  1. 14 个涉改 `.mjs` 文件 `node --check` 全部通过；
  2. 7 组单元测试及桌面壳测试（63 项）全量通过，含新增高优让位与 7 件批量核对测试；
  3. 替换安装并受控重启后，本机桌面进程正常运行且哈希核验一致。

### 2. 目标
- **Windows 正式安装目录**：`G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`
- **服务端说明**：`agent/host/reminder-review.mjs` 一并更新至上述目录；若远端集成主站/Worker 尚未同步部署该接口，客户端已内置 404/405 自动回退单条 `GET` 兼容逻辑。

### 3. 基线与差异（共 14 项）
1. `agent/host/reminder-review.mjs`：基线 `D2AFCC5453FAA75004C08A3F46F6CAE9533994C40C4E188D000DF1680915A8CF` → 候选 `C3AA2E5FF76BB969B178EE2D5054DC32446E0EC13F06ED28633C87E7C8B9E72F`
2. `desktop/agy-cli-client.mjs`：基线 `65E18C6DBB62B4BA692B34285E2BFA61F3AF1A2DB235B357E44D7A28212A6E33` → 候选 `FC439AF7C3102BD3ABD1E077D70E3675E8AED37FD6DEE7475F2ECF28ABCD6508`
3. `desktop/ai-execution-round.mjs`：基线 `767720A84C4E6E737D4E20FBBFBD6C60E448192F6234B77C01A29B064F74C96A` → 候选 `B3A33FF4A3C27B97E6AE1B3CBBAC01D33A770407AD735733E755EEECCF947898`
4. `desktop/ai-gateway.mjs`：基线 `B0B04EDB26418FF4AFD33E24A15095FF47F7288A0DE5E7B486B73D3A72A0326D` → 候选 `74F73BA8DFEA3854DFFBE1944AC62FA823E8C0E6EB512C386C8928C6D0AC007E`
5. `desktop/ai-network-pool.mjs`：基线 `NEW_FILE` → 候选 `2A85E50B74EC47581846AAA10716C0F95F5E003872E209842F41E9C590470847`
6. `desktop/ai-network-worker.mjs`：基线 `NEW_FILE` → 候选 `131700DE7832FCCDE76DB7EA3AA6DCD5950C5E9CBDD1CDF67E368BBF1698E942`
7. `desktop/chat-deepseek.mjs`：基线 `C55435964C916FC3AE749FDD09A3B8C9ECAA3033D2AE6A2BEDC2B8D3FA792773` → 候选 `00336BE759C304F446C0FDCB0AECBE62DB81E3782F9679CA3F41E96723DAE0E5`
8. `desktop/conversation-ui.mjs`：基线 `256DE9582EC83DF202C2AB316AD759D020175884432A8D9AC8A2ADECE3FC5AE4` → 候选 `4C9E0130E68F335E0E87AE4523C3D5DF4790E4D1B3795E5FE7DE5E060AD84885`
9. `desktop/diary-deepseek.mjs`：基线 `CDCAB92A338D78C12D750341ABE48FF88D4097F8D4DF66D15ED53BCFB86C4066` → 候选 `8C0DF99204E982C876C91CC2ED7F583CD952B93EE91C98BA62617D45418608C6`
10. `desktop/emotion-service.mjs`：基线 `091D56837D6EAFE9E00AFE5786A3A63592F5ADE3D31DD485D80029E8D2A76A99` → 候选 `8005933093EFCF6D7A69B91D8AE31E8EA37E06F1B785DDC6719E7A5D937835C9`
11. `desktop/pending-questions.mjs`：基线 `9AE13E5A6BD3F662A3793FDFBCEDA268A1DBFF31FA6AB2D96A0163092844D0D6` → 候选 `8E6EE7B4B9DD8DBDBEE822F5804FC53590D4687BFE438A83943574793FBBDBD7`
12. `desktop/personality-nags.mjs`：基线 `54EA809B74E1F4E6E28EA98908FF3A6CBF81589609F3AAC9C21D0C8815C5DDBB` → 候选 `C2585FD5ECB50777699B69F75A98B3F4D3A34588F8C3BDCB25EBB904284E0F48`
13. `desktop/reminder-review-flow.mjs`：基线 `AE45FABF52EC9D227FFB7F44534798FD5FA8B9DFD5C5D45ECC3E49CC9D30AFA6` → 候选 `E5C1CC6C1AB6D523765C5D9A0A701C4F69B880B8516801459E7FBC18C20EF80A`
14. `desktop/shell.mjs`：基线 `0F3337343553F50C87DD126A13387B9A01EF6F0CF7F1250AEF460A475634E446` → 候选 `BEE4ABA7E96E06727B85EB63A3E37CBABA30A97335C36C2825ADBE18EF079BFA`

### 4. 逐项文件与行为变更
- `shell.mjs` & `emotion-service.mjs`：高优抢占调用 `interruptMemory(false)`，等待当前在途 AI 调用完成并落盘后再中止后续任务；退出/休眠/锁屏仍传 `true` 立即中止。
- `pending-questions.mjs` & `personality-nags.mjs`：允许句中自然连问的 `？`/`?`；云端未产出有效问题时跳过入队而不抛出错误。
- `agent/host/reminder-review.mjs` & `desktop/reminder-review-flow.mjs`：新增 `POST /api/reminder-review/batch`（上限 7 件），客户端 `reconcile()` 分批核对并支持 404/405 回退。
- `desktop/ai-network-worker.mjs`、`desktop/ai-network-pool.mjs`、`desktop/ai-gateway.mjs`、`desktop/chat-deepseek.mjs`：云端 AI 请求迁至 `worker_threads` 异步池，按 `priority` 优先投递高优回执。
- `desktop/ai-execution-round.mjs`、`desktop/diary-deepseek.mjs`、`desktop/agy-cli-client.mjs`：全局单次超时上限统一收口为 5 分钟（`300_000 ms`）。
- `desktop/conversation-ui.mjs`：全量日志与模型快照采用 `formatReadableValue()` 去转义展示。

### 5. 数据和配置影响
- 无数据库迁移、无数据回填、无新增外部依赖或环境变量变更。

### 6. 实际验证
- 14 个 `.mjs` 文件 `node --check` 全部通过；
- `node --test --test-timeout=15000` 跑通 7 个测试文件共 **63 / 63 全部通过**（`fail: 0`，`5464ms`）。

### 7. 未完成事项
- 待用户明确部署确认后，执行正式安装目录备份、文件替换、哈希核验与受控重启；
- 云端 Worker（`myapp` / `subscriptions-api`）本次未同步部署，`/api/reminder-review/batch` 线上生效前桌面端自动回退单条 `GET`。

### 8. 风险与恢复
- **风险**：低。客户端对批量接口具备 404/405 自动回退，线程池 `worker.unref()` 不阻塞退出，5 分钟超时上限有统一兜底。
- **恢复**：部署前备份正式目录既有 12 个旧文件至 `output/install-backup-20261125-1137/`；异常时覆盖恢复并删除 2 个新增文件后重启即可。

### 9. 部署和发布后验证
- **安装备份**：已将正式目录既有 12 个旧文件备份至 `personal-digital-companion/output/install-backup-20261125-1139/`。
- **文件替换与哈希核验**：14 / 14 文件原子替换成功，SHA-256 全部与候选一致。
- **进程与接口验证**：正式版桌面进程以 WMI 脱离方式重启就绪（PID `14456`），`http://127.0.0.1:8765/infoguide` 返回 `version: 7`、`pid: 14456`。
- **花园登记回执**：
  - 批次编号：`feiyue-graceful-yield-batch-20261125`
  - Git 提交：`d133ce8dd2ec3e2c494196c9cd07fbbb2da87ddb`（`G:/cloudflare/myapp`）
  - 审核摘要（reviewHash）：`c3e0afc82f0a59047ce86847e75c4adeb10c8bd898e23be8a35c850f70b289df`
  - 完成时间：`2026-11-25 11:46:36 JST`（`state: done`，3 步全部 `verified`，D1 revision `179` / `180` / `181`，已 `ack`）。

### 10. 用户确认与第三方审核状态
- **用户确认**：已明确确认部署并登记（2026-11-25 11:39 JST）。
- **第三方审核**：无。

---

## 2026-11-25 提交队列解绑严格等待与提交前一刻占号改造 · 绯月 Windows 正式安装版 · 已部署

状态：**用户已明确许可（指令「先部署，后登记」），已于 2026-11-25 00:11 JST 成功部署并完成哈希核验；花园登记已于 2026-11-25 00:20 JST 完成（批次 feiyue-queue-simplify-20261125，Git 提交 74c95b49，D1 版本 33.6 → 33.7，revision 171 → 173）**。第三方审核：无。

### 1. 需求与验收
- **需求背景**：用户指出正式工作与花园登记提交队列设计过于复杂、限制太多（“至少把这个罗里吧嗦的严格等待去掉，对号码的占据应该是再提交前一刻决定的，不是提前做好了恶心人”）。
- **验收标准**：
  1. 彻底移除 `prepare` 脚本在起草阶段的长轮询死等（`while (turn.state === 'waiting')`）与控制台阻塞输出；
  2. 制单（`prepare`）恢复为本地纯净、瞬时快照运算，支持多方并行准备，起草阶段零阻塞、零占位；
  3. `waitingTurn` 排队占位严格限定在已定稿（`review IS NOT NULL AND review <> ''`）批次，未定稿草案不进入排队计数、不阻断其他草案；
  4. 排位与号码的占据收缩至提交前一刻（提供 `reviewHash` 定稿 / `submit` 入队瞬间）；
  5. 本地 REST API 契约测试（17 项）与全流程集成测试 100% 通过；
  6. 接口文档同步更新说明。

### 2. 目标
- **正式安装目录**：`G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`

### 3. 基线与差异
- **涉及文件清单**（共 3 项）：
  1. `desktop/local-task-pool.mjs`
     - 基线 SHA-256：`A3F66FD891351D9052F671A7038F5CAD8B6C6C05FC5827E7BFFA6995863C7D2B`
     - 候选 SHA-256：`E6546F738922FB5007D86AFC3A404C8D4F5648D4D153D3390108E39337721604`
  2. `tools/prepare-garden-registration.mjs`
     - 基线 SHA-256：`4C739565D34F2E4198E96D438A34E2BC5A443613EBA936A63D53540623219E67`
     - 候选 SHA-256：`565520D78B7C35D42F7B013283942F6409A0F9E7EC1171EEB8DDAE8ECAAACA48`
  3. `docs/LOCAL_GARDEN_API.md`
     - 基线 SHA-256：`06038C9DAF1EAA7F1494E4F3F82A2FFE047397A91EE29C784CB20B74DC265CC1`
     - 候选 SHA-256：`5F3C08E01EF38B8CD665B92BDADAED5001A431DBA6FAB9B1D05BBF4B0F2CD802`

### 4. 逐项文件与行为变更
1. `desktop/local-task-pool.mjs`：
   - 过滤条件 `waitingTurn` 增加 `review IS NOT NULL AND review<>''`，未定稿草案不进入等待计数，不使后续草案变成 `waiting`；
   - 修正 `claimTurn` 断言为 `invariant(prior||!poll)`，允许在提交前一刻直接单步定稿取号；
   - `allowSubmit` 解绑强制预取号逻辑：没有正在定稿提交中的外部冲突时直接允许合法批次入队。
2. `tools/prepare-garden-registration.mjs`：
   - 拔除 `while(turn.state === 'waiting')` 死循环轮询与 `等待统一取号，位置 n` 阻塞输出；
   - 移除起草阶段多余的强制封包与异常 `/cancel` 握手，使 `prepare` 成为无状态瞬时工具。
3. `docs/LOCAL_GARDEN_API.md`：
   - 更新“并行准备与统一取号（v7）”章节条款，明确准备阶段无锁并行、号码占据收缩在提交前一刻。

### 5. 数据和配置影响
- **数据影响**：无数据库表结构变更，复用既有 `batches`、`garden_turns` 表结构；无数据回填需求。
- **配置与依赖**：无环境变量变动、无外部依赖增加。

### 6. 实际验证
- 单元契约测试：`node --test personal-digital-companion/agent/tests/local-rest-garden.test.mjs`（17 项全部 pass，耗时约 6.7 秒）；
- 端到端工作流：`personal-digital-companion/agent/tests/garden-first-use.test.mjs` 全流程通过；
- Codex 三轮自审：已完成 3 轮完整五项检查，形成自审报告 `docs/reviews/SUBMISSION_QUEUE_SELF_REVIEW_2026-11-25.md`，结论为自审通过。

### 7. 未完成事项
- 无。本次代码已全部替换生效。

### 8. 风险与恢复
- **风险评估**：极低。本次仅解开草稿期的前置排它锁，提交后的正式入队与批次执行流水线（`ready.get()` 串行执行、D1 步骤回读与版本校验）完全保持原有健壮逻辑。
- **恢复方案**：部署前已将正式安装目录对应 3 个文件备份至 `output/install-backup-queue-20261125/`。若有异常，直接恢复旧文件覆盖即可秒级回退。

### 9. 部署和发布后验证结果
- **安装前复核**：3 个目标文件基线哈希核对一致。
- **备份**：旧文件已完整备份至 `output/install-backup-queue-20261125/`。
- **文件替换**：3 个文件原子替换完成，正式安装目录文件 SHA-256 哈希全部与候选值一致。
- **安装后验证**：正式目录文件哈希 100% 匹配。

### 10. 用户确认与第三方审核状态
- 第三方审核：无。
- 用户确认：用户已明确许可部署（指令「先部署，后登记」）与花园登记确认（回复「“确认部署」）。
- **花园登记回执**：
  - 批次编号：`feiyue-queue-simplify-20261125`
  - Git 提交：`74c95b49c0a28102c4ced0a5a642f71ce024ad7d`（G:/cloudflare/myapp，`database/changes/feiyue-queue-simplify-20261125`）
  - 审核摘要（reviewHash）：`cbe0bc507c83ffa419d38d31081606c0005f381d224d04a9fb60d3300cd897c7`
  - 完成时刻：2026-11-25 00:20 JST（UTC 2026-11-24T15:20:19.029Z），已调用 `/ack` 应答确认（2026-11-24T15:20:25.300Z）
  - 执行结果：2 步全部 verified，D1 修订号递增为 171 → 173：
    - 步骤 1：功能改善 #84《提交队列解绑严格等待与提交前一刻占号》（done，revision 172）
    - 步骤 2：部署明细 #107 / #191（绯月（桌面精灵）版本 33.6 → 33.7，revision 173）

---

## 2026-11-24 对话转录云端终审中档思考与合法空结果修复 · 绯月 Windows 正式安装版 · 已部署

状态：**用户已许可，已于 2026-11-24 23:28 JST 成功部署并重启**。**花园登记已完成（批次 feiyue-transcription-deepseek-20261124，Git 提交 a2ed1d6b，D1 版本 33.5 -> 33.6，revision 171）**。第三方审核：无。

### 1. 需求与验收
- **需求背景**：用户核查自主行动“对话内容转录”失败原因，定性为“本地判断只能解释为可能有任务，具体最终判断交给云端判断，这里单独调用中档深度思考”，要求按此逻辑方向修复并上线。
- **验收标准**：
  1. 云端 DeepSeek 对话转录补拟显式调用 `reasoning_effort: 'medium'`（中档深度思考）；
  2. 本地初筛提取仅作线索，当云端中档思考终审裁定无须入库（`candidates: []`）时，转录正常结案为 `empty`，不再报错中断为 `failed`；
  3. 若存在明确委托（`confirmedIds`）但云端仍未能生成具有原文依据的草稿，才报错提示；
  4. 自主行动的阶段动态更新（修复界面永远残留“准备整理”的日志展示问题）；
  5. 既有单元测试与新增空结果终审测试全部通过，无新增失败。

### 2. 目标
- **正式安装目录**：`G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`

### 3. 基线与差异
- **基线版本**：正式安装目录（当前运行版本），涉及 2 个文件：
  - `desktop/transcription-deepseek.mjs` (SHA-256: `a6cb7bff8b1c44da8530aec8542787288af05a0566ccb14b3e070cd8040a875b`)
  - `desktop/conversation-transcription.mjs` (SHA-256: `163227e9cbd2e0fd4bd48d264bc3ff70d912ca7350f5935ef13d3eae065497ea`)
- **候选版本**：
  - `desktop/transcription-deepseek.mjs` (SHA-256: `2df7b5fb4538212a7e2ddd83064c1c938277d02d6204f28e541a33e0b5d6f8dc`)
  - `desktop/conversation-transcription.mjs` (SHA-256: `2f4aee46d620ec3c235186f088fd1ad360472605a5c5891802c6efa0fc49fe01`)
- **清单存档**：`docs/releases/transcription-deepseek-20261124/desktop-manifest.json`

### 4. 逐项文件与行为变更
1. `desktop/transcription-deepseek.mjs`：调用 `requestBandao` 时注入 `reasoning_effort: 'medium'`。
2. `desktop/conversation-transcription.mjs`：
   - 移除 `remoteDraft` 校验回调中 `!drafted.rows.length` 的强行报错限制，保留 `!hasConfirmedDrafts(drafted)`，允许云端合法的“无任务”空候选；
   - 联动 `worker.claim` 与 `progress(phase)`，动态同步 `claim.stage`，使界面与审计日志准确呈现真实执行阶段。
- **配置与数据**：无配置文件或数据库修改，现有数据零侵入。

### 5. 实际验证
- `agent/tests/conversation-threads.test.mjs` 中“转录只在首轮本地拟稿无结果时经 DeepSeek 共用接口补拟一次”通过（1.74s），覆盖思考强度与云端终审空结果正常流转至 `empty`。
- `ai-gateway-guard.test.mjs` 与 `chat-registration-boundary.test.mjs` 6 项测试全部通过（100% pass）。

### 6. 风险与恢复
- **风险**：中档思考耗时略增（通常 2~4 秒），后台异步转录不影响前台交互。
- **恢复**：部署前将正式安装目录原文件备份至 `output/install-backup-transcription-20261124/`，遇异常可秒级覆盖还原。

### 7. 部署和发布后验证结果
- **安装前复核**：两个目标文件哈希完全等于清单基线值。
- **备份**：旧文件备份在 `output/install-backup-transcription-20261124/desktop/`。
- **进程替换**：旧主进程 PID 13852 退出，两个文件经临时文件哈希校验后原子替换，目标文件哈希核对与候选值一致。
- **启动验证**：注入用户环境变量后受控启动，新主进程 PID 35312，renderer 进程 PID 35056 正常运行。

### 8. 用户确认
- 部署许可：用户已明确许可部署（回复「ok」）。
- 花园登记指令：用户明确指示登记（回复「提交」/「轮你提交了」）。

### 9. 花园管理记录与回执
- **批次编号**：`feiyue-transcription-deepseek-20261124`
- **批次标题**：绯月对话转录云端终审与中档思考修复发布
- **Git 提交**：`a2ed1d6b127d3a61979101565202c05d5e2602f5`
- **审核摘要 (reviewHash)**：`6235662f43527771d9c5e054f18967302ae71d675335390d1e42a983b8df5494`
- **D1 修订号**：`170` -> `171`
- **功能变更**：项目 #16（网页角色组件）下功能 #61「绯月（桌面精灵）」部署版本 `33.5` -> `33.6`（部署记录 #106，部署明细 #190）
- **入队与完成时间**：创建于 `2026-11-24T15:12:20.783Z`，执行完成于 `2026-11-24T15:12:47.220Z`，签收于 `2026-11-24T15:12:55.547Z`
- **执行状态**：`state: 'done'`，步骤 `[{"label":"登记绯月对话转录云端终审发布","state":"verified","at":"2026-11-24T15:12:39.763Z","revision":171}]`，回读一致无差错。

