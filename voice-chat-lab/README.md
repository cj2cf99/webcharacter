# 绯月语音对比实验台

## 需求

> 我想试试语音转文字，提高录入速度，SenseVoiceSmall 试试这个，然后搭建一个简单的测试页面

> MeloTTS 顺便把这个也加上，然后做成个简单的对话模式，输入只有我，我的文字会转给绯月的直连模型，对方仍旧扮演绯月，身份是妻子，然后根据我的输入文字进行反馈，反馈后用melotts发音给我

> 那做一个页面2套方案，一套是用GPT-SoVITS这一组实现，一套用SenseVoiceSmall 和MeloTTS 实现，我对比下效果。

验收以同一个页面为准。录音停止后填入可编辑的转写文字，也可以直接打字。只有用户发起对话，绯月用妻子的身份回应，并朗读答复。两套方案能复用同一录音和同一句答复，以便比较听写和发音。

> 你做成一个页面，我贴一段字，你按照一次加载60-100字的自然分段进行边读边加载试试效果

> 换成拆30-50字一段试试看。

分段朗读试用入口为 <http://127.0.0.1:8792/read/>。粘贴文字，选择 MeloTTS 或 GPT-SoVITS，点击「开始朗读」。页面按 30～50 字找句末或停顿，末段和较短的原文可以少于 30 字。发送首段并播出后，当前段播放期间生成下一段。进度区显示每段字数、实际音频时长和下一段的生成状态。

> 录音能做到流输入吗，似乎录音时间过长会被打断

对话页现在连续采集麦克风，在停顿处优先转写，连续说话时每约 8 秒提交一段。识别结果按顺序回填在输入框。按「停止录音」后收齐尾段，再把草稿发送给绯月。输入框可保留超过 500 字的听写草稿，对话单次发送上限仍为 500 字。

## 运行

在 `G:/selftool/WebCharacter` 启动，打开 <http://127.0.0.1:8792/>。

```powershell
& './personal-digital-companion/desktop/node_modules/electron/dist/electron.exe' (Join-Path (Get-Location) 'voice-chat-lab/server.mjs')
```

| 方案 | 听写 | 朗读 |
| --- | --- | --- |
| GPT-SoVITS | 本机安装包中的 Paraformer、FSMN-VAD、CT-Transformer 标点模型 | GPT-SoVITS V5 Turbo，复用本机中日朗读页的中文参考，4 步推理 |
| SenseVoiceSmall + MeloTTS | FunAudioLLM 官方 SenseVoiceSmall，自动识别语言 | MeloTTS 中文音色，使用 sherpa-onnx 的中英 ONNX 转换版 |

- 「试用样音」使用发布方的中文例音。「重转写」在切换方案后重新处理同一份录音的各个短段。已手改的输入会保留。
- 「发给绯月」或 `Ctrl+Enter` 发送当前文字。回复先显示，合成完成后自动尝试播放。每条回复底下可分别试听两种声音，浏览器拦截自动播放时点对应按钮。
- 页面显示实际推理用时，首轮还会有模型加载和设备初始化开销。交谈内容和录音在页面及本机工作进程内保留到关闭，仅上一轮随下一条文字提供给模型。刷新会清空页面记录。

## 设计与准备

单页使用原生 HTML、CSS 和 JS，后端通过已有 Electron 使用绯月的 `balanced-local-model` 及 `hint: 'direct'`。两组语音共用本机 Aggressive 9B，不运行桌宠主程序、业务动作或档案流程。麦克风由 AudioWorklet 持续采集并输出短段，浏览器转换为 16 kHz 单声道 WAV 后按顺序复用 `/api/transcribe`。服务只接受同源的本机请求，供本地 Chrome 或 Edge 试用。首屏无需下载模型，听写和朗读组件首次调用时加载。听写与 MeloTTS 使用 CPU，GPT-SoVITS 有足够显存时使用 CUDA。

本机安装基线是 `G:/selftool/voice/GPT-SoVITS-v5-20261006` 和上述 Electron、桌宠 GGUF 权重及 `G:/voicesample/新建文件夹/` 中的 `elysia_01.wav`、`prompt.txt`。可用 `VOICE_LAB_SOVITS`、`VOICE_LAB_REFERENCE` 指定等价本机路径。独立运行资料位于 Git 忽略的 `work/sensevoice-small/`。

- 从 [SenseVoiceSmall 固定版本](https://huggingface.co/FunAudioLLM/SenseVoiceSmall/tree/3847d57b6bdf2dd8875cb1508d2af43d80a16bf7) 把 `model.pt`、`config.yaml`、`configuration.json`、`am.mvn` 和 `chn_jpn_yue_eng_ko_spectok.bpe.model` 放到 `work/sensevoice-small/model/`。将仓库中的 `example/zh.mp3` 放到 `work/sensevoice-small/zh.mp3`。
- 将 [sherpa-onnx 的 MeloTTS 中国语转换包](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html#vits-melo-tts-zh-en-chinese-english-1-speaker) 解压到 `work/sensevoice-small/vits-melo-tts-zh_en/`，使用 GPT-SoVITS 配套的 Python 3.12 运行以下命令。

```powershell
& 'G:/selftool/voice/GPT-SoVITS-v5-20261006/runtime/python.exe' -m pip install --only-binary=:all: --no-deps --target work/sensevoice-small/python sherpa-onnx==1.12.34 sherpa-onnx-core==1.12.34
```

设计前查阅根 `CLAUDE.md`、`docs/DEVELOPMENT.md`、`docs/DESIGN.md`、桌宠 `REQUIREMENTS.md`、`docs/DESIGN.md`、`docs/DEVELOPMENT.md` 和 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`。按最简单页、低首屏负担、短状态反馈和本机直连的约定实现。相关文档索引未找到另列的全局或项目开发设计备忘录。界面和中文参考音色目前是本轮试用的实现选择，听感由用户自己比较。

[实测及复核记录](../docs/reviews/VOICE_CHAT_LAB_REVIEW_2026-11-21.md)

分段朗读沿用同一个本机 `/api/speak`。首段按需生成，此后播放时只预取下一段。GPT-SoVITS 在单个请求内保留短句的换行，避免长单行试验中出现的漏读。按「停止」立即停止出声，当前已发出的合成完成后即可重新开始。设计依据为本页原始需求、根开发指南、已有设计备忘查找记录和全局框架偏好，以自然语句、短状态反馈和按需生成落实。

[30～50 字复核记录](../docs/reviews/VOICE_READ_30_50_REVIEW_2026-11-21.md) · [60～100 字试验记录](../docs/reviews/VOICE_READ_REVIEW_2026-11-21.md)

[连续录音与听写复核](../docs/reviews/VOICE_STREAMING_MIC_REVIEW_2026-11-21.md)
