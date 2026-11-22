# 绯月 Skill 更新和新增

绯月用默认总纲 `feiyue-interaction` 查找已登记功能。总纲下有说明、能力目录和当前版本表。运行时按现有入口选功能，再从总纲读它当前使用的子 Skill。发布后下次加载即生效。对话转录从开工到交回结果使用同一份快照，暂停、让出调度时隙或应用重启后沿用原版。

## 找到本机目录

在要操作的桌宠项目根目录运行以下命令。默认资料目录是该安装的 `output/desktop-profile`。正式版使用独立安装目录，先用本机 `GET /infoguide` 核对实例的 `instance.profile`。开发时建议给命令明确传入隔离目录，以下用 `output/skill-lab` 演示。

```powershell
python -B skills/catalog.py external --profile output/skill-lab status
```

```text
<资料目录>/skills/
  feiyue-interaction/
    active.json                         总纲发布记录，发布工具维护
    feiyue-interaction/
      source/SKILL.md                   总纲正文草稿
      source/capabilities.json          每个功能的用途、调用方式和示例
      versions/1.0.json                 总纲已发布快照
  conversation-transcription/
    careful-transcription/
      source/SKILL.md                   功能说明
      source/local-ai.json              可调整的分阶段提示
      source/workflow.json              对话转录命令链
      versions/1.0.json
```

没有外置发布记录时自动使用随附版本。桌宠本身无需加载草稿、监听编辑器或扫描整个目录。此机制需要支持它的桌宠安装版。

## 更新总纲

```powershell
python -B skills/catalog.py external --profile output/skill-lab export feiyue-interaction
python -B skills/catalog.py external --profile output/skill-lab check feiyue-interaction
python -B skills/catalog.py external --profile output/skill-lab publish feiyue-interaction
```

先执行 `export`，打开返回的 `draft` 路径，编辑 `SKILL.md` 或 `capabilities.json`，再执行 `check` 与 `publish`。总纲能力条目使用已登记功能的稳定 ID。每项含 `name`、`does`、`call` 和 `examples`，示例可写一至三条。Markdown 保留开头由两行 `---` 包围的头部和正文。以后更新同一份草稿时，从编辑开始即可。

## 新增子 Skill 或更新已有 Skill

以下为「对话转录」新增名为 `careful-transcription` 的子 Skill。已有功能也可省略新名字，使用与功能相同的名称。

```powershell
python -B skills/catalog.py external --profile output/skill-lab export conversation-transcription careful-transcription
```

编辑返回目录里的 `SKILL.md` 和需要改动的 `local-ai.json`。使用已有阶段名，值为模型用的短指令。删除某条阶段提示的改动可恢复该阶段的随附提示。要调整实际命令链，可将 `workflow.json` 改成下面的形式。

```json
{
  "steps": [
    {"run": "organize", "instruction": "按发言原话区分事实、请求和设想。"},
    {"run": "classify", "instruction": "同一件事的重复描述合并到一条草稿。"},
    {"run": "review", "when": "has-candidates", "instruction": "核对日期、主体和是否已发生。"}
  ]
}
```

- 进入。现行普通对话线交给本机转录时，绯月按总纲找到当前子 Skill。
- 执行。`organize` 整理事实和意向，`classify` 按现有登记模板拟稿。排在末尾的 `review` 可选。默认有候选时执行，也可设为 `has-missing-fields`，只复核有缺项的批次。每步可追加最多 1000 字的短指令。
- 离开。绯月保存并交回整理结果。模型发现的疑点会显示在待确认清单的复核备注中，必填字段仍由程序校验。草稿由用户选择和确认，之后才通过原登记入口提交。

```powershell
python -B skills/catalog.py external --profile output/skill-lab check conversation-transcription careful-transcription
python -B skills/catalog.py external --profile output/skill-lab publish conversation-transcription careful-transcription
python -B skills/catalog.py conversationTranscription --profile output/skill-lab
```

`publish` 校验草稿、保留快照，并将总纲对应功能切到这个版本。改动有效内容后，从 `1.0` 依次递增 `0.1`。同内容重复发布沿用该快照。可为同一功能保留多个不同名字，按需要切换。当前可配置命令链用于现行普通对话线的转录。旧式会话作业恢复时沿用原整理流程，可使用外置阶段提示。其他已注册 Skill 支持更新正文及已有的阶段提示。要接入新的实际动作，先在宿主注册相应命令及参数规则，再由功能模板引用。

## 切换和恢复

```powershell
python -B skills/catalog.py external --profile output/skill-lab use conversation-transcription careful-transcription 1.0
python -B skills/catalog.py external --profile output/skill-lab reset conversation-transcription
```

`use` 切回已发布版本，`reset` 切回随附版本；草稿和历史仍可用于下一次发布。草稿校验失败时当前版本继续运行。已发布资料损坏或与新版程序不兼容时，绯月使用随附版本并给出技能告警。若整个 `active.json` 损坏，备份并移走它，再按需要激活原有快照。运行身份、确认规则、输出结构、任务接口和 ComfyUI 节点由宿主版本管理。请只发布自己核对过的本机模板。

## 查询当前能做什么

在「问绯月」输入「查看技能目录」。程序调用方先读 [本机 REST 调用说明](LOCAL_GARDEN_API.md)，再用同一个本机令牌请求 `GET /v1/skills`。返回每个技能的 ID、名称、用途、调用方式、示例、来源和当前版本。对话转录条目附进入、执行和交回阶段。接口查目录，执行仍按每项 `call` 指向的现有入口。
