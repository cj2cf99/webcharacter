import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {createMemoryArchive} from '../desktop/memory-archive.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';

const source=resolve(import.meta.dirname,'..');
const profile=mkdtempSync(join(tmpdir(),'feiyue-bubble-turn-'));
const root=join(profile,'app'),memory=createMemoryArchive(join(profile,'archive'));
electron.app.setPath('userData',profile);
let host,pet;
async function until(check){
  for(let i=0;i<200;i++){if(await check())return;await delay(30);}
  throw Error('等待超时 '+check);
}
async function run(){
  await electron.app.whenReady();
  for(const sub of ['app/desktop','app/workflows/comfyui','tools'])mkdirSync(join(profile,sub),{recursive:true});
  copyFileSync(join(source,'desktop/screen-question-preload.cjs'),join(root,'desktop/screen-question-preload.cjs'));
  const png=join(profile,'result.png');
  writeFileSync(png,electron.nativeImage.createFromBitmap(Buffer.alloc(32*32*4,255),{width:32,height:32}).toPNG());
  // 替身只读写临时目录。测试通过标记控制两张图各自的完成时间。
  writeFileSync(join(root,'workflows/comfyui/image_chain.py'),[
    'import json, sys, uuid',
    "if sys.argv[1]=='describe': print(json.dumps(dict(instruction='test',version='1',workflowVersion='1')))",
    "else: print(json.dumps(dict(job=uuid.uuid4().hex,state='queued')))",
  ].join('\n'));
  writeFileSync(join(profile,'tools/comfy_job.py'),[
    'import json, sys, time, pathlib',
    'folder=pathlib.Path(__file__).resolve().parents[1]',
    'for _ in range(400):',
    '    if (folder/sys.argv[2]).exists(): break',
    '    time.sleep(0.05)',
    "else: sys.exit(1)",
    "print(json.dumps(dict(state='done',output=str(folder/'result.png'),width=32,height=32)))",
  ].join('\n'));
  pet=new electron.BrowserWindow({show:false});
  const create=()=>attachScreenQuestion(electron,{win:pet,root,profile,memory,bundle:join(source,'output/desktop-bundle'),
    visible:false,client:{forget(){},askText:async()=>({state:'answer',text:'这轮文字回复'})}});
  host=create();
  const ui=code=>host.panel.webContents.executeJavaScript(code);
  const current=()=>ui("document.querySelector('#imageResults').innerText");
  const empty=()=>ui("document.querySelector('#imageResults').hidden && !document.querySelector('#imageResults').childElementCount");
  const send=text=>ui("document.querySelector('#question').value="+JSON.stringify(text)+";document.querySelector('#questionForm').requestSubmit()");
  await host.open();
  await send('画一只猫');
  await until(async()=>(await current()).includes('已排队'));
  const first=(await ui('window.screenQuestion.state()')).imageJob;
  await send('画一只狗');
  assert(await empty());
  await until(async()=>(await current()).includes('画一只狗'));
  const second=(await ui('window.screenQuestion.state()')).imageJob;
  assert.notEqual(first,second);
  writeFileSync(join(profile,second),'');
  await until(()=>ui("document.querySelector('#imageResults img')?.naturalWidth>0"));
  assert.equal(await ui("document.querySelectorAll('#imageResults button').length"),1);
  host.hide();await host.open();
  await until(()=>ui("document.querySelector('#imageResults img')?.naturalWidth>0"));
  assert((await current()).includes('画一只狗'));
  // 阻止旧缩略图返回，直到下一轮文字已显示。
  const nativeImage={...electron.nativeImage};
  let release,started=false;
  const thumbnailGate=new Promise(resolve=>{release=resolve;});
  nativeImage.createThumbnailFromPath=async(...args)=>{
    started=true;await thumbnailGate;
    return electron.nativeImage.createThumbnailFromPath(...args);
  };
  host.close();
  host=attachScreenQuestion({...electron,nativeImage},{win:pet,root,profile,memory,bundle:join(source,'output/desktop-bundle'),visible:false,
    client:{forget(){},askText:async()=>({state:'answer',text:'这轮文字回复'})}});
  await host.open();
  await until(()=>started);
  await send('你好');
  await until(()=>ui("document.querySelector('#answer').innerText==='这轮文字回复'"));
  release();await delay(100);
  assert(await empty());
  assert.deepEqual(await ui('window.screenQuestion.imageList()'),[]);
  writeFileSync(join(profile,first),'');
  const day=tokyoDay(Date.now());
  await until(async()=>(await memory.readImageReport(day,first))?.report?.state==='done');
  await until(()=>!host.executing);
  assert(await empty());
  for(const job of [first,second])assert(existsSync(memory.taskImage(day,job,1)));
  await memory.archiveImageTask({job:'a'.repeat(32),serverTaskId:'cloud-test',at:Date.now(),state:'done',
    original:'云端图片',text:'后台完成',output:png,width:32,height:32});
  host.close();host=create();await host.open();
  await until(()=>ui("document.querySelector('#asked').innerText==='你好'"));
  assert(await empty());
  console.log('PASS 两次生图只显示本轮卡、重开恢复本轮图、文字发送清卡、晚到缩略图及旧任务完成、冷启动排除后台图、历史原图可读。');
}
run().then(()=>{host?.close();pet?.destroy();electron.app.exit(0);},error=>{
  console.error(error);host?.close();pet?.destroy();electron.app.exit(1);
});
