# WebCharacter 部署审查报告 (RELEASE_REVIEW.md)

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

