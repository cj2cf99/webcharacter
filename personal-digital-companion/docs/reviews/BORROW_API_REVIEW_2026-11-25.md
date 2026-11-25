# 本机借用接口与动画生成器菜单 · 开发审核报告 · 2026-11-25

- **对象**：`desktop/borrow.mjs`（新）、`desktop/local-rest.mjs`（v8 路由）、`desktop/image-tasks.mjs`（`localUpscale`）、`desktop/ai-gateway.mjs`（Gemini `aspectRatio`）、`desktop/shell.mjs`（接线）、`desktop/animation-maker.mjs` 与菜单；测试与文档相应更新
- **需求来源**：动画生成器项目 `G:/selftool/webmcreator/REQUIREMENTS.md` 第 3.1 节第 3 条、`docs/DESIGN.md` 第 6 节；用户原话“开发，同时带上绯月的菜单”“开发借用接口”
- **基线**：HEAD `e4b5dff`，改动未提交。SHA-256：borrow.mjs 3a153f8e…0277；local-rest.mjs a6e8580d…6b45；image-tasks.mjs 4a1d20d7…b7b8；ai-gateway.mjs c5647c29…0f864；shell.mjs e7f64799…9e；borrow.test.mjs e2d84456…6fb9
- **方式**：单测、契约测试、隔离 Electron、真实联调（隔离资料目录 + 端口 8795）

## 实际执行

| 命令 / 操作 | 结果 |
|---|---|
| `node --test agent/tests/borrow.test.mjs agent/tests/local-rest-garden.test.mjs agent/tests/skill-hot-update.test.mjs agent/tests/garden-first-use.test.mjs agent/tests/image-gemini.test.mjs` | 32/32 通过（说明版本 8、路由 16 条已同步） |
| `node --test agent/tests/animation-maker.test.mjs` | 3/3 通过 |
| `node tools/build-desktop.mjs` + `node tools/test-desktop-shell.mjs` | 通过 |
| 隔离 Electron `tools/test-menu-popup-electron.mjs` | 通过 |
| 真实联调：隔离 REST（真实 `requestGeminiImage` + `localUpscale`）+ webmcreator | Gemini：页面生成 10.1 秒返回 848×1264，按提示词加了油纸伞、人物与绿底保留，2:3 参数生效；送去切图成功。ComfyUI：原本未运行，由 `comfy_job.py` 自动拉起，25 秒完成 4× 放大 848×1264 → 3392×5056，结果作为新原图进入切图页、框按倍率换算。CLI：`python-version` 返回 `Python 3.15.2`；未登记命令 400 |
| `agent/tests/screen-question-host.test.mjs` | 未完成（上一轮运行超过 5 分钟无输出被中止），与本次改动无直接关系，待单独复跑 |

未执行：正式安装版更新与重启（未获部署指示）；`奥星` 账户下不做 agy 相关测试，CLI 白名单未纳入 agy。

## 三轮复核

### 第 1 轮
| 编号 | 级别 | 发现 | 处理 |
|---|---|---|---|
| B-1 | 中 | 绯月错误体为 `{error: 文本}`，webmcreator 原按 `{error:{code,message}}` 解析，且把任务 404 误判为“缺借用接口” | webmcreator 改为区分“接口不存在”与“任务不存在（BORROW_LOST）”，失败原因按文本显示；单测与联调通过 |
| B-2 | 低 | 任务视图曾带多余字段 | 视图只去掉内部 `task`，排队时附 `queue.position` |

### 第 2 轮
| 编号 | 级别 | 发现 | 处理 |
|---|---|---|---|
| B-3 | — | 安全：仍需本机令牌、拒绝 Origin；CLI 白名单；只有借用路由放宽到 30MB，其余仍 8KB；结果不回显提示词与输入图 | 单测覆盖 401、400、大请求体 |
| B-4 | 低 | 借用任务逐个执行：ComfyUI 冷启动约 25 秒期间，后到的 Gemini / CLI 需排队 | 符合“借用任务之间逐个执行”的设计，记录为已知行为，未改 |
| B-5 | — | 最简检查：结果只留内存（最近 30 个），不建库表；不进正式工作队列 | 符合设计“与生图同属并行工作” |

### 第 3 轮
复查 B-1、B-2 已生效；未发现新问题，停止。

## 结论

**通过（开发版）**。正式安装版未更新，部署需按发布流程另行确认。

## 改动与清理

联调用的隔离资料目录在系统临时目录，联调进程已结束；ComfyUI 已随任务结束停止（8188 无监听）。未写入正式资料目录，未提交 Git。

## 状态

待用户确认。
