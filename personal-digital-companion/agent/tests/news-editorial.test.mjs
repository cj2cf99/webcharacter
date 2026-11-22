import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNewsBriefing} from '../../desktop/news-briefing.mjs';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';
import {createReminderChecks} from '../../desktop/reminder-checks.mjs';
import {readInteractionSkill} from '../../desktop/interaction-skills.mjs';
import {supportedNewsTitle} from '../../desktop/news-editor.mjs';

const day=86400000;
const time=day=>Date.parse('2026-11-'+day+'T09:00:00+09:00');
const signal=new AbortController().signal;

test('绯月新闻编辑沿同一话题分段执行，重启后接着查完并归档两条时间线',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-news-editorial-'));
  const state=join(dir,'news.sqlite'),archiveDir=join(dir,'archive');
  let at=time(18)+3600000,db,news,items=[];
  const stages=[],requests=[];
  const model=createAiWorkflowModel({file:join(dir,'ai.sqlite'),model:{
    close(){},
    async memory(text,_instruction,_schema,_signal,job){
      stages.push(job.stage);
      const latest=JSON.parse(text).current?.title??'';
      if(job.stage==='title')return {title:latest.includes('恢复')
        ?'沿海铁路北段恢复运行，南段仍受暴雨影响'
        :'沿海铁路因暴雨停运，工作人员全面巡查受损区段'};
      if(job.stage==='reviewTitle')return {accept:'yes',reason:'与已经报道的进展一致'};
      if(job.stage==='keywords')return {groups:['沿海铁路 暴雨','沿海铁路 恢复','沿海铁路 北段']};
      if(job.stage==='wind')return {title:'讨论聚焦铁路复运',summary:'X 关注复运时间，Reddit 关注仍未开放的区段。',change:'近期更关心恢复范围。',refs:['1','2']};
      throw Error('未登记阶段 '+job.stage);
    }
  }});
  t.after(async()=>{await model.close();db?.close();rmSync(dir,{recursive:true,force:true,maxRetries:3});});
  const compile=async()=> '沿海铁路受持续暴雨影响停运。当地铁路公司安排人员巡查受损区段并检查供电设施，计划根据排查和天气情况分段恢复运行。';
  function open(){
    db=new DatabaseSync(state);
    news=createNewsBriefing(db,()=>at,()=>{},async()=>({items,failed:[]}),{archiveDir,compile,
      editorial:{model,skill:()=>readInteractionSkill('newsEditorial'),lookup:async(platform,groups,to)=>{
        requests.push({platform,groups,to});
        const url=platform==='X'?'https://x.com/rail/status/12345':'https://www.reddit.com/r/trains/comments/abc123/';
        return {state:'ok',credits:1,posts:[{url,title:'沿海铁路',at:platform==='X'?to-3600000:null,text:'关注铁路复运与分段恢复。'}]};
      }}});
  }
  const report=(key,title,when,source,excerpt)=>({url:'https://example.org/'+key,title,source,publishedAt:when,
    topic:'中国社会',excerpt,lang:'zh'});
  open();
  const first='沿海铁路因暴雨停运';
  items=['甲报','乙报','丙报'].map((source,index)=>
    report('first-'+index,first,time(18)+index*60000,source,'工作人员全面巡查受损区段和沿线供电设施。'));
  await news.poll(signal);
  const id=news.feed().boards.社会.hot[0];
  assert.ok(id);
  await news.editorialStep(signal);
  assert.equal(news.feed().items[0].title,first);
  await news.editorialStep(signal);
  assert.equal(news.feed().items[0].title,'沿海铁路因暴雨停运，工作人员全面巡查受损区段');
  await news.editorialStep(signal);
  await news.editorialStep(signal);
  await news.editorialStep(signal);
  assert.deepEqual(requests.map(row=>row.platform),['X']);
  db.close();open();
  await news.editorialStep(signal);
  await news.editorialStep(signal);
  assert.deepEqual(requests.map(row=>row.platform),['X','Reddit']);
  assert.equal(requests[0].to,requests[1].to);
  assert.equal(news.editorialHistory(id)[0].to-news.editorialHistory(id)[0].from,3*day);
  assert.equal(news.editorialHistory(id)[0].platforms[1].unverified,1);
  assert.deepEqual(stages,['title','reviewTitle','keywords','wind']);
  at+=3*day;
  assert.deepEqual(news.feed().boards.社会.quiet,[id]);
  items=[report('later','沿海铁路北段恢复运行',at-3600000,'甲报','北段恢复列车运行，南段仍受暴雨影响，需要继续整修。')];
  await news.poll(signal);
  assert.deepEqual(news.feed().boards.社会.hot,[id]);
  assert.deepEqual(news.feed().boards.社会.quiet,[]);
  for(let step=0;step<7;step++)await news.editorialStep(signal);
  assert.equal(news.event(id).title,'沿海铁路北段恢复运行，南段仍受暴雨影响');
  assert.equal(news.event(id).nodes.length,2);
  assert.equal(news.event(id).reports.length,4);
  assert.equal(news.editorialHistory(id).length,2);
  const last=items[0].publishedAt;
  at=last+7*day-1;
  assert.equal(news.feed().boards.社会.hot[0],id);
  at++;
  items=[];
  assert.equal(news.feed().items.length,0);
  assert.match(await news.poll(signal),/已归档 1 件/);
  assert.equal(news.event(id),undefined);
  const saved=readFileSync(join(archiveDir,'2026-11-21',id+'.md'),'utf8');
  assert.match(saved,/新闻发展时间线/);
  assert.match(saved,/社论风向/);
  assert.match(saved,/北段恢复运行/);
  assert.match(saved,/reddit\.com/);
  assert.equal((saved.match(/讨论聚焦铁路复运/g)||[]).length,2);
});

test('关键 headline 校验保持市场范围和新闻状态',()=>{
  assert.equal(supportedNewsTitle('Anthropic 首日冲高，次日股价回落',[{
    date:'2026-11-21 JST',title:'美股周末前跌势加剧，Anthropic 次日回落',text:'美股科技股继续下跌。'
  }]),false);
  const disaster=[{date:'2026-11-22 JST',title:'德令哈地震救援',text:'暂未发现人员伤亡，青藏铁路受影响区段已限速恢复。'}];
  assert.equal(supportedNewsTitle('德令哈地震无人员伤亡，青藏铁路已恢复正常',disaster),false);
  assert.equal(supportedNewsTitle('德令哈地震暂未发现伤亡，受影响铁路区段限速恢复',disaster),true);
});

test('桌面既有轮询自动推进标题，未到 RSS 周期也能续办',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-news-poll-'));
  let now=time(23),stages=[];
  const db=new DatabaseSync(join(profile,'reminder-checks.sqlite'));
  db.exec('CREATE TABLE news_briefing (id INTEGER PRIMARY KEY,lastCheck INTEGER,latest TEXT)');
  db.prepare('INSERT INTO news_briefing VALUES(1,?,?)').run(now,JSON.stringify({at:now,items:[{
    title:'沿海铁路北段恢复运行',topic:'中国社会',publishedAt:now-3600000,
    url:'https://example.org/rail',excerpt:'南段继续安排工作人员检查交通和设备。',source:'通报'
  }]}));
  db.close();
  const timers=new Set();
  const checks=createReminderChecks({profile,now:()=>now,notifyNews:()=>{},isBusy:()=>false,
    setTimer:(callback,delay)=>{
      const timer={at:now+delay,callback};
      timers.add(timer);return timer;
    },
    clearTimer:timer=>timers.delete(timer),
    newsEditorial:{skill:()=>readInteractionSkill('newsEditorial'),model:{async memory(_text,_rule,_schema,_signal,stage){
      stages.push(stage.stage);
      return stage.stage==='title'?{title:'沿海铁路北段恢复运行，南段继续检查设备'}:{accept:'yes',reason:'保留恢复范围'};
    }}}});
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true,maxRetries:3});});
  checks.start();
  const job=()=>checks.polls().find(row=>row.id==='newsEditorial');
  const next=async()=>{
    now=job().nextAt;
    for(const timer of [...timers].filter(timer=>timer.at===now)){
      timers.delete(timer);timer.callback();
    }
    while(job().running)await new Promise(resolve=>setTimeout(resolve,5));
  };
  await next();
  await next();
  assert.deepEqual(stages,['title','reviewTitle']);
  assert.match(checks.newsFeed().items[0].title,/南段继续检查设备/);
  assert.ok(checks.polls().find(row=>row.id==='news').nextAt>now);
});
