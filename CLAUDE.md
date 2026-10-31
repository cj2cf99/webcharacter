# WebCharacter 代理说明

先读 `docs/DEVELOPMENT.md`，当前主线为 Rigby2D，旧 iki 研究仅存历史记录。

- 中文交流与注释；保持免费、Chrome/Edge、低负载、无需用户安装额外软件。
- 原生 ES Modules，已有 Node.js 24 用于开发；新增依赖或构建工具先征求用户同意。
- 不改原图 `白发双马尾黑白裙少女.png` 或 `seethrough_output.psd`，两者仅保留本地并忽略。
- `assets/white/` 是正式演示资源，`assets/source-layers/` 是绑定输入；`work/` 是可重建临时产物。
- 不把 `local-backup/`、日志、原始 PSD、凭据或本机配置提交到远端。
- 运行：`node tools/dev-server.mjs`；测试见 README。
- 完成阶段后更新开发指南的现状和注意事项；历史记录不可冒充当前结论。
- 每次实际部署前，先在根目录准备完整 `RELEASE_REVIEW.md`（需求/验收、目标、基线与差异、逐项文件/行为、数据和配置影响、实际验证、未完成事项、风险与恢复、部署和发布后验证、用户确认与第三方审核状态），再请求本次部署明确确认；等待许可后才部署。触发自动部署的 push 同样受此限制。一般源代码同步不等于网站部署。
