import {CompanionSound} from '../desktop/sound.mjs';
// 执行真实桌面控制脚本，验证输入到共享状态的接线；不是Windows视觉测试。
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
import assert from 'node:assert/strict';
const stateCode=stripTypeScriptTypes(readFileSync(new URL('../src/companion-state.ts',import.meta.url),'utf8')).replace(/^export /gm,'');
const State=new Script(stateCode+'\nCompanionState').runInNewContext();
const callbacks={},events={},loads=[];let player,snapshot,nativeStarts=0,nativeEnds=0;
const canvas={clientWidth:243,width:464,height:688,addEventListener(n,fn){events[n]=fn},setPointerCapture(){},hasPointerCapture(){return true},releasePointerCapture(){}};
class Player{
  constructor(){player=this;this.frames=0;this.holds=0;this.video={paused:false};}
  async load(id){loads.push(id)}draw(){}hit(){return true}hold(){this.holds++}pause(){}async resume(){}destroy(){}
}
const host={soundReady(){},onSound(fn){callbacks.sound=fn;return()=>{}},onSoundPreview(fn){callbacks.preview=fn;return()=>{}},hit(){},ready(){},dragStart(){nativeStarts++},dragEnd(){nativeEnds++},
  onPointer(fn){callbacks.pointer=fn;return()=>{}},onVisible(fn){callbacks.visible=fn;return()=>{}},onWork(fn){callbacks.work=fn;return()=>{}},
  onPerfSnapshot(fn){callbacks.snapshot=fn;return()=>{}},perfSnapshot(value){snapshot=value}};
let idleCallback;
const context=createContext({CompanionSound,Audio:class{pause(){}async play(){}},CompanionState:State,CompanionPlayer:Player,URL,setTimeout:(fn)=>{idleCallback=fn;return 1},clearTimeout:()=>{},
  document:{getElementById:id=>id==='character'?canvas:{textContent:''}},
  window:{desktopHost:host,devicePixelRatio:1.5,localClips:{},addEventListener(){}},performance:{},
  Image:class{set src(value){queueMicrotask(()=>this.onload())}}});
const source=readFileSync(new URL('../desktop/renderer.mjs',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify('file:///local/renderer.mjs'));
new Script(source).runInContext(context);const settle=()=>new Promise(setImmediate);await settle();
assert.equal(loads.at(-1),'idle');idleCallback();await settle();assert.equal(loads.at(-1),'idle-special');player.onEnded();await settle();assert.equal(loads.at(-1),'idle');idleCallback();await settle();callbacks.pointer({x:100,y:100});await settle();assert.equal(loads.at(-1),'hover','悬停立即切换');
player.onEnded();await settle();assert.equal(loads.at(-1),'hover-loop');callbacks.work(true);await settle();assert.equal(loads.at(-1),'hover-exit');player.onEnded();await settle();assert.equal(loads.at(-1),'work-enter');
events.pointerdown({button:0,clientX:100,clientY:100,screenX:500,screenY:500,pointerId:1});
events.pointermove({screenX:502,screenY:501});assert.equal(player.holds,0,'点击微动不触发拖拽');
events.pointermove({screenX:510,screenY:510});await settle();assert.equal(player.holds,1);callbacks.snapshot();assert.equal(snapshot.state,'drag-enter');
player.onEnded();await settle();assert.equal(loads.at(-1),'drag-loop');
callbacks.work(false);events.pointerup({type:'pointerup',screenX:510,screenY:510,pointerId:1});await settle();assert.equal(loads.at(-1),'drag-exit','松开立即退出');player.onEnded();await settle();assert.equal(loads.at(-1),'idle');
const after=loads.length;events.click({clientX:100,clientY:100});assert.equal(loads.length,after,'松开拖动不误触点击');
callbacks.work(true);await settle();assert.equal(loads.at(-1),'work-enter','工作立即打断待机');
events.pointerdown({button:0,clientX:100,clientY:100,screenX:500,screenY:500,pointerId:2});events.pointermove({screenX:520,screenY:510});
callbacks.visible(false);callbacks.visible(true);await settle();assert.equal(loads.at(-1),'drag-exit');
player.onEnded();await settle();assert.equal(loads.at(-1),'work-enter','隐藏中结束拖动，恢复后完成退出再回工作');
assert(nativeStarts===2&&nativeEnds>=2);
console.log('PASS：桌面真实控制脚本，待机立即切换、5DIP阈值、拖拽抢占、屏蔽旧结束/释放误点击、隐藏恢复。');
