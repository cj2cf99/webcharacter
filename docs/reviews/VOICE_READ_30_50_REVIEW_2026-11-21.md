# 30～50 字分段朗读复核

2026-11-21 JST。用户验收待试用。

对照[用户原话](../../voice-chat-lab/README.md#需求)。Git 基线为 `067bfd5`，实际比较以[上一轮本机朗读实现](VOICE_READ_REVIEW_2026-11-21.md)的 60～100 字为准。范围为 `read-segments.mjs` 的页面分段默认值、`read.html` 的页面标签和说明。继续按自然停顿找切点，较短原文和末段允许少于 30 字。引擎参数、播放队列和实验服务配置沿用上一轮。

第一轮复核通过。执行 `node --check voice-chat-lab/read-segments.mjs`、`node --check voice-chat-lab/read.mjs` 和 `git diff --check`。Node 内联断言检查了 1 到 1200 字的输入、50 和 51 字边界、标点数字和末段，文字顺序无丢失。

复用 `work/sensevoice-small/read-browser-check.mjs`，用现有 Electron 和两个真实本地引擎，分别在 390 和 1280 CSS 像素下播放同一段 205 字样文。两套都发出 31、45、41、44、44 字五次请求。MeloTTS 首段等待 1.18 秒，单段 6.13～8.72 秒，最短接续余量 4.54 秒。GPT-SoVITS 首段等待 1.57 秒，单段 7.46～10.46 秒，最短接续余量 4.99 秒。接续均未停等合成，停止和模拟生成失败后可重试通过。浏览器静音测时，人耳试听待用户确认。静态页面和模块从现有本机服务加载，打开新页面或刷新即可试用。
