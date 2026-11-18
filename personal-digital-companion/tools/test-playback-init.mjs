// 执行真实内联脚本，回归“源模板被直接打开”和两种内嵌素材初始化；不是浏览器解码验收。
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Script,createContext} from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
async function check(name,isTemplate){
  const html=readFileSync(new URL(name,root),'utf8');
  const data=html.match(/<script id="embedded-media" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const code=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const elements=new Map(),blobs=[],listeners={},callbacks=[];
  function element(id){
    if(!elements.has(id))elements.set(id,{textContent:'',style:{},dataset:{bg:'checker'},checked:true,
      append(...children){this.children=children},setAttribute(k,v){this[k]=v}});
    return elements.get(id);
  }
  element('embedded-media').textContent=data;
  const video=element('video');Object.assign(video,{paused:true,currentTime:0,duration:6.04,
    playCalls:0,loadCalls:0,addEventListener(name,fn){(listeners[name]??=[]).push(fn)},
    pause(){this.paused=true;for(const fn of listeners.pause||[])fn()},
    load(){this.loadCalls++},play(){this.playCalls++;this.paused=false;return Promise.resolve()},
    requestVideoFrameCallback(fn){callbacks.push(fn);return callbacks.length},cancelVideoFrameCallback(){}});
  const buttons=['webm','mp4','play','replay','step','background'].map(element);
  const document={getElementById:element,querySelectorAll:()=>buttons,createElement:()=>({style:{}})};
  const context=createContext({document,window:{addEventListener(){}},Blob,Uint8Array,
    URL:{createObjectURL(blob){blobs.push(blob);return `blob:test-${blobs.length}`},revokeObjectURL(){}},
    atob:s=>Buffer.from(s,'base64').toString('latin1')});
  new Script(code).runInContext(context);await new Promise(setImmediate);
  if(isTemplate){
    assert.equal(element('badge').textContent,'这是源模板');assert(buttons.every(x=>x.disabled));
    assert.equal(video.loadCalls,0);assert.equal(element('message').children[1].href,'../绯月播放测试_直接打开.html');
  }else{
    assert.equal(video.loadCalls,1);assert.equal(blobs[0].type,'video/webm');
    assert(Buffer.from(await blobs[0].arrayBuffer()).equals(readFileSync(new URL('output/video-wave-review/wave-alpha-test.webm',root))));
    assert.equal(element('badge').textContent,'播放中');callbacks[0]();assert.match(element('frames').textContent,/1/);
    element('mp4').onclick();await new Promise(setImmediate);
    assert.equal(video.loadCalls,2);assert.equal(blobs[1].type,'video/mp4');
    assert(Buffer.from(await blobs[1].arrayBuffer()).equals(readFileSync('G:/picsample/q版挥手打招呼.mp4')));
    element('play').onclick();assert.equal(video.paused,true);
    video.currentTime=2;element('replay').onclick();await new Promise(setImmediate);assert.equal(video.currentTime,0);
    element('step').onclick();assert.equal(video.paused,true);assert(video.currentTime>0);
  }
  console.log(`PASS ${name}：${isTemplate?'模板给出成品入口，不再空白失败':'真实脚本初始化、WebM/MP4 Blob字节、切换和播放控制'}`);
}
await check('tools/playback-test.template.html',true);
await check('绯月播放测试_直接打开.html',false);
