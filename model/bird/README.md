# 极乐鸟模型结构预览

当前前颈与胸羽：局部补足前颈、修正颈羽埋入体表的法线问题；常态胸羽沿胸口收拢贴伏，展示扇面保留，四阶段接口不变。新窗口 MCP 9877 已更新，当前查看 `chest-fold-comparison.png`、`neck-comparison.png` 与更新后的头部/整体图。保存资产检查增加 612 个前颈外法线样本和全胸羽贴体距离/收拢宽度/展开保留验证。详见 `docs/reviews/BIRD_NECK_CHEST_REVIEW_2026-11-15.md`；以下旧轮次的“常态扇面”不代表当前实现。

当前模型：根据最新要求降低喙尖，闭合喙缝抬角约 5.36°，收薄喙与下颌前段，补细外部喙缝和短额羽。上下喙独立、四阶段保留；新窗口 MCP 9877 已更新。当前查看 `root-refine-comparison.png` / `root-refine-views.png` 或更新的 `head-views.png`，之前 `bill-*` / `strict-head-*` 属历史。喉部主体硬边仍残留、外观未验收；详见 `docs/reviews/BIRD_ROOT_AND_PITCH_REVIEW_2026-11-15.md`。

最新头部纠偏：前次嘴形与扁头被用户否决，现恢复头部高度，喙缝改直线、上背改单段平顺曲线，保留窄喙和独立部件。最新图为 `strict-head-side/front/three/top.png`、更新的头部五向和 `rest-three.png`；旧 `bill-*` 不代表当前模型。按用户要求另开 Blender，通过独立 MCP 9877 核对本轮文件。三轮后仍有喙根接合生硬/羽片规则感，外观未验收；详见 `docs/reviews/BIRD_HEAD_REALIGN_REVIEW_2026-11-15.md`。

当前第四批按用户提供的三视图、动画拆分图与头部外形图调整，补臀尾连续过渡。沿用四阶段形态键，不开发新动作。正式源码 `build_model.py` 不依赖 work 内的旧粗模；已有本机 Blender 5.2.4 LTS，无需安装新库。

第三批按用户最新要求优先修正常态的鸟类比例、贴体折翼、胸羽和关节脚；模型保存为 **stage=0 常态**，默认相机为常态斜侧视图。打开文件后 3D 区域为相机材质预览；F12 使用场景灯光渲染。原先默认完全展开的文件状态已替代，四阶段接口仍保留。

## 重建与查看

在 `G:/selftool/WebCharacter` 执行（后台独立场景，不操作已打开的 Blender）：

```powershell
& G:/blender/app/blender.exe --background --factory-startup --python-exit-code 1 --python model/bird/build_model.py -- --preview
```

输出：`work/bird-model/bird-model.blend`、七阶段正侧渲染、多视图和 `validation.json`。生成物在 Git 忽略目录，正式源码不在忽略目录。

第二批迭代另外生成 `head-detail.png`；验证在 13 个阶段采样中检查实际胸盾羽根到身体网格表面的距离。排版脚本可生成 `plumage-details.png`，本地存在首版归档时生成 `iteration-comparison.png`。连续身体截面和经线距离布羽借鉴参考项目的方法，模型仍可通过既有接口变形；未迁移参考项目的应用或动作系统。

第三批增加 `rest-front.png` / `rest-side.png` / `rest-three.png`，排版为 `rest-views.png`；`realism-comparison.png` 与上一批使用相同灯光、相机、画幅和比例比较，不按不同主体大小分别缩放。上一批源码与图在本地 `work/bird-model/iteration-2/`。本轮形态采样同时检查变形网格不穿过脚底基准平面；脚底保持位置不代表已经完成步态/地面接触物理验证。

第四批修订：新三视图使用浅色纸背景，环境照明值保留；画幅为新参考重新构图。旧比较排版仅作历史对照，不再标注同相机/比例。`turnaround.png` 是当前正、侧、背视图。前批源码、渲染及修改前 MCP 场景副本留存于 `work/bird-model/iteration-3/`。

用户参考的长尾下垂至脚部挂点以下；当前没有地面，因此第四批只对非尾羽身体检查脚底基准，不沿用上段历史版本的全模型“低于脚底即穿地”判断。未来地面接触仍需按真实场景验证。

## 动画拆分与绑定准备

| 部件 | 实际网格 / 分组 | 后续绑定用途 |
| --- | --- | --- |
| 连续体表 | `M_Body`，`Torso` / `Neck` / `Head` 归一权重 | 保持头颈胸腹连续，后续骨骼可独立分区影响 |
| 身体羽区 | `M_TorsoFeathers`、`M_HeadNeckFeathers`，同名权重 | 羽毛随对应体表部位变化 |
| 头冠与眼 | `M_Crown`、`M_EyeL/R`、`M_EyelidUpperL/R`、`M_EyelidLowerL/R`、隐藏展示眼点 | 外表瞳孔/棕色虹膜/暗外缘；上下眼睑独立，常态展示眼点隐藏 |
| 喙 | `M_BeakUpper`、`M_BeakLower` | 原点在喙根，两个独立网格可分别绑定 |
| 双翼 | `M_ShoulderL/R`、`M_CovertsL/R`、`M_SecondariesL/R`、`M_PrimariesL/R` | 肩羽、覆羽、次级及主飞羽独立；左右逐羽组使用 `.L` / `.R` 后缀 |
| 披肩与胸盾 | `M_CapeL/R`、`M_Breastplate` | 保留四阶段形态键；胸盾 `BodyAttachment` 标记接体根点 |
| 尾羽 | `M_Tail`，`Tail_01`..`Tail_10` | 十根尾羽可分组绑定，物体原点位于尾根 |
| 臀尾过渡 | `M_TailBase`、`M_RumpCoverts`、`M_UndertailCoverts` | 有体积的尾根与上下尾覆羽；覆羽保留 `Torso` / `TailBase` 权重和 `BodyRootAttachment` 根点 |
| 腿足 | 双腿、双脚、双爪，`M_ThighFeathers` | 羽腿上段随身体，脚部保留挂点基准 |

生成的 `animation-parts.json` 列出每个网格的绑定姿态原点、权重组、形态键及逐飞羽/尾羽根点（模型坐标）。不逐羽创建对象，不提前搭完整骨架、IK、展翅或步态系统。

**这是收拢绑定姿态的结构准备，不是完成的动画 rig。** 对象原点和逐羽根点作为未来绑定输入；当前形态键驱动几何四阶段，不保证在任意形态值叠加对象旋转能替代骨骼层级。构建验证会检查权重和左右分组，另可重新打开保存模型验证下喙独立转动：

```powershell
& G:/blender/app/blender.exe --background work/bird-model/bird-model.blend --python-exit-code 1 --python model/bird/verify_saved.py
```

测试会恢复临时转动且不保存，结果写入 `work/bird-model/saved-model-check.json`。

用户随后指出臀尾平截插接；已优先收束身体末端、补体积尾根及上下尾覆羽，按同一尾轴排布，避免形成分叉副尾。构建会在 13 个形态采样中检查两组覆羽根点到身体表面的距离。`rump-detail.png` 是该局部近景；最终实际窗口通过 Blender MCP 重新载入核对。

最新头部参考只落实外部结构：收紧额头/下颌，连续锥形喙、喙缝与浅表鼻孔，短密面羽、贴伏蓝色冠羽、外表眼睛和独立眼睑。没有制作内部解剖。`head-left/front/right/three/back.png` 为多角度近景，`head-views.png` 为排版；保存资产检查包含眼部材质分区和眼睑独立性。

用户再次指出嘴形不符后，喙改为分段连续截面：上喙弧背、轻微下扣尖端、薄而略短的下喙、后延嘴角，并收顺接喙处下颌。`bill-comparison.png` 是与修改前保存模型的同相机/灯光对比，`bill-views.png` 检查侧/斜侧/正/俯视；仍为两个独立网格与原阶段接口，没有口腔内部。

首次同条件基线对比可追加 `--baseline work/bird-blender/build_scene.py`；该选项只用于本机历史粗模对比，主模型重建不需要它。旧粗模基线 SHA-256 见设计复核报告。基线和新模型使用同一预览灯光、相机、画幅和色彩管理，不复用旧舞台渲染冒充对比。

生成对比排版（需已有 before-* 基线渲染；仅调用 Windows 自带 System.Drawing）：

```powershell
& ./model/bird/make_preview.ps1
```

打开生成的 `.blend` 可直接检查和修改各部位网格、材质、形态键。打开文件不会自动执行脚本。形态键为相对链：Basis → S1 → S2 → S3；阶段 2 需要 S1=1、S2=1、S3=0，阶段 3 三者均为 1。

## 动画接口

脚本中的 `set_stage(stage, frame=None)`、`PARTS` 和 `Male` 根节点保留旧约定。后续动画程序可以用下面方式加载源码并重建独立场景，再沿用阶段调用（执行前保存手上的场景；`main()` 会清空当前场景）：

```python
import importlib.util
spec = importlib.util.spec_from_file_location('bird_model', 'G:/selftool/WebCharacter/model/bird/build_model.py')
bird = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bird)
bird.main()
bird.set_stage(1.5)              # 连续形态
bird.set_stage(3, frame=60)      # 插入形态键关键帧
```

`Male` 控制整体位置和转向，分区对象保留。没有建立骨架或逐羽控制器。旧 `animate.py` 未接入验证；完整求偶动画、网页导出和浏览器性能不在本轮验证结论中。
