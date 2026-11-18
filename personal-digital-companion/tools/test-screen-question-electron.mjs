// 隐藏的自有窗口 + 合成图片 + mock Worker；不抓取用户屏幕，不调用真实AI。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {createScreenQuestionClient} from '../desktop/screen-question-client.mjs';
import {createWorker} from '../agent/worker.mjs';
import {CLOUDFLARE_MODEL} from '../agent/assistant/cloudflare.mjs';
const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'qa-bubble-')),output=resolve(root,'output/screen-question-qa');
mkdirSync(output,{recursive:true});electron.app.setPath('userData',profile);
electron.app.commandLine.appendSwitch('disable-gpu');
let host,pet;
const wait=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('UI等待超时');};
async function run(){try{
  await electron.app.whenReady();
  pet=new electron.BrowserWindow({x:600,y:600,width:240,height:360,show:false,webPreferences:{offscreen:true}});
  let captures=0,calls=0,mode='answer',release;
  const image=electron.nativeImage.createFromBitmap(Buffer.alloc(64*64*4,255),{width:64,height:64});
  const worker=createWorker({createVisionClient:()=>({async generate(){calls++;if(mode==='waiting')await new Promise(resolve=>release=resolve);if(mode==='error')throw Object.assign(new Error('mock'),{code:'TIMEOUT'});return {provider:'cloudflare',model:CLOUDFLARE_MODEL,finishReason:'stop',text:JSON.stringify({answer:mode==='long'?'<img src=x onerror=alert(1)>\n'+('从这张截图只能确定路径没有找到，先核对文件位置，不要急着删除配置。\n'.repeat(30)):'这个报错是说文件找不到。先检查路径是否拼错、文件有没有被移动；仅凭截图还不能确定具体原因。'})};}})});
  const client=await createScreenQuestionClient({profile,screen:{getCursorScreenPoint:()=>({x:-100,y:50}),getDisplayNearestPoint:()=>({id:77,size:{width:64,height:64},scaleFactor:1})},
    desktopCapturer:{async getSources(){captures++;return [{display_id:'77',thumbnail:image}];}},
    request:(path,options)=>worker.fetch(new Request('https://test'+path,{...options,headers:{...options.headers,Authorization:'Bearer test'}}),{API_TOKEN:'test'})});
  host=attachScreenQuestion(electron,{win:pet,profile,bundle:resolve(root,'output/desktop-bundle'),root,client,visible:false});
  await host.open();const panel=host.panel;
  const js=code=>panel.webContents.executeJavaScript(code);
  const snapshot=async name=>{await new Promise(resolve=>setTimeout(resolve,250));writeFileSync(join(output,name),(await panel.webContents.capturePage()).toPNG());};
  await wait(()=>js('Boolean(window.screenQuestion)'));
  mode='waiting';await js("document.querySelector('#question').value='这个报错是什么意思？';document.querySelector('#questionForm').requestSubmit();");
  await wait(()=>Boolean(release));assert.equal(await js("document.querySelector('#reply').dataset.state"),'waiting');
  await snapshot('waiting.png');mode='answer';release();
  await wait(()=>js("document.querySelector('#reply').dataset.state==='answer'"));
  assert.equal(captures,1);assert.equal(calls,1);await snapshot('answer.png');
  mode='error';await js("document.querySelector('#questionForm').requestSubmit()");await wait(()=>js("document.querySelector('#reply').dataset.state==='error'"));
  assert.equal(captures,2);assert.equal(calls,3);assert.equal(await js("document.querySelector('#retry').hidden"),false);
  await snapshot('error.png');
  mode='answer';await js("document.querySelector('#retry').click()");await wait(()=>js("document.querySelector('#reply').dataset.state==='answer'"));assert.equal(captures,2);assert.equal(calls,4);
  mode='long';await js("document.querySelector('#questionForm').requestSubmit()");await wait(()=>js("document.querySelector('#answer').textContent.startsWith('<img')"));
  assert.equal(await js("document.querySelectorAll('#reply img').length"),0);assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await js("document.querySelector('#reply').scrollHeight>document.querySelector('#reply').clientHeight"),true);
  await snapshot('long-answer.png');
  assert.equal(await js("Object.keys(window.screenQuestion).sort().join(',')"),'ask,close,fit,onLayout,onState,retry,state');
  const before=panel.getBounds();pet.setBounds({x:400,y:400,width:240,height:360});await wait(()=>panel.getBounds().x!==before.x);
  await js("document.querySelector('#close').click()");await wait(()=>!host.panel);
  console.log('PASS：真实Electron窄IPC/输入/等待/回答/两次失败/原图手动重试/文本安全/长文滚动/跟随/关闭；仅合成图片和mock模型。');
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{host?.close();pet?.destroy();electron.app.exit(process.exitCode||0);}}
run().catch(error=>{console.error(error.stack);electron.app.exit(1);});
