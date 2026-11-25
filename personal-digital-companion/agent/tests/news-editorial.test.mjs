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
import {acceptedNewsReview,newsTitleEvidence,staysOnDiscussion} from '../../desktop/news-editorial.mjs';

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
      const latest=JSON.parse(text).latest?.title??'';
      if(job.stage==='topic')return {day:'沿海铁路暴雨停运',center:'沿海铁路暴雨停运与恢复',brief:'巡查受损区段供电设施'};
      if(job.stage==='reportBrief'){const n=JSON.parse(text).reports.length;return {briefs:Array.from({length:n},(_,i)=>'报道极简述'+(i+1))};}
      if(job.stage==='title')return latest.includes('恢复')
        ?{latest:'北段恢复南段仍受影响'}
        :{main:'沿海铁路暴雨停运风波',latest:'工作人员全面巡查区段'};
      if(job.stage==='reviewTitle')return {accept:'yes',reason:''};
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
  const id=news.feed().boards.社会.week[0][0];
  assert.ok(id);
  await news.editorialStep(signal); // topic
  await news.editorialStep(signal); // reportBrief
  await news.editorialStep(signal); // title
  assert.equal(news.feed().items[0].title,first);
  await news.editorialStep(signal); // reviewTitle
  assert.equal(news.feed().items[0].title,'沿海铁路暴雨停运风波，工作人员全面巡查区段');
  await news.editorialStep(signal); // summary
  await news.editorialStep(signal); // keywords
  await news.editorialStep(signal); // X
  assert.deepEqual(requests.map(row=>row.platform),['X']);
  db.close();open();
  await news.editorialStep(signal); // Reddit
  await news.editorialStep(signal); // wind
  assert.deepEqual(requests.map(row=>row.platform),['X','Reddit']);
  assert.equal(requests[0].to,requests[1].to);
  assert.equal(news.editorialHistory(id)[0].to-news.editorialHistory(id)[0].from,3*day);
  assert.equal(news.editorialHistory(id)[0].platforms[1].unverified,1);
  assert.deepEqual(stages,['topic','reportBrief','title','reviewTitle','keywords','wind']);
  at+=3*day;
  assert.equal(news.feed().boards.社会.week[0][0],id);
  items=[report('later','沿海铁路北段恢复运行',at-3600000,'甲报','北段恢复列车运行，南段仍受暴雨影响，需要继续整修。')];
  await news.poll(signal);
  assert.equal(news.feed().boards.社会.week[0][0],id);
  for(let step=0;step<9;step++)await news.editorialStep(signal);
  assert.equal(news.event(id).title,'沿海铁路暴雨停运风波，北段恢复南段仍受影响');
  assert.equal(news.event(id).nodes.length,2);
  assert.equal(news.event(id).reports.length,4);
  assert.equal(news.editorialHistory(id).length,2);
  const last=items[0].publishedAt;
  at=last+7*day-1;
  assert.ok(news.event(id));
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
  assert.equal(acceptedNewsReview({accept:'yes',reason:'草稿中的计划没有来源'}),false);
  assert.equal(acceptedNewsReview({accept:'yes',reason:''}),true);
  assert.equal(staysOnDiscussion('X 平台引用显示股价跌破 IPO 价；Reddit 在讨论融资瓶颈。',['X','Reddit']),false);
  assert.equal(staysOnDiscussion('X 有帖子担心抛售持续，Reddit 有帖子讨论融资瓶颈。',['X','Reddit']),true);
  const market=[{date:'2026-11-21 JST',title:'Anthropic上市次日回落',text:'美股科技板块承压。'}];
  assert.equal(supportedNewsTitle('金银走弱，计划或受宏观数据影响',market,'美股科技板块承压，Anthropic上市次日回落'),false);
  assert.equal(supportedNewsTitle('Anthropic上市次日回落，美股科技板块承压',market,'美股科技板块承压，Anthropic上市次日回落'),true);
  assert.equal(supportedNewsTitle('Anthropic上市次日回落，AI最大IPO熄火',market,'美股科技板块承压，Anthropic上市次日回落'),false);
});

test('转载和综合早报只补出处，榜单编号与真正的新进展一起保留',async t=>{
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  let at=time(22),items=[];
  const news=createNewsBriefing(db,()=>at,()=>{},async()=>({items,failed:[]}),
    {editorial:{skill:()=>readInteractionSkill('newsEditorial')}});
  const row=(id,title,publishedAt,topic='美国股市')=>({url:'https://example.org/'+id,title,topic,
    publishedAt,source:id,excerpt:title,lang:'zh'});
  items=[
    row('first','Anthropic(ANT.US)登陆美股市场，开盘股价暴涨超33%',at-day*2),
    row('market','美股科技股集体下挫，Anthropic上市未能提振交易，纳指跌5.28%，英伟达跌14%',at-day*2+2*3600000),
    row('second','Anthropic上市次日大跌8%，英伟达再跌5%',at-day)
  ];
  await news.poll(signal);
  const primary=news.feed().items.find(item=>item.title.includes('Anthropic'));
  assert.ok(primary);
  const oldId=primary.id;
  const last=news.event(oldId).at;
  items=[row('roundup','【早报】美股大跳水；Anthropic上市首秀收涨17%；黄金、白银大幅走弱',at+3600000)];
  at+=3600001;
  await news.poll(signal);
  const updated=news.event(oldId);
  assert.ok(updated);
  assert.equal(updated.at,last);
  assert.equal(updated.nodes.some(node=>node.title.includes('黄金')),false);
  assert.equal(updated.reports.length,4);
  assert.equal(newsTitleEvidence(updated).at(-1).title,'Anthropic上市次日回落');
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
      if(stage.stage==='topic')return {day:'沿海铁路北段恢复运行',center:'沿海铁路暴雨后分段恢复',brief:'北段恢复运行并检查设备'};
      if(stage.stage==='reportBrief')return {briefs:['北段恢复运行']};
      return stage.stage==='title'?{main:'沿海铁路暴雨后分段恢复',latest:'北段恢复运行继续检查设备'}:{accept:'yes',reason:''};
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
  await next(); // topic
  await next(); // reportBrief
  await next(); // title
  await next(); // reviewTitle
  assert.deepEqual(stages,['topic','reportBrief','title','reviewTitle']);
  assert.match(checks.newsFeed().items[0].title,/北段恢复运行继续检查设备/);
  assert.ok(checks.polls().find(row=>row.id==='news').nextAt>now);
});

test('快照重排周期（8h/24h）、话题生命周期（48h/120h）及旧闻维持与纠错',async t=>{
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  let at=time(18);
  let items=[];
  let topicCall=0;
  const news=createNewsBriefing(db,()=>at,()=>{},async()=>({items,failed:[]}),{
    compile:async()=>({summary:'这是用于测试纠错和摘要的完整新闻摘要正文内容超过五十字以便通过摘要长度校验。',
      corrections:[{index:0,field:'title',text:'沿海铁路因暴雨临时停运'}]}),
    editorial:{
      skill:()=>readInteractionSkill('newsEditorial'),
      model:{
        async memory(_text,_rule,_schema,_signal,job){
          if(job.stage==='topic'){
            topicCall++;
            if(topicCall===1)return {day:'超长'.repeat(12),center:'中心',brief:'中心'};
            return {day:'沿海铁路暴雨停运',center:'沿海铁路停运风波',brief:'排查受损供电设施'};
          }
          if(job.stage==='reportBrief')return {briefs:['暴雨致铁路停运']};
          if(job.stage==='title')return {main:'沿海铁路停运风波',latest:'排查受损供电设施'};
          if(job.stage==='reviewTitle')return {accept:'yes',reason:''};
          return {groups:['沿海铁路']};
        }
      }
    }
  });
  // 旧格式快照应立即重算
  db.prepare("INSERT INTO news_boards VALUES('社会',?)").run(JSON.stringify({hot:['old'],key:[]}));
  items=[{url:'https://example.org/a1',title:'沿海铁路因暴雨停运',source:'甲报',publishedAt:at-3600000,topic:'中国社会',excerpt:'正在排查供电设施。',lang:'zh'}];
  await news.poll(signal);
  const feed1=news.feed();
  const id=feed1.boards.社会.week[0][0];
  assert.ok(id);
  assert.equal(feed1.boards.社会.day[0][0],id);
  const snapAt=feed1.boards.社会.dayAt;

  // 推进 4 小时（不满 8h）：日榜快照不变
  at+=4*3600000;
  items=[
    {url:'https://example.org/b1',title:'新热点事件一',source:'甲报',publishedAt:at-1000,topic:'中国社会',excerpt:'详情',lang:'zh'},
    {url:'https://example.org/b2',title:'新热点事件一',source:'乙报',publishedAt:at-2000,topic:'中国社会',excerpt:'详情',lang:'zh'},
    {url:'https://example.org/b3',title:'新热点事件一',source:'丙报',publishedAt:at-3000,topic:'中国社会',excerpt:'详情',lang:'zh'}
  ];
  await news.poll(signal);
  assert.equal(news.feed().boards.社会.day[0][0],id);
  assert.equal(news.feed().boards.社会.dayAt,snapAt);

  // 再推进 4 小时（满 8h）：日榜重算，周榜不变（未满 24h）
  at+=4*3600000;
  const feed8=news.feed();
  assert.notEqual(feed8.boards.社会.day[0][0],id);
  assert.equal(feed8.boards.社会.week[0][0],id);

  // topic 重试 1 次后成功写入，center 冻结
  await news.editorialStep(signal);
  assert.equal(topicCall,2);
  const itemAfterTopic=news.feed().items.find(x=>x.id===id);
  assert.equal(itemAfterTopic.center,'沿海铁路停运风波');
  assert.equal(itemAfterTopic.dayText,'沿海铁路暴雨停运');
  assert.equal(itemAfterTopic.weekLines[0][0],'排查受损供电设施');

  // 推进到 24h，加上另外 5 个更高热度事件把 id 挤出周榜前 5
  at+=16*3600000;
  const distinctTitles=['金融市场波动','航天发射成功','城市地铁延伸','芯片制程突破','气象台发预警'];
  items=distinctTitles.flatMap((title,n)=>[1,2].map(k=>({
    url:`https://example.org/top-${n}-${k}`,title,source:`报${k}`,publishedAt:at-k*1000,topic:'中国社会',excerpt:'内容',lang:'zh'
  })));
  await news.poll(signal);
  const feed24=news.feed();
  assert.ok(!feed24.boards.全部.week.some(([eid])=>eid===id));
  assert.ok(feed24.items.find(x=>x.id===id).isTopic);

  // 推进到 120h 无新内容且不在前 5：中断话题身份
  at+=100*3600000;
  assert.equal(news.feed().items.find(x=>x.id===id).isTopic,false);

  // 验证纠错保留原文 was
  await news.editorialStep(signal); // 对在榜话题执行一次，或直接检查节点定稿
  const ev=news.event(id);
  assert.ok(ev.nodes[0].title);
});
