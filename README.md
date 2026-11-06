# WebCharacter

> 2026-11-06 当前状态与分类入口：[网页角色组件文档索引](docs/README.md)。下方旧阶段说明保留历史，已完成/待办以最新状态记录及发布回执为准。

零构建、零 npm 安装的网页 2D 角色原型。使用固定版本的 Rigby2D、原生 ES Modules、WebGL2 与 Canvas，验证参数化动作与简单角色扮演。

## 运行

已有 Node.js 24 的开发机器：

```sh
node tools/dev-server.mjs
```

打开 http://127.0.0.1:8768/ 。最终观看者只需 Edge / Chrome；直接双击 HTML 无法读取模型。运行资源全部在仓库内，演示无需 CDN 或大模型服务。

- [苹果小剧场](rigby-validation.html)：双角色走近、递苹果、接住、吃掉。
- [魔法书与扫帚](rigby-magic.html)：落书、拾取、收纳、取扫帚、淑女侧坐、飞走；支持裙摆与腿部微调。
- 两页均可暂停、拖动进度、阶段跳转、倍速和循环。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/` | 时间轴、IK、人物渲染、裙摆网格和绑定生成器 |
| `assets/white/` | 已生成且可直接运行的模型、清单、16 张裁片 |
| `assets/source-layers/` | 当前角色重新绑定所需的拆层 PNG |
| `tools/` | 本地服务、浏览器绑定工具、资源提升工具、验证脚本 |
| `vendor/rigby2d/` | 固定提交的运行库及原许可，不含上游示例角色 |
| `docs/DEVELOPMENT.md` | 当前架构、限制、维护及后续路线 |
| `docs/CLEANUP.md` | 本次清理范围、备份与验证记录 |
| `docs/history/` | 历史研究记录，不作为当前开发规范 |
| `work/`、`local-backup/` | 本地生成物与清理备份，Git 忽略 |

## 验证

```sh
node tools/test-rigby.mjs
node tools/test-rigby-magic.mjs
node tools/check-project.mjs
```

## 重新绑定当前角色

1. 启动本地服务，打开 http://127.0.0.1:8768/tools/rigby-white.html 。
2. 点击生成，结果写入 `work/rigby-white/`，正式资源不立即改变。
3. 执行 `node tools/promote-rig.mjs`，将生成结果复制到 `assets/white/`。
4. 执行上述验证，刷新两页并检查画面。

关节、腰线及裁切规则针对当前素材显式标定，换角色需要重新标定，不是通用一键自动绑定。

## 当前边界

用户已接受此版本作为可行性基线。仍有动作错位和二维近似，尚未接入聊天、大模型或语音，也未完成生产环境性能测试。手掌为整体贴图，没有逐根手指骨骼。裙摆采用局部网格形变，不是实时布料模拟；真正侧身和新增褶皱可能需要补图。

## 授权与发布

参见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。Rigby2D 运行库为 MIT OR Apache-2.0；角色图片不随引擎获得开源许可。当前角色仅作技术验证，本仓库不授予角色素材的商业使用或再分发权利。公开产品应更换为权利明确的原创形象。

本仓库没有自动部署工作流。本次仅同步源代码和验证资源到 GitHub，未部署网站。实际部署前遵守项目发布审核及逐次确认要求。

本地开发服务检查：`node tools/test-server.mjs`（需要允许本地回环连接，使用 18768 临时端口，退出时停止服务）。

## 继续开发与迁移

当前三个剧场已获用户接受。跨项目接入请先读 [迁移交接说明](docs/HANDOFF.md)，办公室入口为 [只改一个小 Bug](rigby-office.html)。

## 可嵌入播放器

多实例演示：`player-validation.html`。接口与接入说明见 [PLAYER_API](docs/PLAYER_API.md)。当前第一阶段采用同源 iframe，支持三个已接受剧场独立控制。
