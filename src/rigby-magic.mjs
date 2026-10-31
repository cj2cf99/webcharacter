import {dressDetails,atmosphere} from './rigby-magic-details.mjs';
import {makeActor} from './rigby-actor.mjs';
import {WebGLRenderer} from '../vendor/rigby2d/src/webgl/renderer.js';
import {DURATION,BEATS,sceneAt,poseMagic} from './rigby-magic-scene.mjs';
const $=s=>document.querySelector(s),canvas=$('#characters'),rear=$('#rear'),front=$('#props'),back=rear.getContext('2d'),ctx=front.getContext('2d');
let actor,renderer,gl,textures,time=0,playing=false,last=0,lastPaint=0;
function book(c,p,angle,scale){c.save();c.translate(...p);c.rotate(angle);c.scale(scale,scale);c.fillStyle='#714b92';c.strokeStyle='#47345b';c.lineWidth=2;c.beginPath();c.roundRect(-27,-15,54,30,4);c.fill();c.stroke();c.fillStyle='#f6ead3';c.fillRect(-22,6,46,6);c.fillStyle='#d8b875';c.fillRect(-21,-12,3,16);c.strokeStyle='#e6ce92';c.strokeRect(-12,-10,27,13);c.font='12px serif';c.textAlign='center';c.fillStyle='#ecdca9';c.fillText('✦',1,1);c.restore();}
function broom(c,p,angle,scale){c.save();c.translate(...p);c.rotate(angle);c.scale(scale,scale);c.lineCap='round';c.strokeStyle='#67462c';c.lineWidth=9;c.beginPath();c.moveTo(-110,0);c.lineTo(125,0);c.stroke();c.fillStyle='#ceac63';c.beginPath();c.moveTo(-83,-10);c.lineTo(-155,-29);c.quadraticCurveTo(-171,0,-155,29);c.lineTo(-83,10);c.closePath();c.fill();c.strokeStyle='#a47b3d';c.lineWidth=2;for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(-87,i*2);c.lineTo(-158,i*8);c.stroke();}c.strokeStyle='#805541';c.lineWidth=5;c.beginPath();c.moveTo(-90,-12);c.lineTo(-90,12);c.stroke();c.restore();}
function draw(){if(!actor)return;actor.seatControls={gather:Number($('#gather').value),drape:Number($('#drape').value),legTilt:Number($('#leg-tilt').value)};const s=sceneAt(time),p=poseMagic(actor,s),w=Math.round(canvas.clientWidth*Math.min(devicePixelRatio||1,2)),h=Math.round(w*.57);for(const c of [canvas,rear,front])if(c.width!==w||c.height!==h){c.width=w;c.height=h;}for(const c of [ctx,back]){c.setTransform(w/1000,0,0,h/570,0,0);c.clearRect(0,0,1000,570);}
 back.fillStyle=`rgba(71,63,84,${.12*(1-s.flight)})`;back.beginPath();back.ellipse(Math.min(s.x,940),493,65*(1-s.flight),8,0,0,Math.PI*2);back.fill();
 if(s.bookVisible)book(p.bookBehind?back:ctx,p.book,p.bookAngle,p.bookScale);
 if(s.broomVisible)broom(back,p.broom,p.broomAngle,p.broomScale);
 if(s.flight>0){back.strokeStyle='#b59dd070';back.lineWidth=3;for(let i=0;i<7;i++){back.beginPath();back.moveTo(s.x-130-i*19,s.y+375+i*11);back.lineTo(s.x-190-i*22,s.y+385+i*11);back.stroke();}}
 gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);renderer.begin(w,h,{x:500,y:285,zoom:w/1000});renderer.drawSkeleton(actor.sk,actor.pose,textures);renderer.end();
 dressDetails(ctx,actor,s);atmosphere(ctx,s);
 if(s.bonk>0){ctx.fillStyle='#d6a442';ctx.font='bold 30px system-ui';ctx.fillText('✦',s.x-55,125);ctx.fillText('✧',s.x+35,140);}
 const text=time<1.8?'今天也很安静……':time<2.6?'哎哟！':time<3.4?'……书也会偷袭？':time<6?'谁的书？':time<8.5?'让我看看……':time<10.3?'原来是我的魔法书！':time<12.5?'没事，假装什么都没发生。':time<15.5?'扫帚，出来！':time<17?'整理一下裙摆……':time<18?'坐稳，优雅出发。':time<23?'出发！':'她飞走了 · 可以重播';
 ctx.fillStyle='#fff9';ctx.beginPath();ctx.roundRect(360,58,280,42,16);ctx.fill();ctx.fillStyle='#695478';ctx.textAlign='center';ctx.font='17px system-ui';ctx.fillText(text,500,85);
 $('#phase').textContent=BEATS[s.beat][1];$('#seek').value=time;$('#clock').textContent=`${time.toFixed(1)} / ${DURATION}.0 s`;document.querySelectorAll('[data-time]').forEach((b,i)=>b.classList.toggle('active',i===s.beat));}
function sync(){$('#play').textContent=playing?'暂停':'播放';}
$('#play').onclick=()=>{if(time>=DURATION)time=0;playing=!playing;sync();};$('#replay').onclick=()=>{time=0;playing=true;sync();draw();};$('#seek').oninput=e=>{time=Number(e.target.value);playing=false;sync();draw();};
for(const [t,label] of BEATS){const b=document.createElement('button');b.textContent=label;b.dataset.time=t;b.onclick=()=>{time=t;playing=false;sync();draw();};$('.beats').append(b);}
function frame(now){const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;if(playing&&!document.hidden){time+=dt*Number($('#speed').value);if(time>=DURATION){if($('#loop').checked)time%=DURATION;else{time=DURATION;playing=false;sync();}}if(now-lastPaint>1000/30){draw();lastPaint=now;}}requestAnimationFrame(frame);}
window.addEventListener('resize',draw);
for(const id of ['gather','drape','leg-tilt'])$('#'+id).oninput=draw;
$('#seat-reset').onclick=()=>{ $('#gather').value=1;$('#drape').value=1;$('#leg-tilt').value=0;draw(); };
try{gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true});if(!gl)throw Error('需要 WebGL2');renderer=new WebGLRenderer(gl);async function file(name,type){const r=await fetch('../assets/white/'+name);if(!r.ok)throw Error(name+' 加载失败');return r[type]();}const [json,manifest]=await Promise.all([file('character.json','json'),file('manifest.json','json')]);textures=renderer.imageTextures(new Map(await Promise.all(manifest.images.map(async n=>[n,await createImageBitmap(await file(n+'.png','blob'),{premultiplyAlpha:'none'})]))));actor=makeActor(json,1,{palmOffset:65});$('#play').disabled=$('#replay').disabled=false;draw();playing=true;sync();requestAnimationFrame(frame);}catch(e){$('#error').textContent=e.message;console.error(e);}
