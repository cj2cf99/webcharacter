// 执行共享状态核心与真实页面脚本，验证队列/工作退出/异步视频交接；不冒充浏览器验收。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const stateCode=stripTypeScriptTypes(readFileSync(new URL('src/companion-state.ts',root),'utf8')).replace(/^export /gm,'');
const State=new Script(`${stateCode}\nCompanionState`).runInNewContext();
let m=new State();assert.equal(m.enter(),'hover');assert.equal(m.current,'hover','悬停立即打断待机');assert.equal(m.ended(),'idle');assert.equal(m.enter(),null,'持续悬停不重复触发');
m=new State();m.enter();m.leave();assert.equal(m.ended(),'idle','已启动的悬停自然结束');
m=new State();assert.equal(m.click(),'click');for(let i=0;i<100;i++)m.click();assert.equal(m.ended(),'click');assert.equal(m.ended(),'idle','连点只保留一次补播，不从头打断');
m=new State();assert.equal(m.setWork(true),'work-enter');assert.equal(m.ended(),'work-loop');
for(let i=0;i<5;i++)assert.equal(m.ended(),'work-loop');m.setWork(false);assert.equal(m.ended(),'work-exit');assert.equal(m.ended(),'idle');
m=new State();m.setWork(true);m.setWork(false);assert.equal(m.ended(),'work-exit','进入途中结束也先收尾');assert.equal(m.ended(),'idle');
m=new State();m.setWork(true);m.ended();m.click();assert.equal(m.ended(),'work-exit');assert.equal(m.ended(),'click');assert.equal(m.ended(),'work-enter');
for(const clip of ['idle','hover','click','work-enter','work-loop','work-exit','drag-exit']){
  m=new State();m.current=clip;m.clickPending=true;assert.equal(m.beginDrag(),true);assert.equal(m.current,'drag-enter');assert.equal(m.clickPending,false);
  assert.equal(m.ended(),'drag-loop');assert.equal(m.click(),null);m.endDrag();assert.equal(m.ended(),'drag-exit');assert.equal(m.ended(),'idle');
}
m=new State();m.setWork(true);m.beginDrag();m.endDrag();assert.equal(m.ended(),'drag-exit','进入中松开不额外进入循环');assert.equal(m.ended(),'work-enter');
m.beginDrag();m.setWork(false);m.endDrag();assert.equal(m.ended(),'drag-exit');assert.equal(m.ended(),'idle');
m.beginDrag();m.endDrag();m.ended();assert.equal(m.current,'drag-exit');m.beginDrag();assert.equal(m.current,'drag-enter','退出中再次拖拽立即抢占');
console.log('PASS：待机立即中断、所有状态被拖拽抢占、拖拽保护/释放、连点合并、工作恢复。');

const playerCode=stripTypeScriptTypes(readFileSync(new URL('src/companion-player.ts',root),'utf8')).replace(/^export /gm,'');
let fallbackCallbacks=[],draws=0;
const Player=new Script(`${playerCode}\nCompanionPlayer`).runInNewContext({requestAnimationFrame:fn=>{fallbackCallbacks.push(fn);return 1},cancelAnimationFrame(){}});
const fallback=new Player({getContext:()=>({clearRect(){},drawImage(){draws++}})},async()=>null);
fallback.video={paused:false,currentTime:0};fallback.watch(0);
for(let i=0;i<20;i++)fallbackCallbacks.shift()();assert.equal(draws,1,'RAF兜底只画变化的视频帧');
fallback.video.currentTime=1/24;fallbackCallbacks.shift()();assert.equal(draws,2);
fallback.video.paused=true;fallbackCallbacks.shift()();assert.equal(fallbackCallbacks.length,0,'暂停停止RAF兜底');
console.log('PASS：不支持视频帧回调时仅重画变化的帧，暂停停止绘制。');

const html=readFileSync(new URL(process.argv[2]||'绯月四状态_直接打开.html',root),'utf8');
const mediaText=html.match(/<script id="media" type="application\/json">([\s\S]*?)<\/script>/)[1];
const code=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const nodes=new Map(),videos=[],urls=new Set(),windowEvents={},documentEvents={};let frames=0;
function node(id){if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{toggle(){}},setPointerCapture(){},addEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:464,height:688}},getContext(){return {clearRect(){},drawImage(){frames++},getImageData(){return {data:[0,0,0,255]}}}},width:464,height:688});return nodes.get(id);}
node('media').textContent=mediaText;
class Video {
  constructor(){this.events={};this.paused=true;this.currentTime=0;this.error=null;videos.push(this);}
  addEventListener(n,fn){(this.events[n]??=new Set()).add(fn)}
  removeEventListener(n,fn){this.events[n]?.delete(fn)}
  emit(n){for(const fn of [...(this.events[n]||[])])fn()}
  load(){if(this.src)queueMicrotask(()=>this.emit('loadeddata'))}
  play(){this.paused=false;return Promise.resolve()}
  pause(){this.paused=true}
  removeAttribute(n){if(n==='src')this.src=''}
  requestVideoFrameCallback(fn){this.callback=fn;return 1}
  cancelVideoFrameCallback(){this.callback=null}
}
const document={getElementById:node,createElement:n=>{assert.equal(n,'video');return new Video()},addEventListener(n,fn){documentEvents[n]=fn},hidden:false};
const context=createContext({document,window:{addEventListener(n,fn){windowEvents[n]=fn}},
  Image:class{set src(value){assert(value.startsWith('data:image/png;base64,'));queueMicrotask(()=>this.onload())}},
  Blob,Uint8Array,Map,Error,Promise,setTimeout,clearTimeout,queueMicrotask,
  setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},location:{reload(){}},
  URL:{createObjectURL(){const url=`blob:fake-${videos.length}`;urls.add(url);return url},revokeObjectURL(url){urls.delete(url)}},
  atob:s=>Buffer.from(s,'base64').toString('latin1')});
new Script(code).runInContext(context);
const settle=()=>new Promise(setImmediate);await settle();await settle();
assert.equal(node('badge').textContent,'待机');assert.equal(videos.length,1,'只解码首屏待机');assert(frames>0);
node('click').onclick();await settle();assert.equal(node('badge').textContent,'点击 · 开心挥手','点击立即打断待机');assert.equal(urls.size,1);
const videoCount=videos.length;for(let i=0;i<100;i++)node('click').onclick();
assert.equal(videos.length,videoCount,'播放点击时不反复重启');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'点击 · 开心挥手');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'待机');
node('work').onclick();await settle();assert.equal(node('badge').textContent,'工作 · 进入','工作立即打断待机');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'工作 · 进行中');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'工作 · 进行中');
node('work').onclick();videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'工作 · 收尾');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'待机');
node('click').onclick();await settle();const interrupted=videos.at(-1);
node('drag').onpointerdown({preventDefault(){},pointerId:1});assert(interrupted.paused);
interrupted.emit('ended');await settle();assert.equal(node('badge').textContent,'拖拽 · 进入');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'拖拽 · 循环');
node('drag').onpointerup();await settle();assert.equal(node('badge').textContent,'拖拽 · 循环');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'拖拽 · 退出');
videos.at(-1).emit('ended');await settle();assert.equal(node('badge').textContent,'待机');
node('pause').onclick();assert(videos.at(-1).paused);await node('pause').onclick();assert(!videos.at(-1).paused);
document.hidden=true;documentEvents.visibilitychange();assert(videos.at(-1).paused);
document.hidden=false;documentEvents.visibilitychange();await settle();assert(!videos.at(-1).paused);
videos.at(-1).error={code:3};videos.at(-1).emit('error');assert.equal(node('badge').textContent,'播放未开始');
await node('pause').onclick();await settle();assert.equal(node('badge').textContent,'待机','解码错误后重载而非空恢复');
windowEvents.pagehide();assert.equal(urls.size,0,'销毁释放所有对象URL');
console.log('PASS：成品实际内联脚本，首屏懒加载、结束边界交接、点击/工作循环/退出、暂停、隐藏恢复、对象URL释放。');
