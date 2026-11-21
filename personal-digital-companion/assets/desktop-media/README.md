# 当前桌宠正式动画资源

从2026-11-18实际运行包按clip-catalog.json收集，含所有在用动画的原尺寸与compact副本、baseline.png和tray.png。RESOURCE_MANIFEST.json记录大小和SHA256。

普通构建：在独立项目根执行 `node tools/build-desktop.mjs`，从本目录恢复，无需output中间产物或FFmpeg。已安装依赖后运行 `node tools/run-desktop.mjs`。

重做动画：现有素材处理工具生成中间产物后，以 `node tools/build-desktop.mjs --from-intermediates` 构建，人工验证再更新本目录及哈希清单。不能仅更新被忽略的output后宣称资源已提交。

语音独立存放于assets/voice，构建时完整复制。用户配置和导入的个人资源仍在本机profile，不纳入Git。

`actions/` 保存用户提供的七段绿幕 MP4 提取的透明 VP9 WebM。文件名与原片对应如下。

| 原片 | 成品 |
| --- | --- |
| 入场 | startup.webm |
| 退场 | farewell.webm |
| 有提醒 | reminder-idle.webm |
| 补评价 | diary-review-idle.webm |
| 亲爱的真棒 | praise-idle.webm |
| 对话时接到了任务 | chat-registration.webm |
| 闲置特殊2 | idle-special-2.webm |

均保留 464×688、24 fps、145 帧及原始站位，无音轨。采用 FFmpeg RGB 绿幕色键（相似度 0.20、过渡 0.08）、去绿溢和 VP9 Alpha 编码。《闲置特殊2》源片第 39–44、98–115 帧轮廓触边，成品保留相同边界。
