import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,access,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {createReminderChecks} from '../../desktop/reminder-checks.mjs';
import {openTestDatabase} from './sqlite-d1.mjs';
import {personalityMemory} from '../assistant/personality-memory.mjs';
import {bucketFixture} from './txt-test-bucket.mjs';
import {createSceneCuriosity,readBox} from '../../desktop/scene-curiosity.mjs';

const signal=new AbortController().signal;
for(const kind of ['diary','nag'])test('此刻所想实际收笔保留 501 字原文与归属 · '+kind,async t=>{
  const profile=await mkdtemp(join(tmpdir(),'scene-attachment-'));
  const {DB,sqlite,close}=openTestDatabase(),bucket=bucketFixture();
  sqlite.exec(await readFile(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8'));
  const at=Date.parse('2026-11-21T10:00:00+09:00'),day='2026-11-21';
  const req=(path,init)=>/\/(sources|expenses)\?/.test(path)?Response.json({records:[],complete:true}):
    personalityMemory(new Request('https://fixture'+path,init),{DB,myMainStorage:bucket},'tester');
  let interruptSummary=true;
  const store=createPersonalityDiary({profile,now:()=>at,memory:{read:async()=>[],readTasks:async()=>[]},weather:()=>[],request:req,
    model:{memory:async()=>{
      if(interruptSummary){interruptSummary=false;throw Error('概要推理中断');}
      return {text:'最后确认归还。'};
    }}});
  const f=await setup(t,{action:'ask',record:kind,text:'收到画册了吗？',focus:'',drawing:''},{first:'reflect'});
  const svc=createSceneCuriosity({...f.options,diary:store,now:()=>at});
  t.after(async()=>{svc.close();store.close();close();await rm(profile,{recursive:true,force:true});});
  await svc.run(signal);
  const raw=' '+('月'.repeat(498))+'。\n';assert.equal(Array.from(raw).length,501);
  await assert.rejects(svc.finish(f.views[0],raw),/概要推理中断/);
  await access(join(f.profile,'curiosity-pending.json'));
  assert.equal(bucket.objects.size,0);
  await svc.finish(f.views[0],'');await svc.finish(f.views[0],raw);
  if(kind==='diary')await store.run('diary',signal);else await store.syncNags(signal);
  const path='/api/memory/'+(kind==='diary'?'diaries/'+day+'.1':'nags/scene-'+f.views[0].id);
  const record=await (await req(path)).json();
  assert.equal(record.automaticTxt?.ids.length,1);
  const original=await req(path+'/original');assert.equal(original.status,200);
  assert.equal(await original.text(),'【原文 1 · 用户发言】\n'+raw);
  const published=kind==='diary'?record.body:record.talk.at(-1).text;
  assert.match(published,/概要：/);assert(!published.includes(raw));assert.equal(bucket.objects.size,1);
});
async function setup(t,decision,{first='observe',position='[300,200,100,120]',valid='是',readable=true}={}){
  const profile=await mkdtemp(join(tmpdir(),'scene-round-'));
  t.after(()=>rm(profile,{recursive:true,force:true}));
  const views=[],notes=[],prompts=[];let captures=0,wake=()=>{};
  const image={isEmpty:()=>false,toJPEG:()=>Buffer.from([255,216,255,217]),getSize:()=>({width:1000,height:1000}),crop:()=>image};
  const options={profile,memory:{folder:()=>profile},diary:{recordScene:s=>notes.push(structuredClone(s))},
    model:{memory:async(data,prompt)=>{prompts.push({data:JSON.parse(data),prompt});return prompts.length===1?{choice:first,idea:''}:decision;}},
    electron:{screen:{getCursorScreenPoint:()=>({x:50,y:50}),getDisplayNearestPoint:()=>({id:2,size:{width:1000,height:1000}})},
      desktopCapturer:{getSources:async()=>{captures++;return [{display_id:'2',thumbnail:image}];}},nativeImage:{createFromPath:()=>image}},
    vision:async q=>({text:q.startsWith('裁剪')?valid:q.startsWith('用能包住')?position:readable?'画面中有一弯月亮。':''}),
    show:async s=>{views.push(s);return true;},draw:async()=>'fixture.png',eligible:()=>true,wake:()=>wake(),context:()=>'平静'};
  const service=createSceneCuriosity(options);t.after(()=>service.close());
  return {profile,options,service,notes,views,prompts,captures:()=>captures,onReady:()=>new Promise(r=>{wake=r;})};
}
const ask={action:'ask',record:'nag',text:'老公，这弯月亮是你画的吗？',focus:'月牙',drawing:''};
test('定向提问保留同帧 JPEG，记录实际回答；全图和不确定的定位都无标注',async t=>{
  for(const [focus,valid,mark] of [['月牙','是',true],['','是',false],['月牙','否',false]]){
    const f=await setup(t,{...ask,focus},{valid});await f.service.run(signal);
    assert.equal(f.captures(),1);const [view]=f.views;
    assert.equal(Boolean(view.frames[0].box),mark);assert.match(view.frames[0].url,/^data:image\/jpeg;base64,/);
    await f.service.finish(view,'我自己画的。');
    assert.equal(f.notes.at(-1).reply,'我自己画的。');assert.equal(f.notes.at(-1).record,'nag');
    await assert.rejects(access(join(f.profile,'curiosity-pending.json')));
  }
});
test('可以保持沉默、只写日记，或从哲学出发。跳过的画面不落盘',async t=>{
  const f=await setup(t,{...ask,action:'quiet',record:'none'});await f.service.run(signal);
  assert.deepEqual(await readdir(f.profile),[]);assert.equal(f.views.length,0);
  const diary=await setup(t,{...ask,action:'quiet',record:'diary',text:'何时才算同一幅画？'},{first:'reflect'});
  await diary.service.run(signal);assert.equal(diary.captures(),0);assert.equal(diary.views.length,0);
  assert.equal(diary.notes[0].record,'diary');assert.ok(diary.prompts.every(p=>p.prompt.includes('哲学')));
});
test('后台画完后等空闲才分享；截图和绘画一共两张，分享没有圈',async t=>{
  const f=await setup(t,{...ask,action:'share',drawing:'以月为信纸的画'});const ready=f.onReady();
  await f.service.run(signal);assert.equal(f.views.length,0);await ready;
  const resumed=createSceneCuriosity({...f.options,eligible:()=>false});await resumed.run(signal);resumed.close();
  await f.service.run(signal);const [view]=f.views;
  assert.deepEqual(view.frames.map(x=>x.label),['刚才看到的','绯月画的']);assert.ok(view.frames.every(x=>!x.box));
  await f.service.finish(view,'');assert.equal(f.notes.at(-1).reply,undefined);
});
test('自动看屏开关默认关，退出重启沿用用户选择',async t=>{
  const profile=await mkdtemp(join(tmpdir(),'scene-setting-'));
  const options={profile,check:async()=>'',handlers:{curiosity:async()=>''}};
  let checks=createReminderChecks(options);
  assert.equal(checks.polls().find(p=>p.id==='curiosity').enabled,false);
  checks.configure('curiosity',{enabled:true,minutes:45,maximum:3});checks.close();
  checks=createReminderChecks(options);t.after(()=>{checks.close();return rm(profile,{recursive:true,force:true});});
  assert.equal(checks.polls().find(p=>p.id==='curiosity').minutes,45);
  assert.equal(checks.polls().find(p=>p.id==='curiosity').enabled,true);
});
test('静默日记草稿与念叨回执能独立保存和重试，没有虚构用户回复',async t=>{
  const profile=await mkdtemp(join(tmpdir(),'scene-memory-'));
  const {DB,sqlite,close}=openTestDatabase();
  const migration=await readFile(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8');
  sqlite.exec(migration);
  const store=createPersonalityDiary({profile,memory:{},request:(path,init)=>personalityMemory(new Request('https://unit.test'+path,init),{DB},'tester')});
  const local=new DatabaseSync(join(profile,'personality-memory.sqlite'));
  t.after(()=>{local.close();store.close();close();return rm(profile,{recursive:true,force:true});});
  const s={id:'curiosity-unit',at:Date.now(),text:'那还是同一幅画吗？',record:'diary'};
  await store.recordScene(s);await store.recordScene(s);
  assert.equal(local.prepare('SELECT count(*) n FROM drafts').get().n,1);
  s.record='nag';s.reply='是的';s.repliedAt=s.at+8000;await store.recordScene(s);await store.recordScene(s);
  await store.syncNags(signal);
  const r=await personalityMemory(new Request('https://unit.test/api/memory/nags/scene-curiosity-unit'),{DB},'tester');
  assert.equal(r.status,200);
  const note=await r.json();assert.equal(note.source,'curiosity');assert.deepEqual(note.talk.map(line=>[line.who,line.text]),[['绯月',s.text],['你','是的']]);
});
test('未授权运行或模型主动选择休息时不采集，异常坐标不绘制',async t=>{
  const f=await setup(t,ask,{first:'wait'});await f.service.run(signal);assert.equal(f.captures(),0);
  const off=createSceneCuriosity({...f.options,eligible:()=>false});await off.run(signal);off.close();assert.equal(f.captures(),0);
  for(const v of ['null','[950,10,100,100]','[]','[1,2,0,4]'])assert.equal(readBox(v),null);
});
