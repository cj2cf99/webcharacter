// 细节全部从已变形的裙装网格取点，避免褶皱像贴纸一样滑离衣服。
export function dressDetails(ctx,a,s){
 const strength=Math.max(s.ride,s.crouch*.55);if(!strength)return;
 const {slot,att}=a.seatedDress,v=a.pose.worldVertices(a.sk,slot,att);
 const p=(row,col)=>{const i=(row*13+col)*2;return[v[i],570-v[i+1]];};
 ctx.save();ctx.lineCap='round';
 for(const col of [4,5,7,8,9]){
  const top=p(17,col),mid=p(22,col),end=p(26,col);
  ctx.strokeStyle=`rgba(80,68,92,${.13*strength})`;ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(...top);ctx.quadraticCurveTo(mid[0]-4,mid[1]+2,...end);ctx.stroke();
  ctx.strokeStyle=`rgba(255,255,255,${.5*strength})`;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(top[0]+1.8,top[1]);ctx.quadraticCurveTo(mid[0]-2,mid[1]+2,end[0]+1.8,end[1]);ctx.stroke();
 }
 if(s.ride){const l=p(23,3),m=p(24,5),r=p(23,8);ctx.strokeStyle=`rgba(65,51,72,${.14*s.ride})`;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(...l);ctx.quadraticCurveTo(...m,...r);ctx.stroke();}
 ctx.restore();
}
export function atmosphere(ctx,s){
 ctx.save();
 // 魔法从抽出扫帚开始聚集，起飞后留下逐渐变淡的星屑。
 if(s.t>12.8&&s.t<23){
  const power=Math.min(1,(s.t-12.8)/1.4);
  for(let i=0;i<18;i++){const phase=((s.t*.7+i*.137)%1),x=s.x-40-i*7-phase*40,y=365+s.y+Math.sin(i*2.4+s.t)*23+phase*25;
   ctx.globalAlpha=(1-phase)*power*.65;ctx.fillStyle=i%2?'#bda1da':'#e4bd6e';ctx.beginPath();ctx.arc(x,y,1.2+(i%3)*.7,0,Math.PI*2);ctx.fill();}
 }
 if(s.t>1.8&&s.t<3.1){ctx.globalAlpha=(3.1-s.t)/1.3;ctx.fillStyle='#d6ae54';ctx.font='19px serif';ctx.textAlign='center';for(let i=0;i<3;i++){const q=s.t*5+i*Math.PI*2/3;ctx.fillText('✦',s.x+Math.cos(q)*44,128+Math.sin(q)*9);}}
 ctx.restore();
}
