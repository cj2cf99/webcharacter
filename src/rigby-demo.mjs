import {makeActor,poseActor} from './rigby-actor.mjs';
import {WebGLRenderer} from '../vendor/rigby2d/src/webgl/renderer.js';
import {DURATION,sceneAt,ease,mix,pointMix} from './rigby-scene.mjs';
const $=s=>document.querySelector(s), canvas=$('#characters'), overlay=$('#props'), ctx=overlay.getContext('2d');
const FLOOR=490,W=1000,H=570;
let renderer,gl,actors=[],textures,time=0,playing=false,last=0,lastPaint=0,frameCost=0,frames=0;
function apple(p){ctx.save();ctx.translate(...p);ctx.fillStyle='#d84a41';ctx.beginPath();ctx.moveTo(0,-10);ctx.bezierCurveTo(-24,-22,-28,10,-12,22);ctx.bezierCurveTo(-6,28,-3,23,0,24);ctx.bezierCurveTo(5,22,9,29,16,19);ctx.bezierCurveTo(30,-1,19,-24,0,-10);ctx.fill();ctx.strokeStyle='#79513a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-10);ctx.quadraticCurveTo(-2,-21,4,-25);ctx.stroke();ctx.fillStyle='#698b43';ctx.beginPath();ctx.ellipse(10,-21,9,4,-.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff85';ctx.lineWidth=3;ctx.beginPath();ctx.arc(-8,-1,7,3.4,4.5);ctx.stroke();ctx.restore();}
function bubble(x,text){ctx.font='16px system-ui';const w=ctx.measureText(text).width+34;ctx.fillStyle='#ffffffed';ctx.beginPath();ctx.roundRect(x-w/2,62,w,40,14);ctx.fill();ctx.fillStyle='#3c5144';ctx.textAlign='center';ctx.fillText(text,x,88);}
function draw(){
  if(!actors.length)return;const start=performance.now(),s=sceneAt(time);
  const dpr=Math.min(devicePixelRatio||1,2),width=Math.round(canvas.clientWidth*dpr),height=Math.round(width*H/W);
  if(canvas.width!==width||canvas.height!==height){canvas.width=overlay.width=width;canvas.height=overlay.height=height;}
  gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  ctx.setTransform(width/W,0,0,height/H,0,0);ctx.clearRect(0,0,W,H);
  for(const x of [s.ax,s.bx]){ctx.fillStyle='#526b5220';ctx.beginPath();ctx.ellipse(x,FLOOR+2,67,9,0,0,Math.PI*2);ctx.fill();}
  actors.forEach((a,i)=>poseActor(a,i?s.bx:s.ax,s,i));
  renderer.begin(width,height,{x:W/2,y:H/2,zoom:width/W});for(const a of actors)renderer.drawSkeleton(a.sk,a.pose,textures);renderer.end();
  // 交接前后使用同一个接触点，不复制苹果，也不做假抛物线。
  if(s.owner)apple(actors[s.owner==='A'?0:1].palm);
  if(time>=4&&time<6.3)bubble(s.ax,'请你吃苹果！');else if(time>=6.3&&time<7.7)bubble(s.bx,'谢谢！');else if(time>=9&&time<11)bubble(s.bx,'啊呜，好吃！');
  ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillStyle='#6b7d70';ctx.fillText('A · 递出苹果',s.ax,530);ctx.fillText('B · 接住吃掉',s.bx,530);
  $('#phase').textContent=s.phase;$('#seek').value=time;$('#clock').textContent=`${time.toFixed(1)} / 12.0 s`;
  document.querySelectorAll('[data-time]').forEach((b,i)=>b.classList.toggle('active',i===s.beat));
  frameCost+=performance.now()-start;frames++;$('#metrics').textContent=`双角色更新与绘制 CPU 平均 ${(frameCost/frames).toFixed(2)} ms / 帧（不代表 GPU 耗时）；目标 30 fps。`;
}
function syncPlay(){ $('#play').textContent=playing?'暂停':'播放'; }
function seek(t){time=Math.max(0,Math.min(DURATION,t));draw();}
$('#play').onclick=()=>{if(time>=DURATION)time=0;playing=!playing;syncPlay();};
$('#replay').onclick=()=>{seek(0);playing=true;syncPlay();};
$('#seek').oninput=e=>{playing=false;syncPlay();seek(Number(e.target.value));};
document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{playing=false;syncPlay();seek(Number(b.dataset.time));});
document.addEventListener('visibilitychange',()=>{last=performance.now();});
function frame(now){const dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;if(!document.hidden&&playing){time+=dt*Number($('#speed').value);if(time>=DURATION){if($('#loop').checked)time%=DURATION;else{time=DURATION;playing=false;syncPlay();}}if(now-lastPaint>1000/30){draw();lastPaint=now;}}requestAnimationFrame(frame);}
window.addEventListener('resize',draw);
try{
  gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true});if(!gl)throw Error('浏览器未提供 WebGL2，请在 Edge / Chrome 中启用硬件加速后重试。');
  renderer=new WebGLRenderer(gl);
  {
    async function whiteFile(name,type){const r=await fetch(new URL('../assets/white/'+name,import.meta.url));if(!r.ok)throw Error('白发角色尚未生成，请先打开 tools/rigby-white.html 生成绑定。');return r[type]();}
    const [json,manifest]=await Promise.all([whiteFile('character.json','json'),whiteFile('manifest.json','json')]);
    const images=new Map(await Promise.all(manifest.images.map(async name=>[name,await createImageBitmap(await whiteFile(name+'.png','blob'),{premultiplyAlpha:'none'})])));
    textures=renderer.imageTextures(images);
    actors=[makeActor(json,1,{palmOffset:65,gaitScale:.55,walkStyle:'pseudo'}),makeActor(json,-1,{palmOffset:65,gaitScale:.55,walkStyle:'pseudo'})];
    $('#cast-name').textContent=' · 当前：现有白发素材';$('#credits').textContent='使用已有白发角色拆层素材，关节针对这张图标定；原图和 PSD 未修改。';
  }
  $('#play').disabled=$('#replay').disabled=false;draw();playing=true;syncPlay();last=performance.now();requestAnimationFrame(frame);
}catch(e){$('#error').textContent='加载失败：'+e.message;$('#phase').textContent='加载失败';console.error(e);}
