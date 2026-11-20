import {sampleCourtship,duration} from './courtship.mjs';
import {drawBird,loadBirdArt} from './bird-art.mjs';
const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d');
const bg=document.createElement('canvas');bg.width=1400;bg.height=760;const g=bg.getContext('2d');
let seed=8234;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
function ellipse(c,x,y,rx,ry,color,angle=0){c.beginPath();c.ellipse(x,y,rx,ry,angle,0,Math.PI*2);c.fillStyle=color;c.fill();}
function line(c,points,color,width=1){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
// 背景只画一次，前景仅重绘鸟和极少量浮尘，无图片或外部资源请求。
function background(){
  const sky=g.createLinearGradient(0,0,1100,760);sky.addColorStop(0,'#344b2b');sky.addColorStop(.45,'#152c22');sky.addColorStop(1,'#0b1c18');g.fillStyle=sky;g.fillRect(0,0,1400,760);
  g.filter='blur(25px)';
  for(let i=0;i<85;i++){let x=rand()*1500,y=rand()*800;ellipse(g,x,y,25+rand()*100,30+rand()*90,`rgba(${65+rand()*50},${90+rand()*40},49,${.08+rand()*.15})`);}
  for(let i=0;i<13;i++){let x=rand()*1500;line(g,[[x,-100],[x-110,760]],`rgba(8,24,19,${.15+rand()*.4})`,20+rand()*75);}
  g.filter='none';
  const light=g.createRadialGradient(480,-50,20,480,-50,700);light.addColorStop(0,'#c5c78336');light.addColorStop(1,'#a0bb7200');g.fillStyle=light;g.fillRect(0,0,1400,760);
  g.save();g.beginPath();g.moveTo(-80,565);g.bezierCurveTo(340,490,800,565,1470,472);g.lineTo(1470,645);g.bezierCurveTo(900,697,300,610,-80,712);g.closePath();g.clip();
  let bark=g.createLinearGradient(0,520,0,700);bark.addColorStop(0,'#8c8762');bark.addColorStop(.18,'#6d684b');bark.addColorStop(.45,'#494637');bark.addColorStop(1,'#1c241c');g.fillStyle=bark;g.fillRect(0,460,1400,300);
  for(let i=0;i<600;i++){const x=rand()*1400,y=500+rand()*210;line(g,[[x,y],[x+rand()*80+8,y-2-rand()*12],[x+100+rand()*110,y-rand()*12]],rand()>.5?'#141c1660':'#c1b58a27',.5+rand()*3);}
  for(let i=0;i<750;i++){let x=rand()*1400,y=516+Math.sin(x*.006)*12+rand()*28;ellipse(g,x,y,1+rand()*9,.5+rand()*3,['#83915b77','#a8ad6b88','#425c3baa'][i%3]);}
  g.restore();
  // 两端虚焦叶片将注意力留在中间的树干。
  g.filter='blur(5px)';for(const side of [-1,1])for(let i=0;i<10;i++){let x=side<0?rand()*180:1250+rand()*170,y=rand()*760;ellipse(g,x,y,25+rand()*50,8+rand()*13,'#122c20',side*(.3+rand()));}g.filter='none';
  const vignette=g.createRadialGradient(720,340,150,720,340,850);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#020d0bcc');g.fillStyle=vignette;g.fillRect(0,0,1400,760);
}
background();
const dust=Array.from({length:15},()=>({x:rand()*1400,y:rand()*500,s:.5+rand()*1.3}));
const query=new URL(location.href).searchParams;
let time=Math.max(0,Math.min(duration,Number(query.get('t'))||0)),playing=!query.has('still'),looping=true,speed=1,last=0,frameId=0;
let sampled=sampleCourtship(time);
function draw(){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
  ctx.setTransform(canvas.width/1400,0,0,canvas.height/760,0,0);ctx.clearRect(0,0,1400,760);ctx.drawImage(bg,0,0);
  for(const d of dust)ellipse(ctx,(d.x+time*3*d.s)%1400,d.y+Math.sin(time*.3+d.x)*7,d.s,d.s,'#c5d59842');
  // 统一缩放二维坐标，横竖屏均不拉伸鸟形。
  const scale=Math.min(r.width/820,r.height/570);
  ctx.setTransform(dpr*scale,0,0,dpr*scale,r.width*dpr*.51,r.height*dpr*.74);
  sampled=sampleCourtship(time);
  drawBird(ctx,sampled.pose,sampled.clock);
  document.querySelector('#pose-name').textContent=sampled.phase;
  document.querySelector('#seek').value=String(time);
  document.querySelector('#elapsed').textContent=time.toFixed(1)+' / '+duration+' 秒';

}
function updatePlay(){document.querySelector('#play').textContent=playing?'Ⅱ 暂停':'▶ 播放';document.querySelector('#play').setAttribute('aria-label',playing?'暂停动画':'播放动画');}
function requestFrame(){if(!frameId&&playing&&!document.hidden)frameId=requestAnimationFrame(frame);}
document.querySelector('#play').addEventListener('click',()=>{playing=!playing;if(playing&&time>=duration)time=0;last=0;updatePlay();requestFrame();});
document.querySelector('#replay').addEventListener('click',()=>{time=0;last=0;playing=true;updatePlay();draw();requestFrame();});
document.querySelector('#loop').addEventListener('click',()=>{looping=!looping;document.querySelector('#loop').setAttribute('aria-pressed',String(looping));});
document.querySelector('#seek').addEventListener('input',e=>{time=+e.target.value;last=0;draw();});
document.querySelector('#speed').addEventListener('change',e=>{speed=+e.target.value;});
document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else requestFrame();});
new ResizeObserver(()=>draw()).observe(canvas);
function frame(now){frameId=0;const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(playing&&!document.hidden){time+=dt*speed;if(time>=duration){if(looping)time%=duration;else{time=duration;playing=false;updatePlay();}}draw();}requestFrame();}
updatePlay();draw();
const loading=document.querySelector('#loading');
async function load(){loading.textContent='正在载入二维羽毛素材…';try{await loadBirdArt();loading.style.display='none';}catch{loading.replaceChildren(document.createTextNode('素材加载失败，已使用程序绘制。'));const retry=document.createElement('button');retry.textContent='重试';retry.onclick=load;loading.append(retry);loading.style.inset='auto 12px 12px auto';loading.style.padding='8px';}draw();requestFrame();}
load();
