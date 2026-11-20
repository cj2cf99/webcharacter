import {postureHit,isHeadPoint} from './screen-posture.mjs';
import {CompanionPlayer} from './companion-player.mjs';
import {BehaviorController} from './behavior-controller.mjs';
import {WINDOW_STAGES} from './window-nodes.mjs';
const host=window.desktopHost,canvas=document.querySelector('#character'),status=document.querySelector('#status');
let posture='right',attached=null,loadedAttachment=null,displayedAsset='idle',headClick=false;
let snapshot,config,controller,visible=true,press=null,dragged=false,suppress=false,request=0,voiceTimer=null,lastHit=null,activeSound=null,playing=false;
let displayScale=devicePixelRatio,baseline=null,quietWalk=false;
const audio=new Audio();audio.preload='none';
function videoURL(id){const a=snapshot.assets.find(a=>a.id===id&&a.kind==='video');if(!a)throw Error('动画资源缺失');return canvas.width<=372&&a.compact?a.compact:a.url;}
const player=new CompanionPlayer(canvas,async id=>videoURL(id),true);
function fitCanvas(frame=player.video?.readyState>=2?player.video:baseline){
 const sourceWidth=attached&&!attached.elevator?854:464;
 const dipWidth=attached?.width||canvas.clientWidth;
 const scale=Math.min(displayScale,sourceWidth/Math.max(1,dipWidth));
 const w=Math.max(1,Math.round(dipWidth*scale));
 const h=Math.max(1,Math.round(attached?attached.height*scale:w*688/464));
 if(canvas.width===w&&canvas.height===h)return;
 canvas.width=w;canvas.height=h;player.blend=null;lastHit=null;
 if(frame)player.draw(frame);
}
function refit(){if(!attached||loadedAttachment===attached)fitCanvas();}
refit();
window.addEventListener('resize',refit);
let noticeTimer;
function message(t){if(!noticeTimer)status.textContent=t;}
function clearVoiceTimer(){clearTimeout(voiceTimer);voiceTimer=null;}
function stopVoice(){clearVoiceTimer();audio.pause();audio.currentTime=0;activeSound=null;}
function level(id,phase){const s=config.states[id].sound[phase];return config.master.enabled&&s.on?config.master.volume*s.volume/10000:0;}
function updateLevel(){if(!activeSound)return;audio.volume=level(activeSound.id,activeSound.phase);if(!audio.volume)stopVoice();}
function speak(id,phase){clearVoiceTimer();if(id==='walk'&&quietWalk)return;const s=config.states[id].sound[phase],resource=snapshot.assets.find(a=>a.id===s.voice&&a.kind==='audio');if(!visible||!resource||!level(id,phase))return;const start=()=>{voiceTimer=null;if(!visible||!level(id,phase))return;audio.pause();audio.src=resource.url;audio.loop=false;audio.volume=level(id,phase);activeSound={id,phase};audio.play().catch(e=>{if(e.name!=='AbortError')message('语音失败：'+e.message);});};if(s.delay)voiceTimer=setTimeout(start,s.delay*1000);else start();}
function report(frame=null){host.reportRuntime({frame,state:controller.current,specialPending:controller.specialPending,phase:controller.phase,resource:config.states[controller.current].slots[controller.phase],target:'pc'});}
async function play(id,phase){player.preserveAspect=false;const token=++request;clearVoiceTimer();const resource=config.states[id].slots[phase];if(id==='walk'&&phase==='exit')report();try{await player.load(resource);if(token!==request)return;displayedAsset=resource;playing=true;player.loopBlend=!['hoverLoop','walk-loop'].includes(resource);player.video.loop=controller.canNativeLoop();if(!visible)player.pause();message('');speak(id,phase);report({time:player.video.currentTime,duration:player.video.duration});}catch(e){if(token===request)message('动画失败：'+e.message);}}
function input(kind,value){if(attached){if(kind!=='click')controller[kind]=value;return;}controller.input(kind,value);if(player.video)player.video.loop=controller.canNativeLoop();report();}
function elevatorPlayback(kind,progress){
 if(loadedAttachment!==attached||!attached?.elevator)return;
 host.elevatorPlayback({...attached.elevator,kind,progress});
}
player.onFrame=(time,duration)=>{if(attached?.elevator?.phase==='run'&&duration>0)elevatorPlayback('frame',time/duration);if(!attached&&controller?.current==='walk'&&['enter','exit'].includes(controller.phase))report({time,duration});};
player.onEnded=()=>{if(attached){if(attached.elevator)elevatorPlayback('ended');else if(attached.transition)host.attachmentDone(attached.asset);else if(attached.special)host.attachmentDone('special-done:'+attached.asset);return;}clearVoiceTimer();controller.ended();};player.onLoop=()=>{
 const stage=attached?WINDOW_STAGES[attached.asset]:null;
 const id=attached?(stage?config.states[stage.id].slots[stage.phase]:attached.asset):config.states[controller.current].slots[controller.phase];
 const url=videoURL(id);
 if(url.includes('?v=')&&url!==player.url){
   if(attached)void playAttachment(attached);else void play(controller.current,controller.phase);
   return;
 }
 if(!attached){speak(controller.current,controller.phase);return;}
 if(loadedAttachment!==attached)return;
 if(attached.elevator)elevatorPlayback('loop');
 else if(!attached.transition&&!attached.special)host.attachmentDone('cycle:'+attached.asset);
 if(stage)speak(stage.id,stage.phase);
};player.onError=e=>{message(e.message);if(attached?.elevator)elevatorPlayback('failed');};
function hitAt(x,y){return postureHit(canvas,player.context,x,y,posture);}
function headAt(x,y){
 const video=player.video,aspect=player.preserveAspect&&video?.videoHeight?video.videoWidth/video.videoHeight:0;
 return isHeadPoint(canvas.getBoundingClientRect(),x,y,posture,displayedAsset,video?.currentTime/video?.duration,aspect);
}
function hit(value){if(lastHit!==value){lastHit=value;host.hit(value);}}
const off=[];
off.push(host.onScale(value=>{if(Number.isFinite(value)&&value>0){displayScale=value;refit();}}));
off.push(host.onAttachmentNotice(text=>{
 clearTimeout(noticeTimer);status.textContent=text;
 noticeTimer=setTimeout(()=>{noticeTimer=null;message('');},3000);
}));
off.push(host.onAttachmentPending(label=>{if(attached&&!attached.placeholder)message(label?'本轮结束后切换为'+label:'');}));
async function playAttachment(value){
 if(!controller)return;
 clearTimeout(noticeTimer);noticeTimer=null;
 attached=value;loadedAttachment=null;const token=++request;player.hold();clearVoiceTimer();
 if(!value){
   fitCanvas(baseline);
   const work=controller.work;
   controller=new BehaviorController(config,play);controller.work=work;controller.next();
   return;
 }
 press=null;
 const stage=WINDOW_STAGES[value.asset];
 const resource=stage?config.states[stage.id].slots[stage.phase]:value.asset;
 player.preserveAspect=true;
 try{
   await player.load(resource);
   if(token!==request||!attached)return;
   fitCanvas(player.video);
   displayedAsset=resource;
   loadedAttachment=value;
   player.video.loop=value.elevator?value.elevator.phase==='run':!value.transition&&!value.special;
   player.loopBlend=false;
   if(!visible)player.pause();
   message('');
   if(stage)speak(stage.id,stage.phase);
   host.reportRuntime({state:stage?.id??'attachment',phase:stage?.phase??value.label,resource,transition:!!value.transition,special:!!value.special,target:'pc'});
 }catch(e){
   if(token!==request)return;
   message('依附资源失败：'+e.message);
   if(value.elevator)host.elevatorPlayback({...value.elevator,kind:'failed'});
 }
}
off.push(host.onAttachment(playAttachment));
off.push(host.onPosture(side=>{if(side!=='left'&&side!=='right')return;posture=side;canvas.style.transform=side==='left'?'scaleX(-1)':'none';lastHit=null;}));
off.push(host.onPointer(({x,y})=>{if(!controller||!visible)return;if(attached||controller.walk){hit(hitAt(x,y));return;}if(press){hit(true);return;}const over=hitAt(x,y);hit(over);if(controller.over!==over)input('over',over);}));
off.push(host.onIdleSpecial(value=>{
 if(!controller)return;
 if(!value){controller.specialPending=false;return;}
 if(visible&&!attached&&!press&&!controller.over&&!controller.walk&&controller.current==='idle')input('specialPending',true);
 else report();
}));
off.push(host.onMove(value=>{
 if(!controller)return;
 controller.clickPending=false;controller.specialPending=false;
 if(value==='interrupt'){
   controller.walk=false;
   if(!attached&&controller.current==='walk')controller.next();
   return;
 }
 if(value==='finish'){controller.finishWalk();if(player.video)player.video.loop=controller.canNativeLoop();report();return;}
 const start=value===true||value==='roam';
 if(start)quietWalk=value==='roam';
 if(start&&controller.current==='walk'&&controller.phase==='exit'){controller.walk=true;controller.start('walk');return;}
 input('walk',start);
}));
off.push(host.onWork(value=>{if(controller)input('work',value);}));
off.push(host.onVisible(value=>{visible=value;if(!controller)return;if(!value){stopVoice();press=null;host.dragEnd();input('drag',false);input('over',false);player.pause();}else{player.resume().catch(e=>message(e.message));}}));
off.push(host.onSettings(value=>{snapshot=value;config=value.config;if(!controller)return;if(attached){controller.config=config;updateLevel();return;}if(value.kind==='animation'){request++;player.hold();stopVoice();controller.reconfigure(config);}else{controller.config=config;updateLevel();}report();}));
canvas.addEventListener('pointerdown',e=>{if(!controller||e.button!==0||!hitAt(e.clientX,e.clientY))return;headClick=false;press={x:e.screenX,y:e.screenY,head:headAt(e.clientX,e.clientY)};dragged=false;suppress=false;canvas.setPointerCapture(e.pointerId);host.dragStart(press.head);});
canvas.addEventListener('pointermove',e=>{if(press&&!dragged&&Math.hypot(e.screenX-press.x,e.screenY-press.y)>=5){dragged=true;input('drag',true);}});
function release(e){if(!press)return;suppress=dragged||e.type!=='pointerup'||Math.hypot(e.screenX-press.x,e.screenY-press.y)>=5;headClick=press.head&&!suppress&&hitAt(e.clientX,e.clientY);press=null;host.dragEnd(e.type!=='pointerup');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);input('drag',false);}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);canvas.addEventListener('click',e=>{if(suppress){suppress=false;return;}if(headClick){headClick=false;host.toggleConversation();return;}if(controller&&!controller.walk&&hitAt(e.clientX,e.clientY))input('click');});
if(host.onPerfSnapshot)off.push(host.onPerfSnapshot(()=>host.perfSnapshot({state:controller?.current,frames:player.frames,visible,paused:player.video?.paused??true,canvas:[canvas.width,canvas.height]})));
try{snapshot=await host.getSettings();config=snapshot.config;controller=new BehaviorController(config,play);const image=new Image();image.onload=()=>{baseline=image;player.draw(image);host.ready();controller.start('idle');};image.onerror=()=>message('基准图加载失败');image.src='./baseline.png';}catch(e){message('本地设置读取失败：'+e.message);host.ready();}
window.addEventListener('pagehide',()=>{window.removeEventListener('resize',refit);clearTimeout(noticeTimer);stopVoice();request++;off.forEach(f=>f());player.destroy();host.dragEnd();});
