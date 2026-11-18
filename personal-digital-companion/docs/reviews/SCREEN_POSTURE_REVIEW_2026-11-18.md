
## 2026-11-18 屏幕三分区姿态
用户原文：“首先实现对屏幕空间的理解，左侧1/3固定左侧姿态，右侧1/3固定右侧姿态，中间则保持当前姿态（延后切换），默认出生在屏幕右下角。当前图像资源均为右侧姿态，左侧姿态时，水平镜像左右翻转。其他不动。”
实现解释：以精灵窗口中心的DIP坐标，按中心所在屏幕完整bounds的宽度划分；x<1/3为左，x>=2/3为右，中间保留当前姿态，默认right。出生仍沿用主屏工作区右下角。拖动进入外侧区域即可改变姿态，没有额外等待松手/动作结束、移动轨迹或全局选项。多屏使用当前中心所在屏幕及其坐标原点，不把所有显示器合为一张屏。
实现：desktop/screen-posture.mjs纯判断及镜像命中；shell移动事件/既有50ms轮询仅在姿态变化时发送IPC，show强制同步；preload提供只读订阅；configured-renderer只对canvas做scaleX(-1)，透明像素命中同步反向取样。原视频与音频资源不复制，声音、动画状态与设置预览不改。镜像变化不触发动画load或声音播放。构建加入模块。
依据：重读当前ANIMATION_SETTINGS_DESIGN、configured-renderer/shell/player及G:/selftool/resourceforlater/docs/FRAMEWORK_PREFERENCES.md；沿用独立开发备忘录缺失记录。最简复用既有显示器API/轮询，无框架依赖，无新增设置或存储。
复核第一轮：测试脚本字符串笔误修正后，test-screen-posture通过左→中保持左→右→中保持右、精确分界、负坐标屏幕、镜像命中及透明边界；test-desktop-shell验证宿主位置判断和IPC去重，保留右下角出生断言；test-pc-settings及test-player-resources通过。真实Electron隔离测试通过onPosture桥接到canvas镜像/恢复，并回归最终效果、资源列表、保存/重开。未发现残留功能问题，首轮停止。未做用户手动跨屏拖动视觉验收；用户现有任务功能的并行修改未覆盖。没有提交、推送或部署。
