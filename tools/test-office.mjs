import fs from 'node:fs';import assert from 'node:assert/strict';import {makeActor} from '../src/rigby-actor.mjs';import {sceneAt,poseOffice} from '../src/rigby-office-scene.mjs';
const a=makeActor(JSON.parse(fs.readFileSync(new URL('../assets/white/character.json',import.meta.url))),1,{palmOffset:65});
function sample(t){const p=poseOffice(a,sceneAt(t));for(const m of a.pose.world)assert.ok([m.a,m.b,m.c,m.d,m.tx,m.ty].every(Number.isFinite));return p;}
for(let i=0;i<=1680;i++)sample(i/60);
for(const t of [0,3,5.5,7.5,11,19,24]){const first=sample(t);sample(27);assert.deepEqual(sample(t),first);}
const typing=sample(11);for(const p of [typing.left,typing.right])assert.ok(p[0]>620&&p[0]<720&&Math.abs(p[1]-373)<7,'手未到键盘');
console.log('PASS: 1681 个时间点，7 个跳转姿态，双手键盘接触范围。');
