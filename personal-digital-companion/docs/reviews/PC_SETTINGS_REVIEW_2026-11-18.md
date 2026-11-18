# 本地 PC 设置接入复核

2026-11-18（Asia/Tokyo）。需求依据：ANIMATION_SETTINGS_DESIGN.md所有原文、PC/Web隔离决定、声音跟随动画澄清及最新真实本地保存要求。界面已获用户认可，未据此宣称运行功能已获验收。

## 变更与基线

修改前统一界面只有prototype/settings.html内存演示；desktop/index.html使用renderer.mjs，真实宿主仅有声音落盘。父仓库personal-digital-companion是既有未跟踪目录，不将全部父仓库变更计入本次。原型保留；旧renderer及声音源文件保留作比较，当前入口改为configured-renderer.mjs。

新增settings-store/host/UI/controller/configured-renderer；调整shell/preload/index/build接线和原型提醒。主存储是profile/pc-behavior-settings.json，首次迁移旧sound-settings.json，构建只重建bundle。无生产部署、云端调用、Git提交或push。

## 第一轮：需求、bug与最简检查

- 发现并报告原型保存不写桌宠的缺口，补齐可信主frame IPC、原子保存、运行广播、启动回读、资源复制与重命名。
- 固定PC显示，后端拒绝非PC；旧原型提示真实入口，防止误改或误认为保存。
- 动画保存不覆盖即时声音配置；迁移保留两个待机关闭及节点音量；导入资源不随build清理。
- 实际Electron验收使用隔离临时profile，不改用户配置：通过页面选择基础待机资源为click，点击保存；读取文件与精灵renderer运行报告均为click。音量改37%即时写盘，重新读取及关闭重开保持，web目标拒绝。
- 真实Electron脚本初期出现ESM启动等待/测试全局变量重复/窗口重开事件时序问题，均修正验收脚本；最终完整通过，未把早期失败当通过。
- 复核发现特殊待机定时器可绕过idle强制完成；已报告并改为正常意图请求，新增断言。

## 第二轮：修正复查并停止

自动特殊待机等待强制idle完成后切换；强制三段结束、快速拖拽释放不补播、配置保存按有效意图重启、原生循环取消/继续均通过。与需求一致，无新增框架或未经确认云端功能；没有残留代码问题，第二轮停止。

实际命令与结果：
- node tools/build-desktop.mjs：通过。
- node tools/test-pc-settings.mjs：通过。覆盖文件回读、域隔离、无效目标/资源、失败不污染、资源复制/改名、强制及状态意图。
- node tools/test-desktop-shell.mjs：通过。
- node tools/test-player-resources.mjs：通过。
- node tools/test-desktop-sound.mjs：通过（原声音语义回归）。
- node --check desktop/settings-ui.mjs、configured-renderer.mjs、settings-host.mjs、settings-store.mjs：通过。
- desktop/node_modules/electron/dist/electron.exe tools/test-pc-settings-electron.mjs：最终通过真实界面→IPC→磁盘→renderer资源变化、音量37%、重新读取/重开、web目标拒绝。预期拒绝在日志中记录Error，属于通过项。
- output/pc-settings-qa.png：已查看实际Electron深色桌面设置截图，PC目标及按钮明确，控件可见。该图使用隔离测试值，非用户配置。

## 限制与恢复

未完成：用户手动操作所有动画组合的视觉/听感验收、浅色与窄窗口视觉回归、长期运行性能测试。独立资源预览只预览单片段，不冒充完整状态机模拟。导入按允许格式复制，损坏媒体在预览/播放报错，未声称可自动修复。

恢复：旧声音文件及旧renderer仍保留，首次迁移前可备份profile；新配置资源在profile，不随build覆盖。若需回退，恢复desktop/index.html指向旧renderer并重建，旧sound-settings仍可用；新配置不删除。不能将本地运行版本验证称为云端发布。

状态：功能已接入且验证通过，实际用户体验待用户确认；无第三方审核。

## 2026-11-18 最终效果预览
用户原文：“这里应该再加一个最终效果，方便我做调整。”所指为节点配置区。
已在节点规则下增加画布预览和播放/重播、结束动作、停止预览按钮。使用当前动画草稿和配套语音（延时、总/节点音量），不自动保存动画；声音设置延续即时保存约定。复用BehaviorController与CompanionPlayer，三段按进入→循环保持→退出；结束动作遵循强制播完，停止预览立即取消；事件型节点按既有规则播一轮后退出。切换节点/动画配置停止旧预览，资源预览与最终效果互斥，隐藏窗口停预览。按需加载，无新依赖。该区域仅预览当前节点，不模拟所有桌面鼠标交互。
查阅既有ANIMATION_SETTINGS_DESIGN、PC_SETTINGS_REVIEW及FRAMEWORK_PREFERENCES；沿用独立备忘录未找到的已记录事实。修改文件：desktop/effect-preview.mjs、settings.html/css/ui.mjs、tools/build-desktop.mjs、test-pc-settings-electron.mjs。
第一轮：实际Electron发现强制退出后保留悬停意图导致重入，已报告并修正预览完成边界；运行桌宠状态机未改。
第二轮：真实Electron测试通过三段进入/循环/强制退出/完成、停止取消晚到加载、未保存草稿不落盘，以及原PC保存与重开回读。build-desktop、JS语法、test-pc-settings通过；查看output/effect-preview-qa.png确认深色实际预览布局与角色可见。第二轮未发现残留代码问题，停止。隔离测试总声音关闭，真实听感/音画延时的人耳验收及浅色/窄屏视觉未验证，不冒充已通过。
没有提交、推送、部署或云端改动。用户现有配置不改；本地重启加载新版设置页。

## 2026-11-18 补登记已认可语音
用户指出laugh-soft.wav、greeting-dear.wav、laugh-bell-v3.wav似乎未加入语音包。核对：assets中三个源文件存在，原型voices已有登记，但真实settings-store资源目录遗漏。已补入三个稳定voice:资源ID，显示“已认可”，laugh-bell-v3明确原版，未重新生成、拉长或自动分配节点。
实际验证：build-desktop、test-pc-settings通过；三个源文件与bundle文件SHA256一致；测试确认目录可读和新增资源不更改配置映射。第一轮需求/bug/最简检查通过后停止。既有声音与节点配置不变，重启本地桌宠加载新目录；没有部署/提交/push。

## 2026-11-18 整体布局及共用资源预览
用户原文：“重新设计下界面，改成给你左边列表，右边公用预览的效果，现在这样太占地方了”；追加“声音也是”“另外整体界面重新规划，现在有点乱”。
已改为节点配置/资源管理两个页面。节点区左状态列表及总声音、中间阶段设置、右最终效果；资源管理用动画/声音切换，均为左侧紧凑列表、右侧单一预览与分配/重命名。保留搜索、导入、单节点声音与真实保存，不更改配置数据。窄窗自动纵排，预览按需创建，切换停止释放上一项，避免多项同时播放。
依据既有需求设计、用户截图及FRAMEWORK_PREFERENCES紧凑/少说明/按需加载规则；沿用独立备忘录缺失记录。本轮仅settings.html/css/ui.mjs布局与资源展示逻辑、测试调整，无新框架。
第一轮：build、JS语法和真实Electron测试通过保存/回读、最终效果、动画/声音单实例预览、切换释放、搜索空状态、740px窗口无横向溢出。查看library-layout-qa.png、library-light-narrow-qa.png及effect-preview-qa.png，发现左状态说明过多使音量偏低、声音预览留白偏大，已报告并压缩。
第二轮：复核CSS仅缩减说明和声音面板高度、调整选中对比及提示，不影响设置读写；构建通过，无残留问题后停止。深浅两种主题截图已检查；新布局用户体验待确认。测试隔离profile，不改用户设置；重启本地桌宠加载新版。无部署/Git提交或推送。
