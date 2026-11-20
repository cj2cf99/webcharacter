# 七天手记质问 · 四轮自测与合规检查

2026-11-21 JST。范围为开发版桌宠、绯月技能、记忆 API 和本地网页阅读入口。验收依据为 [七天手记质问的原始需求及追加确认](../FEIYUE_PERSONALITY_MEMORY.md#七天手记质问2026-11-21-jst)。测试使用虚构手记、临时资料目录和隔离数据库。

## 四轮结果

| 轮次 | 方法 | 实际结果 |
| --- | --- | --- |
| 1 · 来源与去重 | 用东京日期边界内外的手记测试引用。两个不同主篇同时争用同一附引篇，再重复提交胜出的记录 | 一个成功，另一个返回冲突，重试后仍只有一条。修正了篇号前导零的识别，新增质问要求规范篇号，旧悬念记录按实际篇号参与双向去重。手记修订后仍视为同一篇。 |
| 2 · 问答与恢复 | 用可控时钟测试一小时前后；在回答已落盘时插入任务；断网后稍后、重启、手动续答、再次重启再补传 | 自动提醒遵守一小时间隔，手动可以提前继续。已提交的答案保留，最多两轮追问，拒答终止。发现模型判定解释不完整却重复原问时会被记成“已解释”，已改为“回合结束”，同一用例复测通过。 |
| 3 · 真实本地模型 | Qwen3.5-4B、Vulkan。两篇写同一版本在周四与周五正式发布，用户解释周四为测试。再提供一篇普通读书记录 | 模型只问正式发布时间，得到解释后直接收笔，普通手记保持静默。初测出现情绪偏离，修订后又发现一次对用户感受的推测。最终技能 diary-audit 1.4 的收笔为“老公已说明周五下午三点才是花园部署回执的正式发布。我此刻对这件事感到牵挂。” 本地记录与按 ID 回读的整条记录一致。 |
| 4 · 桌面与网页 | 离屏 Electron 中点击稍后、从待确认继续、提交文字、接收追问、拒绝。隔离 Worker/D1 阅读页测试桌面和窄屏、两个主题 | 实际按钮、预加载脚本和 IPC 全链路通过，拒绝后待确认项消失。多篇引文可读，只有一个主篇入口。七个面板的标题栏和轮询设置回归通过。离屏气泡测试模拟可见回执，问答使用固定回执，真实 4B 单独在第三轮验证。 |

## 合规对照与适用边界

- 核查对象是绯月最近七个东京日期的手记。用户日记、花园部署和消费通过手记中的引文参与。无实质疑点和已有解释均有静默用例。
- 关键词检索读取本机归档。测试检查发送到记忆服务的请求及保存内容，命中的原始本地材料没有随念叨上传。线上记录保留主篇 ID、引文快照、问答和收笔。
- 正文回答先存入本机；重启后的提醒间隔、部分回答、繁忙暂停、无当日情绪时的抽取、拒绝和结束后的去重均有状态或回读断言。首次生成需要联系服务端登记。
- 并发去重使用同一隔离数据库。每小时提醒的实测范围是同一桌宠资料目录及其重启；多台真实桌宠同时在线时的弹窗时序未测。真实模型的正、反例覆盖本报告中的样例，无法据此推算它对所有日记的识别率。
- 本次仅更新工作区及 API 集成副本，未修改生产资料、安装目录或运行中的桌宠。正式环境仍待发布验收。无新增依赖、数据库迁移或回填。

## 复测入口

在绯月子项目根目录执行：

```powershell
node --test agent/tests/diary-audit.test.mjs agent/tests/personality-memory.test.mjs agent/tests/pending-poller.test.mjs agent/tests/screen-question-host.test.mjs tools/test-reminder-checks.mjs
python -B tools/test-skills.py
node tools/build-desktop.mjs
node tools/test-desktop-shell.mjs
desktop/node_modules/electron/dist/electron.exe tools/test-personality-model-electron.mjs --audit
desktop/node_modules/electron/dist/electron.exe tools/test-screen-question-electron.mjs --diary-audit
desktop/node_modules/electron/dist/electron.exe tools/test-panel-titlebar-electron.mjs
node tools/personality-memory-preview.mjs --visual
```

相关 Node 回归 53/53，技能测试 6/6，构建和桌面壳通过。API 集成工作树的 `node --test` 为 34/34。API 集成副本与子项目记忆模块的 SHA-256 相同。
