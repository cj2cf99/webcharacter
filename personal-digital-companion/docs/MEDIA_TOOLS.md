# 图片、GIF 与 WebM 工具准备

日期：2026-11-18（Asia/Tokyo）。

## 用户原始需求及边界

本次用户原话：

> 你先准备从图片生成gif，然后再从gif到webm的技术工具，我的原始设定图很快就完成

此前明确要求：新内容与旧试验基本隔离；先理解 V1.5 需求；允许 GIF 作为输入素材。最终角色形象、动作及状态转移仍须依据用户新提供的标准图、人设与确认。前文建议的尺寸、三个动作主题不是本次已确定的素材规格。

本次实现解释：准备本地处理工具并用人工构造测试素材验证；不把整图位移说成眨眼或呼吸，不把格式转换说成动作生成。角色动作效果不在本次已通过验证范围。

## 参考约定与最简设计

已阅读 `G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md`（1.2 最简组件、1.8 不委派、2 复核与停止、3 验证留痕）、`C:/Users/asura/.claude/CLAUDE.md`、本仓库 `CLAUDE.md`、`docs/DEVELOPMENT.md`、`docs/README.md` 和 `docs/catalog.md`，以及本目录 `reference/` 中 V1.5 第 9.4、10.1 节。

在全局约定、项目索引及 `G:/selftool` 中按 `*MEMO*.md` / `*备忘*.md` 检索，未找到独立的全局或本项目开发设计备忘录；不得视为已阅读不存在的文件。当前以这些实际存在的规则和原始需求为准。

落实：一个 Node.js CLI 调用已有 FFmpeg，不建素材流水线服务、不引入框架和新依赖、不接旧渲染器。主站外壳、云端偏好存储等约定不适用于本次离线素材工具。

## 已具备的操作

以下命令在 `G:/selftool/WebCharacter/personal-digital-companion` 执行。示例输入路径须替换成实际文件；示例命令不是已经执行的角色制作记录。

### 1. 单张图片 → 简单位移动画 GIF

```powershell
node tools/media.mjs still-gif --input input/标准图.png --output output/轻摆.gif --motion bob --seconds 3 --fps 20 --key green
```

- `bob`：整图上下移动最多 2px，只是简单运动，不是人体呼吸、眨眼或局部骨骼动作。
- `hold`：静态保持，适合确认基准位置，默认使用它。
- 图片透明时使用 `--key none`，绿底时才选择 `--key green`。
- 保持原比例和分辨率，不强行缩放；四周增加 4px 余量，输出宽高分别比源图大 8px，防止轻摆裁切。
- 静态图输入有明确时长上限，调色板可在有限输入后完成计算。

### 2. 连续动作图片 → GIF

```powershell
node tools/media.mjs frames-gif --input "input/idle/frame-%04d.png" --output output/待机.gif --fps 20
```

图片从 `frame-0000.png` 开始连续编号、采用相同画布。此步骤按给定帧率合成，不自动生成缺失动作、对齐锚点或修复人物变形。局部动作须先取得合适分层或连续帧，再进行人工检查；目前没有接通图生视频模型。

GIF 以 10ms 为延时单位，工具接受可精确表示的帧率（如 10/20/25/50），不支持的值明确报错。GIF 只有 256 色及二值透明；保留原始 PNG 主素材，避免将 GIF 当作无损母版。

### 3. 绿幕 GIF → 透明 WebM

```powershell
node tools/media.mjs gif-webm --input input/互动.gif --output output/互动.webm --key green
```

若 GIF 本身透明：

```powershell
node tools/media.mjs gif-webm --input input/透明互动.gif --output output/透明互动.webm --key none
```

- RGB 色键参数：`--key 0x00FF00 --similarity 0.18 --blend 0.06`，实际阈值需看新角色素材调整。
- 编码：VP9 / Alpha，保留单次播放的帧时序，不受源 GIF 无限循环标记影响。WebM 是否循环由播放器决定。
- 不固定输出为某个帧率，保留 GIF 不等间隔帧及最后一帧时长。
- `-lossless 1` 是编码器设置，不代表 GIF 颜色损失或此前缺失的半透明细节可恢复，也不等于整条链 RGB 逐像素无损。
- 现有输出拒绝覆盖，原始素材不改动。输出目录自动创建。

### 4. 检查实际帧时序

```powershell
node tools/media.mjs inspect --input output/互动.webm
```

WebM 通过 libvpx-vp9 解码，避免仅凭 Alpha 元数据认定存在透明通道。自检进一步提取真实 Alpha 平面核对透明背景与不透明主体。

## 验收范围

已用 64×64 和 96×48 合成素材验证上述链路，且测试了 50/150/250/350ms 的不等间隔帧。未验证真人或新角色动作自然度、薄纱半透明恢复、复杂发丝去绿、桌面壳、真实浏览器播放或目标设备性能。后续收到素材后再进行相应验证。

官方技术依据：[FFmpeg 滤镜（colorkey、palettegen、paletteuse）](https://ffmpeg.org/ffmpeg-filters.html)、[FFmpeg libvpx 编码器](https://ffmpeg.org/ffmpeg-codecs.html#libvpx)。工具支持情况以本机 `doctor` 与实际解码测试为准。
