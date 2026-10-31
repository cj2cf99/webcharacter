# 历史研究记录（归档）

本文保留清理前的研究过程，其中路径、默认引擎和待办可能过时。当前事实以 ../DEVELOPMENT.md 为准。

# WebCharacter 开发指南

> 写给接手开发的人或 AI 代理。前半部分是**已经确定的事实和决策**，后半部分是**接下来怎么做**。
> 动手前请先通读第 1–4 节；第 5 节按阶段推进，每个阶段都列了参考资料和验收标准。
> 最后更新：2026-11-01（可行性验证阶段结束时）

---

## 1. 项目目标

做一个**跑在网页上的 Q 版角色**，作为练习外语时的"对话对象"。角色由外部状态机指挥，根据对话状态做出反应。

### 1.1 核心场景

| 对话状态 | 角色表现 |
|---|---|
| 等用户回复 | 待机：呼吸、眨眼、视线游移、头发摆动 |
| 用户很久没回复 | 瞌睡：闭眼、点头、头顶冒 Zzz |
| 用户开始输入 | 惊醒：吃惊表情、冒"!"，回到待机 |
| 已发送、等 AI 接口返回 | 翻书：走到一旁（或切换姿态）在书堆里翻找，书往外飞，冒"?" |
| AI 返回 | 找到了：闪光、开心，然后说话 |
| AI 回复播放中 | 说话：口型同步，按回复里的情绪标签切换表情 |

### 1.2 硬性约束（用户已明确，不要违反）

1. **免费**：不使用 Spine、付费的 Rive、需要发布授权的商用 Live2D 等。所有依赖必须是可免费商用的开源协议（MIT、BSD、Apache 等）。
2. **浏览器**：以 Edge 和 Chrome（Chromium）为准，不考虑 Safari、Firefox 的兼容。
3. **低负载**：网页常驻也几乎感觉不到。见第 5.8 节的性能预算。
4. **用户不安装任何软件**：最终产物是网页。开发期可以使用用户机器上已有的 Node.js（v24）和 Python（3.15，但**没有** PIL、numpy 等库），不要要求用户安装 conda、PyTorch、AI 绘图环境等。
5. **用户只提供角色的基础形象图**，后面的拆层、绑定、动画尽量自动化。可以请用户在免费的在线 AI 工具里跑提示词（一次性的少量操作）。
6. **画风**：Q 版二次元。原型参考《缘之空》春日野穹（白发双马尾、黑色发带、白色连衣裙）。这是有版权的角色，如果要公开或商用，需要改成原创衍生形象。
7. **动作以站立为主**；大幅动作用"切换姿态模型 + 转场特效"实现，"看起来像"就行，不需要真实的物理接触。

### 1.3 不做的事

- 不追求 Live2D 级别的大角度转头和细腻形变
- 不做真实的走路、弯腰等全身动作过程（用姿态切换代替）
- 不做服务端渲染，也不用 AI 实时生成视频

---

## 2. 技术路线（已确定）

```
外部状态机（对话逻辑）
   │  avatar.setState / resolve / setExpression / activity ...
   ▼
调度器 Director：状态 → 姿态模型 + 表情 + 参数覆盖 + 特效 + 转场；处理打断和最短展示时长
   │
   ├─ 人物层：CharacterLayer 接口 ← iki 适配器 ← @ikijs/engine（参数驱动的 2D 骨骼和变形）
   │          主模型（站立，完整绑定）⇄ 姿态模型若干（翻书、趴睡……道具直接画进图里）
   ├─ 特效层：后层 / 前层两块 2D 画布（"三明治"夹住人物）；粒子、序列帧、透明 WebM
   └─ 转场：烟雾、挤压拉伸等，遮住姿态模型的切换
```

### 2.1 关键决策和理由

| 决策 | 理由 | 放弃的方案 |
|---|---|---|
| 人物引擎用 **iki**（MIT） | 参数驱动，接近 Live2D 的架构；网页原生；**支持从分层图自动绑定**，不需要人工建模；模型是纯 JSON | Live2D：建模需要专业技能，商用有门槛。Spine、Rive：付费。DragonBones：停止维护。完全自研：要 35–55 人天，而且绑定这一步做不了 |
| 拆层用 **See-through**（Apache-2.0，SIGGRAPH 2026） | 单张动漫图 → 最多 23 个语义图层，并补画被遮挡的部分 | 人工拆层违反"只给一张图"的约束 |
| 道具和特效**不放进人物模型**，单独做特效层 | 道具数量可以无限扩展，不受人物方案限制；复杂的特效可以预先做成固定动画 | 把道具画进模型：难以维护；逐帧动画：帧数会爆炸 |
| 大幅动作用**姿态模型切换** | 绕开"人物和道具精确接触"这个最难自动化的问题；手持道具直接画进姿态图 | 真实的手部绑定加道具挂载 |
| **人物层接口抽象**（CharacterLayer） | iki 还处在 0.x 阶段，接口可能会变；需要时可以换成 Live2D、Inochi2D 或自研引擎 | 调度器直接调用 iki |
| **依赖 iki 的 npm 包并锁定版本**，不 fork | 能跟进上游改进；只在必要时局部 fork | Fork 后自己维护整个引擎 |

### 2.2 备选方案（iki 不行时）

1. **Inochi2D**（BSD-2）：成熟的开源 Live2D 替代品，有图形化编辑器 Inochi Creator。网页端运行依赖 inox2d（Rust 编译成 WASM）。
2. **Live2D + easy-live2d**：效果最好，但需要有人建模；个人和小规模使用免费。
3. **自研参数驱动引擎**：不做网格变形，用关键形态插值、视差位移、斜切、弹簧物理来实现，约 36–55 人天。

---

## 3. 现状（可行性验证已完成）

### 2026-11-01 追加：Rigby2D 双角色最小验证

#### 第四轮：淑女侧坐与裙摆局部变形（2026-11-01）

- 用户要求将扫帚骑乘改为双腿同侧的淑女坐姿，并验证裙装细节控制。入口仍为 `rigby-magic.html`，第 ⑦ 段为 17.5 秒的侧坐检查点。
- `src/rigby-seated-dress.mjs` 将当前实例的 torso region 转成 12×28 网格（377 顶点），腰线以下逐渐压缩、收拢并向膝盖侧移；上衣顶点不变。仅运行时处理，不改原 PNG、PSD、生成模型或苹果页。
- `src/rigby-magic-scene.mjs` 混合退出腿部 IK，控制大腿向同一侧弯折、小腿并拢垂下、双手放在膝前；扫帚坐下后使用独立座位位置，不再跟手掌漂移。
- 页面增加裙摆收拢、裙摆侧移、小腿倾斜三个实时滑块及恢复默认按钮，暂停时也能观察变化。参数仅当前页面内存保存。
- 实际执行 `node tools/test-rigby-magic.mjs` 通过：原 1441 点时间轴验证，并追加 27 组参数 × 6 个过渡时刻，检查裙摆无退化/翻折、上衣零变形、默认侧坐脚部间距小于 20 舞台像素。`node --check src/rigby-magic.mjs` 通过。内置 Chromium 已检查实际侧坐图像及滑块交互。
- 限制：仍是正面素材的伪侧坐，裙装变化为指定网格形态混合，并非布料物理；关节和腰线标定仅适用于这张角色图。未部署，未验证用户 Edge 性能。

#### 第三轮：魔法书与扫帚复杂编排（2026-11-01）

- 用户认可白发素材绑定和简单交互后，要求验证：掉书砸头、书落在旁边、走近蹲下拾起、塞到身后消失、取出扫帚骑着飞走。
- 新入口 `rigby-magic.html`，24 秒独立小剧场；原苹果页保留并增加入口。运行方式沿用现有本地服务，访问 `http://127.0.0.1:8768/rigby-magic.html`。
- `src/rigby-magic-scene.mjs`：确定性时间轴、低位拾物 IK、屈膝和骑乘参数、道具挂点及前后遮挡切换。`src/rigby-magic.mjs`：三层画布、程序绘制书与扫帚、30 fps 播放和阶段检查控件。
- 不新增依赖，不生成新人物图、不修改原素材；蹲姿与侧坐扫帚均为正面拆层图的二维近似，裙摆掩盖部分膝盖，尚非真实侧面坐姿。飞行采用整体平移上升。
- 实际执行 `node tools/test-rigby-magic.mjs` 通过：1441 个时间点数值有效、拾书瞬间跳动小于 2 舞台像素、道具收纳/出现和飞离状态、9 个阶段跳转确定性。模块语法检查通过；浏览器已检查蹲下拾书与骑乘画面，无控制台错误。未做用户 Edge 性能测试、未接大模型、未部署。

#### 第二轮：现有白发角色接入（2026-11-01）

- 用户看过示例版后要求继续。本轮将已有白发角色拆层转换到 Rigby2D，并保留 NILA 示例对照。
- 白发版：`http://127.0.0.1:8768/rigby-validation.html?cast=white`；示例版：同页 `?cast=sample`。两版均保留播放、暂停、阶段跳转、进度拖动、循环和倍速。
- `src/rigby-white-build.mjs` / `tools/rigby-white.html`：通过浏览器 Canvas 清理手臂残渣、裁出左右腿和手掌、生成蒙皮网格、标定 23 根骨骼与四肢 IK，保存到 `work/rigby-white/`。原图和 PSD 未修改，未安装新依赖。
- 当前绑定针对这张图显式标定关节，不是通用自动绑定。头发与脸仍是简单二维部件；腿和手臂使用真实 Rigby2D 网格蒙皮。两个角色共用此形象，B 镜像并给裙装染色，皮肤不染色。
- 调整为同方向弯膝的小步走，落地段目标点向后移动以抵消身体位移；仍是伪侧面原型，未声称真实侧身行走。增加确定性、错开时机的眨眼，保留圆嘴吃苹果。
- 生成 JSON、清单、16 张裁片总计约 0.66 MiB；两个实例共用纹理。实际性能以浏览器面板实测为准，尚未在用户 Edge 验收。
- `node tools/test-rigby.mjs --white` 与 `node tools/test-rigby.mjs` 均通过：721 个时间点、交接误差、入嘴位置、道具消失、任意跳转/重播；白发版额外验证网格权重归一化和骨骼索引。`node --check src/rigby-white-build.mjs`、`node --check src/rigby-demo.mjs` 通过。
- 已在内置 Chromium 检查腿部行走、递苹果和送到嘴前的实际画面。接下来重点由用户评价该画风下的肢体变形与步态；本轮仍未接大模型、未部署。

用户最新目标优先于旧路线：允许伪侧面小步行走、简单接物，苹果碰到张圆的嘴后直接消失；两角色用于对话网页中的简单角色扮演。本轮不接大模型，不部署。

- 入口：`rigby-validation.html`；运行 `node tools/dev-server.mjs 8768`，打开 `http://127.0.0.1:8768/rigby-validation.html`。
- `src/rigby-demo.mjs`：真实 Rigby2D WebGL 渲染、双实例、共享贴图、独立苹果层、播放/暂停/重播/时间拖动/倍速/循环。
- `src/rigby-actor.mjs`：IK 手脚控制、镜像、持物接触点、张嘴贴图切换；`src/rigby-scene.mjs`：12 秒确定性时间轴。
- `vendor/rigby2d/` 固定上游提交 `9d807762410bbf1e1d531809ea47cccc22823dfa`，运行库保留 MIT / Apache-2.0 许可，无 npm 安装、无构建。此依赖由用户本次明确指定。
- 两个人物均为 NILA 示例的独立实例，B 镜像并调整衣服色调；不是用户角色绑定结果。示例素材独立许可仅允许本地评估/原型，不能随正式产品发布。许可保存在 `vendor/rigby2d/branding/DEMO-LICENSE.md`。
- 已执行 `node tools/test-rigby.mjs`：721 个时间点骨骼数值有效、交接接触点差 < 1 舞台像素、消失前手掌到嘴 < 2 像素、9 秒苹果消失、7 个阶段跳转确定性通过。`node --check src/rigby-demo.mjs` 通过。
- 已在内置 Chromium 浏览器检查走近、递物和送嘴画面；用户 Edge 的最终观感和性能尚待用户确认。走路是正面小步挪动的最小原型，不是完成的侧面步态；未验证用户 AI 素材自动绑定。

### 3.1 目录结构

```
WebCharacter/
├─ 白发双马尾黑白裙少女.png      用户提供的基础形象（1086×1448，白底）
├─ seethrough_output.psd         See-through 在线演示的输出（1024×1024，16 层）
├─ avatar-validation.html        技术验证页：状态机 + 特效层 + 姿态切换 + 性能面板
├─ tools/
│  ├─ dev-server.mjs             零依赖本地服务：静态文件 + POST /save?name= 写入 work/
│  ├─ psd-inspect.html           查看 PSD：逐层导出 work/layers/，生成总览图和合成图
│  ├─ rig.html                   PSD → 修正 → iki 图层 → 自动绑定 → 图集 → work/model/character.iki
│  └─ viewer.html                模型查看器：全部参数滑块、表情、动作、待机动画开关
├─ work/                         工具生成的中间产物（可以重新生成）
│  ├─ layers/                    PSD 原始图层
│  ├─ rig-layers/                修正后、按 iki 命名的图层
│  ├─ model/character.iki        绑定好的模型（约 1MB，图集 870×1653）
│  └─ rig-check/                 姿态检查图（全身和头部特写，各 12 个姿态）
└─ .claude/launch.json           预览配置（node tools/dev-server.mjs 8766）
```

### 3.2 运行方式

```bash
node tools/dev-server.mjs 8766
```

- 验证页：http://localhost:8766/avatar-validation.html（默认加载 `work/model/character.iki`；`?a=` 指定主模型，`?b=` 指定姿态模型，`none` 表示不切换）
- 模型查看器：http://localhost:8766/tools/viewer.html
- 重新绑定：http://localhost:8766/tools/rig.html（参数：`?psd=`、`?original=`、`?out=`）
- 直接双击 HTML（file://）无法读取本地模型，验证页会退回 iki 的示例角色。

### 3.3 已验证的结论

| 项目 | 结果 |
|---|---|
| 从 CDN 加载 iki 引擎、格式包、编辑器包 | ✅ 通过 importmap，不需要构建 |
| 在浏览器里自动绑定（不用 Node 的 sharp，也不用 MCP） | ✅ `tools/rig.html` 复刻了官方 MCP 的 `autoRigFromLayers` 流程 |
| 头部效果：眨眼（眼皮合上）、转头视差、点头、歪头、视线、张嘴 | ✅ 效果良好 |
| 外部状态机驱动完整循环；AI 秒回时保证最短展示时长；情绪标签 | ✅ |
| 前后特效层夹住人物、烟雾转场切换姿态模型 | ✅ |
| 每帧主线程耗时 | 自己的模型约 **0.15ms**；示例的全身模型约 0.4–0.7ms（含特效） |
| 模型加载 | 约 150–180ms（每个模型约 1MB） |
| 显存 | 自己的模型图集约 5.5MB；示例的全身模型约 33–43MB（贴图是 2–3k × 4k 的大图） |
| 真实帧率 | **还没在用户的 Edge 里测过**（内置浏览器的窗格是隐藏状态，会被节流） |

### 3.4 当前模型的已知不足

1. 分辨率偏低：See-through 在线演示输出的是 1024 画布，脸约 190px 宽，放大会糊。
2. 眉毛被刘海盖住，拆出来很淡，眉毛相关的表情效果弱。
3. 嘴是程序画的：闭嘴是一条弧线，张嘴是椭圆加舌头（原图的嘴几乎提取不出来）。
4. 手臂只能小幅抬起；没有 `forearm_pose`，所以没有 Wave（挥手）动作。
5. 折叠检查有 2 处问题，只出现在极端组合姿态下（转头、抬头、歪头、身体全部拉满并且闭眼），实际使用中不会出现。
6. 表情只有 smile、laugh、angry、sad、surprised，没有 shy（因为没有腮红图层）。

---

## 4. 关键技术知识（踩过的坑都在这里）

### Rigby2D 原型补充

- `writeSkeletonJson()` 返回 `{ json, warnings }`，保存模型应取 `.json`，不能把整个返回对象当骨骼文件。
- 后台浏览器的 `canvas.toBlob()` 可能延迟回调；本次小型离线生成工具使用 `toDataURL()` 同步编码并上传到本地 `/save`，避免逐图保存被后台节流。
- 图层透明不代表干净：旧手臂层旁有较多低透明度残渣，先保留最大实心连通区域及边缘，再绑定变形。

- 上游示例 JSON 使用 `constraints`，读取后手脚 IK 在 `skeleton.ik`，不能仅查看源文件的 `ik` 字段判断有没有 IK。
- NILA 手臂 IK 默认 mix=0；运行时需要启用。脚 IK 默认开启，修改腿部旋转可能被 IK 覆盖，应修改目标点。
- 模型 Y 向上；画布 Y 向下。苹果从手骨最终世界矩阵取位置，手腕到手掌的偏移也计入，防止道具漂移。
- 每次跳转重置姿态，再计算完整时间点状态；不依赖一次性触发事件，因此暂停、拖动、重播不会遗留苹果所有权。
- 编辑器表情滑块并非原样导出的运行时 API；这里直接切换示例嘴部 attachment。

### 4.1 iki（版本锁定：engine 0.10.0、format 0.10.0、editor 0.28.0）

- **CDN 引入**：engine 内部用的是裸模块名 `@ikijs/format`，必须用 importmap 映射：
  ```html
  <script type="importmap">{ "imports": {
    "@ikijs/format": "https://cdn.jsdelivr.net/npm/@ikijs/format@0.10.0/dist/index.mjs",
    "@ikijs/engine": "https://cdn.jsdelivr.net/npm/@ikijs/engine@0.10.0/dist/index.mjs",
    "@ikijs/editor": "https://cdn.jsdelivr.net/npm/@ikijs/editor@0.28.0/dist/index.mjs"
  } }</script>
  ```
- **坐标系**：模型坐标原点在画布中心，**+y 向上**。`_L` 指**角色自己的左边，也就是画面右侧（+x）**，和 Live2D 的约定一致。
- **IkiPlayer**：每个实例独占一个 WebGL2 上下文，背景透明（预乘 alpha）。
  - `start()` 会启动引擎自己的 rAF 循环，**不能限制帧率**。目前的做法是不调用 `start()`，由我们的循环直接调用 `player.renderFrame()`。这是 TS 层面的私有方法，**升级时要检查它还在不在**。
  - 像素比直接读取 `window.devicePixelRatio`，不能配置。目前用 `Object.defineProperty(window, "devicePixelRatio", { get })` 截断，是个临时办法。
  - `setView({x, y, width, height})` 指定画面中心和尺寸（模型单位）。
  - `load()` 必须 await，否则 `getParameters()` 为空。
- **IkiMotion**：把待机（眨眼、呼吸、视线、晃动）、动作片段、表情、物理打包在一起。每帧调用 `update(now)`；**宿主要在它之后写自己的信号**（口型、覆盖值），最后写入的值生效。
  - `drivenParameterIds` 列出它会写的参数。宿主做平滑混合时：它驱动的参数取当前值作为基准，**其余参数用默认值作为基准**，否则覆盖值撤掉后会卡在原地（见 `avatar-validation.html` 的 `Blender`）。
- **自动绑定**（`@ikijs/editor`）：
  1. `parseLayerRoles(文件名[])`：必需的图层是 `face`、`eye_L`、`eye_R`，以及嘴（`mouth`，或者唇组 `mouth_inner` + `lip_lower` + `lip_upper`）；有手臂就必须有 `body`。
  2. 可用图层：`hair_back, body, arm_L/R, face, blush_L/R, nose, mouth, mouth_open, mouth_inner, mouth_tongue, mouth_teeth, lip_lower, lip_upper, eye_L/R, iris_L/R, pupil_L/R, highlight_L/R, lash_lower_L/R, lash_L/R, brow_L/R, hair_front, forearm_pose_L/R`。
  3. `mouth` 单独使用时是拉伸式口型；加上 `mouth_open` 是交叉淡化；用唇组则是像眼皮那样折叠，效果最好，但需要拆好的口腔素材。
  4. `createLayerSetMeasurer({width, height})` → 逐层 `add({role, fileName, rgba})` → `finish()` → `generateIkiFromLayerSet(layers, canvas, { turnTargets, headEdges, strandEdges, rigPlan, patches })`。
  5. 图集：`packAtlas(...)`，每个裁片的右侧和下侧按 `layout.padding` 复制边缘像素 → `new EditorDocument(model).applyAtlas({ textures, partTextureAssignments })`，其中 `partIdsOfRole(role)` 列出该图层对应的部件 → `parseIkiModel()` 校验。
  6. 自检：engine 的 `checkFolds(model)`（网格翻折）、`checkPhysics(model)`。
  7. 个性化调整用 `rigPlan`（字段见 `RIG_PLAN_FIELDS`）；对具体关键形态的修正用 `patches`。
- 官方 MCP 的实现（`@ikijs/mcp` 的 `autoRigFromLayers`）是浏览器版的参考：Node 端用 sharp 解码和打包，浏览器端用 canvas 替代。

### 4.2 See-through 的输出（V3 标签）

- 标签：`front hair, back hair, headwear, face, irides, eyebrow, eyewhite, eyelash, eyewear, ears, earwear, nose, mouth, neck, neckwear, topwear, handwear, bottomwear, legwear, footwear`（可能还有 tail、wings、objects）。
- 和 iki 图层的对应（实现见 `tools/rig.html`）：

| See-through | iki | 处理 |
|---|---|---|
| back hair + headwear | hair_back | 发带跟着后发走 |
| front hair | hair_front | 直接对应 |
| neck + ears + face | face | iki 会从 face 里切出脖子和耳朵 |
| eyewhite / irides / eyelash / eyebrow | eye / iris / lash / brow 的 `_L`、`_R` | 以脸的中线为界拆成左右，画面右侧是 `_L` |
| handwear（含袖子的整条手臂） | arm_L / arm_R | 按中线拆分 |
| legwear + bottomwear + topwear + neckwear | body | 见下面的修正 |
| nose | nose | 只有几十个像素 |
| mouth | mouth（+ mouth_open） | 拆出来太淡，改用程序绘制 |

- **在这张图上发现的缺陷和修正**（换图后可能还会遇到）：
  1. bottomwear 吞进了整块灰色背景 → 用原图白底泛洪得到人物剪影，裁掉剪影之外的部分；再只保留最大的那块不透明连通区域（alpha ≥ 200），外扩 2px。
  2. 头发和手臂后面有半透明的补画残留 → 同上。
  3. legwear 是半透明的，footwear 完全丢失 → 裙摆以下没有遮挡，直接从原图剪影取（裙摆位置：从腰线沿中线往下扫，第一次碰到背景的那一行）。
  4. 腿压在裙子上面 → body 的叠放顺序改为：腿 → 裙子 → 上衣。
  5. 嘴只有 7 个像素 → 闭嘴画成弧线，张嘴画成椭圆加舌头。
- 原图到 PSD 画布的映射：等比缩放后居中（这张图是缩放 0.707 倍，x 方向偏移 128）。
- 在线演示：魔搭 ModelScope（免费，分辨率稍高）、HuggingFace（每天 1–2 次）。本地运行需要 8–16GB 显存。用户的 RTX 4060 笔记本显卡有 8GB，可以跑 NF4 量化版，但违反"不装东西"的约束。
- 白色角色贴着白色背景，边缘容易出问题。下次可以先把背景换成浅灰色再拆。

### 4.3 浏览器和工具方面的坑

- Rigby2D region 是刚性四边形，裙摆局部形变需先转 mesh，再使用 pose.deform；每帧 reset 会清除 deform，需要重新写入。只改变腰线下方顶点可避免上衣跟着扭曲；退出脚 IK 后再混合侧坐骨骼角度。


- Rigby2D 低位拾物需要把躯干降低到手臂实际可达范围，不能只把 IK 目标放到地面；道具交接用求解后的手掌位置，并检测切换前后的跳动。收纳同时调整手臂绘制顺序及道具前后层。正面长裙素材会遮住深蹲时的膝部，因此只能视为卡通近似。


- 页面在后台（窗格隐藏）时，`img.decode()` 可能一直不返回 → 用 `createImageBitmap(await (await fetch(url)).blob())`。
- 后台页面的 rAF 会被节流，帧率数据没有意义 → 用 `avatar-validation.html` 里的 `window.__bench(n)` 同步跑 n 帧，测 CPU 侧的耗时。
- 桌面应用的 `preview_start` 曾经一直读取旧文件夹里的 launch 配置 → 直接在后台运行 `node tools/dev-server.mjs 8766`，再用浏览器打开。
- file:// 页面不能 fetch 本地文件；CDN 资源（jsDelivr 有 CORS）可以。
- 读取 PSD 用 `ag-psd@33.0.0`（`https://cdn.jsdelivr.net/npm/ag-psd@33.0.0/+esm`），返回的图层树里每层带 `canvas`，以及 `left` / `top` / `right` / `bottom`。

### 4.4 验证页里已有的可复用代码（`avatar-validation.html`）

- `Character`：iki 适配器的雏形（加载、视图、`toStage` 坐标换算、`head()` 头部位置、`base()`、`setOffset`）
- `Blender`：状态的目标参数 → 平滑混合到人物上
- `FxLayer` + `FX`：Zzz、气泡（? !）、闪光、烟雾、飞书；`pile` 书堆（前后两层"三明治"）
- `director`：状态机（idle / doze / wake / thinking / found / talking），包含最短展示时长、姿态切换、情绪标签解析、伪口型
- 主循环：自己控制帧率、瞌睡时降到 15fps、页面隐藏时暂停、性能统计

这些是验证用的代码，正式开发时要拆成模块并整理（第 5.1 节）。

---

## 5. 开发路线

各阶段大体按顺序进行；5.3 / 5.4 / 5.5 之间相互独立，可以并行。**每个阶段都要在用户的 Edge 里实际看过效果才算完成。**

### 5.1 阶段 1：工程化骨架

**目标**：把验证页的代码拆成可维护的模块，保持"零构建、零安装"。

- 目录建议：`src/character/`（接口和 iki 适配器）、`src/director/`、`src/fx/`、`src/app/`（对话页面）、`assets/`（模型、特效素材）
- 原生 ES Modules + importmap + **CDN 锁定精确版本**；同时把依赖下载一份到 `vendor/`，以防 CDN 不可用（提供开关）
- 如果确实需要 TypeScript，用 JSDoc 加 `// @ts-check` 做类型检查，不引入构建步骤。要引入 Vite 等构建工具，**先征得用户同意**
- `dev-server.mjs` 继续使用

**验收**：验证页的全部功能在新结构下照常运行；任何页面都不需要 `npm install` 就能打开。

**参考**：MDN [Import maps](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap)；jsDelivr 的 npm 和 GitHub 镜像用法。

### 5.2 阶段 2：人物层接口和 iki 适配器

**目标**：调度器只依赖 `CharacterLayer` 接口；iki 的所有细节都封装在适配器里。

```ts
interface CharacterLayer {
  load(url): Promise<void>; destroy(): void           // 必须真正释放 WebGL 资源
  update(nowMs): void; render(): void                  // 由宿主的循环驱动
  setParam(id, value): void; getParam(id): number
  playExpression(id | null): void; playMotion(group, index): void
  expressions: string[]; motions: string[]
  anchor(name: 'head' | 'mouth' | 'hand_L' | 'hand_R'): { x, y, scale }   // 舞台坐标，给特效定位
  setVisible(v): void; setOpacity(a): void; setOffset(px): void
  on(event: 'loaded' | 'motionEnd', cb): void
}
```

- 封装帧率控制和像素比上限（不依赖修改 window 的临时办法；必要时给 iki 提 issue，或局部 fork）
- 锚点：用部件的变换和变形器求出实际位置，替代现在 `head()` 里的近似值
- 资源生命周期：加载、预加载、`destroy()` 后显存确实被回收（在 Edge 的任务管理器里核对）

**验收**：用 iki 示例模型和自己的模型都能跑；连续切换 50 次模型，内存和显存不增长。

**参考**：
- iki 仓库 https://github.com/zeikar/iki（`packages/engine` 的 IkiPlayer、IkiMotion、ROADMAP.md）
- iki 在线演示 https://zeikar.dev/iki/playground/
- Charivo 的 render-iki 适配器 https://github.com/zeikar/charivo （iki 作者自己的宿主实现）

### 5.3 阶段 3：调度器和外部接口

**目标**：一份明确的状态规格 + 实现 + 对外 API。

- 状态：`idle, doze, wake, listening`（用户正在输入）`, thinking, found, talking`，以及可扩展的自定义状态
- 每个状态定义：姿态模型、表情、参数覆盖（目标值和混合速率）、特效（进入、循环、退出）、转场方式、最短时长、可以被哪些事件打断
- 对外 API（保持现在的形式）：`avatar.setState()`、`avatar.resolve(text)`、`avatar.setExpression()`、`avatar.playMotion()`、`avatar.activity()`、`avatar.on(event, cb)`
- 状态配置写成数据（JSON），不写死在代码里，方便新增动作
- 现有的参数值（瞌睡、翻书时的头部角度、手臂摆动等）都在 `avatar-validation.html` 的 `director.update` 里，可以直接作为初始配置

**验收**：表驱动的状态配置；所有打断组合（秒回、连续发送、说话中又发送、瞌睡中发送）都有确定的行为，并有测试页能逐一触发。

**参考**：
- Duolingo 角色的状态机思路（Rive 状态机文档 https://rive.app/docs/editor/state-machine ，只借鉴设计，不使用 Rive）
- 开源 AI 伴侣的情绪标签驱动表情：airi https://github.com/moeru-ai/airi 、Open-LLM-VTuber https://github.com/Open-LLM-VTuber/Open-LLM-VTuber
- VPet 的动作和状态组织方式 https://github.com/LorisYounger/VPet

### 5.4 阶段 4：特效和道具层

**目标**：一套统一的特效系统，可以无限增加特效，也可以替换成精美素材。

- 特效类型：程序化粒子（现有的 Zzz、气泡、闪光、烟雾、飞书）、**序列帧播放器**（WebP 精灵图，和人物共用同一个时钟，帧级精确）、**透明 WebM 播放器**（VP9 alpha，用 `requestVideoFrameCallback` 同步，提前加载并停在第一帧）、可选的 Lottie
- 统一结构：每个特效包含"进入、循环、退出"三段，有锚点（舞台坐标或人物锚点），放在前层或后层
- 资源规范：序列帧单张不超过 2048；同时播放的视频不超过 2–3 个；用完释放
- 素材来源（免费）：我们自己用程序或 SVG 绘制；或者用户在免费 AI 工具里跑提示词生成，再用 RIFE 等工具离线插帧（注意透明通道要单独插）
- 转场库：烟雾、挤压拉伸、速度线、快速交叉淡化

**验收**：新增一个特效只需要"一份素材 + 一段配置"；同时播放 3 个视频特效时，单帧耗时小于 2ms。

**参考**：
- MDN [requestVideoFrameCallback](https://developer.mozilla.org/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- Chrome 的透明 WebM（VP9 alpha），用 ffmpeg 编码：`-c:v libvpx-vp9 -pix_fmt yuva420p`
- 可选：dotLottie https://github.com/LottieFiles/dotlottie-web 、Glaxnimate（免费的 Lottie 编辑器）

### 5.5 阶段 5：美术管线改进（主模型）

**目标**：提高模型质量，补全口型和眉毛。

1. **分辨率**：把原图裁成"头部到胸口"单独拆一次，得到高精度的脸部图层，再按位置合回全身拆层结果；或者在在线演示里选择更高的分辨率。
2. **嘴**：请用户用 AI 改图生成"只把嘴张开"的版本（提示词见第 6 节），从差异区域提取 `mouth_open`；最好能拆出唇组（`mouth_inner`、`lip_*`、`teeth`、`tongue`），用上 iki 的折叠式口型。
3. **眉毛**：在 rig.html 里把眉毛提取得更饱满，或者生成"把刘海稍微剪短、露出眉毛"的版本，只取眉毛部分。
4. **腮红**：程序生成 `blush_L/R`（椭圆形的淡粉色渐变），这样就有 shy 表情和 `ParamCheek`。
5. **手臂**：拆出 `forearm_pose_L/R`（另外画一张抬起的前臂），获得 Wave 等手势。
6. **`rigPlan` 调参**：转头幅度、头发跟随、眨眼程度、头发摆动幅度。对照 `work/rig-check/` 的姿态检查图调整。
7. 把 `tools/rig.html` 的修正步骤做成可配置的（每张图的问题不一样），检查图要包含修正前后的对比。

**验收**：头部特写放大到 2 倍不糊；说话时能看出明显的口型变化；眉毛能表达情绪。

**参考**：
- See-through https://github.com/shitagaki-lab/see-through （论文 arXiv:2602.03749，`inference/scripts/heuristic_partseg.py` 里有左右和深度拆分的思路）
- 魔搭在线演示 https://modelscope.cn/studios/ljsabc/See-Through
- HuggingFace 在线演示 https://huggingface.co/spaces/24yearsold/see-through-demo
- 备选的拆层模型：Qwen-Image-Layered https://github.com/QwenLM/Qwen-Image-Layered
- iki 编辑器 https://zeikar.dev/iki/editor/ （可以导入 PSD，手工调变形器）
- ag-psd https://github.com/Agamnentzar/ag-psd

### 5.6 阶段 6：姿态模型

**目标**：用于大幅动作的姿态模型，比如"蹲在书堆旁翻书""趴着睡觉""举手欢呼"。

- 以主图为参考，用 AI 生成姿态图，道具直接画进图里（提示词模板见第 6 节）
- 姿态图可以简化绑定：只需要眨眼、呼吸、表情、头部微动。非正面的姿态如果拆层效果差，可以退化为"只单独切出眼睛和嘴 + 整体呼吸"，类似 PNGTuber 的做法
- **所有姿态模型使用同一套参数名**，这样表情和口型在切换时能连续
- 按需加载；根据状态机预测下一个可能的姿态并预加载；不用的姿态模型要释放
- **最大的风险是人物一致性**：发型细节、服装、配色要和主图对得上。设计越简洁，越容易保持一致

**验收**：翻书姿态切换时人物看起来是同一个人；切换时看不出破绽；切换时没有加载卡顿。

**参考**：
- 视觉小说的立绘差分组织：WebGAL https://github.com/OpenWebGAL/WebGAL
- 轻量的 PNGTuber 做法：https://github.com/rotejin/PuruPuruPNGTuber 、https://github.com/rotejin/MotionPNGTuber_Player

### 5.7 阶段 7：对话集成（外语练习）

**目标**：真正接上大模型和语音。

- 大模型：用哪家服务还没定，**需要问用户**。如果用 Claude，默认用最新的模型（例如 `claude-sonnet-5-5`）。系统提示词要求回复开头带情绪标签 `[smile]` 等，取值必须在模型的表情列表里。
- 流式输出：收到第一个 token 就 `resolve()`，进入说话状态，同时逐字显示文本
- TTS：浏览器自带的 `speechSynthesis`（免费，但拿不到音量）；或者用能返回音频的 TTS 服务，再用 Web Audio 的 `AnalyserNode` 按音量驱动 `ParamMouthOpenY`
- 用户输入时调用 `avatar.activity()`；可选的语音输入
- 外语练习功能（纠错、角色扮演话题）属于产品设计，和用户商量后再做

**验收**：一次完整的对话里，等待、瞌睡、翻书、说话的切换全部由真实事件驱动，口型和语音对得上。

**参考**：
- MDN [AnalyserNode](https://developer.mozilla.org/docs/Web/API/AnalyserNode)、[SpeechSynthesis](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)
- airi（大模型、TTS 和角色的联动）https://github.com/moeru-ai/airi
- Open-LLM-VTuber（语音打断、口型）https://github.com/Open-LLM-VTuber/Open-LLM-VTuber
- Charivo（TypeScript 的 LLM、TTS、STT 框架，和 iki 配套）https://github.com/zeikar/charivo

### 5.8 阶段 8：性能和发布

**性能预算**（在用户的 Edge 里实测，包括几年前的轻薄本）：

| 指标 | 预算 |
|---|---|
| 主线程每帧 | 平均 < 1ms，峰值 < 4ms |
| 帧率 | 默认 30fps；瞌睡、静止时 15fps；页面不可见时停止 |
| 首屏下载 | < 2MB（引擎 + 主模型 + 待机素材） |
| 常驻显存 | < 64MB（主模型 + 常用特效）；姿态模型按需加载、用完释放 |
| 像素比 | 上限 2 |

- 角色滚出视口时停止渲染（IntersectionObserver）
- 可选：用 OffscreenCanvas 加 Worker 把渲染移出主线程（iki 依赖 `canvas.clientWidth`，需要适配）
- 发布：纯静态网站，任何静态托管都可以
- 授权：iki（MIT）、See-through（Apache-2.0）、ag-psd（MIT）；**角色形象如果公开发布，要改成原创衍生**

**参考**：MDN [IntersectionObserver](https://developer.mozilla.org/docs/Web/API/Intersection_Observer_API)、[OffscreenCanvas](https://developer.mozilla.org/docs/Web/API/OffscreenCanvas)、[Page Visibility](https://developer.mozilla.org/docs/Web/API/Page_Visibility_API)。

---

## 6. 素材提示词模板

### 6.1 主图要求（已经用过，生成新角色时沿用）

全身、严格正面、左右对称、双臂下垂并和身体留出空隙、空手、双马尾或长发垂在肩膀后面、刘海不要遮住眼睛和眉毛（这次的眉毛就被盖住了）、表情平静、睁眼直视、闭嘴、纯色背景（建议浅灰色而不是白色）、平涂上色、长边 ≥ 1280px。

### 6.2 张嘴版本（AI 改图，以主图为输入）

```
Edit this image. Keep EVERYTHING identical — same character, pose, hair, outfit, colors,
lineart, lighting, framing and background, pixel-aligned with the original.
Change ONLY the mouth: open it in a relaxed speaking "ah" shape,
small dark mouth interior with a little visible tongue, no teeth showing.
Do not change the eyes, eyebrows, face shape or anything else.
```

### 6.3 姿态图（以主图为参考）

```
Same character as the reference image (identical face, hair, twin tails with black ribbons,
white dress with black trim, colors and art style), [姿态描述，例如：
crouching beside a messy pile of books on the floor, holding an open book with both hands,
looking down at the book with a focused expression],
full body in frame, the character and props only, plain light gray background,
flat cel shading, clean lineart, no text, no watermark.
```

不论什么姿态，眼睛和嘴都要清晰可见，方便绑定眨眼和口型。

---

## 7. 待决事项（需要问用户）

1. 大模型和 TTS 用哪家服务（会影响费用和口型方案）
2. 目标外语和练习形式（自由对话、纠错、场景角色扮演）
3. 角色是否会公开发布（决定是否必须改成原创形象）
4. 首批要做的姿态和特效清单（目前只有：等待、瞌睡、惊醒、翻书、找到、说话）
5. 是否接受引入构建工具（目前是零构建）

## 8. 交接约定

- 用户以中文交流；代码注释用中文，风格和现有文件保持一致
- 用户不希望安装软件；需要新依赖时优先用 CDN 并锁定精确版本，否则先问用户
- 生成物放在 `work/` 下面，都可以用工具重新生成；用户提供的原图和 PSD 不要改动
- 每完成一个阶段，在第 3 节更新现状，并把新踩到的坑补进第 4 节
