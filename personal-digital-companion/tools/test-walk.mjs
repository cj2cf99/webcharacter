import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {movementTarget,movementStep,settlePosition,displayRoutes,displaySize,displayPosition,WALK_SETTLE_TIME,WALK_BRAKE_DISTANCE} from '../desktop/movement.mjs';
import {SettingsStore,defaults} from '../desktop/settings-store.mjs';
import {BehaviorController} from '../desktop/behavior-controller.mjs';
const b={width:243,height:360},area={x:-1920,y:-100,width:1920,height:1040};
assert.deepEqual(movementTarget(area,b,'top-left'),{x:-1904,y:-88});
assert.deepEqual(movementTarget(area,b,'bottom-right'),{x:-259,y:568});
assert.deepEqual(movementTarget({x:0,y:0,width:100,height:100},b,'center'),{x:0,y:0});
assert.throws(()=>movementTarget(area,b,'bad'));
assert.deepEqual(movementStep({x:0,y:0},{x:3,y:4},.05),{x:3,y:4,done:true});
const cfg=defaults(),c=new BehaviorController(cfg,()=>{});c.start('idle');c.input('walk',true);assert.equal(c.current,'walk');assert.equal(c.phase,'enter');c.ended();assert(c.canNativeLoop());c.input('walk',false);assert(!c.canNativeLoop());c.ended();assert.equal(c.phase,'exit');c.ended();assert.equal(c.current,'idle');
c.input('walk',true);c.ended();assert.equal(c.phase,'loop');assert.equal(cfg.states.walk.force,true);c.finishWalk();assert.equal(c.phase,'exit','到达预告不等待循环剩余帧');assert.equal(c.walk,false);assert(!c.canNativeLoop());c.ended();assert.equal(c.current,'idle');
const dir=mkdtempSync(join(tmpdir(),'walk-migration-'));
try{
 const old=defaults();delete old.states.walk;old.master.volume=32;old.states.hover.sound.enter.volume=19;
 writeFileSync(join(dir,'pc-behavior-settings.json'),JSON.stringify({config:old,custom:[],names:{}}));
 const store=new SettingsStore(dir,resolve('output/desktop-bundle'));
 const migrated=store.snapshot().config;const restored=structuredClone(migrated);delete restored.states.walk;assert.deepEqual(restored,old,'旧节点、音量全部保留');
 assert.equal(migrated.states.walk.sound.loop.on,false);assert.equal(migrated.states.walk.sound.enter.voice,'voice:walk-enter');
 for(const id of ['walk-enter','walk-loop','walk-exit','voice:walk-enter','voice:walk-exit']){const a=store.catalog().find(a=>a.id===id);assert(a&&existsSync(new URL(a.url)));if(a.compact)assert(existsSync(new URL(a.compact)));}
 assert(JSON.parse(readFileSync(join(dir,'pc-behavior-settings.json'))).config.states.walk);
}finally{rmSync(dir,{recursive:true});}
console.log('PASS WALK：负坐标工作区、边界、精确到达、行走三段、旧设置无损迁移及资源存在。');

const origin={x:0,y:0},target={x:WALK_BRAKE_DISTANCE,y:0};assert.equal(settlePosition(origin,target,0).x,0);const half=settlePosition(origin,target,WALK_SETTLE_TIME/2);assert.equal(half.x,WALK_BRAKE_DISTANCE*.75);assert(!half.done);assert.deepEqual(settlePosition(origin,target,WALK_SETTLE_TIME),{...target,done:true});assert.deepEqual(settlePosition(origin,target,2),{...target,done:true});console.log('PASS：收步连续减速，站稳帧到达，之后无滑动。');

const base={id:1,scaleFactor:1,workArea:{x:0,y:0,width:1440,height:900}};
const above={id:2,scaleFactor:1.25,workArea:{x:331,y:-800,width:880,height:720},
  physicalArea:{x:400,y:-900,width:1100,height:900}};
const upperRight={id:3,scaleFactor:1,workArea:{x:1250,y:-920,width:1000,height:900},
  physicalArea:{x:1500,y:-920,width:1000,height:900}};
const corner={id:4,workArea:{x:1440,y:880,width:700,height:650}};
const taskbarGap={id:5,workArea:{x:-880,y:30,width:880,height:20}};
const routes=displayRoutes([base,above,upperRight,corner,taskbarGap],base,b);
assert.equal(routes.get(above.id).length,1,'物理坐标中上下相接，DIP 空隙不会阻断真实接缝');
assert.equal(routes.get(upperRight.id).length,2,'错位三块屏通过中间屏连接');
assert(!routes.has(corner.id),'窄角接触不足以通过角色画布');
assert(!routes.has(taskbarGap.id),'任务栏或小条带不成为通过区');
const snappedSize=displaySize(above,b);
assert.deepEqual(displaySize(taskbarGap,b),b,'窄工作区只限制位置，保持普通动画尺寸');
assert.deepEqual(snappedSize,{width:244,height:360});
const snapped=displayPosition({x:332,y:-999},above,snappedSize);
assert.equal(snapped.x,331,'DPI 网格以所属屏幕原点为准');
assert.equal(snapped.y,-800);
console.log('PASS：混合 DPI 接缝、上下及多段路由、角落与窄条过滤、逐屏像素网格。');
