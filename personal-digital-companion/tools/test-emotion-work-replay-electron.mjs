// 用截图中的工作事件回放一次正式评价路径。仅在临时资料库内准备事件发生时的状态。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {createAiWorkflowModel} from '../desktop/ai-workflow-model.mjs';
import {createEmotionService} from '../desktop/emotion-service.mjs';
import {attachConversationDetails} from '../desktop/conversation-details.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-emotion-replay-'));
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
const title='绯月 Windows 外置 Skill 与技能目录发布登记';
const desire={id:'screenshot-desire',want:'语音转文字功能',condition:'中日英三语支持且能解决打字慢的问题'};
const history={
  pages:[['21','好奇'],...Array.from({length:5},()=>['21','欣慰']),...Array.from({length:3},()=>['20','欣慰']),['20','理性、务实、默契、共']],
  nags:[['23','安心'],['23','焦虑'],['23','安心'],['23','温暖'],['22','期待'],['22','安心'],['22','欢喜中带着些许担忧'],['22','欣慰'],['22','欣慰与宠溺'],['22','期待']]
};
const rows=list=>list.map(([day,mood])=>({at:'2026-11-'+day,mood}));
const at=Date.parse('2026-11-23T10:00:00+09:00');
await electron.app.whenReady();
const log=[];
const base=createBalancedLocalModel({utilityProcess:electron.utilityProcess,modelPath:desktopModelPath(electron.app,root)});
const model=createAiWorkflowModel({file:join(profile,'ai.sqlite'),model:base,safeStorage:electron.safeStorage,log:e=>log.push(e)});
const emotions=createEmotionService({profile,model,now:()=>at,log:e=>log.push(e),
  diary:{emotionalHistory:()=>({pages:rows(history.pages),nags:rows(history.nags)})}});
const db=new DatabaseSync(join(profile,'emotions.sqlite'));
let review,code=1;
try{
  emotions.store.adopt(desire);
  emotions.taskRows([{task_id:'garden-batch:sample',action:'完成花园登记',at,title}]);
  db.prepare('UPDATE weeks SET face=2').run();
  const before=emotions.store.snapshot();
  db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify({...before,word:'担忧',grade:-4}));
  // 准备相同的事前档位，让正常结算能从上一条终态复算本事件。
  db.prepare("INSERT INTO events(key,at,kind,delta,status,grade,hold) VALUES('earlier',?,'loss',-1,'done',-3,0)").run(at-1);
  await emotions.drain();
  const entry=log.find(e=>e.ai_step_id);
  assert.ok(entry,JSON.stringify(log));
  const snapshot=model.readAiStep(entry.ai_step_id);
  assert.ok(snapshot.output?.value,JSON.stringify(snapshot.output));
  const answer=snapshot.output.value;
  const after=emotions.store.snapshot();
  console.log(JSON.stringify({model:base.snapshot().model,backend:base.snapshot().backend,ms:entry.duration_ms,answer,after},null,2));
  assert.equal(answer.status,'keep');
  assert.equal(answer.quote,'');
  assert.equal(answer.want,'');
  assert.equal(answer.condition,'');
  assert.deepEqual(after.desire,before.desire);
  assert.equal(after.grade,-4);
  assert.equal(after.hold,0);
  assert.equal(emotions.store.pending(),undefined);
  assert.ok(snapshot.input.text.includes(title));
  assert.doesNotMatch(snapshot.input.text,/screenshot-desire|用户原话：|绯月回复：/);
  const stored=JSON.parse(db.prepare('SELECT data FROM state WHERE id=1').get().data);
  assert.deepEqual(stored.desire,before.desire);
  review=attachConversationDetails(electron,{root,profile,bundle:join(root,'output/desktop-bundle'),visible:false,
    readTraffic:async()=>({lines:[JSON.stringify(entry)],next:null}),readAiStep:model.readAiStep});
  await review.open(null,'log');
  const js=s=>review.panel.webContents.executeJavaScript(s);
  const waitFor=async script=>{
    for(let n=0;n<80;n++){
      if(await js(script))return;
      await new Promise(r=>setTimeout(r,50));
    }
    assert.fail(script);
  };
  await waitFor("document.querySelector('#turns summary')?.innerText.includes('情绪复盘')");
  await js("document.querySelector('#turns summary').click()");
  await waitFor("document.querySelector('.ai-snapshot')?.innerText.includes('保留原欲求')");
  const raw=".ai-snapshot details";
  assert.equal(await js("document.querySelector('"+raw+"').open"),false);
  const out=join(root,'output/emotion-replay');
  mkdirSync(out,{recursive:true});
  for(const [theme,width] of [['light',620],['dark',360]]){
    electron.nativeTheme.themeSource=theme;
    review.panel.setSize(width,670);
    await new Promise(r=>setTimeout(r,300));
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'));
    writeFileSync(join(out,theme+'.png'),(await review.panel.webContents.capturePage()).toPNG());
  }
  await js("document.querySelector('"+raw+" summary').click()");
  await waitFor("document.querySelector('"+raw+" pre')");
  assert.deepEqual(JSON.parse(await js("document.querySelector('"+raw+" pre').textContent")),snapshot);
  console.log('PASS 工作记录保留旧欲求，快照分段、深浅色窄窗和原始 JSON 回读。');
  const confirmation='语音转文字实测通过：中日英三语均可听写，已解决打字慢的问题';
  emotions.taskRows([{task_id:'voice-check',action:'第 1 次执行成功',at:at+1,title:confirmation}]);
  await emotions.drain();
  const control=log.findLast(e=>e.ai_step_id);
  assert.notEqual(control.ai_step_id,entry.ai_step_id);
  const controlOutput=model.readAiStep(control.ai_step_id).output;
  console.log('直接验收对照',JSON.stringify(controlOutput));
  assert.equal(controlOutput.value?.status,'satisfied');
  assert.ok(controlOutput.value.quote&&confirmation.includes(controlOutput.value.quote));
  assert.equal(emotions.store.snapshot().hold,3);
  assert.notEqual(emotions.store.snapshot().desire?.want,desire.want,'已满足的欲求不能立即原样重建');
  console.log('PASS 直接证明三语听写已解决打字慢的记录可满足欲求。');
  code=0;
}catch(error){console.error(error);}
finally{review?.close();db.close();await emotions.close();await model.close();electron.app.exit(code);}
