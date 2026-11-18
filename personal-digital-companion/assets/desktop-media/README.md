# 当前桌宠正式动画资源

从2026-11-18实际运行包按clip-catalog.json收集，含所有在用动画的原尺寸与compact副本、baseline.png和tray.png。RESOURCE_MANIFEST.json记录大小和SHA256。

普通构建：在独立项目根执行 `node tools/build-desktop.mjs`，从本目录恢复，无需output中间产物或FFmpeg。已安装依赖后运行 `node tools/run-desktop.mjs`。

重做动画：现有素材处理工具生成中间产物后，以 `node tools/build-desktop.mjs --from-intermediates` 构建，人工验证再更新本目录及哈希清单。不能仅更新被忽略的output后宣称资源已提交。

语音独立存放于assets/voice，构建时完整复制。用户配置和导入的个人资源仍在本机profile，不纳入Git。
