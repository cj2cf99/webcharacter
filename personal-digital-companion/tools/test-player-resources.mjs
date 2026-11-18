import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/companion-player.ts',import.meta.url),'utf8')).replace(/^export /gm,'');
let created=0,revoked=[],draws=0;
class Video{
  constructor(){this.events={};this.paused=true;this.currentTime=0}
  addEventListener(n,fn){(this.events[n]??=new Set()).add(fn)}removeEventListener(n,fn){this.events[n]?.delete(fn)}
  load(){if(this.src)queueMicrotask(()=>{for(const fn of [...(this.events.loadeddata||[])])fn()})}
  play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}removeAttribute(){this.src=''}
  requestVideoFrameCallback(){return 1}cancelVideoFrameCallback(){}
}
const context={document:{createElement:()=>new Video()},URL:{createObjectURL(){return `blob:${++created}`},revokeObjectURL(url){revoked.push(url)}},
  setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},queueMicrotask};
const Player=new Script(source+'\nCompanionPlayer').runInNewContext(context);
const canvas={width:243,height:360,getContext:()=>({clearRect(){},drawImage(){draws++}})};
const local=new Player(canvas,async id=>`file:///local/${id}.webm`);
await local.load('idle');await local.load('work-loop');local.destroy();
assert.equal(created,0,'本地视频不创建Base64/Blob');assert.equal(revoked.length,0,'不撤销文件URL');assert.equal(draws,2);
const web=new Player(canvas,async()=>({type:'video/webm'}));
await web.load('idle');await web.load('click');web.destroy();assert.equal(created,2);assert.equal(revoked.length,2,'单文件网页的Blob仍完整释放');
console.log('PASS：本地URL按需加载不造Blob，网页Blob兼容且完整释放。');
let release;const delayed=new Player(canvas,()=>new Promise(resolve=>{release=resolve}));
const pending=delayed.load('hover');const oldDraws=draws;
delayed.hold();release('file:///late.webm');await pending;
assert.equal(delayed.video,null);assert.equal(draws,oldDraws,'拖拽中断后，晚到资源不画入Canvas');
const active=new Player(canvas,async()=> 'file:///active.webm');await active.load('idle');
let ended=0;active.onEnded=()=>ended++;active.hold();
for(const fn of active.video.events.ended)fn();assert.equal(ended,0,'被中断动画的结束事件不能推进状态');
active.destroy();delayed.destroy();
console.log('PASS：拖拽hold取消晚到加载和旧结束回调，保留当前画面。');
