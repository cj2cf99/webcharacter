# 绯月本地技能目录

总体入口是 `feiyue-interaction`，图像编排入口是 `image-task-chain`。代码和父 skill 使用稳定标识查找子 skill。例如，问答选择登记后加载 `record-submission`，图像任务再按操作使用 `comfy-image-workflows` 的图。桌面规则决定可执行的动作，模型只在该动作范围内理解输入。

新增登记参照绯月已经使用的[图像编排指令](image-task-chain/source/SKILL.md)和[工作流执行指令](comfy-image-workflows/source/SKILL.md)。正文写给本地 AI，说明它收到什么、应提取什么、输出给谁、何时需要追问，以及以哪种回执报告完成。父技能的 `children.json` 以用途对应稳定标识，例如附件识读的 registration 指向 record-submission。编辑 source 后由解析器生成带版本的快照。

| 场景 | 稳定标识 | 实际动作 |
| --- | --- | --- |
| 交互分流、按需查找子技能 | feiyue-interaction | 根据宿主判断的用途或菜单动作选子技能 |
| 对话 | personal-conversation | 原有本地思索、回复及已有回退 |
| 图片、文件或所选屏幕 | evidence-reading | 问答或提取待核对的登记字段 |
| 鱼与熊掌资源登记 | resource-registration | 标题概括资源，正文保留原文，默认其他，单独提取网址后确认 |
| 吃喝、运动、一键事件、随手记、日记、新提醒 | record-submission | 使用现有六类模板，逐条回执 |
| 今日任务、已有提醒的查询和修改 | reminder-review | 使用现有列表和整组修改审批 |
| 联网搜索、三地天气 | public-lookup、weather-lookup | 各自调用已有查询接口 |
| 云端任务、服务器任务 | server-pc-task | 在「问绯月」输入「服务器任务：具体事项」。本机按已有 PC 模板提案，确认后在服务器创建；“派给 all”由任意一台支持模板的空闲电脑领取，默认由当前 PC 领取；单发关键词查看可用模板。 |
| 接取、执行、补传、中断恢复 | task-lifecycle | 现有任务链、设备归属和确认流程 |
| 动作、依附、设置、显示、连接、重启、退出 | desktop-controls | 对话或菜单中已存在的入口 |
| 对话与任务复盘、日志、归档 | activity-review | 已有日期复盘和日志视图 |
| 绯月手记和行动评价 | [diary-writing](diary-writing/source/SKILL.md) | 手动与定时共用一个版本，按东京日期取材，先定情绪，再写叙述与私语 |
| 本机生图、重绘、局部指令编辑、高清放大 | image-task-chain、comfy-image-workflows | 按步骤保存中间图并返回最终 PNG |

## 更新和查找

更新绯月手记范本时，同时核对 diary-writing/source/SKILL.md 的成篇范例和同目录 local-ai.json 的六个阶段。每轮手记或补评通过 diaryWriting 读取一次技能快照，Aggressive 9B 按阶段接收短指令，推理日志记录技能名和版本。手动「看绯月写日记」与定时手记沿用同一入口。

手记质问走 `diaryAudit`，使用 `diary-audit` 的摘录、比对、本机关键词联想、回答完整度判定和收笔指令。引文可以跨篇，线上唯一主篇排在引文首位。

编辑对应稳定目录内的 `source/`。下次解析此 skill 时比较全部源文件的内容；内容有变化就生成新的快照并原子更新 `latest.json`。版本按 1.0、1.1、…、1.9、2.0 递增。重复读取相同内容保持同一版本。历史快照位于 `versions/<稳定标识>-v<主版>-<小版>/`，每份 SKILL.md 的名称和标题都带版本号。已发布快照作为历史保留。

在绯月项目目录执行 `python -B skills/catalog.py list` 可立即同步并列出所有版本。`python -B skills/catalog.py registration` 返回当次登记规则，`python -B skills/catalog.py today menu` 返回今日任务对应的技能。图像任务在提交时固定编排和模型工作流两个版本，并记录到该作业的 request.json。

## 登记与回执

「问绯月」中的文字提醒先按 record-submission 准备草案，支持无日期提醒和引用上一轮用户原文。用户点击「确认登记」或回复「确认登记」后才写入。已有提醒查询和修改沿用 reminder-review。

纯文字登记沿用现有触发规则。用户明确要求把附件登记时，先提取资料，再调用现有只读计划接口。桌面展示提取结果以及实际要提交的节点和字段。点击「确认登记」后，宿主按主进程缓存的同一份计划取提交号，只允许确认一次。放弃、关闭、计划过期或换题后都需要重新提取。识图和制作登记计划继续使用已配置的本地及云端服务；业务登记以服务器回执为准。

图像操作的模型、节点、GPU 队列、输出路径和超时由宿主固定。简单指令可直接编译，多义指令由小模型按 skill 提取后校验。取不到底图、发现未支持操作或不能核对时向用户说明。成功时在问答气泡返缩略图，可点击打开 PNG。失败时显示原因，已有中间图可打开。图像任务存档与步骤输出见对应的本机作业目录。
