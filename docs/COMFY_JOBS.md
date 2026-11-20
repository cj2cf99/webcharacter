# 代理调用本机 ComfyUI

在本机 Windows 主机执行 `tools/comfy_job.py`。需要系统 Python 3.10+ 和已配置的 Comfy Desktop 本地实例。代理从 Desktop 的安装清单找到 ComfyUI 虚拟环境及共享模型，默认使用已经安装的 SDXL Turbo。无需打开 Desktop 窗口或浏览器。

### 提交与取结果

```powershell
$cli = 'G:/selftool/WebCharacter/tools/comfy_job.py'
$dir = Join-Path $env:USERPROFILE 'Pictures/Feiyue'
$id = [guid]::NewGuid().ToString('N')
$draw = python $cli submit --prompt 'A blue ceramic teacup on a wooden table, studio photograph' --output "$dir/$id.png" | ConvertFrom-Json
python $cli status $draw.job
```

`submit` 返回 JSON 任务号和目标路径。主任务保存任务号后可以继续，只有依赖这张图片的步骤才需要在稍后用 `status` 查看结果。后续调用可从另一个终端发起。`wait` 会阻塞调用它的进程，适合专门等待结果的终端。状态依次为 `queued`、`starting`、`rendering`、`done` 或 `failed`。消费图片前检查 `done`，读取 JSON 的 `output`、`width` 和 `height`。失败时读取 `error` 和任务日志，命令以非零状态结束。

### 用已有图片做图生图

```powershell
$edit = python $cli submit --input "$dir/$id.png" --prompt 'A terracotta teacup in warm afternoon light, studio photograph' --strength 0.6 --output "$dir/$id-edited.png" | ConvertFrom-Json
python $cli status $edit.job
```

`--input` 接受 PNG、JPEG 或 WebP，提交时复制底图。图生图按照提示重绘整张图，`--strength` 越小越保留原图，默认 0.55。此入口适用于整体风格、配色和外观变化。精确局部修改需要遮罩工作流。默认生图尺寸为 512×512，修图则按原比例将长边调整到 512，潜空间编码可能使边长取整。可用 `--size 768` 或 `--size 1024` 指定尺寸，`--seed` 可固定种子。

### 后台行为

任务数据和日志位于 `%LOCALAPPDATA%/Feiyue/ComfyJobs/<任务号>`。省略 `--output` 时，结果保存为该目录的 `result.png`。指定路径时会创建所需目录；已有同名文件会报错。代理向用户给出实际完成的文件路径。

这些作业共用一个本地 GPU 锁，每次只让一个作业加载模型。每项作业按需启动离线后端，只监听随机回环端口，使用内置节点，完成后关闭本次实例。任务归本机进程执行，提交终端可以关闭；电脑关机中断的作业需要重新提交。

新提交的作业从提交起共用 10 分钟预算，包括排队、启动、渲染和取图。超时后作业以 `failed` 和 `code=TIMEOUT` 收尾，清理本次后端及临时文件可能另需少许时间。
