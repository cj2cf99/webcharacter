# 绯月本地 ComfyUI 换衣与换动作工作流调用说明

本文档说明如何在本机（RTX 4060 Laptop 8GB 显存）调用存放于 F 盘的绯月专属 ComfyUI 图像工作流，完成**只换衣服**与**迁移参考动作**两类任务，并强制输出**标准纯绿幕背景（`#00FF00`）**。

---

## 1. 环境与文件位置

- **运行环境**：复用 F 盘 ComfyUI Desktop 本地离线环境（无需预先打开 ComfyUI 窗口，仅使用原生内置节点，无额外自定义节点依赖）。
- **使用模型**：
  - Diffusion：`fibo2_edit_turbo_int8_convrot.safetensors`
  - Text Encoder：`qwen3vl_4b_int8_convrot.safetensors`（`type: fibo2`）
  - VAE：`flux2-vae.safetensors`
- **F 盘工作流根目录**：`F:\feiyue-comfy-workflows\`
  - 运行脚本：[feiyue_comfy.py](file:///F:/feiyue-comfy-workflows/feiyue_comfy.py)
  - Q 版基准图备份：`F:\feiyue-comfy-workflows\feiyue_chibi_base.jpg`（同步于 `F:\Comfy-Desktop\ComfyUI-Shared\input\feiyue_chibi_base.jpg`）
  - 图形化工作流目录：`F:\feiyue-comfy-workflows\workflows\`（已同步一份到 `F:\Comfy-Desktop\ComfyUI-Installs\local\ComfyUI\user\default\workflows\`）

---

## 2. 支持的模式与风格

| 维度 | 可选值 | 说明 |
| --- | --- | --- |
| **工作模式** (`mode`) | `outfit` | **换衣工作流**：以 `--person` 为人设基准，将 `--ref` 的服装穿到人设身上，保持脸、发型、姿势与绿幕背景。 |
| | `pose` | **换动作工作流**：以 `--person` 为人设与服装基准，按 `--ref`（照片或素体线稿均可）迁移肢体动作，输出标准绿幕背景。 |
| **画风选项** (`--style`) | `anime`（默认） | 强保 **2D 二次元卡通插画画风**，干净线条与平涂光影，抑制参考图带来的摄影写实感。 |
| | `chibi` | **标准 Q 版（2 头身）**，大头小身短萌比例，自动清除素体关节线并严格继承人设原有服装配色与饰品。 |
| | `impasto` | 保留**半厚涂古风质感**。 |

---

## 3. 命令行调用方法（供终端 / 代理 / 脚本调用）

### 3.1 参数说明

```text
python F:\feiyue-comfy-workflows\feiyue_comfy.py <mode> [参数]
```

| 参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `mode` | 是 | - | `outfit`（换衣）或 `pose`（换动作） |
| `--person` | 是 | - | 人设图路径（基准图或已换过衣服的图） |
| `--ref` | 是 | - | 参考图路径（换衣时传衣服图；换动作时传动作参考图/素体图） |
| `--output` | 是 | - | 输出 PNG 文件完整路径（自动创建父目录） |
| `--prompt` | 否 | `""` | 简短补充提示词（仅写要微调的地方，未提及的要素默认从人设图继承） |
| `--style` | 否 | `anime` | `anime` / `chibi` / `impasto` |
| `--megapixels` | 否 | `0.65` | 8GB 显存推荐 `0.65`（约 `672×1008`，耗时约 38–45 秒） |
| `--steps` | 否 | `4` | FIBO Turbo 采样步数，默认 4 步 |
| `--size-from` | 否 | `person` | 输出宽高比来源：`person`（跟随人设图）或 `ref`（跟随参考图） |
| `--seed` | 否 | 随机 | 固定随机种子以便复现微调 |
| `--timeout` | 否 | `300` | 单次任务超时秒数 |

### 3.2 常用调用示例

#### 示例 A：换衣工作流（只换衣服 + 2D 卡通风 + 标准绿幕）

```powershell
python F:\feiyue-comfy-workflows\feiyue_comfy.py outfit `
  --style anime `
  --person F:\feiyue.png `
  --ref "F:\path\to\outfit_ref.png" `
  --prompt "改成轻纱款式，保留精致金色饰品" `
  --output F:\feiyue-comfy-workflows\out_outfit.png
```

#### 示例 B：换动作工作流（保留刚换好的衣服 + 迁移新动作 + 标准绿幕）

```powershell
python F:\feiyue-comfy-workflows\feiyue_comfy.py pose `
  --style anime `
  --person F:\feiyue-comfy-workflows\out_outfit.png `
  --ref "F:\path\to\pose_ref.jpg" `
  --prompt "微笑看着镜头，长发自然飘动" `
  --output F:\feiyue-comfy-workflows\out_pose.png
```

#### 示例 C：标准 Q 版换动作（Q 版基准图 + 黑白素体动作参考图）

```powershell
python F:\feiyue-comfy-workflows\feiyue_comfy.py pose `
  --style chibi `
  --person F:\feiyue-comfy-workflows\feiyue_chibi_base.jpg `
  --ref "F:\path\to\bow_skeleton.jpg" `
  --prompt "按<image_2>向前鞠躬行礼，双手合拢垂放在膝盖前方，去掉素体关节线" `
  --output F:\feiyue-comfy-workflows\out_chibi_bow.png
```

### 3.3 返回格式

执行成功后标准输出返回 JSON（退出码 `0`）：

```json
{
  "ok": true,
  "mode": "pose",
  "output": "F:\\feiyue-comfy-workflows\\out_chibi_bow.png",
  "width": 672,
  "height": 1008,
  "seed": 20261132,
  "elapsed_sec": 37.97
}
```

同时会在输出同目录生成 `.comfy.log` 供排查异常。

---

## 4. ComfyUI Desktop 图形界面调用方法

打开 ComfyUI Desktop 后，在左侧 **Workflows（工作流）** 列表直接选用以下任一已同步工作流：

- `绯月-1-换衣工作流(标准绿幕-卡通风-8GB).json`
- `绯月-1-换衣工作流(标准绿幕-厚涂风-8GB).json`
- `绯月-2-换动作工作流(标准绿幕-卡通风-8GB).json`
- `绯月-2-换动作工作流(标准绿幕-厚涂风-8GB).json`

操作步骤：
1. 节点 `①` 选择人设图（如 `feiyue_chibi_base.jpg` 或 `feiyue.png`）。
2. 节点 `②` 选择参考图（衣服图或动作图）。
3. 节点 `③` 修改第一行简短提示词（其余保人设、保画风与强制绿幕指令已内置）。
4. 点击 **Run（运行）**，等待约 40 秒即可在节点 `④` 获取标准绿幕成图。

---

## 5. 注意事项

1. **提示词勿擅自编造未要求的特征**：例如做换动作时不要在 `--prompt` 中额外写入颜色词（如“黑金”），否则会覆盖人设基准图原有的服装配色。
2. **显存与并发**：8GB 显存建议保持 `--megapixels 0.65`，且每次仅运行一个生图任务，避免显存争用。
3. **超时控制**：代理或自动化脚本调用时建议同时设置命令 `--timeout` 参数与工具级超时提醒，避免后台无限等待。
