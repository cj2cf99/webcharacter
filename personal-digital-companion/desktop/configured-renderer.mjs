import {CompanionPlayer} from './companion-player.mjs';
import {BehaviorController} from './behavior-controller.mjs';
const host=window.desktopHost,canvas=document.querySelector('#character'),status=document.querySelector('#status');
const scale=Math.min(1,canvas.clientWidth*devicePixelRatio/464);canvas.width=Math.round(464*scale);canvas.height=Math.round(688*scale);
let snapshot,config,controller,visible=true,press=null,dragged=false,suppress=false,request=0,voiceTimer=null,idleTimer=null,lastHit=null,activeSound=null,playing=false;
const audio=new Audio();audio.preload='none';
const player=new CompanionPlayer(canvas,async id=>{const a=snapshot.assets.find(a=>a.id===id&&a.kind==='video');if(!a)throw Error('动画资源缺失');return canvas.width<=372&&a.compact?a.compact:a.url;},true);
function message(t){status.textContent=t;}
function clearVoiceTimer(){clearTimeout(voiceTimer);voiceTimer=null;}
function stopVoice(){clearVoiceTimer();audio.pause();audio.currentTime=0;activeSound=null;}
function level(id,phase){const s=config.states[id].sound[phase];return config.master.enabled&&s.on?config.master.volume*s.volume/10000:0;}
function updateLevel(){if(!activeSound)return;audio.volume=level(activeSound.id,activeSound.phase);if(!audio.volume)stopVoice();}
function speak(id,phase){clearVoiceTimer();const s=config.states[id].sound[phase],resource=snapshot.assets.find(a=>a.id===s.voice&&a.kind==='audio');if(!visible||!resource||!level(id,phase))return;const start=()=>{voiceTimer=null;if(!visible||!level(id,phase))return;audio.pause();audio.src=resource.url;audio.loop=false;audio.volume=level(id,phase);activeSound={id,phase};audio.play().catch(e=>{if(e.name!=='AbortError')message('语音失败：'+e.message);});};if(s.delay)voiceTimer=setTimeout(start,s.delay*1000);else start();}
function report(){host.reportRuntime({state:controller.current,phase:controller.phase,resource:config.states[controller.current].slots[controller.phase],target:'pc'});}
function idleClock(){clearTimeout(idleTimer);if(visible&&controller.current==='idle')idleTimer=setTimeout(()=>{if(controller.current==='idle')input('specialPending',true);},config.idleSpecialDelaySeconds*1000);}
async function play(id,phase){const token=++request;clearVoiceTimer();idleClock();const resource=config.states[id].slots[phase];try{await player.load(resource);if(token!==request)return;playing=true;player.loopBlend=resource!=='hoverLoop';player.video.loop=controller.canNativeLoop();if(!visible)player.pause();message('');speak(id,phase);report();}catch(e){if(token===request)message('动画失败：'+e.message);}}
function input(kind,value){controller.input(kind,value);if(player.video)player.video.loop=controller.canNativeLoop();report();}
player.onEnded=()=>{clearVoiceTimer();controller.ended();};player.onLoop=()=>speak(controller.current,controller.phase);player.onError=e=>message(e.message);
function hitAt(x,y){return x>=0&&y>=0&&player.hit(x,y);}
function hit(value){if(lastHit!==value){lastHit=value;host.hit(value);}}
const off=[];
off.push(host.onPointer(({x,y})=>{if(!controller||!visible)return;if(press){hit(true);return;}const over=hitAt(x,y);hit(over);if(controller.over!==over)input('over',over);}));
off.push(host.onWork(value=>{if(controller)input('work',value);}));
off.push(host.onVisible(value=>{visible=value;if(!controller)return;if(!value){stopVoice();clearTimeout(idleTimer);press=null;host.dragEnd();input('drag',false);input('over',false);player.pause();}else{player.resume().catch(e=>message(e.message));idleClock();}}));
off.push(host.onSettings(value=>{snapshot=value;config=value.config;if(!controller)return;if(value.kind==='animation'){request++;player.hold();stopVoice();controller.reconfigure(config);}else{controller.config=config;updateLevel();}report();}));
canvas.addEventListener('pointerdown',e=>{if(!controller||e.button!==0||!hitAt(e.clientX,e.clientY))return;press={x:e.screenX,y:e.screenY};dragged=false;suppress=false;canvas.setPointerCapture(e.pointerId);host.dragStart();});
canvas.addEventListener('pointermove',e=>{if(press&&!dragged&&Math.hypot(e.screenX-press.x,e.screenY-press.y)>=5){dragged=true;input('drag',true);}});
function release(e){if(!press)return;suppress=dragged||e.type==='pointercancel'||Math.hypot(e.screenX-press.x,e.screenY-press.y)>=5;press=null;host.dragEnd();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);input('drag',false);}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('click',e=>{if(suppress){suppress=false;return;}if(controller&&hitAt(e.clientX,e.clientY))input('click');});
if(host.onPerfSnapshot)off.push(host.onPerfSnapshot(()=>host.perfSnapshot({state:controller?.current,frames:player.frames,visible,paused:player.video?.paused??true,canvas:[canvas.width,canvas.height]})));
try{snapshot=await host.getSettings();config=snapshot.config;controller=new BehaviorController(config,play);const image=new Image();image.onload=()=>{player.draw(image);host.ready();controller.start('idle');};image.onerror=()=>message('基准图加载失败');image.src='./baseline.png';}catch(e){message('本地设置读取失败：'+e.message);host.ready();}
window.addEventListener('pagehide',()=>{stopVoice();clearTimeout(idleTimer);request++;off.forEach(f=>f());player.destroy();host.dragEnd();});
