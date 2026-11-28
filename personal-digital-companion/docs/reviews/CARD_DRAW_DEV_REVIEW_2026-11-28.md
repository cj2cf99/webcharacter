# 抽卡开发复核（2026-11-28 JST）

状态：**待用户确认**。结论：**开发区通过**（复核 3 轮，第 3 轮无新问题）。正式版未安装，真实密钥出图未验证。

## 1. 范围、依据与基线

- 对象：抽卡功能开发区实现及接线。
- 对照：[需求](../CARD_DRAW_REQUIREMENTS.md) R1–R21、[设计](../CARD_DRAW_DESIGN.md)、定稿原型。
- 基线：仓库 HEAD `cf198e5`（分支 `codex/workspace-checkpoint-20261120`），改动未提交。
- 新增：`desktop/card-draw{.mjs,-host.mjs,-preload.cjs,.html,.css,-ui.mjs,-words.json}`、`agent/tests/card-draw.test.mjs`、`tools/test-card-draw-electron.mjs`。
- 修改：`desktop/{shell.mjs,menu-layout.json,source-updates.mjs,README.md}`、`docs/DESKTOP_UI_GUIDE.md`、`tools/{test-desktop-shell.mjs,test-menu-first-show-electron.mjs}`。
- SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| desktop/card-draw.mjs | `6a59477e288b3eefae063feffc5dd9bd32035cb12e1edf794959cc58c3b665bf` |
| desktop/card-draw-host.mjs | `0fb896d8997245ea795a151aa6b6403cae58258ec49c1067e3baca2d73125c2f` |
| desktop/card-draw-preload.cjs | `4f874561da12e2f1a2e876ad6115f1e80c9f3f4e0db2ac6cd9170c6cfd77dc7d` |
| desktop/card-draw.html | `1245cc2c707cd709a7f656c4ffcc0a08eafc52cd179c2a7cac6b0012b5893619` |
| desktop/card-draw.css | `982bd5f3e49c21a33ff3e436c1b1c9a1aa82b7d9894d579a40057076ff5270b4` |
| desktop/card-draw-ui.mjs | `49429be6041e945cdfc3e63b542eb59f267e77872969ab7b3e3e59d487458f2e` |
| desktop/card-draw-words.json | `9bbcde4c7e21ba6d33045e591d830eeb5aeebf37a46a9c3782b67b38e8994dad` |
| desktop/shell.mjs | `9caf731cab17d4b179255d3ccbf8cca3053ccbc8cbce2f1bfa88a723b281f643` |
| desktop/menu-layout.json | `fa24af2c63877b9a159c89fdc875a6e61c2dbd2b550336de6ce7666adb676124` |
| desktop/source-updates.mjs | `7b877dc7c16003d61bc3b7e5a71957038ffda076078f96f79083a06b884bc28e` |
| agent/tests/card-draw.test.mjs | `e4d67982ad00f12224c4e3abc679c7837e9f75cef492561943f1b2e3a45fffe6` |
| tools/test-card-draw-electron.mjs | `09db748d6e301bac26e8756d718377454562df7c0f2e4dbd87b6d6509bde8567` |

## 2. 命令与结果（子项目目录）

| 命令 | 结果 |
| --- | --- |
| `node tools/build-desktop.mjs` | 通过，构建产物含抽卡页面 |
| `node --test agent/tests/card-draw.test.mjs` | 12/12。首次运行 1 项失败，原因是用例少等了启动后的首轮，改用例后通过 |
| `node --test --test-force-exit --test-timeout=45000` 抽卡、动画生成器、问答宿主三个文件 | 29/29 |
| `node tools/test-desktop-shell.mjs` | 通过 |
| Electron：`test-card-draw-electron.mjs` | 通过 |
| Electron：`test-panel-titlebar-electron.mjs` | 通过（日志有三条既有的“标题栏高度或颜色无效”提示，来自该用例的异常配置场景） |
| Electron：`test-menu-popup-electron.mjs`、`test-menu-shell-electron.mjs` | 通过 |
| Electron：`test-menu-first-show-electron.mjs card`，角色 / 托盘 × 自然 / 首次显示被吞 | 4/4，同一次点击可见、只建窗一次 |
| 全量 `node --test --test-force-exit --test-timeout=45000 "agent/tests/*.test.mjs"` | 637 项：603 通过、27 失败、4 取消、3 跳过 |
| 同参数跑 `git archive HEAD` 导出的改动前代码 | 625 项：590 通过、30 失败、2 取消、3 跳过 |
| 两次失败清单对比 | **仅当前代码失败：0 项**；当前 31 项失败在改动前同样失败（`ai-workflow` 17、`registration-flow` 4、`local-first-interaction` 3、`server-image-task` 3、其余 4 个文件各 1）；仅改动前失败 1 项，因导出目录缺素材 |
| 不带 `--test-force-exit`、超时的全量运行 | 多个文件不结束，超过 10 分钟后手动停止；加参数后可完成。改动前代码未按无超时方式对照 |
| 不带密钥的 `GET https://api.openai.com/v1/models`（Node `fetch`） | 返回 401，本机可直连 |
| 静态检索 `sk-` 实值、`prefers-reduced-motion`、`localStorage`、`innerHTML` | 抽卡文件无命中 |
| `git diff --check` | 通过（仅换行格式提示） |

抽卡 Electron 检查覆盖：真实文件选择与缩放到 1024、坏图保留原图、拖放与粘贴（脚本构造事件）、移除、提示词记忆与立即关窗保存、真实回车提交密钥、首次成功才落盘且为密文、页面不留密钥、关窗后继续出图、重开恢复、分页与新卡提示、撤回、高清、大图勾选、额度暂停与继续、360 宽深色三个页签无横向滚动、清理只留勾选、重启后开关与密钥保持、真实定时器到点出图、无页面错误与 CSP 拦截。接口为假实现，图片与资料只在临时目录。

## 3. 复核发现

| 轮 | 编号（级别） | 发现与依据 | 处理与验证 |
| --- | --- | --- | --- |
| 开发中 | P-1（中） | OpenAI 认证报错可能回带部分密钥，会进任务日志和暂停原因 | 打码；单测断言 |
| 开发中 | P-2（中） | 无卡片标记时启动仍读取系统图片目录，假 Electron 与隔离实例会触及 | 仅在有标记时读取；隔离资料目录实例改用其下的图片目录 |
| 1 | F1（低） | 清理后列表读两次，骨架闪烁 | 去掉重复读取；Electron 复跑 |
| 1 | F2（待证） | 输入后 0.7 秒内关窗可能丢提示词 | 补实测，未丢失，无需改 |
| 1 | F3（验证缺口） | 真实定时器路径未在 Electron 跑过 | 补实测通过 |
| 1 | F4（低） | “模型发挥”“可空”徽标用分隔线色，看不清（原型同样存在） | 改次要文字色 |
| 2 | F5（低） | 设计未列 `unchecked` 动作；原定改公共截图工具，实际由专项检查截图 | 更新设计 |
| 3 | — | 复跑构建、相关测试、改动范围核对 | 无新问题 |

需求对照：R1–R21 均有实现；未增加需求外功能。用户中途问“怎么停止”，现有方式为关开关停抽卡、取消勾选停排队高清，未加“全部停止”。最简：无新依赖、无数据库、无缩略图缓存与重试队列。

## 4. 未验证与风险

- 真实密钥出图、实际花费、2048 输出是否被 `gpt-image-2.6-sunburst` 接受、组织验证、三张参考图能否各按用途参考。
- 真实回收站（检查中以删除临时文件替代 `shell.trashItem`）。
- 气泡提示：接线经代码核对，沿用现有 `{title,stage}` 结构，未做实机观察。
- 真实鼠标拖放、系统剪贴板、动画观感；浅色 360 宽未单独截图。
- `safeStorage` 同步接口在当前 Electron 有弃用提示（现有学习模块同样使用），升级 Electron 时需一并迁移。
- 正式安装、重启、花园登记未进行。

## 5. 改动与清理

开发区改动见第 1 节，未提交、未安装。检查截图在 `output/card-draw-qa/`（不入库）。Electron 仍占用的临时资料目录留在系统临时目录（`feiyue-card-*`，仅含假图片与测试密钥密文）。全量测试的残留进程已停止并核对；改动前代码导出在会话临时目录。
