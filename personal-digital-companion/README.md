# 个人数字精灵 · 独立试验

当前阶段：素材技术准备（2026-11-18，JST）。原始人设图待用户提供，未开始角色动作制作或桌面宿主开发。

最新状态（同日后续）：已收到四状态素材，当前交付是 `绯月四状态测试_直接打开.html`，工作使用新版“工作三段2”，支持进入/循环/退出。上段为工具准备时的历史状态；当前效果待用户确认，Windows宿主尚未开发。见[四状态需求与实现](docs/FOUR_STATES.md)及[复核记录](docs/reviews/FOUR_STATES_REVIEW_2026-11-18.md)。

- 原始锁定需求、实施计划与鱼骨图：[reference/](reference/)，原件不修改。
- 本次工具说明与需求边界：[docs/MEDIA_TOOLS.md](docs/MEDIA_TOOLS.md)。
- 实际验证及复核：[docs/reviews/MEDIA_TOOLS_REVIEW_2026-11-18.md](docs/reviews/MEDIA_TOOLS_REVIEW_2026-11-18.md)。
- 当前开发状态：[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
- 绯月交互本地优先：[需求](REQUIREMENTS.md) · [设计](docs/DESIGN.md)。

本目录与既有 Rigby2D、3D 场景等试验隔离，不引用其运行代码或角色素材。不部署、不启动常驻服务、不提交或推送。

## 工具

已有 Node.js 24 + 已安装的 FFmpeg；没有新增 npm/Python 依赖。

在本目录执行：

```powershell
node tools/media.mjs doctor
node tools/test-media.mjs
node tools/media.mjs help
```

本机 FFmpeg 路径存放在忽略的 `.local-tools.json`，不修改 PATH。其他机器可设置 `COMPANION_FFMPEG` 为已有 FFmpeg 的路径，或使用 PATH 中的 `ffmpeg`。二进制不复制进仓库。

源图与测试结果分别保留；`output/` 和本机配置不纳入 Git。现有 `assets/static-test/failed-imagegen-*.png` 是先前失败试验，不是标准图或合格素材。

