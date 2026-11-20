import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as wait} from 'node:timers/promises';
import {createMemoryArchive} from '../desktop/memory-archive.mjs';
import {createTaskTrafficLog} from '../desktop/task-traffic-log.mjs';
import {createScreenQuestionClient} from '../desktop/screen-question-client.mjs';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';
import {localVision} from '../desktop/local-vision.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-memory-qa-'));
electron.app.setPath('userData',profile);
async function until(fn){
  for(let i=0;i<600;i++){if(await fn())return;await wait(100);}
  throw Error('等待图片复盘测试超时');
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
  const infer=localVision(desktopModelPath(electron.app,root)),real=process.argv.includes('--real');
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
  const host=attachScreenQuestion(electron,{win,profile,root,bundle:join(root,'output/desktop-bundle'),memory,client,
    log:traffic.write,readTraffic:traffic.readPage,readTasks:memory.readTasks,visible:false});
  try{
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
