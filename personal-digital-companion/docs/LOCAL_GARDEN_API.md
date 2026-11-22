# 绯月本机花园登记接口

## 入口和实例

正式安装版完成更新、受控重启和验收后，在同一台 Windows 电脑读取 `GET http://127.0.0.1:8765/infoguide`。核对 `instance.pid`、`instance.profile` 和启动时间确实属于本次安装。说明列出当前版本全部路由、请求字段、回执、分页和恢复方法。每次调整 REST 都须同步说明与契约测试。运行时通过同一份路由表提供说明和匹配请求。端口被占用时桌宠会提示，保存的任务留在原资料目录。

调用端从实际安装目录的 `output/desktop-profile/local-api.token` 读取令牌，放入 `Authorization: Bearer <token>`。保留该目录原有用户权限，勿复制令牌到草案、日志或 Git。执行数据在同目录的 `local-batches.sqlite`。测试使用独立资料目录和随机端口。桌宠退出时停止受理，已经持久入队的任务随原资料恢复。

## 查询技能目录

v6 的只读 `GET /v1/skills` 使用同一本机令牌，返回总纲 ID `router`、技能数组 `skills` 和回退提示 `warnings`。每项含 `id`、`name`、`does`、`call`、`examples`、`version` 和 `source`。外置版本写作 `名称@版本`，`source` 为 `external`。对话转录另有 `workflow`，含 `entry`、`steps` 和 `exit`。

```powershell
$feiyueSkillHeaders = @{ Authorization = 'Bearer ' + (Get-Content -Raw -LiteralPath (Join-Path $verifiedFeiyueProfile 'local-api.token')).Trim() }
Invoke-RestMethod 'http://127.0.0.1:8765/v1/skills' -Headers $feiyueSkillHeaders
```

`$verifiedFeiyueProfile` 为已核对的实例资料目录。调用方可读取条目的 `call` 和 `examples`，再按相应入口操作。例如，转录从结束后的对话交给本机整理，并在任务管理查看结果。目录读取不会调模型、入队或执行任务。401 表示需要有效令牌，403 表示来源不符合原有本机限制，503 表示总纲暂不可读取。[更新及新增方法](SKILL_HOT_UPDATE.md)

## 准备清单和展示给用户

v3 的首次调用可以直接 GET 监听地址，也可以 GET `/infoguide`。两处返回相同 JSON。先核实正式安装实例，按 `firstUse.sequence` 顺序执行。每个 `firstUse.commands` 条目提供可执行程序、工作目录和独立的参数数组，路径取自当前实例。占位符由调用方填入实际数据。

1. 在 `commands.sync.cwd` 执行 `npm.cmd run db:sync-schema`，检查退出码。随后在私有临时目录选择一个新文件，按 `commands.inspect` 生成目录快照。该文件含实际业务数据，只供本机调用方核对。
2. 从快照的 `resources.projects` 精确匹配项目，按项目编号和名称匹配 `resources.flowers`，查看功能的 `version` 和 `resources.deploy[].items` 历史。各类目标的筛选条件、必填字段和取值见 `firstUse.catalog` 与 `createRules`。名称或归属有歧义时先澄清；新增前检查历史及发布标记。
3. 将快照中的 `baseline` 对象原样放入请求。按 `commands.prepare` 运行；标准输出是含 `file`、`id`、`reviewHash` 的 JSON。结构或数据修订改变时重新查询。读取 `file` 给用户看完整清单，保留本次明确确认后，按 `packageRoot`、Git 命令和接口说明继续。未经确认的草案留在调用端。

以下是原有请求格式和兼容命令。示例中的编号和时间仅用于说明格式。

1. 沿用现行登记意愿、实际线上结构同步和授权读取规则。先确定真实发布结果和东京时间，核对实际项目、功能、当前版本、历史及是否已登记。不适用的类别列入 `noChanges`。
2. 在调用方编写下列结构的请求。示例中的编号、说明和时间只演示结构。桌宠更新要从实际花园核对「网页角色组件 → 绯月（桌面精灵）」的唯一功能。失败发布使用 `release: "failed"`，按既有口径准备含真实原因的「发布中」记录，保留既有成功版本。
3. 从桌宠项目目录运行 `node tools/prepare-garden-registration.mjs 请求.json 新目录`。这一步使用主项目 Wrangler 对 stockanalysis 作授权读取，复制当前结构和花园行到内存 SQLite，复用主项目既有花园模型计算实际字段、关系和版本。它只在新目录生成 `registration.json`、逐步的 `step-001.sql` 等文件并显示确认摘要。运行条件是本机既有的 Node、Git、主项目工作树和 Wrangler 授权。
4. 调用方将**整批清单**展示给用户。逐项列出归属、编号、新增或修改、执行先后、前后值、版本变化、实际发布结果及无需更新项。取得对具体内容的明确确认后，保留该清单和摘要，将生成的清单和逐步 SQL 放到主项目 `database/changes/<id>/` 并提交 Git。原有 SQL 留痕和发布确认继续适用。
5. 读取正式实例的 infoguide，提交一次。API 校验调用方的确认声明、摘要、提交可达性及 Git 包中的精确 SQL。确认声明来自持有本机令牌的调用方，调用方负责保存用户的实际确认记录。

```json
{
  "id": "desktop-release-example",
  "title": "绯月本机更新登记",
  "kind": "desktop-update",
  "release": "succeeded",
  "result": "在此填经核验的实际安装版本、重启时间和结果",
  "noChanges": ["种子", "功能改善"],
  "steps": [{
    "label": "登记绯月安装版本",
    "resource": "deploy",
    "data": {
      "deployed_at": "2026-11-21T01:00:00+09:00",
      "items": [{"flower_id": 61, "note": "[发布成功:desktop-release-example] 此处填写经确认的实际更新内容"}]
    }
  }]
}
```

通用花园登记使用 `kind: "garden"`。普通数据更新使用 `release: "none"`。步骤的 `resource` 和 `data` 沿用花园模型的项目、功能、种子、种子落地、改善、Bug、关系、平台、平台功能、链接、数据源和部署。修改既有记录须填步骤的 `id`，新增省略。部署头和对应明细在同一步原子写入。原有字段和值由调用方在具体清单中逐项审阅。

## 入队、查看与恢复

```powershell
$base = 'http://127.0.0.1:8765'
$guide = Invoke-RestMethod "$base/infoguide"
# 先独立核对 instance 与实际安装版匹配
$token = (Get-Content -Raw -LiteralPath (Join-Path $guide.instance.profile 'local-api.token')).Trim()
$headers = @{Authorization = "Bearer $token"}
# 仅在用户已看过并明确确认具体清单时执行
$body = @{id=$batchId; commit=$approvedCommit; reviewHash=$approvedHash; userConfirmed=$true} | ConvertTo-Json
$receipt = Invoke-RestMethod "$base/v1/batches" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod "$base/v1/batches/$batchId" -Headers $headers
```

入队回执 202 表示本机事务已提交。重复提交相同编号与确认摘要可取回原回执。任务管理的「本机执行中任务」显示排队序号、每步确认和暂停原因。桌宠进入工作节点，头顶显示步骤名和已核对数。已入队的批次逐个执行。基线冲突的批次暂停，其他可执行批次仍按入队顺序处理。完成或暂停时有桌面通知。

- **中断或回执丢失**。先按原编号查询。进程重启自动读取未完成步骤。已有写入的步骤先核对行及修订号。短暂故障解决后可按原摘要调用 `POST /v1/batches/:id/retry`。
- **余下内容需要修改**。读取原批次和线上现值，将已完成项、待改项及前后差异一起给用户看。按原编号制备仅含剩余事项的新包，请求的 `continues` 填原确认摘要。保存新包到原 Git 目录并生成新提交。取得新清单的明确确认后调用 `POST /v1/batches/:id/revise`。旧提交保留历史，已核对步骤保留回执，最终仍是一批。结果仍不明确的在途写入会暂停。
- **完成判定**。最后独立读回所有目标、归属和有效终值，同一行多步修改以最后确认值核对。持久记录最终核对时间，写入一条整批复盘及手记素材后，清理本机待执行清单和 SQL。永久保留编号、确认摘要、Git 提交、步骤及回执。若归档失败，重试只补归档。
- **本机升级收尾**。按项目 AGENTS.md 核实实际安装基线，准备候选和发布审核，获准后安装并受控重启，核对新实例并验收。最后向用户展示最终登记清单，取得确认，再交给重启后的 API。开发和部署纪要分别记录实际安装结果、入队编号、最终回读结果。端口或正式实例未就绪时，保留调用方清单及原编号。

接口说明 v2 的步骤状态依次为 `pending`（待执行）、`checking`（核对基线）、`applying`（写入结果待核对）及 `verified`（已核对）。受控暂停期间，尚在读取基线的步骤保留到恢复后执行。已发出的写入仍须等待读回或在恢复后核实。

丢失写入回执后若花园又有更新，自动重试会保留现场。按当前基线重新制单并明确确认后，续办会读回原步骤的准确终值和归属。全部匹配时将实际核对时的修订记入步骤回执，并跳过已到位的写入。

## v4：正式工作队列、提交后不等待与待回执

v4 起（2026-11-21 JST，设计见 [FORMAL_WORK_QUEUE.md](FORMAL_WORK_QUEUE.md)），infoguide 的 `workStates` 说明绯月的两种工作状态。

- **正式工作**：花园登记批次、用户的登记、云端派给本机的任务。开始后不打断。本地待处理合计最多 20 项，执行中的也算，暂停的批次在恢复或续办前同样占名额。按到达顺序逐个执行。服务器每台电脑最多 2 个已接取任务，这条规则不变。
- **闲时工作**：写日记、补评价、念叨、手记核对、此刻所想等自发整理。正式工作开工时，这些工作暂停并保存草稿，空闲后续做。问答、生图和各路轮询与正式工作并行，互不等待。

接口变化：

- **提交不等空闲**：`POST /v1/batches` 在有名额时立即入队（202），满员返回 `429`，请稍后用同一编号重交。
- **排队信息**：入队回执和未完成批次的 `GET /v1/batches/:id` 附带 `queue`，格式为 `{position, used, limit, running}`。`position` 为 1 表示正在执行或下一个执行；`running` 是当前执行中的正式工作标题，空闲时为 null。
- **待回执清单**：`GET /v1/batches?unacknowledged=1` 列出已完成或已暂停、调用方尚未取回结果的批次。
- **取回确认**：`POST /v1/batches/:id/ack` 无需正文，只用于已完成的批次，记录取回时间；重复调用返回原回执。升级前的历史批次一律视为已取回。

调用方流程：

1. 入队成功后在发布纪要记下“已入队待回执”、编号、提交和摘要，本轮即可结束，不必等到 done。
2. 之后任一调用方开工时，先读待回执清单。对已完成的批次，核对全部步骤、finished 和摘要，把最终回执补记到原纪要，再调用 ack。
3. 暂停的批次按上文 retry 或 revise 处理。

```powershell
$pending = (Invoke-RestMethod "$base/v1/batches?unacknowledged=1" -Headers $headers).batches
# 逐个核对 state=done 的 steps、finished、reviewHash，把回执写入纪要后：
Invoke-RestMethod "$base/v1/batches/$batchId/ack" -Method Post -Headers $headers
```

## v5：本机 REST 创建一次性提醒

用户要求「在rest把这个功能也放开」，以便在桌面窗口无法操作时，由绯月按指定时间登记一条提醒并保留可复制的提示词。客户端直接提供标题、时间和正文。绯月沿用正式工作队列和既有提醒业务链路。调用前核对 `/infoguide` 的实例和版本，并使用同一本机令牌、JSON 请求体及回环地址。

```json
{
  "id": "follow-up-example-20261207",
  "title": "复盘既有同步任务",
  "deadline": "2026-12-07T09:30+09:00",
  "content": "请核对最近两轮运行的日志和快照，并比较等待与重试。"
}
```

- `POST /v1/reminders` 新建时返回 202 和 `{existing:false, reminder}`。编号沿用小写字母、数字、下划线和短横线，最多 80 位。标题不能为空且最多 300 字符，正文可省略，保留换行，JSON 请求体上限为 8192 字节。使用 `YYYY-MM-DDTHH:mm+09:00` 指定东京时分。新提醒日期不得早于东京今天。登记按次创建，等级沿用现有默认值「中」。
- 同编号、同内容重交返回 200 及该次登记回执。JSON 键顺序、标题首尾空白不影响匹配。同编号内容不同返回 409。队列满时新编号返回 429，稍后按原编号重交。
- `GET /v1/reminders/:id` 取回 `queued`、`running`、`blocked` 或 `done` 状态、东京截止时间及进度。`done` 附既有提醒表的 `recordId`，表明取得实际登记回执。查询及重复提交均只回显标题和时间等状态。任务完成后清理本机队列中的正文副本。
- 请求超时或应用重启后先查原编号。查询返回 404 时，按原编号和原内容重交。暂停时 `POST /v1/reminders/:id/retry` 恢复原提交，无需再次提供正文。登记已经成功时，恢复调用返回原回执。无法从云端确认时保留待核对状态。

本机 SQLite 在首次启动时建立独立的提醒请求表。花园表、原路由和旧批次回执沿用原有格式。两类任务共享 20 个名额及执行顺序。既有云端提醒模板、业务表、主站代码和提醒检查频率保持。正式工作队列及提醒业务的设计依据见 [正式工作队列](FORMAL_WORK_QUEUE.md) 和 [登记链路](RECORDING_CHAIN_RELEASE_DESIGN.md)。

## 正式安装验收后的全局说明条款

待更新位置为 `C:/Users/asura/.codex/AGENTS.md` 和 `C:/Users/asura/.claude/CLAUDE.md`。本次开发阶段自动审批因正式安装、受控重启和验收尚未完成而拒绝写入。实际切换时在两份文件追加以下条款，并在本次发布纪要记录执行情况。

> 所有项目的花园登记统一提交给绯月 Windows 正式安装版的本机 REST 入口 `http://127.0.0.1:8765`。调用方先读取 `GET /infoguide`，核对进程、启动时间及资料目录属于实际安装版，按返回说明调用。每次 REST 更新同步维护 infoguide。
>
> 沿用现有的登记意愿、实际结构和线上数据核对、发布结果、SQL 留痕和数据库约束。提交前必须给用户看完整的具体清单，列明归属、前后值、版本、真实发布结果与无需更新项，取得明确确认。按确认内容先提交精确 SQL 和清单，再向重启后的绯月提交一个批次。结果不明先查原编号，具体内容变化重新确认。发布纪要保留批次号和整批回读回执。
>
> 本机桌宠功能更新先准备实际安装版候选和发布审核，获准后安装、受控重启并验收。收尾时将已确认的本次更新交给新实例，归属「网页角色组件 → 绯月（桌面精灵）」。调用说明见 `G:/selftool/WebCharacter/personal-digital-companion/docs/LOCAL_GARDEN_API.md`。
