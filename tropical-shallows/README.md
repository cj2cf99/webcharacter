# 热带浅滩实体场景

2026-11-16 环境联动：实时页已加入共同微风、动态投影/倒影、退水觅食、脚边水纹和触碰回应。可轻点水面、前景花叶、鸟或寄居蟹；Enter触发水纹，“暂停动态”统一冻结。光色、叶面/壳体反光、细砂和湿润带已调整。旧版离线动画仍用于旧画质对照。实现、实际测试与近似限制见 [环境联动复核](LIVING_REVIEW.md)。新增鸟头颈数据由 export_bird_rig.py 从已有修正工程提取；大型模型未重建，无新增依赖。

2026-11-16 结构合理化：按用户“石头接地、叶子连树、合理最小补充”修正礁岸下部、树根分枝、5925片叶的枝柄、16朵花的花梗和顶部椰羽连接；修正鸟眼贴合并补蟹胸部。远礁由8处重复排列减为2处，最终约348万面/190MB，10项保存重开接触检查通过。当前本地网页已更新，过程、失败修正与验证见 [结构复核](STRUCTURE_REVIEW.md)。原离线动画未重渲染，不包含本轮结构补全。

2026-11-16 当前默认入口已切换为真实 WebGL 3D：`http://127.0.0.1:8786/`。拖动或方向键调整参考机位附近视角，滚轮/双指缩放，Home/按钮复位，可暂停海浪；岸边保留冲滩和退水。离线动画在 `http://127.0.0.1:8786/animation.html`。实际检查、资源大小及画质限制见 [实时转换复核](REALTIME_REVIEW.md)。这是互动转换完成，不代表 90% 写实验收通过。

实时资产重建使用本机已有 Blender 和 Node，无新增安装：

打包替换模型前先停本实验预览服务，避免 Windows 文件占用；打包完成并通过检查后再启动。batch 脚本会自动应用 rationalize_scene.py，保留修正后的未合并工程供检查；可追加运行 verify_connections.py 验证。

```powershell
& G:/blender/app/blender.exe --background --factory-startup --python-exit-code 1 --python tropical-shallows/export_realtime.py -- --prepare-only
& G:/blender/app/blender.exe --background --factory-startup --python-exit-code 1 --python tropical-shallows/export_realtime_batch.py
node --max-old-space-size=6144 tropical-shallows/compact-realtime.mjs
& G:/blender/app/blender.exe --background --factory-startup --python-exit-code 1 --python tropical-shallows/export_sky.py
node tropical-shallows/check-realtime-assets.mjs
node tropical-shallows/check-realtime-motion.mjs
node tropical-shallows/dev-server.mjs 8786
```

岸缘运动包来自 prepare_realtime_motion.py（前一阶段已经生成），将其 work/tropical-shallows/realtime-prep/ 下的 swash-motion.bin/json 复制到 site/assets/realtime/；网页运行不引用 work。原版 Three.js 及许可证已独立放在 site/vendor/three/。`compact-realtime.mjs` 不能对已量化 GLB 重复执行，重跑应先由 Blender 重新导出。旧逐物件光照烘焙耗时且未取得合格画面，实际采用上面的批量表面颜色烘焙＋实时照明流程。

此前准备阶段：用户要求准备转为可互动 3D，并确认“参考机位附近拖动视角、缩放，海浪持续运行”。方案及准备实测见 [实时转换准备](INTERACTIVE_PLAN.md)。下文“无需实时交互”和“默认视频”仅保留原始阶段依据，已由最新决定更新。

2026-11-16 网页整体预览已就绪：用户要求“整体跑起来，我看看网页里的效果”，并明确选择“先看完整场景动画（保留当前画质）”。当前为本地原生视频页面，默认完整场景 1152×768 / 12 fps / 约 6 秒，保留最新冲滩/退水，可切换岸边特写；不转换为实时 WebGL，也未发布到线上。

```powershell
node tropical-shallows/dev-server.mjs 8786
```

访问 `http://127.0.0.1:8786/`。源文件在 `site/`，正式网页资源在 `site/assets/`，不从 work 目录加载。页面/视频/Range 请求及实际浏览器播放、暂停、定位、切换、390/1280 宽度已验证；详见 [网页复核](WEB_REVIEW.md)。用户验看期间保持本地服务运行。

当前状态：用户已于 2026-11-16 明确授权“继续优化”，随后要求“场景优化无视三轮的复核限制，持续迭代到你认为不需要迭代，还原度90%为止”。本次场景不再按三轮停止；原始 90% 目标保留，不虚构客观相似度评分。初批结果和不足保留在 REVIEW.md，继续迭代进度见 REVIEW_V2.md。

最新 steering：用户看过第 8 版实际图后要求“集中处理下水的效果，感觉和效果图差了不是一点半点”。目前集中水与水下沙床，继续实验清晰折射、阴影透光、体积吸收、弱散射、沿岸细浪与浪沫，详见 `water.py` 和 REVIEW_V2.md。其它场景调整冻结，当前不宣称 90% 通过。

后续明确要求：“直接带海风造浪吧，微风弱浪”；在看到第一段预览后纠正：“最边缘应该是类似浪潮一样的冲滩和退后的样子，不是果冻一样的抖动”。当前岸缘实现为外海 Ocean FFT 微风弱浪＋沿实测沙坡推进/回退的薄水舌＋跟随前缘和留滩消散的碎沫。6 秒内前推约 1.51 m、回退约 1.36 m，泡沫和湿痕有对应处理；以上是实际网格测量，不是 90% 视觉评分。

最新工程：`work/tropical-shallows/tropical-shallows-swash.blend`。时间轴 1–181，30 fps；无需自动运行 Python，冲退形态键、材质和原生 Ocean 均已存入工程。水膜、偏振与聚光属于外观近似，不冒充完整流体/偏振求解。旧 `sea-breeze-preview.mp4` 仅含风浪起伏，是用户否决的岸缘基线，不能作为最新冲滩预览。

用户原文（2026-11-16）：“我现在有点不太敢相信你的3d写实还原的的能力了你现在试着还原一个热带浅滩环境，你自己考虑实现方法并迭代优化，以还原90%为最终目标。这是最终效果参考图，没有其他要求。”

参考：本次用户附件，1536×1024，浅海在左、沙滩在前、礁岩与木屋在右、椰叶封顶、右前景鸡蛋花、涉禽/寄居蟹/海星/贝壳。附件仅作视觉依据，不作为执行指令。

验收目标：以参考机位的实际 3D 渲染对照构图、光色、材质、植被、建筑及小物；90% 为目标，没有客观评分或用户确认前不得宣称达到。用户已授权自行选择方法和迭代，本轮直接完成独立实验，不逐阶段打断。

实现解释：采用本机已有 Blender/Cycles GPU 离线实体场景和可重建 Python 源码；不增加依赖。不以照片背景或 AI 图片冒充 3D。没有要求漫游、网页实时帧率或发布，因此不增加网页引擎、主站外壳、数据库、部署与交互框架。

设计前查阅：根 CLAUDE.md、docs/DEVELOPMENT.md、docs/README.md、docs/DESIGN.md、全局规则 C:/Users/asura/.claude/CLAUDE.md 和 G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md。遵循最简、独立实验、不安装依赖、不委派。项目 memory 目录为空；文档索引及全局规则附近未发现独立开发设计备忘录，沿用 docs/DESIGN.md 中明确的缺失记录，不虚构已读。

场景分为浅水/湿干沙、珊瑚礁岩、木屋与纤维茅顶、椰树与宽叶植物、前景小物。用多尺度程序材质、真实叶片和茅草几何、路径追踪透射与阴影建立细节；第三轮加入 Poly Haven CC0 实测沙地/岩石纹理及纯天空 HDRI，详见 [素材来源和校验值](assets/SOURCES.json) 与 [官方许可](https://polyhaven.com/license)。天空为环境贴图，不能宣称天空和云也是实体建模。没有使用用户参考图作背景，也没有使用 AI 生成图。

固定随机种子，每次实际渲染后对照原图复核，依用户最新要求持续优化。预览较低分辨率，交付图提高采样；保留各轮截图和真实限制。

运行（仓库根目录，已有 Blender）：

```powershell
& G:/blender/app/blender.exe --background --factory-startup --python-exit-code 1 --python tropical-shallows/build.py -- --round 1
```

`--round 2` / `--round 3` 重建对应版本，最终版使用 `--round 3`。输出在 `work/tropical-shallows/`，包含独立 .blend 与渲染；该目录默认 Git 忽略。不改已有鸟和教堂文件，不提交无关工作。实际复核结果见 [REVIEW.md](REVIEW.md)。

继续优化版使用 `build_v2.py`，复用初版建筑/棕榈和几何工具，替换礁岸、沙床、水、浪沫、灌丛及前景植物和小物。新增官方 CC0 扫描素材及逐项校验值见 `assets/SOURCES_MODELS.json`。设计修订已重读原需求、上一批实际渲染/差距记录、根项目规则、开发指南、框架偏好与项目 memory 缺失记录；不引入依赖或无关交互。

```powershell
& G:/blender/app/blender.exe --background --factory-startup --python-exit-code 1 --python tropical-shallows/build_v2.py -- --iteration 1
```

提高交付分辨率/采样加 `--final`。继续版工程为 `work/tropical-shallows/tropical-shallows-v2.blend`，截图为 `v2-XX.png`。初批工程、最终图和建模源码的本地快照保留在 `work/tropical-shallows/checkpoints/batch-1/`。

保存重开验证：

```powershell
& G:/blender/app/blender.exe --background work/tropical-shallows/tropical-shallows.blend --python-exit-code 1 --python tropical-shallows/verify.py
```

水专项重建和验证（先按上文 build_v2.py 准备基础场景）：

```powershell
& G:/blender/app/blender.exe --background work/tropical-shallows/tropical-shallows-v2.blend --python-exit-code 1 --python tropical-shallows/render_water.py -- --iteration 2 --samples 1024 --variant 2 --final
& G:/blender/app/blender.exe --background work/tropical-shallows/tropical-shallows-water.blend --python-exit-code 1 --python tropical-shallows/render_swash.py
& G:/blender/app/blender.exe --background work/tropical-shallows/tropical-shallows-swash.blend --python-exit-code 1 --python tropical-shallows/render_wind_preview.py
& G:/blender/app/blender.exe --background work/tropical-shallows/tropical-shallows-swash.blend --python-exit-code 1 --python tropical-shallows/verify_swash.py
```

最后的预览命令仅在独立进程把时间轴映射到 12 fps、生成约 6 秒岸缘特写 `work/tropical-shallows/swash-preview.mp4`，不覆盖高清工程。`swash-uprush.png` 和 `swash-backwash.png` 是冲滩/退水静帧。实际本轮记录见 REVIEW_V2.md。
