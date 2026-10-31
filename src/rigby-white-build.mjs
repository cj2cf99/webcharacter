// 将已有拆层图转换为 Rigby2D 骨骼。只生成 work/ 中间产物，不修改原图和 PSD。
// 关节位置针对当前素材标定；这不是任意角色的一键自动绑定器。
import {Skeleton,makeBone,makeSlot,makeAttachment,Affine,writeSkeletonJson} from '../vendor/rigby2d/src/core/index.js';
const SIZE=1024,FACTOR=2.53,GROUND=1008,BASE=276;
const cv=(w=SIZE,h=SIZE)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const world=([x,y])=>[(x-512)*FACTOR,(GROUND-y)*FACTOR+BASE];
async function load(name){const r=await fetch('../assets/source-layers/'+name+'.png');if(!r.ok)throw Error('缺少已有图层：'+name);const c=cv();c.getContext('2d').drawImage(await createImageBitmap(await r.blob()),0,0);return c;}
function mask(src,keep){const c=cv(),g=c.getContext('2d'),d=src.getContext('2d').getImageData(0,0,SIZE,SIZE);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(!keep(x,y))d.data[(y*SIZE+x)*4+3]=0;g.putImageData(d,0,0);return c;}
// 清理手臂旁的半透明拆层残渣：最大实心连通区域加 2px 边缘。
function clean(src){const c=cv(),g=c.getContext('2d'),d=src.getContext('2d').getImageData(0,0,SIZE,SIZE),seen=new Uint8Array(SIZE*SIZE);let best=[];
  for(let i=0;i<seen.length;i++){if(seen[i]||d.data[i*4+3]<170)continue;const stack=[i],group=[];seen[i]=1;while(stack.length){const j=stack.pop();group.push(j);const x=j%SIZE;for(const k of [x?j-1:-1,x<SIZE-1?j+1:-1,j-SIZE,j+SIZE])if(k>=0&&k<seen.length&&!seen[k]&&d.data[k*4+3]>=170){seen[k]=1;stack.push(k);}}if(group.length>best.length)best=group;}
  const keep=new Uint8Array(seen.length);for(const j of best){const x=j%SIZE,y=Math.floor(j/SIZE);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE)keep[yy*SIZE+xx]=1;}}
  for(let i=0;i<keep.length;i++)if(!keep[i])d.data[i*4+3]=0;g.putImageData(d,0,0);return c;}
function stack(...layers){const c=cv(),g=c.getContext('2d');layers.forEach(l=>g.drawImage(l,0,0));return c;}
function bounds(c){const d=c.getContext('2d').getImageData(0,0,SIZE,SIZE).data;let x0=SIZE,y0=SIZE,x1=-1,y1=-1;for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(d[(y*SIZE+x)*4+3]>2){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}if(x1<0)throw Error('图层为空');return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};}
export async function buildWhiteRig(){
  const names=['body','arm_L','arm_R','hair_back','hair_front','face','eye_L','eye_R','iris_L','iris_R','lash_L','lash_R','brow_L','brow_R','nose','mouth'];
  const loaded=await Promise.all(names.map(load)),src=Object.fromEntries(names.map((n,i)=>[n,loaded[i]]));
  const sk=new Skeleton();sk.name='white-haired-prototype';const ids={root:0},frames={root:Affine.identity()};
  function bone(name,parent,from,to){const a=world(from),b=world(to),angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;const m=new Affine(Math.cos(angle*Math.PI/180),Math.sin(angle*Math.PI/180),-Math.sin(angle*Math.PI/180),Math.cos(angle*Math.PI/180),...a);const local=frames[parent].inverse().mul(m).decompose();ids[name]=sk.bones.length;sk.bones.push(makeBone(name,ids[parent],local,Math.hypot(b[0]-a[0],b[1]-a[1])));frames[name]=m;}
  bone('hip','root',[512,610],[512,440]);bone('chest','hip',[512,440],[512,320]);bone('head','chest',[512,288],[512,120]);bone('mouth','head',[511,250],[531,250]);
  bone('eye_l','head',[564,199],[584,199]);bone('eye_r','head',[455,199],[475,199]);
  for(const side of ['l','r']){const mirror=p=>side==='l'?p:[1024-p[0],p[1]];
    bone('upperarm_'+side,'chest',mirror([577,352]),mirror([631,490]));bone('forearm_'+side,'upperarm_'+side,mirror([631,490]),mirror([670,582]));bone('hand_'+side,'forearm_'+side,mirror([670,582]),mirror([681,617]));
    bone('thigh_'+side,'hip',mirror([551,687]),mirror([550,821]));bone('shin_'+side,'thigh_'+side,mirror([550,821]),mirror([550,951]));bone('foot_'+side,'shin_'+side,mirror([550,951]),mirror([553,1001]));
    for(const [part,first,second,pos] of [['hand','upperarm','forearm',[670,582]],['foot','thigh','shin',[550,951]]]){const name='ik_'+part+'_'+side,p=mirror(pos);bone(name,'root',p,[p[0]+20,p[1]]);sk.ik.push({name,order:sk.ik.length,bones:[ids[first+'_'+side],ids[second+'_'+side]],target:ids[name],mix:part==='foot'?1:0,softness:0,bendPositive:part==='hand'?side==='l':side==='r',compress:false,stretch:false,uniform:false});}
  }
  const images=new Map(),report=[];
  function image(name,source){const b=bounds(source),c=cv(b.w,b.h);c.getContext('2d').drawImage(source,b.x,b.y,b.w,b.h,0,0,b.w,b.h);images.set(name,c);report.push({name,...b});return b;}
  function region(name,source,boneName,slotName=name){const b=image(name,source),center=world([b.x+b.w/2,b.y+b.h/2]);const m=frames[boneName].inverse().mul(new Affine(1,0,0,1,...center));const att=makeAttachment(name,name,m.decompose(),b.w*FACTOR,b.h*FACTOR);const slot=sk.slots.find(s=>s.name===slotName);if(slot)slot.attachments.push(att);else sk.slots.push(makeSlot(slotName,ids[boneName],att));}
  function mesh(name,source,boneNames,cuts){const b=image(name,source),nx=6,ny=Math.max(12,Math.ceil(b.h/12)),uvs=[],triangles=[],weights=[];
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const px=b.x+x/nx*b.w,py=b.y+y/ny*b.h,p=world([px,py]);uvs.push(x/nx,y/ny);let influences;
      if(boneNames.length===2){const blend=Math.max(0,Math.min(1,(py-cuts[0]+15)/30));influences=[[boneNames[0],1-blend],[boneNames[1],blend]];}
      else if(py<cuts[0]){const f=Math.max(0,Math.min(1,(py-cuts[0]+18)/36));influences=[[boneNames[0],1-f],[boneNames[1],f]];}
      else if(py<cuts[1]-12){const f=Math.max(0,Math.min(1,(py-cuts[0]+18)/36));influences=[[boneNames[0],1-f],[boneNames[1],f]];}
      else {const f=Math.max(0,Math.min(1,(py-cuts[1]+12)/24));influences=[[boneNames[1],1-f],[boneNames[2],f]];}
      weights.push(influences.filter(([,w])=>w>0).map(([n,weight])=>{const [xx,yy]=frames[n].inverse().apply(p);return {bone:ids[n],x:xx,y:yy,weight};}));
      if(x<nx&&y<ny){const k=y*(nx+1)+x;triangles.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}}
    sk.slots.push(makeSlot(name,ids[boneNames[0]],{name,type:'mesh',image:name,width:b.w*FACTOR,height:b.h*FACTOR,uvs,triangles,weights,color:[1,1,1,1]}));}
  region('hair_back',src.hair_back,'head');
  for(const side of ['r','l']){const leg=mask(src.body,(x,y)=>y>=690&&(side==='l'?x>=512:x<512));mesh('leg_'+side,leg,['thigh_'+side,'shin_'+side,'foot_'+side],[821,951]);}
  // 只保留裙装本体，去除旧 body 图层右侧的头发补画残留。
  const torso=mask(src.body,(x,y)=>y<704&&(y<435||Math.abs(x-512)<90+(y-435)*.31));region('torso',torso,'hip');
  region('face',src.face,'head');
  for(const side of ['L','R'])region('eye_'+side,stack(src['eye_'+side],src['iris_'+side],src['lash_'+side]),'eye_'+side.toLowerCase());
  region('brows',stack(src.brow_L,src.brow_R),'head');region('nose',src.nose,'head');
  region('mouth_smile',src.mouth,'mouth','mouth');const open=cv(),g=open.getContext('2d');g.fillStyle='#632f3a';g.beginPath();g.ellipse(511,250,12,14,0,0,Math.PI*2);g.fill();g.fillStyle='#d7848e';g.beginPath();g.ellipse(511,258,8,4,0,0,Math.PI*2);g.fill();region('mouth_o',open,'mouth','mouth');
  region('hair_front',src.hair_front,'head');
  for(const side of ['r','l']){const arm=clean(src[side==='l'?'arm_L':'arm_R']);mesh('upperarm_'+side,mask(arm,(x,y)=>y<=585),['upperarm_'+side,'forearm_'+side],[490]);region('hand_'+side,mask(arm,(x,y)=>y>=579),'hand_'+side);}
  sk.extra.prototype={source:'work/rig-layers',kind:'calibrated-layer-rig',palmOffset:65,gaitScale:.55};
  const exported=writeSkeletonJson(sk);
  return {json:exported.json,warnings:exported.warnings,images,report,bones:sk.bones.length};
}
