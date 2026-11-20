// 原生二维绘画：连续轮廓、分区覆羽、披肩羽缘和胸盾。没有 3D 投影或烘焙帧。
import {smooth,bodyMotion} from './motion.mjs';
const lerp=(a,b,t)=>a+(b-a)*t;
let seed=617;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const flecks=Array.from({length:1800},()=>[random(),random(),random(),random()]);
function oval(c,x,y,rx,ry,fill,a=0){c.beginPath();c.ellipse(x,y,rx,ry,a,0,Math.PI*2);c.fillStyle=fill;c.fill();}
function stroke(c,pts,color,w){c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.stroke();}
function featherTexture(blue=false,variant=0){
  const a=document.createElement('canvas');a.width=64;a.height=160;const c=a.getContext('2d');
  c.beginPath();c.moveTo(31,0);c.bezierCurveTo(13,35,2,92,9,138);c.quadraticCurveTo(12,155,25,158);c.lineTo(31,154);c.lineTo(35,158);c.quadraticCurveTo(55,154,56,134);c.bezierCurveTo(57,87,47,29,31,0);
  const g=c.createLinearGradient(0,0,64,0);
  if(blue){g.addColorStop(0,'#075583');g.addColorStop(.32,`hsl(${188+variant*4} 90% 42%)`);g.addColorStop(.65,'#52d9dd');g.addColorStop(1,'#087ab1');}
  else{g.addColorStop(0,'#05090b');g.addColorStop(.43,`rgb(${15+variant},${20+variant},${23+variant})`);g.addColorStop(.57,'#172023');g.addColorStop(1,'#080c0e');}
  c.fillStyle=g;c.fill();c.save();c.clip();
  for(let y=19;y<158;y+=2){stroke(c,[[31,y-12],[5,y+1]],blue?'#9afff125':'#80958f12',.65);stroke(c,[[32,y-12],[59,y+1]],blue?'#002e6b22':'#00040750',.65);}
  stroke(c,[[31,10],[32,153]],blue?'#b3f8e943':'#718b8225',.6);c.restore();return a;
}
const blacks=Array.from({length:4},(_,i)=>featherTexture(false,i));
const blues=Array.from({length:4},(_,i)=>featherTexture(true,i));
let atlas=null,shieldArt=null;
export async function loadBirdArt(){const img=new Image(),shield=new Image();img.src=new URL('./assets/male-atlas-v1.png',import.meta.url).href;shield.src=new URL('./assets/breast-shield-v1.png',import.meta.url).href;await Promise.all([img.decode(),shield.decode()]);atlas=img;shieldArt=shield;}
function cutout(c,source,dest,alpha=1){c.save();c.globalAlpha*=alpha;c.drawImage(atlas,...source,...dest);c.restore();}
function feather(c,x,y,w,h,angle,blue=false,k=0){c.save();c.translate(x,y);c.rotate(angle);c.drawImage((blue?blues:blacks)[k%4],-w/2,0,w,h);c.restore();}
function featherTo(c,x,y,ex,ey,w,blue=false,k=0){feather(c,x,y,w,Math.hypot(ex-x,ey-y),Math.atan2(-(ex-x),ey-y),blue,k);}
function velvet(c,x,y,rx,ry,rotation=0,density=800){
  const g=c.createRadialGradient(x-rx*.4,y-ry*.4,0,x,y,Math.max(rx,ry));g.addColorStop(0,'#1b2325');g.addColorStop(.5,'#0c1215');g.addColorStop(1,'#030709');oval(c,x,y,rx,ry,g,rotation);
  c.save();c.translate(x,y);c.rotate(rotation);
  for(let i=0;i<density;i++){const f=flecks[i],a=f[0]*Math.PI*2,r=Math.sqrt(f[1]);let px=Math.cos(a)*rx*r,py=Math.sin(a)*ry*r;
    stroke(c,[[px,py],[px+Math.cos(a)*f[2]*2,py+3+f[2]*4]],f[3]>.6?'#6e817517':'#00070a55',.45+f[2]*.6);
  }c.restore();
}
function tail(c,p){
  const f=p.front,hide=1-smooth((p.fan-.82)/.18);c.save();c.globalAlpha=hide;
  if(atlas){c.translate(lerp(30,0,f),-78);c.rotate(lerp(-.44,0,f));cutout(c,[840,594,200,650],[-18,0,42,133]);c.restore();return;}
  for(let i=0;i<7;i++)featherTo(c,lerp(28,0,f)+(i-3)*4,-83,lerp(100,12,f)+(i-3)*5,lerp(32,46,f)+Math.abs(i-3)*-4,13,false,i);
  c.restore();
}
function foot(c,x,y,side){
  for(let j=-1;j<=1;j++){const tip=x+j*10+side*4;stroke(c,[[x,y],[tip,y+4],[tip+j*5,y+10]],'#101816',3);stroke(c,[[x,y-1],[tip,y+3]],'#7c81705c',.7);stroke(c,[[tip+j*5,y+10],[tip+j*7,y+12],[tip+j*8,y+8]],'#878977',1);}
  stroke(c,[[x,y],[x-side*12,y-2],[x-side*15,y+3]],'#242d26',2.6);
}
function legs(c,p,m){
  for(const side of [-1,1]){
    const fx=side*24+m.feet[side===-1?0:1].x,fy=m.feet[side===-1?0:1].y,hipx=m.x+Math.cos(m.roll)*side*24*m.yaw+Math.sin(m.roll)*57,hipy=m.y+Math.sin(m.roll)*side*24*m.yaw-Math.cos(m.roll)*57,kx=fx+side*3+lerp(12,0,p.front),ky=-26+fy*.45;
    stroke(c,[[hipx,hipy],[kx,ky],[fx,fy]],'#141c19',5.5);stroke(c,[[kx-1,ky],[fx-1,fy]],'#727968',1.1);
    for(let j=0;j<6;j++)stroke(c,[[lerp(kx,fx,j/6)-2,lerp(ky,fy,j/6)],[lerp(kx,fx,j/6)+2,lerp(ky,fy,j/6)+1]],'#89907a4b',.7);
    foot(c,fx,fy,side);
  }
}
function body(c,p){
  if(atlas){const f=p.front;cutout(c,[108,599,490,625],[lerp(-54,-65,f),-202,138,176]);return;}
  const f=p.front;velvet(c,lerp(9,0,f),-119,lerp(66,57,f),81,lerp(-.34,0,f),1150);
  // 肩羽覆盖长飞羽根部，飞羽沿身体后下方叠压。
  for(const side of [1,-1]){c.save();c.globalAlpha*=side===1?1:lerp(.25,1,f);
    for(let row=0;row<4;row++)for(let j=9;j>=0;j--){const x=lerp(12,side*26,f)+side*row*4+j*lerp(3.1,.8,f),y=-178+row*13+j*5;featherTo(c,x,y,x+lerp(35,side*5,f)+side*row*1.5,y+45+row*10+(9-j)*2,12+row*2,false,j+row);}c.restore();
  }
  velvet(c,lerp(-22,0,f),-178,32,53,lerp(-.2,0,f),480);
}
function head(c,p,t){
  if(atlas){const f=smooth((p.front-.35)/.3),turn=Math.sin(t*.8)*.015*(1-f);c.save();c.translate(0,-168);c.rotate(turn+(p.bow||0)*(1-f));c.translate(0,-(p.bow||0)*8);c.scale(1,1+(p.bow||0)*f*.4);c.translate(0,smooth((p.fan-.82)/.18)*35);cutout(c,[48,40,550,485],[-105,-111,148*(1-f*.13),131],1-f);cutout(c,[768,40,380,485],[-48,-111,102,131],f);const blink=smooth((Math.sin(t*.97)-.992)/.008);if(blink>0){c.save();c.globalAlpha*=blink;oval(c,-22,lerp(-78,-81,f),3.4,3.4,'#151a18');if(f>.5)oval(c,22,-81,3.4,3.4,'#151a18');c.restore();}c.restore();return;}
  const f=p.front,hx=lerp(-34,0,f),hy=lerp(-225,-235,f)+Math.sin(t*.8)*.8;
  c.save();c.translate(hx,hy);c.rotate((1-f)*Math.sin(t*.9)*.035);
  velvet(c,0,0,34,34,0,410);velvet(c,6,20,29,34,-.12,250);
  const bx=lerp(-75,-4,f);c.beginPath();c.moveTo(lerp(-20,-10,f),-9);c.bezierCurveTo(lerp(-43,-9,f),-14,bx+7,-8,bx,0);c.quadraticCurveTo(bx+6,2,lerp(-18,10,f),5);c.closePath();
  const beak=c.createLinearGradient(0,-12,0,7);beak.addColorStop(0,'#7a8278');beak.addColorStop(.28,'#384344');beak.addColorStop(1,'#0b1417');c.fillStyle=beak;c.fill();
  c.beginPath();c.moveTo(bx,1);c.quadraticCurveTo(lerp(-43,-2,f),10,lerp(-17,8,f),8);c.lineTo(lerp(-19,8,f),4);c.closePath();c.fillStyle='#182224';c.fill();stroke(c,[[bx+3,1],[lerp(-19,7,f),5]],'#020809',.8);
  for(const side of [-1,1]){c.save();c.globalAlpha*=side===-1?1:f;const ex=lerp(-12,side*20,f),ey=-6;oval(c,ex,ey,6,6.3,'#565d51');oval(c,ex,ey,4.8,5.2,'#020505');oval(c,ex-1.4,ey-1.6,1.3,1.3,'#d9e7d2');const blink=smooth((Math.sin(t*.97)-.985)/.015);if(blink>0)oval(c,ex,ey,6,6.3*blink,'#0e1719');c.restore();}
  c.save();c.beginPath();c.ellipse(0,-29,13,5,-.12,0,Math.PI*2);c.clip();for(let j=0;j<72;j++){const x=(j%18-8.5)*1.6,y=-35+Math.floor(j/18)*2;feather(c,x,y,3,7,-x*.014,true,j);}c.restore();c.restore();
}
function fanPoint(p,side,u,v){
  const theta=lerp(0,Math.PI,u),folded=[side*(24+u*34)*v,-186+v*(45+u*86)];
  const a=lerp(1.65,2.9,u),drape=[side*(12+Math.sin(a)*176*v),-203-Math.cos(a)*141*v];
  const b=lerp(-.12,1.88,u),raised=[side*(8+Math.sin(b)*181*v),-215-Math.cos(b)*163*v];
  const full=[side*Math.sin(theta)*203*v,-180-Math.cos(theta)*128*v];
  const expand=smooth(p.fan/.65),disk=smooth((p.fan-.82)/.18),x=lerp(folded[0],lerp(drape[0],raised[0],p.raise),expand),y=lerp(folded[1],lerp(drape[1],raised[1],p.raise),expand);
  return [lerp(x,full[0],disk),lerp(y,full[1],disk)];
}
function cape(c,p,t){
  const expand=smooth(p.fan/.65),full=smooth((p.fan-.82)/.18);
  // 两个半面共享的抗锯齿边不能露出背景，完全扣合时先铺连续黑幕。
  if(full>.995)oval(c,0,-180,203,128,'#030608');
  for(const side of [-1,1]){c.beginPath();c.moveTo(...fanPoint(p,side,0,0));for(let j=0;j<=64;j++)c.lineTo(...fanPoint(p,side,j/64,1));c.closePath();c.fillStyle='#030608';c.fill();}
  for(let row=0;row<5;row++)for(const side of [-1,1])for(let j=0;j<65;j++){
    const u=j/64,v=1-row*.16+(row?Math.sin(j*1.7+row)*.025:0),[x,y]=fanPoint(p,side,u,v),[ix,iy]=fanPoint(p,side,u,Math.max(0,v-.35)),flutter=Math.sin(t*13-u*6-row*.7)*p.dance*.6*(1-u*.4);
    c.save();c.globalAlpha*=lerp(.4,0,full);featherTo(c,ix,iy,x+flutter,y+flutter*.5,lerp(10,17,expand),false,j+row);c.restore();
  }
  for(let j=0;j<460;j++){const side=j<230?-1:1,u=(j%230)/229,[x,y]=fanPoint(p,side,u,1),[ix,iy]=fanPoint(p,side,u,.98),f=flecks[j];stroke(c,[[ix,iy],[x+(f[0]-.5)*2,y+f[1]*2]],'#111918',.7);}
}
function shield(c,p,full){
  const w=lerp(29,153,p.shield),cy=lerp(-180,-153,p.shield),depth=lerp(25,39,p.shield)*(1-full*.18);
  c.save();c.translate(lerp(-27,0,p.front),0);
  if(shieldArt){c.drawImage(shieldArt,-w,cy-5,w*2,depth+10);if(full>.05){c.globalAlpha*=full;for(const side of [-1,1])oval(c,side*15,-214,4.5,2.6,'#56e2e5');}c.restore();return;}
  c.beginPath();c.moveTo(-w,cy);c.quadraticCurveTo(0,cy-3,w,cy);c.quadraticCurveTo(w*lerp(.95,.56,p.shield),cy+depth,0,cy+depth);c.quadraticCurveTo(-w*lerp(.95,.56,p.shield),cy+depth,-w,cy);c.closePath();
  const color=c.createLinearGradient(-w,cy,w,cy+depth);color.addColorStop(0,'#087da8');color.addColorStop(.45,'#58dadc');color.addColorStop(.7,'#29c3d3');color.addColorStop(1,'#0878aa');c.fillStyle=color;c.fill();c.save();c.clip();
  for(let row=0;row<8;row++)for(let j=0;j<85;j++){const u=(j-42+(row%2)*.5)/42,x=u*w,y=cy-7+row*4+Math.pow(Math.max(0,1-u*u),.7)*row*.7+Math.sin(j*1.7)*.6;c.save();c.globalAlpha*=.5;feather(c,x,y,lerp(2.8,5,p.shield),9,-u*.22,true,j+row);c.restore();}c.restore();
  if(full>.05){c.globalAlpha*=full;for(const side of [-1,1]){const x=side*15;oval(c,x,-214,4.5,2.6,'#45cfe0');for(let j=0;j<4;j++)stroke(c,[[x-3+j*1.5,-216],[x-2+j*1.5,-213]],'#a4f1df88',.5);}}c.restore();
}
export function drawBird(c,p,t){
  const m=bodyMotion(p,t),full=smooth((p.fan-.82)/.18);oval(c,m.x*.3,5,lerp(64,81,full),9,'#040b0866');legs(c,p,m);
  c.save();c.translate(m.x,m.y);c.rotate(m.roll);c.scale(m.yaw,1);tail(c,p);if(p.fan>0){c.save();c.globalAlpha*=smooth(p.fan/.12);cape(c,p,t);c.restore();}if(full<1){c.save();c.globalAlpha=1-full;body(c,p);head(c,p,t);c.restore();}shield(c,p,full);c.restore();
}
export {fanPoint};
