# 绯月 · 点击开心挥手小样

用户原始需求：“图像设定参考 G:\picsample里的图像内容，做一个点击反应：开心挥手的gif”。

2026-11-18（JST）：采用 `G:/picsample/feiyue_4head_front_400x600.png` 为正面基准，`q版4头身等待人设基准.png` 为人设参考；副本保留在 `reference/`，不改源文件。没有采用旧真人比例角色。

本次实现解释：固定机位、站姿、角色左手（画面右侧）抬起挥动两次并微笑，收手回待机。手的选择、次数和时长是本次小样的实现选择，不冒充用户已逐项确认的动作规格。

内置 image_gen 编辑工具生成 4×4 连续关键帧图 `wave-sheet-green.png`；实际生成图为 1024×1536。FFmpeg 拆成 16 个 400×600 透明关键帧，按时间表合成 46 帧、20fps、2.3 秒 GIF。含重复帧保持，46 帧不代表 46 个独立姿态；没有使用光流或视频生成模型。

- `frames/`：逐张透明 PNG，保留母版 Alpha。
- `PROMPT.txt`：实际生成提示词，输入图为上述两个参考副本。
- `../../output/feiyue-click-wave-v1/feiyue-happy-wave.gif`：透明背景正式小样文件。
- 同目录 `feiyue-happy-wave-preview.gif`：浅米色背景预览，背景仅供观察。
- 同目录 `contact-sheet.png` 和 `checks.json`：关键帧及检查结果。

重新生成须指定一个尚无 GIF 的输出目录，避免覆盖先前版本。例如在项目根目录执行：

```powershell
node tools/build-wave.mjs output/feiyue-click-wave-v1-rebuild
```

限制：生成式逐帧图对人物细节有改动，不能保证与源图逐像素一致；手势与表情的逐帧感、发饰与服饰细节、是否符合期望观感待用户确认。GIF 二值透明与有限调色板也不等于 PNG 母版质量。本次只交付素材，没有实现真实点击入口或桌面宿主，不宣称 M0 已验收。

复核见 `../../docs/reviews/FEIYUE_WAVE_REVIEW_2026-11-18.md`。
