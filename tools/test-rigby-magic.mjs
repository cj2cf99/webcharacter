import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeActor} from '../src/rigby-actor.mjs';
import {sceneAt,poseMagic} from '../src/rigby-magic-scene.mjs';
const a=makeActor(JSON.parse(fs.readFileSync(new URL('../assets/white/character.json',import.meta.url))),1,{palmOffset:65});
function sample(t){const s=sceneAt(t),p=poseMagic(a,s);for(const m of a.pose.world)assert.ok([m.a,m.b,m.c,m.d,m.tx,m.ty].every(Number.isFinite));return {s,p,palm:[...a.palm],world:a.pose.world.map(m=>[m.a,m.b,m.c,m.d,m.tx,m.ty])};}
for(let i=0;i<=1440;i++)sample(i/60);
const before=sample(7.999),after=sample(8);
assert.ok(Math.hypot(...after.p.book.map((v,i)=>v-before.p.book[i]))<2,'拾书跳动超过2px');
assert.equal(sample(11.5).s.bookVisible,false);assert.equal(sample(12.9).s.broomVisible,false);assert.equal(sample(14.4).s.broomVisible,true);
assert.ok(sample(24).s.x>1250,'角色未飞离舞台');
for(const t of [1.8,3.4,5,8,11.2,14.4,17.4,20,24]){const first=sample(t);sample(23);sample(0);assert.deepEqual(sample(t),first);}
console.log('PASS: 1441 个时间点骨骼有效；拾书跳动 < 2 px；收纳、取扫帚、离场状态正确；9 个阶段可确定性跳转。');
// 裙摆连续形变不能翻折，上衣顶点保持不动；覆盖控件边界和坐下过渡。
for(const gather of [0,1,1.4])for(const drape of [.6,1,1.3])for(const legTilt of [-15,0,15]){
 a.seatControls={gather,drape,legTilt};
 for(const t of [15.5,16,16.5,17,17.5,19.5]){
  sample(t);const {slot,att,samples}=a.seatedDress,d=a.pose.deform.get(`${slot}/${att.name}`);
  const v=att.vertices.map((x,i)=>x+d[i]);
  const cross=(vs,i,j,k)=>(vs[j*2]-vs[i*2])*(vs[k*2+1]-vs[i*2+1])-(vs[j*2+1]-vs[i*2+1])*(vs[k*2]-vs[i*2]);
  for(let n=0;n<att.triangles.length;n+=3){const ids=att.triangles.slice(n,n+3);assert.ok(cross(v,...ids)*cross(att.vertices,...ids)>0,'裙摆出现翻折或退化三角形');}
  samples.forEach((p,i)=>{if(p.f===0){assert.equal(d[i*2],0);assert.equal(Math.abs(d[i*2+1]),0);}});
 }
}
a.seatControls={gather:1,drape:1,legTilt:0};sample(17.5);
assert.ok(Math.abs(a.world('foot_l').tx-a.world('foot_r').tx)<20,'侧坐双脚没有并拢');
console.log('PASS: 27 组侧坐参数 × 6 个过渡时刻裙摆无翻折，上衣不变形，侧坐双脚间距 < 20 px。');
