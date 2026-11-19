# 每日日志 API

Cloudflare Worker 为已授权客户端提供日志生成和日期读取。客户端提交最近 48 小时整理后的内容，生成结果可作为后续分析的参考。原始需求及后续修订见[需求变更记录](REQUIREMENT_CHANGES.md)。

## 调用地址与认证

- 独立 Worker 使用 `/api/daily-logs`，并在 Worker Secret 中配置 `DAILY_LOG_API_TOKEN`。令牌由 32 个随机字节编码成 64 位小写十六进制，调用时放入 `Authorization: Bearer <令牌>`。该令牌的权限限于独立 Worker 的日志读写路由。
- 主站挂载候选使用 `/api/companion/daily-logs`，沿用主站 Access 身份及同源写入保护。迁移 `008-daily-logs.sql` 应用于 `COMPANION_DB`。独立服务使用 `DB`；两个模式分别使用各自的身份域和存储配置。
- 客户端直接使用 `https://`，正常验证服务端证书。正文放在 JSON 请求体，接口响应使用 `Cache-Control: no-store`。应用错误回执使用固定文字。原始输入用于本次 Workers AI 生成，数据库保存生成后的日志。

生成使用 `clouflareai` Workers AI 绑定，沿用项目的固定文字模型。读取只访问 D1。ChatGPT 定时任务如何送达接口是客户端接入工作，当前可用具备上述认证能力的程序调用。见 [Workers AI 绑定](https://developers.cloudflare.com/workers-ai/configuration/bindings/)和 [D1 数据库接口](https://developers.cloudflare.com/d1/worker-api/d1-database/)。

## POST `/api/daily-logs`

请求使用 `Content-Type: application/json`。唯一字段为 `content`，值为非空字符串。需要保留的日期、来源和条目上下文可直接写在正文里，Worker 会从材料中保留已明确的信息。单次正文最多 12,000 个 Unicode 字符，请求体最多 64 KiB。窗口选取、与昨日日志对照及重叠条目的取舍由客户端处理。

```json
{
  "content": "来源：示例聊天。11 月 19 日完成了一次学习练习，约定次日整理错题。"
}
```

Worker 根据收到请求时的东京日期归档。每个身份每天保留首份成功生成的日志。首次成功返回 `201`。同日再次提交返回 `200` 和已有日志，并发请求也只保存一份。正文按材料多少决定篇幅，信息较多时可以写到 3,000 字或略多，正文上限 4,000 个 Unicode 字符，标题上限 120 字符。生成最多等待模型 90 秒。

```json
{
  "item": {
    "date": "2026-11-19",
    "title": "学习小结",
    "content": "完成了一次学习练习，次日整理错题。来源为示例聊天。",
    "generated_at": "2026-11-19T11:00:00.000Z"
  }
}
```

`date` 为东京业务日期，`generated_at` 为 UTC 生成时间。生成失败时返回错误，客户端可重试。

## GET `/api/daily-logs`

仅传 `from` 和 `to`，格式为 `YYYY-MM-DD`，均按东京日期，两端包含。最长 366 天，指定同一个日期即可取一天。结果按日期从早到晚排序，空范围返回 `{"items":[]}`。每个 `item` 与 POST 返回的形状相同。

```text
GET /api/daily-logs?from=2026-11-18&to=2026-11-19
```

**关键词查询预留** `GET /api/daily-logs/search`（主站候选前缀为 `/api/companion`）。查询参数、匹配方式和回执以后确定。此路径目前仅作接口登记。

## PowerShell 调用示例

`DAILY_LOG_API_TOKEN` 由调用方的受控环境提供。将示例域名换成实际服务地址。

```powershell
$api = 'https://worker.example.com/api/daily-logs'
$headers = @{ Authorization = "Bearer $env:DAILY_LOG_API_TOKEN" }
$json = @{ content = '来源：示例聊天。完成学习练习，明天整理错题。' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri $api -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
Invoke-RestMethod -Uri "${api}?from=2026-11-18&to=2026-11-19" -Headers $headers
```

错误返回 `{"error":{"code":"…","message":"…"}}`。常见状态为 `400` 字段或日期无效、`401` 凭据无效、`403` HTTPS 或身份限制、`413` 超长、`415` 需要 JSON、`429` 模型限流、`502` 生成失败、`503` 缺少配置、`504` 模型超时。

## 本地准备与验证

从 `G:/selftool/WebCharacter/personal-digital-companion/agent` 操作。在被 Git 忽略的 `.dev.vars` 中配置测试令牌，首次对独立测试数据目录应用迁移。准备本机信任的 HTTPS 开发证书后，启动时可用 `--https-cert-path` 和 `--https-key-path` 指定证书与私钥。

```powershell
wrangler d1 execute DB --local --file migrations/008-daily-logs.sql --persist-to .local/daily-logs
wrangler dev --local --ip 127.0.0.1 --local-protocol https --port 8795 --compatibility-date 2026-10-30 --persist-to .local/daily-logs
```

本机 workerd 支持的兼容日期截至 `2026-10-30`，上面按该日期启动。独立本地配置的 GET 可读取测试库，POST 实际生成需配置 Workers AI 绑定。隔离验证使用合成输入与替身模型。现有生产配置、真实模型出站和机器客户端接入留待发布阶段验证。

已验证 `node --test tests/*.test.mjs` 共 146 项。专项覆盖 HTTPS 与权限隔离、输入和日期边界、东京午夜、并发和失败回执，以及 4,000 字符正文完整保存、回读和超限拒绝。另经本机 workerd 与临时 D1 验证 HTTPS URL 门槛、认证、替身模型成功与失败、同日重试及 4,000 字符正文完整回读，测试结束后关闭运行时。

复核对照 48 小时由客户端处理、仅载荷正文写入、仅日期范围读取、关键词预留和传输加密。采用一张新表及既有 Cloudflare 模型适配器。参考全局规则、`G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`、本项目开发指南及[已有日记接口复核](reviews/WEATHER_DIARY_REVIEW_2026-11-19.md)，并按 `G:/cloudflare/myapp/docs/design/development.md` 中的运行时验证要求执行隔离 workerd 测试。项目索引未发现独立的全局或桌宠开发设计备忘录，主站备忘录已查阅。
