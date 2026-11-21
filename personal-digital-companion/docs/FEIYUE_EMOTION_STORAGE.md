# 绯月情绪系统 · 本机、服务端与审核包的存储设计

2026-11-21 JST，基础设计。用户明确要求思考细节只留本机，区分服务消费与事后审核所需数据，明确位置和结构，便于打包。以下“现有”指工作区源码，“拟建”指开发目标。关联[程序设计](FEIYUE_EMOTION_PROGRAM_DESIGN.md)、[本机 skill 设定](FEIYUE_EMOTION_SKILLS.md)。

## 1. 按使用者确定数据边界

| 数据类别 | 谁需要、用来做什么 | 权威位置 | 可离开本机的内容 |
|---|---|---|---|
| 当前情绪、强度、对象、内心话、喜好、当前欲求与满足条件 | 桌宠据此说话、判断欲求和恢复状态 | 本机 profile/emotions.sqlite；已有的人格、skill 设定按版本引用 | 进入已发表日记的当篇情绪和私语、念叨里实际说出口的话及事项评价。完整状态留本机。 |
| 周骰、重掷结果、奖励、维持次数、放下的欲求、结算前后值 | 桌宠运行及事后核对“为什么得奖／扣次” | 同库 weeks、events、state | 无。主站展示日记不需要这些字段。 |
| 观察、模型实际收到的脱敏材料、意图、引用、决定、未发内心话、下一轮关注点、失败点、skill 与模型版本 | 本机审核，定位事实选错、判断偏差或执行失败 | 记忆根目录/决策复盘/东京日期/轮次ID.json | 无。包括服务端日志、远端模型上下文、遥测及错误上报。 |
| 原始对话、完整任务和操作记录、本机专题、候选问题、查询尝试、珍藏引文 | 本地联想、求证、摘要更新与审核 | 既有按日归档与业务库；专题另存本机文件夹 | 已实际纳入手记或念叨的成品摘录可按原契约提交。专题全文、索引、查证过程本期均留本机。 |
| 已成篇手记 | 主站搜索列表、读正文、翻悬念 | 服务端 D1 companion_diary 为已发布版本；本地 pages 为缓存，drafts 为未确认草稿 | 成品批次与篇首字段，按 §3。 |
| 已发生的念叨和回应 | 主站查看原事项、用户解释、绯月评价和结束状态 | 服务端 D1 companion_nags 为已同步版本；本地 nags 保存待传版本 | 按来源投影后的正式事项与互动字段，按 §3。 |
| 查询、技能和业务服务 | 本机 Aggressive 9B 接收本阶段必要字段；傲慢周的公开查询服务接收经校验的公开关键词；既有业务服务接收原有业务参数 | Aggressive 9B 的工作输入在本机；公开来源和业务回执按来源 ID 存本机 | 对外搜索只发公开主题。远端业务调用沿用各自契约，不附带人格快照、本地检索结果或审核文件。 |

**判定例。** “我已经读回正文了”如果是绯月真实说过的话，可以进入日记。模型在决定前看过哪三条证据、想不想借机求夸、最后为何决定暂缓，归本地决策复盘。构造云端正文时只取允许发表的来源材料，不能让写作模型先读整份复盘再自行删减。

## 2. 本地物理位置和结构

profile 取运行中 shell 实际打开的资料目录，默认是应用根目录的 output/desktop-profile；记忆根目录取 memory.root，源码默认 F:/feiyuememory。安装树可用目录联接，导出时通过这两个运行时根解析，包内一律用相对路径。

| 位置 | 结构、主键和内容 | 写入与查找 |
|---|---|---|
| profile/emotions.sqlite · state（拟建） | 单行 id=1；revision、enabledAt、updatedAt、moodWord、direction、strength、object、reason、innerLine、desire（ID／内容／缘由／满足条件／状态）、holdRemaining、按来源的补扫游标、小型喜好版本映射 | 主进程唯一写入。每次结算按 revision 比较并更新。方向为正或负，强度 1–5，维持次数为非负整数。 |
| 同库 · weeks（拟建） | weekStartJst 作主键，rolledAt、face；可附本次实际重掷次数与是否顺移，用于解释结果 | 东京周一起始日期；face 在 1–7 之间。本周重复启动取原行。 |
| 同库 · events（拟建） | seq 为主键，eventKey 唯一；kind、occurredAt、recordedAt、interactionId、sourceRefs、status、beforeRevision、afterRevision、settlement、skillVersion | 按 status、seq 找待办；按稳定事件键查重复。同一表记录刷新原顺序、初次提交的结算前后值、语义是否暂定、数值校正依据、每笔最近一次折算的档位与余次终值及奖励确认序号。奖励键 reward/desireId 唯一且关联原事件。settlement 保存实际变动的前后值、涉及的欲求 ID、满足／放下理由、奖励与剩余次数；不复制整段对话。受影响的终值、完成标记与 state 更新在一个事务内。 |
| profile/personality-memory.sqlite（现有） | materials／cleaned／material_sources 记录素材、清洗文本和来源；drafts(id,day,packet)、pages(id,day,json)、nags(id,json,dirty) 分别保存批次、篇缓存、念叨与待传标志 | 在本地材料记录中保存新产生的历史强度，固定来源 ID 及版本；旧记录缺值为未知。本机附加字段不进入上传载荷。 |
| 记忆根目录/决策复盘/YYYY-MM-DD/roundId.json（拟建） | schemaVersion、roundId、previousRoundId、slotKey、startedAt、endedAt、status；observe／propose／decide／execute 分段保存。每段有时间、状态和本段实际输入／结构化输出。模型阶段附技能版本、模型标识、证据摘录；执行段保存原回执引用和结果。 | 一轮一文件，按开始日归档，各阶段原子替换同一文件。未执行阶段为空；用户打断、解析失败、执行结果未知均保留。 |
| 记忆根目录/专题记忆/专题ID.md、目录.md | 每篇头部固定 topicId、revision、updatedAt、title、aliases、keywords；正文分为当前结论、带引文的事实、来源、待确认、修订。待确认项含 questionId、缘由、来源、有效核查次数、结果与告知版本。 | 主题文件是原件，目录为可重建索引。专题 ID 稳定，改标题不改引用。完成第三轮仍未知即挂起，只有有效新增证据才接续。 |

专题主件为 `专题记忆/<id>.md`，同目录的 `.md.bak1` 到 `.md.bak3` 按新到旧保存，目录可由专题原件重建。加载时先查完整备份，再尝试用可验证的元数据恢复正文，或保留有来源的可读旧摘记并重新核查。全损时原始字节只保留在一个 `.md.bad` 中，同一编号清空结论、重新整理。坏样本计入三份上限，此后最多另留两份健康备份。绯月在空闲时通过本机询问窗口求助，答复作为本机线索；用户取消后停止本次询问。
| 记忆根目录/YYYY/YYYY-MM/YYYY-MM-DD/、profile/tasks.sqlite 等（现有） | 对话与任务的原始业务记录继续使用现有 ID；相同题材可能来自多条独立记录 | 决策引用统一形如 source、id、revision（若有）、at；资料可能后续变化，审核文件另存当轮实际使用的短摘录。 |

存储时间点采用 UTC 毫秒或带 Z 的 ISO 字符串，字段类型在同一结构内固定；数据库中的运行时新时间戳统一用毫秒，JSON 审核包的展示时间附时区。weekStartJst 和 day 是东京业务日期。日记键为 day + 数字 part，念叨用 id，任务用业务 taskId，完整对话用 interactionId。跨机器读包不靠原盘符、数据库自增行号或中文标题拼接找来源。

已核实的负向事实、普通功能改善和用户进展复用 events。以原事实的稳定键作为唯一 eventKey（含事实类别与来源身份），在同一事务把事实标记为由哪一笔交流、独立事实或欲求奖励结算。交流先到时同时登记该事实键，事实先到时后续交流只对新增互动评价。settlement 保存触发规则、建议增减、实际档位与次数前后值；满值吸收增益时同样记下来源，供本地审核包核对。

### 欲望累计池只存本机

二期在本机 profile/emotions.sqlite 中，desirePool 以 desireId 为主键、candidateKey 唯一；保存目标、满足条件、来源引用、登记时确认的七罪 seriesId 及依据、状态、首次／最近出现时间、行动及退出原因。按 seriesId 和有效在池状态计数。desireTriggers 以 triggerId 为主键，保存触发系列、达标当时有效件数、产生时间、状态、指定欲望 ID、轮次、唯一 actionId 和结果；同一系列最多一条待执行触发。唯一执行位仍在 state。入池与触发使用同一 selection/roundId 事务。清池记录实际时间、同系列与其他系列被清除的 ID、其他系列抽样总数及清除数。将相关触发、件数及清池结果关联到本地轮次记录。

二期在 state 的喜好映射中保存当前内容、适用情境、版本和最近行动编号；旧值、修订理由和证据引用放入原 roundId 的本地复盘。重复行动只返回已提交结果。

## 3. 服务端现有结构与可提交字段

基线为来源子项目的 [016 迁移](../agent/migrations/016-personality-memory.sql)和[读写处理](../agent/assistant/personality-memory.mjs)，来源模块通过 env.DB 访问。来源工程的本地配置名为 companion-agent-local，已保存的集成 Worker 配置指向 D1 的 feiyue-companion。花园用的 stockanalysis 不属于这条数据链。网站通过原有列表和详情读成品。本设计按当前业务用途复用两张表，新增云端表、索引、数据迁移和回填的建议均为零。

| 现有 D1 表 | 键、索引 | 存储内容与读取 |
|---|---|---|
| companion_diary | 主键 (owner,day,part) | revision、body、summary、tags、mood、weather、threads、batches、updated_at。tags／threads／batches 为序列化数据。列表只取篇首检索字段，详情再读正文。每篇上限 5000 字符，满篇续开；补写按批次追加，旧正文保留。 |
| companion_nags | 主键 (owner,id)，唯一 (owner,source,source_id)，另有时间索引及每个 owner 最多一个待续事项的条件唯一索引 | revision、created_at、source、source_id、title、reason、status、mood、payload。列表取摘要，详情读 payload。保留 paylog／diary／audit 三种来源和既有结束状态。owner 从服务端已认证身份取得。 |

**客户端出口。** 建议新增纯投影方法 toDiaryBatch 和 toNagPayload。日记只从已生成成品取 day、batch、body、summary、tags、mood、weather、threads。念叨先按现有来源分别列明兼容字段，再从正式事项对象组包：身份与版本、来源、标题、原因、状态、事实摘要、已显示问答、当时评价与情绪、后续问题和续办计数。audit 严格沿用 validAudit 的字段及 refs／points 引文要求；paylog 与 diary 保留各自现有的 source_day、stats、悬念及续问资料。开发时逐项核对现有序列化样本，使重传时原批次和原载荷仍兼容。保留原念叨话语中的 beforeEvaluation／afterEvaluation 和日记段末私语；任何新核心状态、模型输入和内部引用都只入本地审核文件。

**服务端入口。** 当前普通念叨将请求对象序列化入 payload。此次人格设计仅调整本机成品投影，沿用服务端既有契约。服务端新增嵌套校验、日志策略改造如需实施应单独立项。

**补传也走成品投影。** 在发送边界对新记录和旧 dirty 记录统一调用 toNagPayload；talk 每行从已发表对话提取 who、text、at，audit 引文只取 page、quote，其余嵌套内容按各来源既有契约提取。保留原 ID 和 revision；只有该次发送成功且待发记录仍为发送时的原版本，才清 dirty。日记草稿在首次形成批次时固定投影内容，重试使用相同 batch 和相同成品。验收把本机标记放进嵌套的非公开字段，对比首发与重启补传的序列化请求，并确认原样保留实际说出口的文字。

**同步与验收。** 日记沿用原批次与独立读回核对。普通念叨目前未统一读回详情，不能据 HTTP 成功宣称正文已核验。若要升级普通念叨同步协议，另行处理。人格接线验收覆盖本机投影、重传与最终可见成品；审核材料只留本机。

## 4. 本地事后审核如何打包

二期按东京日期分目录保存已完成的 roundId.json，内含脱敏事实短摘录、必要来源引用、版本、当轮前后状态与实际回执。需要跨日时记录前序日期及编号。按日期选择这些文件即可用系统压缩工具打包；池清理与喜好修订的相关摘要纳入该轮记录。专题原文仍单独保存。首版不要求专用 ZIP 导出器、逐文件摘要或复制整个资料库。

本地审核资料与服务端成品通过不同入口取材。用隔离标记检查每种成品及重试载荷均不包含内部审核字段；本地文件可按日期和 roundId 找到该标记。

## 5. 实施边界与剩余决定

- 一期在一个 SQLite 文件内使用 state、weeks、events 三张表。二期随主动欲望池增加 desirePool、desireTriggers，按日期保存轮次复盘。专题按后续阶段接入。
- 本地审核包用于解释“当时为什么这样做”。有状态恢复需求时，应另设计完整资料恢复包；审核包中按范围导出的样本不能覆盖运行库。
- 目前没有已确认的服务消费者需要读取专题全文、实时情绪、欲求历史或思考细节。未来若要跨设备查专题成品，可单独定义只含专题 ID、版本、标题和已发布摘要的投影，再决定服务端表和权限；本机专属思考细节继续留在本机。
- 设计依据另含[项目备忘索引](TASK_TEMPLATE_PREVIEW.md)、[框架偏好](G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md)、主站设计索引和 C:/Users/asura/.claude/projects/G--cloudflare/memory/MEMORY.md，以及现有[本机归档](../desktop/memory-archive.mjs)、[手记同步](../desktop/personality-diary.mjs)。独立项目与全局开发设计备忘录的检索情况沿用项目索引。后续重点验收旧念叨字段兼容、evidence／audit 资料仅本机、断网重试、相同事件重复领取奖励、跨日导出和离线包引用完整性。
