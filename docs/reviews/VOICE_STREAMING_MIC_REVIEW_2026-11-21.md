# 连续录音与分段听写复核

2026-11-21 JST。用户验收待试用。

对照[本次用户需求原文](../../voice-chat-lab/README.md#需求)和两套语音对比约定，修复浏览器的 25 秒自动停止。Git 基线为 `067bfd5`，实际差异以本机语音测试页原有 MediaRecorder 和单段转写流程为准。保持两套识别、手动发送及本机运行。分段朗读、模型和接口契约沿用既有配置。读过根开发指南、设计备忘录查找记录和全局框架偏好，采用浏览器采集、原接口顺序处理与短状态提示。

`mic-processor.mjs` 持续收音，累计至少约 2.5 秒后优先在停顿处分段，连续说话时每 8 秒分段。`mic-capture.mjs` 用 Web Audio 输出 16 kHz 单声道 WAV，并在停止时收齐音频。`page.mjs` 依次提交并把成功结果回填至草稿，保留手工文字。原有重转写现在复用同一录音的各段。草稿可以保留超过 500 字，原有对话单次发送上限继续适用。两个模块由 `server.mjs` 的原静态路由白名单提供。

第一轮检查通过。

- `node --check` 检查 `page.mjs`、`mic-capture.mjs`、`mic-processor.mjs` 与 `server.mjs`，`git diff --check` 通过。本机对话页、新模块和朗读入口均返回 HTTP 200。
- Node 内联执行 35 秒连续样本，检查 8 秒切分、尾段回传、停顿触发以及 PCM 样本总数。
- 仓库 Electron 运行 `work/sensevoice-small/streaming-mic-browser-check.mjs`。SenseVoiceSmall 在冷机录音期间回填文字，实际采集 34.20 秒，收到五段 16 kHz WAV，手动停止后提交最后 2.20 秒并释放麦克风。切至 Paraformer 重转写同一组短段，也单独验证了录音中出字、模拟单段失败后重试和保留编辑过的文本。550 字草稿保留，未触发发送。
- `work/sensevoice-small/streaming-mic-sample-check.mjs` 通过原有 MP3 样音及切换识别后的同段复测，确认重转写仍能替换上次未修改的结果。

使用合成样音模拟麦克风。实体设备、环境噪声和日常用语的识别质量待试用。语音测试服务保持在本机 8792。
