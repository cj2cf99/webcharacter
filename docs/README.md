# 网页角色组件文档索引

2026-11-16 极乐鸟单页 2D 连续求偶舞：[需求、母鸟视角与安全构图设计](../bird-2d/README.md)、[实际复核报告](reviews/BIRD_2D_REVIEW_2026-11-16.md)。运行 `node tools/dev-server.mjs 8784`，访问 `http://localhost:8784/bird-2d/`；未部署。

2026-11-16 新增子项目：巴黎圣母院写实场景在 `cathedral/`（需求、设计、审核、计划、进度记录、Blender 脚本、网页与当前可运行的资源，约 14 MB）。运行：`node cathedral/tools/dev-server.mjs 8780`，打开 `http://localhost:8780/site/?cycle`。测试：`node cathedral/tools/test-collision.mjs`、`test-sun.mjs`、`check-assets.mjs`。本次只是源码同步，不部署网站，也没有新增自动部署；仓库公开，所以下载的参考图纸、烘焙缓存（约 700 MB）、渲染图、帧序列和参考视频都没有上传（清单见 `cathedral/docs/PROGRESS_2026-11-16.md` 第 8 节）。极乐鸟线另有程序化早期版脚本 `model/bird-procedural-v0/`，建模优化以 `model/bird/` 为准。`model/bird/reference/` 里 4 张用户参考图（约 8.6 MB）因来源和授权未确认，暂未提交。

## 极乐鸟模型优化（2026-11-15）

当前第四批按用户三视图、动画拆分图和头部外形图继续纠偏，补臀尾连续衔接、外表眼部与独立眼睑，通过原生 Blender MCP 更新实际场景。第三批“已收敛”仅为历史判断，未获用户接受。保留阶段接口和绑定准备；无内部解剖和新动作，外观待用户确认。

- [需求及用户原文](../REQUIREMENTS.md)
- [模型设计与实际结果](DESIGN.md)
- [设计复核](reviews/BIRD_MODEL_DESIGN_REVIEW_2026-11-15.md)
- [模型源码与查看方法](../model/bird/README.md)
- [模型预览三轮复核](reviews/BIRD_MODEL_PREVIEW_REVIEW_2026-11-15.md)
- [第二批迭代三轮复核](reviews/BIRD_MODEL_ITERATION2_REVIEW_2026-11-15.md)
- [第三批常态写实复核及停止依据](reviews/BIRD_MODEL_REALISM_REVIEW_2026-11-15.md)
- [第四批参考纠偏、臀尾及头部复核](reviews/BIRD_MODEL_REFERENCE_REVIEW_2026-11-15.md)
- [最新喙形三轮专项复核](reviews/BIRD_BILL_REVIEW_2026-11-15.md)
- [最新头部严格参考纠偏及残留](reviews/BIRD_HEAD_REALIGN_REVIEW_2026-11-15.md)
- [喙根迭代、降低喙角与残留复核](reviews/BIRD_ROOT_AND_PITCH_REVIEW_2026-11-15.md)
- [最新前颈饱满度与常态胸羽收拢复核](reviews/BIRD_NECK_CHEST_REVIEW_2026-11-15.md)

<!-- repository-closeout-20261106 -->
## 文档分类与当前进度（2026-11-06）

先读[结案与剩余工作](status/20261106.md)。需求/设计是业务依据；审核是历史证据；发布事实以项目根RELEASE_REVIEW及实际回执为准，不能从旧文中的“未部署”倒推现状。

- 开发历史：[history/](history/)

完整文件按用途浏览：[文档分类目录](catalog.md)。
