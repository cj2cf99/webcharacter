# 绯月手记开发与验收记录

2026-11-20 JST。鱼骨图的 A10「陪伴记忆」和「07 记忆增强」覆盖本功能。当前进度为桌宠子项目已开发、通过隔离验证，待用户本地验收和主站接入。生产数据库迁移、云端发布、用户线上截图确认均待进行。

## 实现与需求对照

依据为 [2026-11-20 确认需求](../FEIYUE_PERSONALITY_MEMORY.md)、[HTML 原型](../../prototype/memory/index.html)及用户开发指令。采用已确认的日记每天两次、近七个东京自然日回补、Paylog 今天和昨天、两小时一次念叨。桌面网页日期选择可翻月，手机使用日期控件。

| 位置 | 实际行为 |
| --- | --- |
| `desktop/personality-diary.mjs` | 按行动读对话、任务、天气和念叨。本地 SQLite 保存来源、发生时间、当时评价、清洗结果、覆盖状态、待提交批次与云端备份。按昨日、今日、其余缺口扫描，断线保留草稿，收到确认才登记已覆盖。 |
| `desktop/balanced-local-model.mjs`、`local-model-process.mjs`、`local-model.mjs` | 记忆使用本机 Qwen3.5 4B。显存不足时可选 CPU。前台对话可中断该后台推理。 |
| `agent/assistant/personality-memory.mjs`、`agent/migrations/016-personality-memory.sql` | 新增日记和念叨两张表。按归属隔离，单篇 5000 个 Unicode 字符，追加时更新篇首，按批次去重。网页列表只取索引字段。悬念“已问”和“已解”互相独立。 |
| `desktop/personality-nags.mjs`、`shell.mjs`、`screen-question-host.mjs` | 筛选消费和悬念。只在气泡实际显示后登记开口。超时沿用原事项，意外中断进入待续，点结束才记录指定的结束语。托盘有“接着解释上次的事”。 |
| `agent/host/memory-expenses.mjs` | 使用主站消费列表相同的读取函数、账户范围和快照分页。数据不足时标明缺口。私有 RPC 需要能确定唯一的消费账户。 |
| `agent/host/memory-route.mjs`、`memory-page.mjs`、`memory-reader.mjs` | 主站外壳内的只读页面，每页 20 条，详情按需加载。从念叨打开 Paylog 编号，账目改期后可继续在活动快照内按编号查找。悬念按篇目及序号定位，关闭原记录回到刚才的念叨。 |

旧篇中的悬念只单独更新标记。事件下文和私语追加到新事实所属日，即使该次补写先处理今天、后发现旧篇悬念也会跟进。资料读失败与查阅成功后确实无事分别处理。

## 实际验证

以下命令均以 `G:/selftool/WebCharacter/personal-digital-companion` 为工作目录。使用临时账户、归档、数据库及合成素材。运行 GUI 和 Worker 回归后，测试进程退出。

| 执行项 | 结果 |
| --- | --- |
| `node --test agent/tests/*.test.mjs` | 246 项中通过 243 项，失败 0 项，跳过 3 项。跳过项是项目已有的可选胡适业务、拒绝回执和供应商契约测试。人格记忆专项 12 项全部通过。 |
| `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs` | 构建和桌面壳回归通过。 |
| Electron 运行 `tools/test-panel-titlebar-electron.mjs` | 原生标题栏、浅深色与轮询设定回归通过。 |
| Electron 运行 `tools/test-personality-model-electron.mjs` | 实际加载本机 Qwen3.5-4B，后端 Vulkan。使用虚构书店对话，生成评价、篇首、正文和私语，读回隔离 SQLite 中的结果。CPU 选择和前台抢占另有模型替身测试。 |
| `node tools/personality-memory-preview.mjs --visual` | 实际 workerd、隔离 D1、主站外壳及主站消费列表函数通过。1280 和 390 像素窗口验证日记懒读、两类原记录、账目改期、悬念定位及返回；切换两套主题。 |
| 两份补丁的 `git apply --check` | 对本机当前主站及 API Worker 工作区的只读检查通过。未修改两个目标仓库。 |

复核修正了补写先后次序导致的悬念遗漏、轮询重启后的时间偏差、改期账目的回链及中断后已留下解释的处理。主站已有更新版任务管理页，手记使用独立路由，以便保留现有功能。

## 本地 Worker 验收

工作目录为 `G:/selftool/WebCharacter/personal-digital-companion`。依赖沿用 `G:/cloudflare/myapp` 已安装的 esbuild、Miniflare 及该项目的外壳和消费模块。若主站检出位于其他目录，可设置 `FEIYUE_MAIN_DIR`。

```powershell
node tools/personality-memory-preview.mjs --serve
```

收到用户启动指令后运行。仅绑定回环地址，默认端口 8796，页面路径为 `/companion/memory/`。启动时自动初始化临时 D1，写入虚构书店消费、日记及两条念叨。查看记录、返回、切换主题和搜索均操作这份隔离资料。退出进程后结束本次验收。

## 主站接入范围

主站目录按相对路径复制 `agent/host/memory-{route,page,reader,expenses}.mjs` 到 `src/features/companion/vendor/`；在主站根使用 [主站接线补丁](../../agent/integration/personality-main.patch)。接线涉及私有消费 RPC、现有消费 GET 的导出、独立页面、导航和总览入口。源代码中现有主站任务管理与子项目旧版不同，整目录同步会覆盖该差异。

API Worker 将 `agent/assistant/personality-memory.mjs` 和 `agent/migrations/016-personality-memory.sql` 分别复制到 `src/companion/agent/` 下对应目录；在 API Worker 根使用 [API 接线补丁](../../agent/integration/personality-api.patch)。合并后还需目标仓库回归。用户已同意准备[花园登记清单](FEIYUE_MEMORY_GARDEN_PLAN.md)，已用独立基线核实线上归属与版本，具体清单已获确认，原开发库已完成迁移、标准结构同步及独立读回验证。实际清单、生产备份、发布审核、部署许可及发布后验证按项目发布规则办理。
