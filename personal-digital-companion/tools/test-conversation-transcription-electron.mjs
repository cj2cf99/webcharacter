import * as electron from 'electron';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {createConversationTranscription,prepareConversationBatch} from '../desktop/conversation-transcription.mjs';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';
import {attachTaskInbox} from '../desktop/task-inbox-host.mjs';
import {createRegistrationFlow} from '../desktop/registration-flow.mjs';
import {createWorker} from '../agent/worker.mjs';
import {initializeDatabase,openTestDatabase} from '../agent/tests/sqlite-d1.mjs';

const root=resolve(import.meta.dirname,'..'),bundle=resolve(root,'output/desktop-bundle');
const profile=mkdtempSync(join(tmpdir(),'feiyue-transcription-'));
electron.app.setPath('userData',profile);
electron.app.commandLine.appendSwitch('disable-gpu');
const timings=[];
let mockCalls=0;
let host,pet,transcription,model,inbox,db;
async function wait(predicate,limit=10_000){
  const end=Date.now()+limit;
  while(Date.now()<end){const value=await predicate();if(value)return value;await delay(60);}
  throw Error('等待结果超时');
}

async function run(){
  await electron.app.whenReady();
  const mock=process.argv.includes('--mock');
  const explicit=process.argv.includes('--registration');
  const theme=process.argv.includes('--dark')?'dark':'light';
  if(mock)electron.nativeTheme.themeSource=theme;
  if(mock){
    model={async withWorkSession(id,signal,run){
      let phase=0,sourceId;
      return run(async text=>{
        mockCalls++;
        const data=JSON.parse(text);
        if(++phase===1){
          sourceId=data.turns[0].sourceId;
          return {recentFactIds:['run'],actions:[{id:'run',summary:'昨天跑了五公里',subject:'user',state:'occurred',intent:'none',
            timeText:'昨天',conditions:[],evidence:[{sourceId,quote:'昨天我跑了五公里'}]}],requests:[],signals:[]};
        }
        if(phase===2)return {candidates:[{id:'exercise',type:'hu-shi.exercise.create',matterIds:['run'],params:{body:'昨天跑了五公里。'},
          conditions:[],dependsOn:[],missing:[],fieldSources:[]},
          {id:'diary',type:'diaries.create',matterIds:['run'],params:{content:'昨天跑了五公里。'},
            conditions:[],dependsOn:[],missing:[],fieldSources:[]}],notes:[]};
        return {issues:[]};
      });
    },close(){}};
  }else{
    model=createBalancedLocalModel({utilityProcess:electron.utilityProcess,modelPath:desktopModelPath(electron.app,root),
      log:event=>timings.push(event),localFirst:true});
    const session=model.withWorkSession;
    model.withWorkSession=(id,signal,run)=>session(id,signal,call=>run(async(...args)=>{
      console.log('合成模型处理',timings.length,JSON.stringify(args[0]).slice(0,300));
      const value=await call(...args);
      console.log('合成输入阶段',JSON.stringify(value));return value;
    }));
  }
  pet=new electron.BrowserWindow({width:240,height:360,show:false});
  let notification;
  const states=[],writes=[],requests=[];
  db=openTestDatabase();initializeDatabase(db.sqlite);
  for(const seed of ['tasklist-hu-shi.sql','tasklist-registration.sql'])db.sqlite.exec(readFileSync(join(root,'agent','seeds',seed),'utf8'));
  const worker=createWorker({authorize:()=>({ownerId:'synthetic'}),loadRegistrationCategories:async()=>[{id:'ai-notes',name:'AI登记内容'}],
    async writeRegistrationEntry({path,body,idempotencyKey}){
      writes.push({path,body,idempotencyKey});
      return ['/api/reminders','/api/diaries'].includes(path)?{item:{seq:writes.length}}:{id:'fixture-'+writes.length,created_at:Date.now()};
    }});
  const env={DB:db.DB,COMPANION_HOST:{async resourceCategories(){return [{id:'ai-resources',name:'AI登记内容'}];}}};
  const request=(path,options)=>{requests.push(path);return worker.fetch(new Request('https://fixture.invalid'+path,options),env);};
  const registration=createRegistrationFlow({profile,request});
  transcription=createConversationTranscription({profile,safeStorage:electron.safeStorage,model,canStart:()=>!host.panel,
    changed:()=>states.push(transcription.list()[0]?.stage),notify:value=>{notification=value;},
    prepareBatch:rows=>prepareConversationBatch(rows,request),registration});
  host=attachScreenQuestion(electron,{win:pet,profile,bundle,root,transcription,registration,visible:false,
    client:{async askText(){return {state:'answer',text:'跑完记得拉伸。'};},forget(){}}});
  await host.open(explicit?'registration':'auto');
  const send=text=>host.panel.webContents.executeJavaScript(`window.screenQuestion.ask(${JSON.stringify(text)},false,
    document.getElementById('mode').value)`);
  const input=['昨天我跑了五公里，回来还拉伸了。'];
  if(!mock)input.push('明天提醒我给田中回信，回信前先看周报。',
    '我很喜欢这个色板网站 https://example.invalid/palette ，以后想参考它的颜色搭配做原型。');
  if(explicit){
    const page=host.panel.webContents;
    await page.executeJavaScript(`document.getElementById('question').value='登记';document.getElementById('send').click()`);
    await wait(()=>page.executeJavaScript(`document.getElementById('reply').textContent.includes('直接输入正文') &&
      !document.getElementById('question').value`));
    assert.equal(await page.executeJavaScript("document.getElementById('mode').value"),'registration');
  }
  const opening=await send(input[0]);
  assert.equal(opening.state,'answer');
  if(explicit){
    assert.match(opening.text,/关窗后.*个人日记.*逐项确认/u);
    assert.ok(!host.inquiryPanel);
  }
  for(const line of input.slice(1))assert.equal((await send(line)).state,'answer');
  assert.equal(transcription.list().length,0);
  const closedAt=Date.now();
  await host.panel.webContents.executeJavaScript('window.screenQuestion.close("button")');
  const result=await wait(()=>{
    const item=transcription.list()[0];
    if(item?.state==='failed')throw Error(transcription.detail(item.id).error);
    if(item?.state==='empty')throw Error('合成会话未生成候选');
    return notification&&transcription.detail(notification.id);
  },605_000);
  const elapsedMs=Date.now()-closedAt;
  assert(elapsedMs<600_000,`耗时 ${elapsedMs} ms`);
  assert(result.result.rows.some(row=>row.type==='diaries.create'));
  if(explicit){
    const diary=result.result.rows.find(row=>row.type==='diaries.create');
    assert.equal(diary.params.content,`记录\n${input.join('\n\n')}\n❤️`);
  }
  if(mock){
    assert.equal(result.result.rows.filter(row=>row.type==='diaries.create').length,1);
    assert.match(result.result.rows.find(row=>row.type==='diaries.create').params.title,
      /^\[昨天跑了五公里\]绯月助记-\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u);
    assert.equal(mockCalls,3,'标题复用原有拟稿，未增加调用');
  }
  assert(result.result.rows.some(row=>row.type==='hu-shi.exercise.create'));
  if(!mock){
    assert(result.result.rows.some(row=>row.type==='reminders.create'));
    const resource=result.result.rows.find(row=>row.type==='resources.create');
    assert.equal(resource?.params.url,'https://example.invalid/palette');
    assert.equal(resource?.categoryLabel,'AI登记内容');
    assert.equal(timings.filter(event=>event.stage?.startsWith('模型已就绪')).length,1);
  }
  assert(transcription.list().length===1);
  assert.deepEqual(requests,[],'确认前无登记读写请求');
  console.log('转录完成',JSON.stringify({elapsedMs,measuredMs:result.durationMs,types:result.result.rows.map(row=>row.type),
    stages:[...new Set(states)].filter(Boolean),model:model.snapshot?.().model,backend:model.snapshot?.().backend}));
  if(!mock)console.log('本地模型调用',JSON.stringify(timings.map(({stage,model,backend,duration_ms})=>({stage,model,backend,duration_ms}))));
  inbox=attachTaskInbox(electron,{bundle,root,visible:false,flow:{local:async()=>[],transcripts:transcription.list,
    transcript:transcription.detail,transcriptDecision:transcription.decide,transcriptRetry:transcription.retry}});
  await inbox.open(result.id);
  const browser=inbox.panel.webContents;
  await wait(()=>browser.executeJavaScript('document.querySelectorAll("#transcript-detail input[type=checkbox]").length>1'));
  const exercise=result.result.rows.find(row=>row.type==='hu-shi.exercise.create');
  assert.match(exercise.params.body,/^运动\n[\s\S]+\n❤️$/u);
  assert(await browser.executeJavaScript(`Array.from(document.querySelectorAll('#transcript-detail .transcript-text')).some(field=>field.textContent.endsWith(${JSON.stringify(exercise.params.body)}))`));
  if(mock){
    inbox.panel.setSize(360,440);inbox.panel.setPosition(-6000,40);inbox.panel.showInactive();inbox.panel.setPosition(-6000,40);
    await delay(900);
    assert.equal(await browser.executeJavaScript('document.querySelectorAll("header.fy-titlebar").length'),1);
    assert(await browser.executeJavaScript(`(()=>{for(const card of document.querySelectorAll('#transcript-detail li.fy-card')){
      for(const animation of card.getAnimations())animation.finish();
      if(getComputedStyle(card).opacity!=='1')return false;
    }return true;})()`));
    const image=await browser.capturePage();assert(!image.isEmpty());
    writeFileSync(join(root,'output','transcription-review-'+theme+'.png'),image.toPNG());
  }
  const selected=mock?['hu-shi.exercise.create','diaries.create']:['hu-shi.exercise.create','reminders.create'];
  await browser.executeJavaScript(`for(const box of document.querySelectorAll('#transcript-detail input[type=checkbox]')){box.checked=${JSON.stringify(selected)}.includes(box.dataset.type);box.dispatchEvent(new Event('change'));}document.querySelector('#transcript-selected').click()`);
  await wait(()=>{const item=transcription.detail(result.id);if(item.state==='submit-pending'||item.result.rows.some(row=>row.prepareError))
    throw Error(item.error||'批量提交未完成');return item.state==='done';});
  assert.deepEqual(writes.map(row=>row.path).sort(),['/api/records/hu-shi/exercise/entries',mock?'/api/diaries':'/api/reminders'].sort());
  assert.equal(writes.find(row=>row.path.endsWith('/exercise/entries')).body.body,exercise.params.body);
  if(mock){
    const diary=result.result.rows.find(row=>row.type==='diaries.create');
    assert.deepEqual(writes.find(row=>row.path==='/api/diaries').body,diary.params);
  }
  assert.equal(requests.filter(path=>path==='/api/chains').length,1);
  console.log('确认后只通过一条登记链提交勾选项，写入由隔离 Worker 回执。');
}

try{await run();}
catch(error){console.error(error);process.exitCode=1;}
finally{
  host?.close();inbox?.close();pet?.destroy();await transcription?.close();await model?.close();db?.close();electron.app.exit(process.exitCode??0);
}
