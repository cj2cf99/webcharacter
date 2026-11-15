# 喙形专项复核

2026-11-15（Asia/Tokyo）。状态：三轮修正与复核后停止，外观待用户确认；上一版嘴形被用户指出不符，不能沿用其通过判断。

## 需求及依据

用户原话：“嘴巴形状差太多，继续修”。依据最新参考局部 `model/bird/reference/bill-correction-20261115.png` 与当前模型截图，延续“写实倾向”“不需要内部细节”“动画暂缓但考虑接入”“最简设计”。只修喙形、嘴角及接喙处下颌，保留其余身体结构与部件划分。

重读 `CLAUDE.md`、开发指南、需求/设计及此前复核，查阅全局框架偏好；沿用设计文档中独立全局/项目备忘录未找到的记录。以现有参数曲面和上下喙独立网格完成，没有新依赖、骨架、动作、口腔内部或控制框架。

Git 基线仍为 `575082f35bff56c3fc74bbbd1542307fefc537c2`，工作区模型/文档未提交。直接修改前正式源码 SHA-256 为 `73A61C3E791C578D99A253FEBDF1506346FB5160B35CDC15A0AE68609A14CB12`；保存到 `work/bird-model/checkpoints/before-bill.py` 与 `.blend`，实际窗口另存 `live-before-bill.blend`。最终源码 SHA-256：`1132E12EBD061ABF40A1AAB17AC0438FF4D0DDDA500CF5E7BEBC483F9AAFA1B2`。最新参考 SHA-256：`186CBB7EBF1D8B01486EF0199618A65E505D154A58638771D3BDAC2630EF6EF1`。

## 三轮发现与修正

| 轮次 | 实际问题与处理 | 视觉检查 |
| --- | --- | --- |
| 1 | 原直锥截面缺少弧背、下扣和上下喙比例。改为六组截面分别控制宽度、喙缝、上背、下缘，嘴角后延、下喙略短；但首次弧背过鼓、下喙根部出现兜状凸起，未通过 | 查看侧/斜侧实际渲染，明确记录失败，未将数值验证当作外观通过 |
| 2 | 压薄上背和下缘、抬高嘴角并使根部埋入面羽，兜状凸起消除；侧视仍见尖端钩度偏重和接喙下颌直截边 | 查看侧视，继续修正上述两处 |
| 3 | 减小背部弧高和尖端下扣量，收顺身体末端接喙处的宽度与腹侧半径，去掉明显直截边；重定位上下喙共同转轴至实际嘴角 | 查看最终侧/斜侧/正/俯视、更新头部五向图及同条件前后图。保留微弧背、薄下喙、略长上喙和连续嘴角；停止本轮迭代 |

实现只涉及 `model/bird/build_model.py` 中身体鼻端末截面、`bill_point`、喙生成与鼻孔外观位置/尺寸。原上/下喙对象名及四阶段形态键保留，喙各一个合并网格，无新增内部结构；鼻孔仍是浅表外观近似。其它改动为参考图、排版脚本、需求/设计/开发说明/索引与本报告。

## 实际验证

- 两轮 `blender --background --factory-startup --python-exit-code 1 --python-expr ...` 重建并渲染四向嘴部图，退出码 0；日志 `work/bird-model/bill-round1.log` / `bill-round2.log`。
- 原生 Blender MCP：`G:/blender/mcp-venv/Scripts/python.exe work/bird-model/refresh_bill_mcp.py`。先断言场景为本项目 `bird-model.blend`、保存副本，执行正式源码，返回 `BILL_LIVE_REFRESH_PASS 32`；未操作其它 Blender 场景。实际文件已保存，MCP `mcp-bill-final.png` 返回预期路径且已查看。刷新时设侧视，随后截图实际为前上方视角；严格侧视证据使用后台最终渲染，不把该 MCP 图误称侧视。
- 最终构建 36 个部位网格、32 个变形网格、506228 顶点、362394 面、11286 片羽毛。13 个形态采样的拓扑/有限坐标/面有效性、归一权重、胸盾和臀尾覆羽根部、非尾身体基准、关键帧接口检查通过。少量羽毛数量变化由接喙截面收顺后按距离布羽自然产生，不增加羽毛系统。
- `blender --background work/bird-model/bird-model.blend --python-exit-code 1 --python work/bird-model/render_bill_final.py`：重开最终资产，执行正式 `verify_saved.py`，检查内嵌源码一致、默认常态、双翼独立/分组、十组尾羽、独立眼睑和下喙绕转轴旋转而上喙不动；临时旋转恢复且不保存。输出 `SAVED_PARTS_PASS` / `BILL_FINAL_RENDER_PASS`，退出码 0，日志 `bill-final-check.log`。
- 修改前 `.blend` 以与最终 `bill-side` 相同相机位置、朝向、正交比例、原场景灯光及色彩设置重新渲染 `bill-before.png`，没有用不同角度的用户截图冒充同条件对比。`make_preview.ps1` 生成 `bill-comparison.png` / `bill-views.png` 和更新的 `head-views.png`。
- `git diff --check` 通过（仅 CRLF 规范化提示）。旧粗模与动画继续不改。

## 限制与恢复

本次消除直锥轮廓及明显下喙兜状根部，向用户参考的微弧鸟喙靠拢，不声明外观已获用户验收或物种精确复原。喙根依旧是连续体表与外部喙网格的叠接，鼻孔没有真实内腔。程序化羽毛规则感和胸盾根部偏硬是前批已知问题，不借本次嘴形修正扩大处理范围。

未执行新动作、完整骨架/旧动画接入、网页导出或浏览器性能验证，无数据库/生产配置影响，无部署或 Git 推送。恢复用上述 `before-bill.blend` / `.py`，正式源码可重建当前模型。本轮按三轮复核停止规则等待用户下一步指令。
