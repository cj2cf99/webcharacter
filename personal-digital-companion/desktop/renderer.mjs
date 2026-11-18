import {CompanionSound} from './sound.mjs';
import {CompanionState} from './companion-state.mjs';
import {CompanionPlayer} from './companion-player.mjs';
const host=window.desktopHost,canvas=document.getElementById('character'),status=document.getElementById('status');
const state=new CompanionState();let visible=true,closed=false,press=null,dragged=false,suppressClick=false,request=0;
// 按实际物理显示像素绘制，不在小窗口内持续绘制超过屏幕所需的画布。
const renderScale=Math.min(1,canvas.clientWidth*window.devicePixelRatio/464);
canvas.width=Math.max(1,Math.round(464*renderScale));canvas.height=Math.max(1,Math.round(688*renderScale));
// 直接按需读取本地视频，不解析全量Base64或反复创建多MB的Blob。
const player=new CompanionPlayer(canvas,async id=>{
  const item=window.localClips[id];
  const path=canvas.width<=372&&canvas.height<=552&&item.compact?item.compact:item.normal;
  return new URL(path,import.meta.url).href;
},true);
const subscriptions=[];
const voice=new Audio();voice.preload='none';
const sound=new CompanionSound(voice,file=>new URL('./voice/'+file,import.meta.url).href);
subscriptions.push(host.onSound(value=>sound.apply(value)),host.onSoundPreview(id=>sound.play(id)?.catch(e=>message('语音播放失败：'+e.message))));
host.soundReady();
// 后续特殊动作只需扩充资源列表。
const idleSpecials=['idle-special'];let specialIndex=0,idleTimer=null,idleTiming=false;
function syncIdleTimer(){
  if(!visible||state.current!=='idle'){clearTimeout(idleTimer);idleTimer=null;idleTiming=false;return;}
  if(idleTiming)return;idleTiming=true;
  idleTimer=setTimeout(()=>{idleTiming=false;if(visible&&state.current==='idle'){state.current=idleSpecials[specialIndex++%idleSpecials.length];playCurrent();}},10000);
}
let lastHit=null;
function reportHit(value){if(value!==lastHit){lastHit=value;host.hit(value);}}
if(host.onPerfSnapshot)subscriptions.push(host.onPerfSnapshot(()=>{
  const quality=player.video?.getVideoPlaybackQuality?.();
  host.perfSnapshot({state:state.current,frames:player.frames,visible,paused:player.video?.paused??true,
    canvas:[canvas.width,canvas.height],heapBytes:performance.memory?.usedJSHeapSize??null,
    totalVideoFrames:quality?.totalVideoFrames??0,droppedVideoFrames:quality?.droppedVideoFrames??0});
}));
function message(text){status.textContent=text;}
async function playCurrent(newCycle=false){
  syncIdleTimer();
  const token=++request;
  try{await player.load(state.current);if(token!==request)return;player.loopBlend=state.current!=='hover-loop';if(player.video)player.video.loop=state.current==='hover-loop'||state.current==='drag-loop';if(!visible)player.pause();message('');sound.state(state.current,newCycle)?.catch(e=>message('语音播放失败：'+e.message));}
  catch(e){if(token!==request)return;message(`播放失败：${e.message}。可从托盘退出后重试。`);reportHit(false);}
}
player.onLoop=()=>{sound.state(state.current,true)?.catch(e=>message('语音播放失败：'+e.message));};
player.onEnded=()=>{state.ended();playCurrent(true);};player.onError=e=>message(e.message);
function startDrag(){if(state.beginDrag()){request++;player.hold();playCurrent();}}
function hitAt(x,y){return x>=0&&y>=0&&player.hit(x,y);}
subscriptions.push(host.onPointer(({x,y})=>{
  if(closed||!visible)return;
  if(press){reportHit(true);if(dragged)state.leave();return;}
  const hit=hitAt(x,y);reportHit(hit);
  if(hit){if(state.enter())playCurrent();}else if(state.leave())playCurrent();
}));
subscriptions.push(host.onVisible(value=>{
  visible=value;sound.setVisible(value);syncIdleTimer();lastHit=null;if(!visible){press=null;host.dragEnd();const exit=state.endDrag()||state.leave();if(exit)playCurrent();player.pause();}
  else player.resume().catch(e=>message(e.message));
}));
subscriptions.push(host.onWork(value=>{if(state.setWork(value))playCurrent();}));
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||!hitAt(e.clientX,e.clientY))return;
  press={x:e.screenX,y:e.screenY};dragged=false;suppressClick=false;
  canvas.setPointerCapture(e.pointerId);host.dragStart();
});
canvas.addEventListener('pointermove',e=>{if(press&&!dragged&&Math.hypot(e.screenX-press.x,e.screenY-press.y)>=5){dragged=true;startDrag();}});
function release(e){
  if(!press)return;
  suppressClick=dragged||e.type==='pointercancel'||Math.hypot(e.screenX-press.x,e.screenY-press.y)>=5;
  if(suppressClick&&!dragged&&e.type!=='pointercancel'){dragged=true;startDrag();}
  press=null;host.dragEnd();
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(state.endDrag())playCurrent();
}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('click',e=>{if(suppressClick){suppressClick=false;return;}if(hitAt(e.clientX,e.clientY)){if(state.click())playCurrent();else message('收到，当前动作结束后打招呼');}});
const baseline=new Image();baseline.onload=()=>{player.draw(baseline);host.ready();playCurrent();};
baseline.onerror=()=>{message('基准图加载失败，请检查本地资源');host.ready();};baseline.src='./baseline.png';
window.addEventListener('pagehide',()=>{closed=true;sound.stop();clearTimeout(idleTimer);host.dragEnd();for(const unsubscribe of subscriptions)unsubscribe();player.destroy();});
