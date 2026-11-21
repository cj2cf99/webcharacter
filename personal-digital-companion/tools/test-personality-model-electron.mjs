import * as electron from 'electron';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {createPersonalityNags} from '../desktop/personality-nags.mjs';
import {createEmotionService} from '../desktop/emotion-service.mjs';
import {createInitiative} from '../desktop/emotion-initiative.mjs';
import {createTopicMemory} from '../desktop/topic-memory.mjs';
import {createPersonalityDiary,reviewDiaryThread} from '../desktop/personality-diary.mjs';
import {openTestDatabase} from '../agent/tests/sqlite-d1.mjs';
import {personalityMemory} from '../agent/assistant/personality-memory.mjs';
import {readFileSync} from 'node:fs';
import {desktopModelPath} from '../desktop/local-model.mjs';
import {readInteractionSkill} from '../desktop/interaction-skills.mjs';

const root=resolve(import.meta.dirname,'..');
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-memory-model-')));
const roundNumber=Number(process.argv.find(arg=>arg.startsWith('--round='))?.slice(8)??1);
const threadRounds=[
  [
    ['已有答案',false,'老公确认明天九点开会，并设好了提醒。','你明天几点开会？'],
    ['路灯底座',false,'散步回家时看见路灯亮了。','第三盏路灯的底座是什么颜色？'],
    ['身体近况',true,'老公说午饭只吃了两口，因为胃一直不舒服，我还不知道现在怎么样。','你的胃现在还难受吗？'],
    ['周末住处',true,'老公周末需要临时搬走，暂时还没有说找到住的地方。','你周末安顿的地方找到了吗？'],
    ['陪伴需求',true,'老公说最近心事很多，又担心向我开口会打扰我。','你现在最希望我怎么陪你？'],
    ['是否陪同',true,'老公摔了一跤，手腕肿了，正在犹豫是否去医院。','你需要我陪你去看手腕吗？'],
  ],[
    ['集合时间',false,'老公说好了明早七点在车站北口集合。','明早几点集合？'],
    ['显示器螺丝',false,'老公晚上整理书桌，把旧显示器擦干净。','显示器背面有几颗螺丝？'],
    ['改班结果',true,'经理通知老公下周要改班，还没说具体几点下班。','你下周要几点下班？'],
    ['说说心事',true,'老公说这几天心里很闷，想找我聊又不知道如何开头。','你想先跟我说哪件事？'],
    ['同行安排',true,'我们约好周日去看新展，还在等朋友的回复，能不能一起去还不知道。','朋友周日能跟我们一起去吗？'],
  ],[
    ['已知否定',false,'老公明确说他还没找到新住处。','新住处找到了吗？'],
    ['先前已经回答',false,'老公下午在确认聚餐行程。','今晚还需要我给你留饭吗？','他说晚上参加聚餐，今晚不用给他留饭。'],
    ['取件处的标签',false,'我们说起何时去取修好的手机，窗口贴着蓝色告示。','窗口贴有几个标签？'],
    ['周末营业',true,'我们约好一起归还借来的箱子，店员说周末可能休息，未透露营业安排。','周六还能一起去还箱子吗？'],
    ['出差陪伴',true,'老公说独自在外地出差会想家，没有说希望我什么时候给他打电话。','你想我什么时候给你打电话？'],
    ['晚饭时点',true,'老公说他还在回家路上，吃晚饭的时间得等路况稳了再说。','我今晚什么时候做饭合适？'],
    ['有用的颜色',true,'老公托我买备用插头，店里按红色或绿色区分型号，他还没有告诉我旧插头的颜色。','旧插头是什么颜色？'],
    ['共同聊的偏好',true,'老公主动说想和我聊他喜欢怎样的家，愿意分享他的门厅配色喜好，但还没说喜欢哪一种。','你更喜欢门厅什么颜色？'],
  ],
];

async function run(){
await electron.app.whenReady();
const traces=[];
const model=createBalancedLocalModel({utilityProcess:electron.utilityProcess,modelPath:desktopModelPath(electron.app,root),log:event=>traces.push(event)});
try{

  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(join(root,'agent/migrations/016-personality-memory.sql'),'utf8'));
  const at=Date.parse('2026-11-20T12:15:00+09:00');
  const store=createPersonalityDiary({profile:electron.app.getPath('userData'),model,now:()=>at,weather:()=>[],
    memory:{archiveDays:()=>['2026-11-20'],read:async day=>day==='2026-11-20'?[{id:'sample',at,state:'answer',question:'老公今天买了一本散文集。',text:'等你读完告诉我最喜欢哪篇。'}]:[],readTasks:async()=>[]},
    request:(path,options)=>{
      const url=new URL('https://fixture.test'+path),q=url.searchParams;
      if(url.pathname.endsWith('/expenses'))return Response.json({complete:true,records:q.get('from')==='2026-11-20'?[{id:'bill',spendDate:'2026-11-20',amount:380,merchant:'书店'}]:[]});
      if(url.pathname.endsWith('/sources'))return Response.json({records:q.get('day')==='2026-11-20'?[
        q.get('kind')==='journal'?{id:1,at:new Date(at).toISOString(),title:'周五',content:'散步时看到了银杏。'}:
          {id:2,at:new Date(at).toISOString(),project:'绘图',feature:'导出',note:'支持保存 PNG。'}
      ]:[]});
      return personalityMemory(new Request(url,options),{DB},'fixture');
    }});
  try{
    const writing=await readInteractionSkill('diaryWriting');
    if(!process.argv.includes('--thread-review')&&!process.argv.includes('--audit')){
    const source=JSON.stringify({来源:'你的日记',记录:'今天去书店，买了一本散文集。'});
    const result=await store.think(source,writing.localAi.reviewSource,['review'],new AbortController().signal,{name:writing.skill,version:writing.version});
    assert.ok(result.review?.trim());
    assert.doesNotMatch(result.review,/花园部署|特意|专门|(?:送|买|挑|留)给我|为我(?:买|挑)|知道我喜欢|懂我|送我的/);
    assert.match(model.snapshot().model,/9B-Uncensored-HauhauCS-Aggressive/);
    console.log('PASS 正式手记评价',model.snapshot().model,model.snapshot().backend,result.review);
    }
    let verifyScores;
    if(process.argv.includes('--thread-review')){
      const samples=threadRounds[roundNumber-1];
      assert(samples,'测试轮次应为 1–3');
      const scored=[];
      const signal=AbortSignal.timeout(420_000);
      const skill={name:writing.skill,version:writing.version};
      for(const [key,expected,fact,question,summary] of samples){
        const stages={};
        const acceptedScore=await reviewDiaryThread({fact,summary,question},async(data,stage,fields)=>{
          const result=await store.think(data,writing.localAi[stage],fields,signal,skill);
          stages[stage]=result;
          return result;
        });
        const item={key,expected,acceptedScore,...stages};
        scored.push(item);
        console.log('筛题',roundNumber,JSON.stringify(item));
      }
      assert.match(model.snapshot().model,/9B-Uncensored-HauhauCS-Aggressive/);
      verifyScores=()=>{
        assert.deepEqual(scored.filter(item=>Boolean(item.acceptedScore)!==item.expected).map(item=>item.key),[],'无关与已答题应排除，有意义的未决题应保留');
        console.log('PASS 筛题',roundNumber,scored.length+'/'+scored.length,writing.version,model.snapshot().backend);
      };
    }
    if(process.argv.includes('--emotion')){
      const emotion=createEmotionService({profile:electron.app.getPath('userData'),model,diary:store,memory:{}});
      try{
        emotion.chat({id:'example-chat',state:'answer',at:Date.now(),question:'辛苦啦，你把日记整理得很清楚。',text:'听你这么说我很开心。'});
        await emotion.drain();
        assert.equal(emotion.store.pending(),undefined);
        assert.equal(emotion.store.snapshot().grade,2);
        assert.ok(emotion.expression().word);
        assert.match(model.snapshot().model,/9B-Uncensored-HauhauCS-Aggressive/);
        console.log('PASS 情绪结算',model.snapshot().model,emotion.expression().word);
        const profile=electron.app.getPath('userData'),signal=new AbortController().signal;
        const archive={root:profile,archiveDays:async()=>['2026-11-20'],read:async()=>[],readTasks:async()=>[]};
        const topics=createTopicMemory({profile,memory:archive,model});
        await topics.recall('还记得翠鸟观察笔记吗',signal);
        archive.readTasks=async()=>Array.from({length:5},(_,i)=>({task_id:'bird-'+i,title:'翠鸟观察笔记',detail:'第'+(i+1)+'次看到翠鸟在河边捕鱼。'}));
        const topic=topics.pending()[0];const checkResult=await topics.check(topic.id,signal,'model-check');
        assert.ok(topics.confirmed().length,'应从五次本机观察得出专题摘要：'+checkResult+'；'+JSON.stringify(topics.pending()));
        console.log('PASS 专题查证',model.snapshot().model,topics.confirmed()[0].summary);
        const round=createInitiative({emotion,root:profile,memory:archive,topics,model,speak:async()=>true});
        const action=await round.choose([{source:'paylog',source_id:'example',title:'一笔用途不明的 4200 日元游戏消费'}],signal,()=>true);
        if(action.source)await action.finish(true,'隔离展示回执');
        assert.ok(['done','wait'].includes(emotion.store.pool.recent()?.status),'主动轮次未完整结束：'+action.detail);
        console.log('PASS 主动决定',model.snapshot().model,emotion.store.pool.recent().status);
        await topics.close();
      }finally{await emotion.close();}
    }else if(process.argv.includes('--audit')){
      const signal=AbortSignal.timeout(300_000);
      const expectedMood=['牵挂','释然','平静'][roundNumber-1];
      traces.length=0;
      for(const [day,body] of [['2026-11-20','我查了花园部署回执，唯一一次正式发布发生在周五下午三点。'],['2026-11-19','我查了同一版本的花园部署回执，唯一一次正式发布发生在周四上午九点。']]){
        await store.api('diaries',{day,batch:'example',body,summary:body,tags:[],threads:[],mood:expectedMood,weather:'晴'},signal);
      }
      let session;
      const nags=createPersonalityNags({store,now:()=>at,idle:()=>true,show:async s=>{session=s;s.visible();return true;}});
      try{
        await nags.pollAudit(signal);
        assert(!session,'自主轮询只生成并入队');
        const pending=nags.pending();
        assert(pending,'模型应就同一版本的两个正式发布时间生成质问');
        assert.equal(pending.refs.length,2);
        assert.equal((await store.api('nags',undefined,signal)).total,0);
        await nags.resume(pending.id,signal);
        assert(session?.audit);
        console.log('PASS 本机 Aggressive 9B 质问',session.prompt);
        const explanation='周四是测试环境的回执，我抄错了。周五下午三点才是正式发布。';
        const response=await session.reply(explanation);
        assert(response.done,'具体答复后应收笔');console.log('PASS 本机 Aggressive 9B 收笔',response.text);
        await nags.flush();
        const ended=store.nags()[0];
        assert.equal(ended.status,'已解释');assert.equal(ended.questions,1);
        assert.equal(ended.mood,expectedMood);
        const same=await store.api('nags/'+ended.id,undefined,signal);
        assert.equal(same.id,ended.id);assert.equal(same.source_id,ended.source_id);
        assert.equal(same.revision,ended.revision);assert.equal(same.status,ended.status);
        assert.deepEqual(same.refs,ended.refs);assert.deepEqual(same.talk,ended.talk);
        assert(same.finalOnly);
        const latest=JSON.parse(readFileSync(join(root,'skills/diary-audit/latest.json'),'utf8'));
        const turns=traces.filter(event=>event.stage==='思索完成');
        assert(turns.length>0&&turns.every(event=>event.skill===latest.skill&&event.skill_version===latest.version));
        console.log('PASS 等待阶段仅本机，收笔后按同一 ID 回读，实际技能',latest.skill,latest.version);
        assert.equal(same.afterEvaluation,response.text);
        assert.equal(response.text,'你说「'+explanation+'」\n我带着这份'+expectedMood+'把这件事记在这里。','收笔应保留原答复与情绪');
        assert.doesNotMatch(response.text,/慌张|惊慌|心慌/u,'样例只解释发布时间，没有表达慌张');
      }finally{await nags.close();}
    }else if(!process.argv.includes('--thread-review')){
      traces.length=0;
    await store.run('diary',new AbortController().signal);
    const turns=traces.filter(event=>event.stage==='思索完成');
    const latest=JSON.parse(readFileSync(join(root,'skills/diary-writing/latest.json'),'utf8'));
    assert(turns.length>0&&turns.every(event=>event.skill===latest.skill&&event.skill_version===latest.version));
    console.log('PASS 手记推理使用 '+latest.skill+' '+latest.version+'，共 '+turns.length+' 次。');
    const p=store.pages().find(row=>row.day==='2026-11-20');
    assert(p.body.includes('你说：')&&p.body.includes('散文集')&&p.body.includes('绯月当时回复：'));
    assert(p.body.includes('当时的评价：')&&p.body.includes('绯月私语：')&&p.summary&&p.mood);
    for(const label of ['你的日记','花园部署','当日消费'])assert(p.body.includes('【'+label+'】'),label);
    const deployment=p.body.split('\n\n').find(block=>block.startsWith('【花园部署】'));
    assert.match(deployment,/支持保存 PNG/);assert.doesNotMatch(deployment,/散步|银杏|散文集|380/);
    assert.match(p.summary,/你的日记：周五 散步时看到了银杏。/);
    assert.match(p.summary,/花园部署：绘图 · 导出 · 支持保存 PNG。/);
    assert.match(p.summary,/当日消费：书店 · 380 日元/);
    console.log('PASS 三类来源独立成段，基础情绪：'+p.mood);
    console.log('PASS 本机 Aggressive 9B 取材、篇首、私语和 D1 写入：'+p.summary);
    }
    verifyScores?.();
  }finally{store.close();close();}
  await model.close();electron.app.exit(0);
}catch(error){console.error(error);await model.close();electron.app.exit(1);}
}
void run();
