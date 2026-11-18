# 行走资源 2026-11-18

源文件 source.mp4 来自用户行走完整.mp4；SHA256、零起始帧区间和语音配对见 manifest.json。24fps，进入[7,27)、单个完整步态循环[27,55)、退出[83,99)。去头尾停留，原速，不做变速补帧。透明 VP9 WebM 提供464×688和372×552两档，移除原视频音轨。

中文参考 elysia_01.wav / prompt.txt，经本地 VoiceTTS 生成“我要出发咯～！”、“到啦！”，循环无语音。轻快感通过文本语气表达，最终听感待用户确认。音频不自行循环，沿用节点规则。

构建：node tools/build-desktop.mjs。重做资源：使用已有含 numpy/soundfile 的 Python 运行 tools/prepare-walk.py；需本机 FFmpeg 和9880 VoiceTTS，脚本列明路径。不要为普通构建重新采样TTS。
