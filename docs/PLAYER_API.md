# 嵌入播放器接口（第一阶段）

## 接入

保持仓库相对目录，部署在宿主同源路径下。容器必须具有明确的宽度和高度，推荐比例 1000/570。

```js
import {CharacterPlayer} from './src/character-player.mjs';
const player = new CharacterPlayer(document.querySelector('#avatar'), {
  scene: 'office', // apple / magic / office
  loop: false,
  speed: 1,
  // baseURL: new URL('/webcharacter/', location.href),
  // assetBase: new URL('/webcharacter/assets/white/', location.href),
});
player.addEventListener('complete', () => console.log('完成'));
player.addEventListener('error', e => console.error(e.detail));
await player.load();
player.play();
// 页面卸载或组件卸载时
// player.destroy();
```

## 方法与事件

- load()：异步加载，成功返回实例；失败可再次调用。已加载时重复调用不重建。
- play() / pause() / replay()：开始、暂停、从头播放；结尾再次 play 从头开始。
- seek(seconds)：跳转并暂停，限制在时间轴内。拒绝非数值。
- setSpeed(0.1–4) / setLoop(boolean)：速度和循环。
- resize()：通知重绘，容器变化也由 ResizeObserver 自动通知。
- destroy()：可重复调用，取消待完成加载、移除 iframe/宿主监听与观察器。子页面 pagehide 释放 WebGL 并取消 RAF；销毁后必须新建实例。
- status：最近一次异步上报的 time、duration、playing、loop；约每 100ms 更新，不能当同步命令确认。
- ready、state、complete、iteration、error：加载就绪、状态、非循环完成、循环次数、错误事件。seek 到结尾不视为播放完成。

## 隔离与边界

目前是同源 iframe 适配器，每实例独立 DOM、时间轴与 WebGL 上下文。消息校验 origin 和直接窗口来源。嵌入模式隐藏原页控件；原始三页仍可独立观看。不是沙箱隔离第三方不可信脚本的方案。多个实例各自加载纹理，尚未共享 WebGL 或纹理，不宜推断大量实例性能。

当前没有跨动作无缝混合或聊天状态机。切换剧场需销毁旧实例、新建并加载。后台冻结沿用逻辑时间和 visibilitychange 重置帧时间；真实后台行为、显存回收量及目标设备性能尚未专项实测。

## 验证

打开 `player-validation.html`，点击“运行组件验收”。覆盖独立控制、暂停、完成事件、连续创建销毁和失败重试。资源/语法检查与原动作数值测试均应通过。浏览器图形上下文依赖真实环境，验收不是纯 Node 测试。
