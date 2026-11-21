# 绯月语音对比实验台复核

日期为 2026-11-21 JST。用户验收待确认。

## 范围和基线

对照[三条用户需求](../../voice-chat-lab/README.md#需求)、现有桌宠直连的 Aggressive 9B 和妻子身份要求。Git 基线为 `2e215d2`，实施差异为 `voice-chat-lab/` 下的新增文件和开发指南入口。桌宠工作区的并行改动不计入本实验差异。GPT-SoVITS 以现有本机 V5 Turbo 为基线，新增权重与下载依赖保存在已忽略的 `work/sensevoice-small/`。本次是本机独立试用，正式桌宠、主站、数据库和发布流程无变更。

## 第一轮

- 中等问题：GPT-SoVITS 组的 Paraformer 和 FSMN-VAD 权重加载成功，但 CT-Transformer 注册失败。便携 Python 会跳过 setuptools 的 `.pth`，日志明确显示缺少 `distutils`。在 FunASR 导入前启用安装包现有兼容模块，不替换标点模型或工程依赖。
- 低风险问题：旧回复的语音按钮可以在下一轮回复等待时抢占页面状态，两个声音共用的时长标签也可能显示上一次播放值。按钮仅在可播放状态受理，缓存各自的合成耗时。
- 最简复核：已有本机模型和推理入口足够，不引入云端、任务执行、数据库或构建链。两组只切换语音组件，对话直连路径相同。

## 第二轮

- 运行 `node --check voice-chat-lab/server.mjs`、`node --check voice-chat-lab/page.mjs`、`python -m py_compile voice-chat-lab/audio_worker.py` 和 `git diff --check`，均通过。
- 使用 `curl.exe` 检查本机页面返回 200，外站 Origin 返回 403，无效方案返回 400，工作脚本不在网页资源白名单中并返回 404。
- 用 `work/sensevoice-small/browser-check.mjs` 在同一台测试机的 Chromium 运行实际流程，检查 1280 和 390 CSS 像素宽度、同一公开样音切方案重转写、模拟麦克风、可编辑输入、Aggressive 9B 实际回复、同一句回复两种 WAV 均可播放。无新增待处理缺陷。物理麦克风、音箱和用户对准确率及音色的判断未执行。
- 5.62 秒公开中文样音的浏览器复核中，SenseVoiceSmall 推理 0.36 秒、首次加载 13.96 秒，Paraformer 推理 0.41 秒、首次加载 3.21 秒。SenseVoiceSmall 识别为「开饭时间早上9点至下午5点。」，Paraformer 为「开放时间，早上九点至下午五点。」。模拟麦克风重录的 SenseVoiceSmall 热机转写为 0.40 秒。最终进程的第一条冒烟断言误要求两套都包含「开饭时间」，调整为检查两者共有的时段，保留识别差异作为对比结果。
- 同一条短合成句的独立 API 样例都返回非静音 PCM WAV。MeloTTS 为 44.1 kHz、3.50 秒，热机合成 0.91 秒。GPT-SoVITS 为 48 kHz、4.38 秒，热机合成 1.74 秒。同一次 API 试验里 GPT-SoVITS 首轮加载约 19 秒，合成含首轮设备初始化约 41 秒。另一轮浏览器播放的是不同长度的真实回复，不能混作同样本计时。
- 最终以关闭调试日志的模式启动 8792，页面返回 200。两套听写和 WAV 冒烟复测通过，绯月能根据上一轮文字回答「青绿色」。服务保持运行供用户试用。

结论为通过本机受控测试。硬件麦克风和音色偏好留待用户试用。截图、转写样音和生成 WAV 存在 Git 忽略的实验目录。只用合成文字及发布方样音做 QA，独立配置保存在实验目录。
