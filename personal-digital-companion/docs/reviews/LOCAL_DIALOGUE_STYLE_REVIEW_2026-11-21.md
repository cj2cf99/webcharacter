# 绯月气泡时限与分场景回复复核

2026-11-21 JST。状态为开发验证通过，待用户确认。范围是绯月开发项目中的桌面问答、提示词和本地 skill，另含该子项目的文字与视觉应答源模块。用户原话及最新补充见 ../REQUIREMENT_CHANGES.md。

## 依据与实现

查阅 G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md、项目 AGENTS.md、docs/DEVELOPMENT.md、docs/DESKTOP_UI_GUIDE.md、docs/TASK_TEMPLATE_PREVIEW.md 的备忘录索引和 docs/REQUIREMENT_CHANGES.md 已确认的直连行为。现有索引未列独立设计备忘录。本次沿用现有气泡、模型子进程和版本化 skill，不增加切换界面、依赖和数据结构。

- 气泡最后一次有效操作起算 90 秒。查询期间保持，空闲隐藏保存原草稿。
- 本地文字对话共享 60 秒，模型准备、意图识别、生成、复核和重写使用同一截止时间。保留原有复核轮数和取消。云端回退沿用请求层超时。
- 交谈使用 personal-conversation 1.5。直连保留原身份提示，补充妻子第一视角当面口语、场景转述和适情境的亲密表达。
- 日记与评论使用 diary-writing 1.2，第一人称作者按文种采用口语或书面语。既有真实写入仍遵循原路径。
- 情境及逻辑判断使用 emotion-appraisal 1.5，带入身份、立场和情绪，结论依据事实和推理。
- 指导、汇总、分析等工具答复使用 tool-response 1.0。网页摘要显式选择工具语体。图片解释保留视觉接口和事实优先，子项目的云端视觉源提示采用工具语体。

## 三轮复核

1. 对照 90 秒和统一 60 秒，检查对话、写作和工具的提示入口。同步直连会加载 skill、视觉按工具语体的回归断言。
2. 核对按文稿和任务选择提示，补上“用列表汇总”“根据附件回答”等表达。隔离 Electron 验证时，更新旧菜单断言及旧的云端摘要替身，使其断言实际本机工具 skill。正式登记确认、重试和任务回执相关回归通过。
3. 真实 9B CPU 抽查时，判断样例首次达到 60 秒上限。将判断提示收束为先给结论和必要依据，并采用简短判断的输出额度。相同判断样例复测 34.05 秒给出正确结论；直连口语样例复测通过。到此停止复核。

## 执行结果

- 隔离执行 node tools/build-desktop.mjs，构建通过。
- node --test 运行 response-style、balanced-local-model、screen-question-host、desktop-screen-question、chat-registration-boundary、personality-memory、screen-question、assistant 八个测试文件，74/74 通过。
- 隔离 Electron 执行 tools/test-panel-titlebar-electron.mjs 和 tools/test-screen-question-electron.mjs 的默认回归，均通过。90 秒专项使用独立测试入口，实际验证空闲隐藏、输入续时、鼠标移动和滚轮不续时及草稿原样恢复。旧全套空闲脚本中的滚轮样式断言与现有渲染有差异，本轮仅验证计时行为。
- 隔离 Electron 通过现有共享 Aggressive 9B 权重以 CPU 推理检验合成样例。最终口语 12.76 秒、写作 11.53 秒、判断 34.05 秒、工具摘要 3.31 秒。样例能验证对应语体，未用样例推断亲密表达长期频率。

本次无数据库迁移和新增运行配置。正式安装版、真实云端接入与部署验证尚未执行。
