// 使用真实上游骨骼验证接触点、任意时间跳转及重播，而非仅检查时间轴标签。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeActor,poseActor} from '../src/rigby-actor.mjs';
import {sceneAt} from '../src/rigby-scene.mjs';
const white=true;
const json=JSON.parse(fs.readFileSync(new URL('../assets/white/character.json',import.meta.url)));
const options=white?{palmOffset:65,gaitScale:.55,walkStyle:'pseudo'}:{};
const actors=[makeActor(json,1,options),makeActor(json,-1,options)];
function sample(t){const s=sceneAt(t);actors.forEach((a,i)=>poseActor(a,i?s.bx:s.ax,s,i));for(const a of actors)for(const m of a.pose.world)assert.ok([m.a,m.b,m.c,m.d,m.tx,m.ty].every(Number.isFinite),'骨骼出现非有限数');return actors.map(a=>({palm:[...a.palm],mouth:[...a.mouth]}));}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
for(let i=0;i<=720;i++)sample(i/60);
if(white){for(const a of actors)for(const slot of a.sk.slots)for(const att of slot.attachments)if(att.weights)for(const weights of att.weights){assert.ok(Math.abs(weights.reduce((s,w)=>s+w.weight,0)-1)<1e-5,'网格蒙皮权重没有归一化');assert.ok(weights.every(w=>a.sk.bones[w.bone]&&Number.isFinite(w.x)&&Number.isFinite(w.y)),'网格蒙皮索引无效');}}
const handoff=sample(6);assert.ok(distance(handoff[0].palm,handoff[1].palm)<1,'交接时双手接触点不一致');
const eat=sample(8.999);assert.ok(distance(eat[1].palm,eat[1].mouth)<2,'消失前苹果未到嘴边');
assert.equal(sceneAt(8.999).owner,'B');assert.equal(sceneAt(9).owner,null);
for(const t of [0,2.5,5.6,6,8.8,9.5,12]){const first=sample(t);sample(11);sample(1);assert.deepEqual(sample(t),first,'跳转后姿态不确定');}
console.log(`PASS (${white?'白发角色':'NILA 示例'}): 721 个时间点骨骼有效；双手交接 < 1 px；苹果入嘴 < 2 px；9 秒消失；7 个阶段可确定性重播。`);
