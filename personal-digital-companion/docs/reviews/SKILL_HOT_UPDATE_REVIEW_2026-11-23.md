# 外置总纲和功能 Skill 复核

2026-11-23 JST。依据[用户原话与验收](../../REQUIREMENTS.md#2026-11-23-jst--外置总纲及功能-skill)、[设计](../DESIGN.md#2026-11-23-jst--外置总纲和功能模板)及先前的固定入口、独立 Skill 版本和登记确认约定。比较 Git `6dc09a3` 及本轮开始时已有的开发区改动。此条记录为子项目开发验证。

## 第一轮

- 核对总纲目录、子 Skill 的查找、命名新增、独立版本、隔离资料目录和回退。可变部分使用已发布快照，阶段提示合并到固定的提示键。实际工具、JSON 输出结构、业务字段、授权、确认和回执继续由程序管理。发布工具校验后切换版本表。目录请求只读取描述及版本，复用原本机鉴权。
- 发现复核建议若写入必填缺项，会阻止后续选择，且原草稿编辑入口没有清除该类建议的途径。改用已有复核备注区域呈现疑点，真正缺项继续由字段校验。Windows 临时数据库的测试清理改为先关库、再删除临时目录。
- 全量 Node 测试有一项失败，共用模型时隙用例给新闻节点的夹具缺少 `reports`，并行开发中的 `desktop/news-editor.mjs` 读取其长度时中断。该文件的改动不属于本次。旧 Python 套件两项失败，`privateChat` 缺少路由和手记质问仍断言已停用的 `write` 提示。以原 Git 加载器复现同样两项，19 项中其余 17 项通过。

## 第二轮

- `node --test --test-reporter=spec agent/tests/skill-hot-update.test.mjs agent/tests/local-rest-garden.test.mjs agent/tests/local-rest-reminders.test.mjs agent/tests/screen-question-host.test.mjs agent/tests/server-image-task.test.mjs tools/test-conversation-transcription.mjs` 共 47 项通过。用真实随机端口验证 401、403、目录发现和鉴权读取，服务运行中发布总纲后立即读到新范例。隔离转录使用模拟模型和实际作业持久化，复核前发布下一版并重新打开作业库，原作业完成原步骤，下项使用新版本。两者均只交回待确认。疑点进入备注，候选原有缺项不受影响。
- `node tools/build-desktop.mjs`、`node tools/test-desktop-shell.mjs`、隔离 Electron 的 `tools/test-panel-titlebar-electron.mjs` 和浅色 `tools/test-conversation-threads-electron.mjs` 通过。另在独立资料目录实际运行图像工具 `describe --profile`，核对发布后采用新的编排提示，传给执行端的原队列版本及 ComfyUI 工作流版本保持一致。
- 对照原始需求，目录、每项用途和示例、更新与新增方法、下一作业热加载、首个带条件的命令链及进入与交回均有对应实现。实现只引入现有 Python/Node、单份总纲版本表和每个模板的版本快照。首个可配置链为对话转录，其他已登记 Skill 可配置内容。新增宿主命令及实际执行入口仍需单独开发。未发现本次范围内的其他问题，停止复核。

真实模型下的新增复核没有实测，Windows 正式安装、运行中正式目录和用户验收均待后续。无数据库结构迁移、线上部署或正式资料写入。
