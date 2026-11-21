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
import {createPersonalityDiary} from '../desktop/personality-diary.mjs';
import {openTestDatabase} from '../agent/tests/sqlite-d1.mjs';
import {personalityMemory} from '../agent/assistant/personality-memory.mjs';
import {readFileSync} from 'node:fs';
import {desktopModelPath} from '../desktop/local-model.mjs';
import {readInteractionSkill} from '../desktop/interaction-skills.mjs';

const root=resolve(import.meta.dirname,'..');
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-memory-model-')));

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
    const source=JSON.stringify({来源:'你的日记',记录:'今天去书店，买了一本散文集。'});
    const result=await store.think(source,writing.localAi.reviewSource,['review'],new AbortController().signal,{name:writing.skill,version:writing.version});
    assert.ok(result.review?.trim());
    assert.doesNotMatch(result.review,/花园部署|特意|专门|(?:送|买|挑|留)给我|为我(?:买|挑)|知道我喜欢|懂我|送我的/);
    assert.match(model.snapshot().model,/9B-Uncensored-HauhauCS-Aggressive/);
    console.log('PASS 正式手记评价',model.snapshot().model,model.snapshot().backend,result.review);
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
      const signal=new AbortController().signal;
      traces.length=0;
      for(const [day,body] of [['2026-11-20','我查了花园部署回执，唯一一次正式发布发生在周五下午三点。'],['2026-11-19','我查了同一版本的花园部署回执，唯一一次正式发布发生在周四上午九点。']]){
        await store.api('diaries',{day,batch:'example',body,summary:body,tags:[],threads:[],mood:'牵挂',weather:'晴'},signal);
      }
      let session;
      const nags=createPersonalityNags({store,now:()=>at,idle:()=>true,show:async s=>{session=s;s.visible();return true;}});
      try{
        await nags.pollAudit(signal);
        assert(session?.audit,'模型应就同一版本的两个正式发布时间发问');
        assert.equal(nags.pending().refs.length,2);console.log('PASS 本机 Aggressive 9B 质问',session.prompt);
        const response=await session.reply('周四是测试环境的回执，我抄错了。周五下午三点才是正式发布。');
        assert(response.done,'具体答复后应收笔');console.log('PASS 本机 Aggressive 9B 收笔',response.text);
        await nags.flush();
        const ended=store.nags()[0];
        assert.equal(ended.status,'已解释');assert.equal(ended.questions,1);
        assert.equal(ended.mood,'牵挂');
        assert(response.text.includes(ended.mood),'收笔正文应带有当时的情绪');
        assert.doesNotMatch(response.text,/慌张|惊慌|心慌/u,'样例只解释发布时间，没有表达慌张');
        const same=await store.api('nags/'+ended.id,undefined,signal);
        assert.deepEqual(same,ended);
        const body='今天我读完了一本散文集，把书放回书架。';
        await store.api('diaries',{day:'2026-11-18',batch:'control',body,summary:body,tags:[],threads:[],mood:'平静',weather:'晴'},signal);
        session=null;
        await nags.pollAudit(signal);
        assert.equal(session,null,'已用篇目之外仅剩平常的读书记录，应当静默');
        assert.equal(store.nags().length,1);
        const latest=JSON.parse(readFileSync(join(root,'skills/diary-audit/latest.json'),'utf8'));
        const turns=traces.filter(event=>event.stage==='思索完成');
        assert(turns.length>0&&turns.every(event=>event.skill===latest.skill&&event.skill_version===latest.version));
        console.log('PASS 普通手记静默，同一 ID 回读一致，实际技能',latest.skill,latest.version);
      }finally{await nags.close();}
    }else{
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
  }finally{store.close();close();}
  await model.close();electron.app.exit(0);
}catch(error){console.error(error);await model.close();electron.app.exit(1);}
}
void run();
