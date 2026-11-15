# Cathedral · 写实哥特教堂场景

参考巴黎圣母院的写实教堂。在网页里以第一人称从广场走到中央大门，开门进入室内。场景由 Blender 脚本生成并烘焙光影，网页用 three.js 显示。

- 需求：[REQUIREMENTS.md](REQUIREMENTS.md)
- 设计：[docs/DESIGN.md](docs/DESIGN.md)
- 审核：[docs/reviews/](docs/reviews/)
- 收工进度记录：[docs/PROGRESS_2026-11-16.md](docs/PROGRESS_2026-11-16.md)
- **计划与进度：[docs/PLAN.md](docs/PLAN.md)**（整体计划、中断点、接下来的 10 步）

当前阶段：第 1 阶段（平面与体块）完成，待用户确认。

- 重建体块：在 Blender 中运行 `exec(open(r"G:/selftool/Cathedral/blender/massing.py", encoding="utf-8").read())`，会清空当前场景。
- 预览渲染：随后运行 `blender/preview.py`，渲染图输出到 `work/renders/`。
- 尺寸及其出处：`blender/dims.py`。参考图纸在 `reference/`，只在本地，不发布。

- **当前优先级见 [docs/PLAN.md](docs/PLAN.md) 第 0 节**（天候系统暂停在 W5）。
- 天候系统（已暂停）：太阳位置 `site/src/sun.mjs` / `blender/sun.py`，测试 `node tools/test-sun.mjs`；外部新资源在 `site/assets_next/`（W4 切换）。
