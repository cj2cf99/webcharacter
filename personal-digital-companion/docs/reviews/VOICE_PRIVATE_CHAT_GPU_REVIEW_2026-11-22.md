# 绯月专聊资源、预览和 GPU 并驻复核

2026-11-22 JST。用户确认[详细设计](../DESIGN.md#2026-11-22-jst--绯月主动专聊)，指定用 B 作为入口头像、保留 A，并授权双 GPU 无法同时常驻时试用一套 CPU。普通 GPU 优先及临时追加的 14 张表情保留在[需求原文](../../REQUIREMENTS.md#2026-11-22-jst--绯月主动专聊)。

## 资源和验证范围

- `assets/voice/private-chat/` 新增两条固定台词。复用正式 GPT-SoVITS V5 Turbo 及现用参考音色，保留 48 kHz、16 位单声道 PCM。邀请 `invite.wav` 3.30 秒，承接 `accepted.wav` 2.74 秒。文件长度、有效采样和 SHA-256 已核验。固定音频未来从原桌宠资源构建路径分发。
- `assets/desktop-media/feiyue-faces/` 保存两套各七张表情及原 A、B。均为单张方形 RGBA PNG，16 张 SHA-256 互异。七宗罪按情绪主题表达。表情以 B 的脸型、红瞳、发髻、两朵花、红缎带和额纹为共同基准。内置 imagegen 提示词与文件映射在该目录的 [`README.md`](../../assets/desktop-media/feiyue-faces/README.md)。
- [专聊交互预览](../../prototype/private-chat/index.html)展示两个待聊入口、邀请、准备语音、正文气泡和主动结束。两条固定语音实际播放，开聊、GPU 条件和队列为演示。在隔离 Electron 上验证 850 px 深色、360 px 浅色和主动结束后无迟到气泡。[表情预览](../../prototype/private-chat/expressions.html)的 16 张原图均成功解码。

## 8 GiB 试验结果

使用本机 RTX 4060 Laptop GPU，驱动报告 8188 MiB。保持当前其它程序，未停止正式绯月及其它用户进程。GPU 试验等利用率低于 40% 再开工，直接验证后端。GGUF 元数据估算完整 GPU 权重约 5356 MiB，该数不含实际运行上下文和共享缓存峰值。

| 组合 | 结果 |
| --- | --- |
| 完整 Aggressive 9B GPU ＋ GPT-SoVITS GPU | 判定当时的实际资源不够。可用显存 4309 MiB 时启动隔离 CUDA 语音，真实出声后全卡只余 132 MiB，远低于 9B 权重，未再强行分配。语音的 PyTorch 预留峰值为 2318 MiB，不含 ONNX 多音字前处理和其他进程。该组不是清空其它程序后的容量极限实测。 |
| 完整 Aggressive 9B CPU ＋ GPT-SoVITS GPU | CPU 9B 载入 3.9 秒，生成 176 个汉字耗时 18.1 秒。并驻启动前的系统可用内存压到约 0.3～1.9 GiB，未开始第二个模型的加载。反向顺序的第一次尝试在语音出声后因系统 RAM 余量不足暂停。 |
| Qwen3.5 2B CPU ＋ GPT-SoVITS GPU | 成功。两模型保持同一会话重复完成两轮，各合成开头两段。正文两次为 153、203 个汉字，分别生成 4.3、5.6 秒。语音冷启动试音 36.9 秒，热态每段 5.2～6.1 秒，得到 7.74～10.82 秒音频。采样最低独显余量 340 MiB。生成、合成和实际 WAV 已验证，未在正式气泡执行整场 10 轮。 |

用户随后确认「那就固定文字走cpu，语音走gpu」。专聊采用固定 CPU 文字、GPU 语音的配置，本机首版文字使用已跑通的 2B。通用模式的 GPU 默认设置随后单独覆盖受影响的入口，普通模式阈值为超过 50%，专聊沿用低于 40% 的入场条件。复核已将该决定同步到需求、S3、设计和交互预览。真实调度及正式接入仍待开发。

## 逐轮复核和未完成项

1. 首次离线 CPU 合成时发现 GPT-SoVITS 多音字模块仍尝试使用 CUDA。改在隔离进程显式选 CPU 前处理。该修改只用于合成和试验。第一次双 GPU 试验取得真实语音和显存余量。
2. 两句成功合成后发现验证脚本误判配置的 Windows 换行，随后改为检查进程回报的后端，保存并核对真实 WAV。CPU 9B 先加载可推理，但在当前 RAM 负载下未同时加载 CUDA 语音。
3. CPU 2B 加 GPU GPT-SoVITS 复测两轮通过。核对两条 WAV、16 张透明 PNG、B 入口及 A 原图。原始试验命令和记录在 `work/feiyue-private-chat/`，分别使用 `node render-fixed-lines.mjs`、`node resident.mjs`、`node resident-cpu-first.mjs`、设置 `FEIYUE_BENCH_TEXT_MODEL=Qwen3.5-2B-Q4_K_M.gguf` 后 `node resident-small-cpu.mjs`。所有试验和预览使用隔离资料。正式桌宠业务接线、生产任务状态回归、正式安装与台词听感验收待后续阶段。
