# 整体动画网页复核（2026-11-16，Asia/Tokyo）

用户原文：“整体跑起来，我看看网页里的效果”。对当前成果为 Blender 离线场景的说明后，用户明确选择：“先看完整场景动画（保留当前画质）”，随后要求“继续”。验收为本地网页能播放最新完整场景，保留冲滩/退水，可以暂停和定位，提供完整可点击 HTTP 地址并保持服务可用。没有要求这次转换实时 3D、漫游、部署或发布。

参考原始 90% 场景目标及 README.md / REVIEW_V2.md 的已确认修订，不把视频页面当作实时 WebGL，不用网页测试通过冒充还原度通过。设计重读根 CLAUDE.md、docs/DEVELOPMENT.md、项目 README 和框架偏好；沿用已记录的独立备忘录缺失情况。使用 Sites 本地预览流程，不创建托管 Site、不安装新包或部署。

## 变更与实际资源

- `site/index.html/style.css/player.mjs/media.json`：单播放器、整体/岸边切换、加载/失败重试、原生媒体控制、简短状态；默认全画面且保持画面完整。无登录、数据库、浏览器持久化或第三方请求。
- `dev-server.mjs`：仅监听 127.0.0.1:8786，只读提供 site/ 中允许的静态资源，正确 MP4 MIME、HEAD、Range 206/416；断开时关闭读取流。没有暴露 Blender 工程、原始附件或项目其它目录。
- `render_wind_preview.py --full --quality`：从最新 tropical-shallows-swash.blend 输出完整画面，保持原先岸边预览的 1152×768 分辨率基准、128 samples、12 fps；本次完整视频没有岸缘裁剪。真实完成 73 帧，work/tropical-shallows/whole-scene-hq.mp4 为 2480750 bytes。
- `site/assets/whole-hq.mp4` 是最终默认完整视频，1152×768；`shore.mp4` 为 792×312 岸缘特写；poster.png 为当前高清冲滩图。早期 960×640 整体视频留作历史，不再默认播放。临时自动升级轮询已在资源全部就绪后移除，维持最简播放器。

## 实际检测

1. `node --check tropical-shallows/site/player.mjs`、`node --check tropical-shallows/dev-server.mjs` 通过。`git diff --check -- tropical-shallows docs/DEVELOPMENT.md` 通过，只有开发指南 CRLF/LF 提示。
2. 服务由 `node tropical-shallows/dev-server.mjs 8786` 启动。首个沙箱内进程不能由宿主浏览器访问，已停止并改为宿主本机进程，仍只绑定回环地址；最终修正后重启，HTTP 再检通过，地址未变。
3. 页面、CSS、JS、JSON、poster、两个 MP4 的 HEAD 均返回 200，类型正确。范围 0–99 和后缀 100 字节返回 206，超出长度返回 416。
4. 实际内嵌浏览器打开 `http://127.0.0.1:8786/`，完整视频 readyState=4、1152×768、duration=6.083333、paused=false。点击暂停成功；点击原生进度条，暂停位置从约 5.136 s 移至 3.046 s。岸边切换后 readyState 可播放、792×312；返回整体继续播放。
5. 浏览器 390×844：页面 scrollWidth=390，画面宽约 372.7、高 248.4，无横向溢出。1280×900：scrollWidth=1280，完整视频正常播放。测试后恢复默认视口，保留整体播放标签页为交付。
6. 控制台 error/warn 记录为空。网页截图保存于 work/tropical-shallows/web-preview.jpg。页面具备原生媒体全屏按钮，但在 Codex 内嵌浏览器点击未进入全屏；外部 Chrome/Edge 全屏未实测，不宣称已通过该项。

## 偏离与简化复核

默认整体而非只播放岸边裁剪，符合用户最新选择；说明中明确是预渲染固定机位。沿用同一 Blender 模型/灯光/材质及冲滩时间轴，没有降成粗模实时版本。高清静帧仍高于动画预览采样，不把视频参数称作完整 512-sample 静帧参数。没有增加框架、构建器、后台或不必要的设置系统。

停止于本次网页交付：已验证本地播放，服务保持运行供用户查看。整体 90% 视觉还原仍需继续判断，不由本报告宣称达标。无部署、Git 提交/推送或第三方独立审核。
