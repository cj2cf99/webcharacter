# 绯月本地 ComfyUI 工作流与「本地生图」Web 页交接文档（2026-11-26 JST）

## 1. 本次已完成内容

### 1.1 F 盘本地 ComfyUI 工作流（RTX 4060 Laptop 8GB 显存）
- **目录**：`F:\feiyue-comfy-workflows\`
- **模型基线**（复用 `F:\Comfy-Desktop\ComfyUI-Shared\models` 已有模型，全原生内置节点）：
  - `fibo2_edit_turbo_int8_convrot.safetensors`
  - `qwen3vl_4b_int8_convrot.safetensors`（`type: fibo2`）
  - `flux2-vae.safetensors`
- **运行脚本**：[feiyue_comfy.py](file:///F:/feiyue-comfy-workflows/feiyue_comfy.py)
  - 支持 `outfit`（换衣）和 `pose`（换动作）两种模式；
  - 支持 `anime`（2D 卡通风，默认）、`impasto`（厚涂风）、`chibi`（标准 2 头身 Q 版，严格继承基准图服装与饰品并去除素体关节线）；
  - 强制输出标准纯绿幕（`#00FF00`）；
  - 支持 `--system-prompt-file` 和 `--negative-prompt-file` 传入自定义系统/负面提示词。
- **图形化工作流 JSON**（存放于 `F:\feiyue-comfy-workflows\workflows\`，并已同步至 `F:\Comfy-Desktop\ComfyUI-Installs\local\ComfyUI\user\default\workflows\`）：
  - `绯月-1-换衣工作流(标准绿幕-卡通风-8GB).json`
  - `绯月-1-换衣工作流(标准绿幕-厚涂风-8GB).json`
  - `绯月-2-换动作工作流(标准绿幕-卡通风-8GB).json`
  - `绯月-2-换动作工作流(标准绿幕-厚涂风-8GB).json`
- **基准图备份**：`F:\feiyue-comfy-workflows\feiyue_chibi_base.jpg`（同步于 `F:\Comfy-Desktop\ComfyUI-Shared\input\feiyue_chibi_base.jpg`）。
- **调用文档**：[FEIYUE_COMFY_WORKFLOWS.md](file:///g:/selftool/WebCharacter/docs/FEIYUE_COMFY_WORKFLOWS.md)、[README.md](file:///F:/feiyue-comfy-workflows/README.md)。

### 1.2 「本地生图」Web 页（集成于 `G:\selftool\webmcreator`）
- **访问入口**：`http://127.0.0.1:8766/#local`（位于顶部导航「Gemini 生图」旁）。
- **涉及改动**：
  - [server.mjs](file:///G:/selftool/webmcreator/server.mjs)：新增 `GET /api/local-comfy/presets`、`POST /api/local-comfy`、`GET /api/local-comfy/:id`（单任务互斥，调用 `feiyue_comfy.py` 并将结果保存至 `data/gemini/`）。
  - [index.html](file:///G:/selftool/webmcreator/public/index.html)、[style.css](file:///G:/selftool/webmcreator/public/style.css)、[app.js](file:///G:/selftool/webmcreator/public/app.js)：新增 `#page-local` 页签，含图 1 人物参考、图 2 图像参考（衣服/姿势，支持上传/拖入/`Ctrl+V` 粘贴）、4 段核心预设 + 标准 Q 版切换、追加提示词输入框、可编辑系统提示词输入框（带重置预设）、参数保留（`megapixels`/`steps`/`sizeFrom`/`seed`），以及结果卡片（放大预览、送去切图、设为图 1 串联、下载、再生成）。
  - [animation-maker.mjs](file:///g:/selftool/WebCharacter/personal-digital-companion/desktop/animation-maker.mjs)：`TABS` 白名单新增 `'local'`。

---

## 2. 已验证记录与当前运行状态

- **脚本实测出图**（`F:\feiyue-comfy-workflows\test_out\`）：
  - `outfit_test.png`（换衣 · 厚涂风，85.23s，672×1008）
  - `outfit_anime_test.png`（换衣 · 2D 卡通风，39.18s，672×1008）
  - `pose_test_v2.png`（换动作 · 厚涂风，39.09s，672×1008）
  - `feiyue_chibi_bow_v3.png`（Q 版基准图 + 鞠躬素体参考图，37.97s，672×1008）
- **代码与接口校验**：
  - `node --check` 校验 `server.mjs`、`public/app.js`、`animation-maker.mjs` 全部通过。
  - `node G:\selftool\webmcreator\tools\test-core.mjs` 核心测试 `4/4` 通过。
  - `GET /api/status` 与 `GET /api/local-comfy/presets` 实测返回正常（5 个预设就绪）。
- **当前运行服务**：`node G:\selftool\webmcreator\server.mjs` 已作为后台守护进程运行在 `http://127.0.0.1:8766/`。

---

## 3. 未完成 / 待后续接手事项

1. **浏览器端真实 UI 操作验证**：尚未在真实浏览器中点击 `#local` 页签跑通一次完整的前端提交到出图闭环，待用户在 [http://127.0.0.1:8766/#local](http://127.0.0.1:8766/#local) 实测或由后续会话通过浏览器验证。
2. **Git 提交状态**：`WebCharacter` 与 `webmcreator` 本次修改（及两仓库中原有未提交改动）均**尚未提交 Git / 未推送**。
3. **正式版同步**：`personal-digital-companion/desktop/animation-maker.mjs` 的改动尚未同步到 Windows 正式安装版目录（如需从绯月菜单直接打开 `#local` 再安排安装）。

> 2026-11-26 JST 后续：上述第 1 项已在浏览器实际生成一次（47.3 秒，672×1008，控制台无报错）；第 3 项已安装，菜单新增「动画生成器 → 本地生图」；两仓库随后提交推送。见 `personal-digital-companion/RELEASE_REVIEW.md`。
