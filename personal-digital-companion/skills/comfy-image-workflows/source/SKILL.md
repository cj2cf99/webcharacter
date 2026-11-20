---
name: comfy-image-workflows-v@VERSION_ID@
description: 将已核准的绯月图像步骤映射到本机已有模型与 ComfyUI API 图，执行后保存 PNG 和步骤回执。
---

# 绯月本机图像工作流 v@VERSION@

父 skill 使用稳定标识 image-task-chain。generate、img2img 对应 SDXL Turbo；edit 对应 FIBO 2 Edit Turbo 多图条件输入；upscale 对应 4× NMKD。API 图位于本版本的 graphs 目录。

宿主工具为绯月项目的 workflows/comfyui/image_chain.py。describe 返回当前指令和版本；check 校验；submit 在后台执行；status 按任务号读取。check 和 submit 的 UTF-8 标准输入由宿主构造，字段 original 为实际用户原文、steps 为模型给出的清单。宿主通过重复的 --image 参数提供已接收的附件。模型不能指定文件路径、节点、模型名或命令。

同一任务共用一个 GPU 名额和十分钟预算，每一步产物独立保存。失败停止后续；已成功的 PNG 可作为新任务的底图。状态 done 的 output 为最终 PNG，completed 列出中间图、执行时间和种子。
