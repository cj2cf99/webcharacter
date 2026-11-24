import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,renameSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as wait} from 'node:timers/promises';
import {createMemoryArchive} from '../desktop/memory-archive.mjs';
import {createTaskTrafficLog} from '../desktop/task-traffic-log.mjs';
import {createScreenQuestionClient} from '../desktop/screen-question-client.mjs';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';
import {cloudVision} from '../desktop/ai-gateway.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-memory-qa-'));
electron.app.setPath('userData',profile);
async function until(fn){
  for(let i=0;i<600;i++){if(await fn())return;await wait(100);}
  throw Error('等待图片复盘测试超时：'+fn.toString());
}
async function test(){
  await electron.app.whenReady();
  const win=new electron.BrowserWindow({show:false,webPreferences:{offscreen:true}});
  await win.loadURL('data:text/html,<canvas width="640" height="200"></canvas>');
  const png=await win.webContents.executeJavaScript(`(()=>{
    const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,200);
    ctx.fillStyle='black';ctx.font='54px Arial';ctx.fillText('Q7M-482',100,120);return c.toDataURL()})()`);
  const source=electron.nativeImage.createFromDataURL(png);
  const memory=createMemoryArchive(join(profile,'memory')),traffic=createTaskTrafficLog(profile,{memory});
  const infer=cloudVision(),real=process.argv.includes('--real');
  const seen=[],uploads=[];
  const client=await createScreenQuestionClient({memory,screen:{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({id:7,size:source.getSize()})},
    desktopCapturer:{getSources:async()=>[{display_id:'7',thumbnail:source}]},
    vision:async(q,img,signal)=>{
      const prior=(await memory.read(tokyoDay(Date.now()))).find(row=>row.question===q);
      assert.ok(prior?.image&&existsSync(memory.original(prior.image.day,prior.id)));
      assert.ok(await memory.thumbnail(prior.image.day,prior.id));
      seen.push(q);
      return real?infer(q,img,signal):q.includes('抠图')?{reason:'没有像素蒙版'}:{text:'Q7M-482'};
    },
    request:async(path,opts)=>{
      assert.equal(path,'/api/assistant/screen-question');
      const body=JSON.parse(opts.body);
      assert.equal(body.question,seen.at(-1));assert.ok(body.image.data_base64);
      uploads.push(body.question);
      return Response.json({ok:true,answer:'云端测试回执'});
    }});
  const reportCase=process.argv.includes('--task-reports'),job='ab'.repeat(16),input=join(profile,'render.png'),dayNow=tokyoDay(Date.now());
  if(reportCase){
    writeFileSync(input,source.toPNG());
    mkdirSync(join(profile,'image-tasks'),{recursive:true});
    writeFileSync(join(profile,'image-tasks',job+'.json'),JSON.stringify({job,state:'done',original:'生成测试字样',at:Date.now(),
      text:'已完成测试图',output:input,completed:[{step:1,operation:'generate',output:input,width:640,height:200}]}));
    await memory.saveTasks(dayNow,[{at:Date.now(),task_id:'task-123',title:'随手记',action:'已登记',detail:'记录编号 123'}]);
  }
  // Windows 仅向已显示的原生窗口反馈全屏状态；透明测试窗不抢焦点。
  class ReportTestWindow extends electron.BrowserWindow{
    constructor(options){super({...options,opacity:0,focusable:false,skipTaskbar:true,
      webPreferences:{...options.webPreferences,offscreen:false,backgroundThrottling:false}});}
  }
  const runtime=reportCase?{...electron,BrowserWindow:ReportTestWindow}:electron;
  const host=attachScreenQuestion(runtime,{win,profile,root,bundle:join(root,'output/desktop-bundle'),memory,client,
    log:traffic.write,readTraffic:traffic.readPage,readTasks:memory.readTasks,visible:false});
  try{
    if(reportCase){
      await until(()=>existsSync(memory.taskImage(dayNow,job,1))&&existsSync(join(memory.folder(dayNow),'对话',job+'.json')));
      renameSync(input,input+'.moved');
      await host.openReview();
      host.details.showInactive();
      const js=code=>host.details.webContents.executeJavaScript(code);
      await until(()=>js("document.querySelectorAll('#turns button').length===2"));
      await js("[...document.querySelectorAll('#turns section')].find(e=>e.textContent.includes('随手记')).querySelector('button').click()");
      await until(()=>js("document.querySelector('#taskReport').open&&document.querySelector('#reportContents').textContent.includes('记录编号 123')"));
      await js("document.querySelector('#reportClose').click();[...document.querySelectorAll('#turns section')].find(e=>e.textContent.includes('ComfyUI')).querySelector('button').click()");
      await until(()=>js("document.querySelector('.result-picture img')?.naturalWidth>0"));
      await js("document.querySelector('.result-picture').click()");
      await until(()=>js("document.querySelector('#pictureViewer').open&&document.querySelector('#pictureOriginal').naturalWidth===640"));
      await until(()=>host.details.isFullScreen());
      assert.equal(await js("document.querySelector('#pictureOriginal').naturalHeight"),200);
      await js("document.querySelector('#pictureScale').click()");
      assert.equal(await js("document.querySelector('#pictureCanvas').classList.contains('actual')"),true);
      await js("document.querySelector('#pictureClose').click()");
      await until(()=>js("!document.querySelector('#pictureViewer').open&&document.querySelector('#taskReport').open"));
      await until(()=>!host.details.isFullScreen());
      console.log('PASS：历史回执补档、文本和图片报告、失去原作业文件后查看、全屏原图及返回。');
      return;
    }
    await host.open();
    const wc=host.panel.webContents;
    async function ask(q,answer){
      await wc.executeJavaScript(`document.querySelector('#question').value=${JSON.stringify(q)};document.querySelector('#withScreen').checked=true;document.querySelector('#questionForm').requestSubmit()`);
      await until(()=>wc.executeJavaScript(`document.querySelector('#reply').dataset.state==='answer'&&document.querySelector('#answer').textContent.includes(${JSON.stringify(answer)})`));
    }
    await ask('只抄写图中的编号。','Q7M-482');assert.equal(uploads.length,0);
    await ask('请抠图，提取人物的像素蒙版。','云端测试回执');assert.equal(uploads.length,1);
    const day=tokyoDay(Date.now()),turns=await memory.read(day);
    assert.equal(turns.length,2);assert.deepEqual(turns.map(t=>t.image.route),['转交云端','本地回答']);
    for(const turn of turns){
      const html=readFileSync(join(memory.folder(day),'图片问答',turn.id+'.html'),'utf8');
      assert.ok(html.includes('../'+turn.image.thumbnail)&&html.includes(turn.text));
    }
    await traffic.flush();await host.openLog();
    const log=host.details.webContents;
    await until(()=>log.executeJavaScript("document.querySelectorAll('img').length===2&&[...document.images].some(i=>i.complete&&i.naturalWidth>0)"));
    const moved=join(profile,'moved-day');
    renameSync(memory.folder(day),moved);
    await win.loadFile(join(moved,'复盘.html'));
    await until(()=>win.webContents.executeJavaScript("document.images.length===2&&[...document.images].every(i=>i.complete&&i.naturalWidth===240)"));
    assert.ok(await win.webContents.executeJavaScript("document.body.innerText.includes('Q7M-482')"));
    console.log('PASS：图片先归档，离线回答零上传，本地未完成才转云端，独立日期文件和任务日志缩略图已验证。');
  }finally{host.close();win.destroy();}
}
test().then(()=>electron.app.exit(0),e=>{console.error(e.stack);electron.app.exit(1);});
