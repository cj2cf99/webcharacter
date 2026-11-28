# 绯月抽卡 · 第 2 轮复审与合规性检查报告（2026-11-28 JST）

状态：**待用户确认**  
结论：**有条件通过**（第 1 轮问题 C-1/C-2/C-3 整改总体到位，单元测试、桌面壳、抽卡 Electron 及浅/深色公共截图巡检均已实测通过；本轮新发现 3 项低级别问题/建议，其中 R2-1 为本次 `paste` 改动引入的边界缺陷，其余为资源释放与巡检覆盖建议；正式安装前仍保留既有实机出图、回收站、气泡与 `RELEASE_REVIEW.md` 放行条件）

---

## 1. 审核对象与范围

- **整改响应记录**：[CARD_DRAW_COMPLIANCE_RESPONSE_2026-11-28.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/reviews/CARD_DRAW_COMPLIANCE_RESPONSE_2026-11-28.md)（对应第 1 轮报告 [CARD_DRAW_COMPLIANCE_REVIEW_2026-11-28.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/reviews/CARD_DRAW_COMPLIANCE_REVIEW_2026-11-28.md)）
- **本轮工作区变更文件**：
  - [card-draw-ui.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/card-draw-ui.mjs)
  - [CARD_DRAW_DESIGN.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/CARD_DRAW_DESIGN.md)
  - [HANDOFF_CARD_DRAW_2026-11-28.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/HANDOFF_CARD_DRAW_2026-11-28.md)
  - [menu-panel-capture.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/tools/menu-panel-capture.mjs)
  - [test-card-draw-electron.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/tools/test-card-draw-electron.mjs)
- **对照基线文档**：[CARD_DRAW_REQUIREMENTS.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/CARD_DRAW_REQUIREMENTS.md)（R1–R21）、[CARD_DRAW_DESIGN.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/CARD_DRAW_DESIGN.md)、[AGENTS.md](file:///G:/selftool/WebCharacter/personal-digital-companion/AGENTS.md)、全局最简设计及「审核修改建议与接受审核评估规则（2026-11-28 JST）」。

---

## 2. 基线信息

- **仓库**：`G:\selftool\WebCharacter`
- **分支**：`codex/workspace-checkpoint-20261120`
- **HEAD**：`3bf0629`（`docs: 抽卡功能交接记录`；功能提交 `b546400`）
- **工作区状态**：含上述 5 个已修改未提交文件，以及 2 个未跟踪审核记录文件（`docs/reviews/CARD_DRAW_COMPLIANCE_REVIEW_2026-11-28.md`、`docs/reviews/CARD_DRAW_COMPLIANCE_RESPONSE_2026-11-28.md`）；仓库根目录下原有未跟踪文件 `?? ../=` 未改动。
- **构建产物一致性实测**：`desktop/card-draw-ui.mjs` 与 `output/desktop-bundle/card-draw-ui.mjs` SHA-256 均为 `f66207945fda091a70096d28e4d175c51d3b85133dbc703fd13f6aa8167c7435`（构建产物已同步）。

---

## 3. 审核方式

1. 阅读整改响应记录及本轮 5 个修改文件的完整 `git diff`，逐行对照需求 R1–R21、设计与 `AGENTS.md`。
2. 核对 [shell.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/shell.mjs#L1150-L1173) 的菜单组装与加载处理，复核对方对 C-3 异议的依据。
3. 核对源码与 `output/desktop-bundle/` 产物哈希一致性。
4. 在 `G:\selftool\WebCharacter\personal-digital-companion` 下独立复跑单元测试、桌面壳测试、抽卡 Electron 隔离检查、公共截图巡检（浅色 + 深色）及 `git diff --check`。
5. 按 2026-11-28 新增全局规则，对本轮新发现的问题逐项定位具体修改点并给出可落地的修改建议。

---

## 4. 实际执行的命令与原样摘要

| 命令 | 结果 | 原样摘要 |
| --- | --- | --- |
| `node -e` 核对 `desktop/card-draw-ui.mjs` 与 `output/desktop-bundle/card-draw-ui.mjs` SHA-256 | 通过 | 两者均为 `f66207945fda091a70096d28e4d175c51d3b85133dbc703fd13f6aa8167c7435` |
| `node --test --test-timeout=30000 agent/tests/card-draw.test.mjs` | 通过 | `tests 12 / pass 12 / fail 0 / duration_ms 518.0376` |
| `node tools/test-desktop-shell.mjs` | 通过 | 7 项 `PASS`（桌面壳、托盘、权限、导航、外联拦截等） |
| `node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-card-draw-electron.mjs` | 通过 | `PASS：抽卡窗口隔离检查，截图在 G:\selftool\WebCharacter\personal-digital-companion\output\card-draw-qa`（含无扩展名选择与粘贴用例） |
| `node desktop/node_modules/electron/cli.js tools/capture-menu-panels-electron.mjs` | 通过 | `截图已写入 G:\selftool\WebCharacter\personal-digital-companion\output\menu-qa` |
| `node desktop/node_modules/electron/cli.js tools/capture-menu-panels-electron.mjs --dark` | 通过 | `截图已写入 G:\selftool\WebCharacter\personal-digital-companion\output\menu-qa`（生成 `card-draw-{setup,cards}{,-360}-{light,dark}.png` 共 8 张） |
| `git diff --check` | 通过 | 无输出 |

**未执行项及原因**：
- 全量 Agent 测试（`agent/tests/*.test.mjs`）：本轮未修改主进程与 Agent 代码，既有 31 项无关失败已于前序报告记录，未重复全量跑批。
- 标题栏测试（`test-panel-titlebar-electron.mjs`）与菜单首击检查（`test-menu-first-show-electron.mjs`）：本轮未改动标题栏、主进程或菜单配置代码，已于上轮通过，本次未重复执行。
- 真实 OpenAI API 密钥出图与计费、`gpt-image-2.6-sunburst` 的 2048×2048 实测、真实回收站（`shell.trashItem`）与头顶气泡实机观感：按规则代理不使用用户真实密钥，留待安装后由用户实机验收。

---

## 5. 上轮发现项（C-1 / C-2 / C-3）复核结论

| 编号 | 复核结论 | 说明 |
| --- | --- | --- |
| C-1 | **原问题已修，引入新边界缺陷（转入 R2-1）** | 无扩展名/空 MIME 参考图的选择与粘贴已可正常加载，且在 `test-card-draw-electron.mjs` 补齐两项实测；但 `paste` 放宽为 `!item.type` 后存在多文件顺序与 `#prompt` 文本粘贴误拦边界，另列为本轮 R2-1。 |
| C-2 | **已关闭**（细节建议转入 R2-3） | 抽卡面板已按 `AGENTS.md` 纳入 `tools/menu-panel-capture.mjs`，浅/深色默认宽（760×800）与窄屏（360×640）均实测生成截图且断言无横向滚动；未覆盖 `hd` 页签的细节作为低级别观察项记录于 R2-3。 |
| C-3 | **认可异议，已关闭** | 核对 `desktop/shell.mjs` 第 1163 行 `menuTemplate(candidate, actions)` 与热加载异常处理：旧进程热加载新菜单会因不认识 `cardDraw` 抛错而保留旧菜单，不会出现可点但无动作的「抽卡」项；新菜单配旧主进程启动则会整体回退基础菜单。更新后的 [HANDOFF_CARD_DRAW_2026-11-28.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/HANDOFF_CARD_DRAW_2026-11-28.md#L93-L97) 后果说明准确。 |

---

## 6. 本轮发现清单（含明确修改点与修改建议）

### R2-1（低 / 逻辑边界，本次改动引入）

- **修改点**：[card-draw-ui.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/card-draw-ui.mjs#L126-L131)（`addEventListener('paste', ...)`）
- **描述与证据**：
  1. 第 127 行 `[...event.clipboardData.files].find(item=>!item.type||item.type.startsWith('image/'))` 在一次粘贴多个文件且首个文件为无扩展名非图片、第二个文件为图片时，会优先命中首个无类型文件并在后续解码失败报红错。
  2. 当焦点位于 `#prompt` 文本输入框时，若剪贴板同时包含纯文本与无类型文件/附件，第 128–130 行仍会匹配参考图槽并执行 `event.preventDefault()`，阻断正常的提示词文本粘贴（注：原本 `item.type.startsWith('image/')` 在富文本/图文混贴时也存在类似倾向，放宽 `!item.type` 后触发面进一步扩大）。
  3. 缺少 `event.clipboardData?.files` 与 `document.activeElement?.closest` 的安全链访问（仅理论空值保护）。
- **影响**：常规单张截图粘贴不受影响；在提示词框粘贴带附件内容，或从系统复制含无扩展名非图片的多文件粘贴时，可能出现文本粘贴被拦或槽位误报 `✕ 读不了`。
- **可落地修改建议**：优先放行提示词输入框内的文本粘贴，并将文件查找改为「先匹配明确 `image/*`，找不到再回退 `!item.type`」：
  ```js
  addEventListener('paste',event=>{
    if(tab!=='setup'||$('dialog[open]'))return;
    const files=[...(event.clipboardData?.files??[])];
    if(document.activeElement?.id==='prompt'&&event.clipboardData?.getData('text'))return;
    const file=files.find(item=>item.type.startsWith('image/'))||files.find(item=>!item.type);
    if(!file)return;
    const slot=document.activeElement?.closest?.('.pic')||hovered||$$('.pic').find(item=>!S?.refs[item.dataset.slot]);
    if(slot){event.preventDefault();void loadPic(slot,file);}
  });
  ```

### R2-2（低 / 资源释放与错误提示一致性）

- **修改点**：[card-draw-ui.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/desktop/card-draw-ui.mjs#L102-L110)（`loadPic` 函数）
- **描述与证据**：
  1. 第 102–105 行通过 `createImageBitmap(file)` 创建解码位图并绘入 `canvas` 后，未调用 `bitmap.close()` 立即释放底层位图内存。
  2. 第 106–109 行将图片解码与 `await saveRef(...)` 放在同一个 `try/catch` 块中：当图片已成功解码但主进程 `setRef` 因超过 8MB 拒收时，顶部 `#status` 会显示「图片无效或过大」，同时槽位徽标会被覆盖为 `✕ 读不了`，两者提示语义略有冲突。
- **影响**：单人工具高频反复换图时，解码位图只能等待 GC 回收；超大图（缩放到 1024 后仍超 8MB 的极端场景）被主进程拒收时，槽位提示略不准确。
- **可落地修改建议**：在 `drawImage` 之后（或 `try/finally` 中）补 1 行 `bitmap.close()`；至于解码与 `saveRef` 是否拆开错误反馈，可结合单人最简原则评估是否仅采纳 `bitmap.close()`（或将 `await saveRef(...)` 移出仅包裹解码的 `try` 块，避免覆盖槽位徽标）。

### R2-3（低 / 巡检覆盖与验证记录小缺口）

- **修改点**：[menu-panel-capture.mjs](file:///G:/selftool/WebCharacter/personal-digital-companion/tools/menu-panel-capture.mjs#L236-L256) 与 [CARD_DRAW_COMPLIANCE_RESPONSE_2026-11-28.md](file:///G:/selftool/WebCharacter/personal-digital-companion/docs/reviews/CARD_DRAW_COMPLIANCE_RESPONSE_2026-11-28.md#L28-L37)
- **描述与证据**：
  1. `menu-panel-capture.mjs` 仅构造了 `抽卡/` 目录样本图并循环截取 `['setup','cards']`，未在 `高清/` 目录写入样本图及截取 `hd` 页签（该页签的浅/深色及 360px 窄屏未在公共截图巡检中覆盖）。
  2. 整改响应记录第 3 节验证表未列出执行了 `node tools/build-desktop.mjs`（尽管实测 `output/desktop-bundle/card-draw-ui.mjs` 哈希已与源码同步更新）。
- **影响**：`hd` 与 `cards` 共用同一套 `.grid` 与响应式样式令牌，布局越界风险极低；响应记录漏列构建命令不影响功能本身。
- **可落地修改建议**：可在 `menu-panel-capture.mjs` 第 237 行顺带写入 2 张 `高清/` 样本图并将第 250 行视图数组扩为 `['setup','cards','hd']`（约 4 行），使三个页签全部纳入公共巡检；后续留痕中补全构建命令即可。

---

## 7. 审核结论与后续要求

- **本轮结论**：**有条件通过**。
- **对整改方的要求**（依据全局「审核修改建议与接受审核评估规则」）：请对本轮 **R2-1～R2-3** 逐项评估：① 问题是否合理；② 是否符合单人自用与最简化设计原则；③ 修改建议是否合理；并给出明确的「采纳 / 部分采纳 / 不采纳及理由」后再执行修改或保持现状。
- **安装放行条件**（沿用）：
  1. 用户确认待决事项（是否开始安装、是否加「全部停止」按钮等）。
  2. 以正式安装版目录为基线合入改动，在待发布根目录编写 `RELEASE_REVIEW.md` 并取得本次部署确认。
  3. 更新文件后按规范受控重启（退出等待 5 秒后独立进程启动），用真实密钥完成无参考图、带参考图、2048 高清各 1 张的实机出图、花费与回收站验收，最后通过本机 `http://127.0.0.1:8765` 提交花园登记。

---

## 8. 审核中是否改动及临时文件清理

- **源码、测试与既有文档改动**：**无**。本轮审核仅新增本报告 `docs/reviews/CARD_DRAW_COMPLIANCE_REVIEW_R2_2026-11-28.md`。
- **检查产物与临时目录**：复跑 Electron 检查刷新了本地不入库的截图目录 `output/card-draw-qa/` 与 `output/menu-qa/`，并在系统临时目录产生了 `feiyue-card-*` 与 `feiyue-menu-qa-*` 临时目录，未污染源码树及用户真实图片目录。
