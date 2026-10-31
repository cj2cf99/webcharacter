import {toAffine} from '../vendor/rigby2d/src/core/math.js';
import {ease} from './rigby-scene.mjs';
// 仅小剧场实例将整块裙装改为网格；不改原图、导出模型或苹果页。
export function prepareSeatedDress(a){
 if(a.seatedDress)return;
 const slot=a.sk.slots.findIndex(s=>s.name==='torso'),att=a.sk.slots[slot].attachments[0];
 const matrix=toAffine(att.offset),vertices=[],uvs=[],triangles=[],samples=[];
 const nx=12,ny=28;
 for(let row=0;row<=ny;row++)for(let col=0;col<=nx;col++){
  const u=col/nx,v=row/ny,p=matrix.apply([(u-.5)*att.width,(.5-v)*att.height]);
  vertices.push(...p);uvs.push(u,v);
  // 此素材腰线原始 y=435，裙摆 y=704；渐变只作用于腰线以下。
  const rawX=351+361*u,rawY=281+423*v,f=ease((rawY-435)/269);
  samples.push({rawX,f});
  if(col<nx&&row<ny){const k=row*(nx+1)+col;triangles.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}
 }
 Object.assign(att,{type:'mesh',vertices,uvs,triangles});
 a.seatedDress={slot,att,samples};
}
export function deformSeatedDress(a,amount,crouch=0,time=0){
 const d=a.seatedDress,{gather=1,drape=1}=a.seatControls??{};
 // hip 设置姿态旋转 90°：局部 x 向上，局部 y 向左。
 a.pose.deform.set(`${d.slot}/${d.att.name}`,d.samples.flatMap(({rawX,f})=>[
  (35*f*gather*amount+28*f*crouch+Math.sin(rawX*.065)*3*f*amount)*2.53,(-(112*drape-(rawX-512)*.22*gather)*amount-(rawX-512)*.12*crouch)*f*2.53
 ]));
}
