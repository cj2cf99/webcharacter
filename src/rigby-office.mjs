import {officeBack,officeFront} from './rigby-office-art.mjs';
import {makeActor} from './rigby-actor.mjs';
import {WebGLRenderer} from '../vendor/rigby2d/src/webgl/renderer.js';
import {DURATION,BEATS,sceneAt,poseOffice} from './rigby-office-scene.mjs';
const $=s=>document.querySelector(s),canvas=$('#characters'),rear=$('#rear'),front=$('#props'),back=rear.getContext('2d'),ctx=front.getContext('2d');
let actor,renderer,gl,textures,time=0,playing=false,last=0,lastPaint=0;
function draw(){if(!actor)return;actor.seatControls={gather:1,drape:1,legTilt:0};const s=sceneAt(time),p=poseOffice(actor,s),w=Math.round(canvas.clientWidth*Math.min(devicePixelRatio||1,2)),h=Math.round(w*.57);for(const c of [canvas,rear,front])if(c.width!==w||c.height!==h){c.width=w;c.height=h;}for(const c of [ctx,back]){c.setTransform(w/1000,0,0,h/570,0,0);c.clearRect(0,0,1000,570);}
 officeBack(back,s);
 gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);renderer.begin(w,h,{x:500,y:285,zoom:w/1000});renderer.drawSkeleton(actor.sk,actor.pose,textures);renderer.end();
 officeFront(ctx,s);
 $('#phase').textContent=BEATS[s.beat][1];$('#seek').value=time;$('#clock').textContent=`${time.toFixed(1)} / ${DURATION}.0 s`;document.querySelectorAll('[data-time]').forEach((b,i)=>b.classList.toggle('active',i===s.beat));}
function sync(){$('#play').textContent=playing?'暂停':'播放';}
$('#play').onclick=()=>{if(time>=DURATION)time=0;playing=!playing;sync();};$('#replay').onclick=()=>{time=0;playing=true;sync();draw();};$('#seek').oninput=e=>{time=Number(e.target.value);playing=false;sync();draw();};
for(const [t,label] of BEATS){const b=document.createElement('button');b.textContent=label;b.dataset.time=t;b.onclick=()=>{time=t;playing=false;sync();draw();};$('.beats').append(b);}
function frame(now){const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;if(playing&&!document.hidden){time+=dt*Number($('#speed').value);if(time>=DURATION){if($('#loop').checked)time%=DURATION;else{time=DURATION;playing=false;sync();}}if(now-lastPaint>1000/30){draw();lastPaint=now;}}requestAnimationFrame(frame);}
window.addEventListener('resize',draw);
try{gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true});if(!gl)throw Error('需要 WebGL2');renderer=new WebGLRenderer(gl);async function file(name,type){const r=await fetch('../assets/white/'+name);if(!r.ok)throw Error(name+' 加载失败');return r[type]();}const [json,manifest]=await Promise.all([file('character.json','json'),file('manifest.json','json')]);textures=renderer.imageTextures(new Map(await Promise.all(manifest.images.map(async n=>[n,await createImageBitmap(await file(n+'.png','blob'),{premultiplyAlpha:'none'})]))));actor=makeActor(json,1,{palmOffset:65});$('#play').disabled=$('#replay').disabled=false;draw();playing=true;sync();requestAnimationFrame(frame);}catch(e){$('#error').textContent=e.message;console.error(e);}
