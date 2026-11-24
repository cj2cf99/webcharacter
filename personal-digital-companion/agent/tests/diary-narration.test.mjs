import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';
import {splitDiaryRecords} from '../../desktop/diary-narration.mjs';
import {writeDeepSeekDiary} from '../../desktop/diary-deepseek.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {personalityMemory} from '../assistant/personality-memory.mjs';
import {openTestDatabase} from './sqlite-d1.mjs';

const day='2026-11-22';
const record=(content,source='本机行动')=>({source,content,day});
const generated=(body,comment)=>({paragraphs:[{body,comment}],thread:''});

test('普通记录整条贪心装片，超长记录优先在自然边界拆分且保留所有原文',()=>{
  const short=[record('一二三'),record('四五六七'),record('八九十')];
  const oversized=record('甲乙丙。丁戊己庚辛壬癸。🌙尾','原文');
  const fits=rows=>rows.reduce((sum,row)=>sum+[...row.content].length,0)<=8;
  const slices=[...splitDiaryRecords([...short,oversized],fits)];
  assert.deepEqual(slices[0],short.slice(0,2));
  assert.deepEqual(slices[1],[short[2]]);
  assert.ok(slices.every(fits));
  assert.equal(slices.slice(2).flat().map(row=>row.content).join(''),oversized.content);
  assert.equal(slices[2][0].content,'甲乙丙。');
  assert.ok(slices.slice(2).flat().every(row=>row.source==='原文'&&row.day===day));
});

test('单条短手记本机一次，长批直接交云端且等待时释放本机时隙',async()=>{
  const trace=[],sent=[],entered=Promise.withResolvers(),release=Promise.withResolvers();
  const model=createAiWorkflowModel({file:':memory:',
    model:{async memory(){throw Error('不应使用 GPU');},close(){}},
    assistant:{async memory(text,_instruction,_schema,_signal,skill){
      trace.push(skill.stage);
      if(skill.stage==='shortDiary'){
        if(text.includes('超限'))throw Object.assign(Error('输入超限'),{code:'LOCAL_AI_CONTEXT_BUDGET'});
        return {review:text};
      }
      return {answer:'是'};
    },close(){}},
    deepSeekDiary:async input=>{
      sent.push(input);
      if(sent.length===3)throw Object.assign(Error('模拟服务不可用'),{code:'DIARY_DEEPSEEK_HTTP_429'});
      if(sent.length===2){entered.resolve();await release.promise;}
      return generated('整批正文','整批短评');
    }});
  const records=['一','二','三','四'].map(value=>record(value));
  try{
    assert.equal(await model.writeLargeDiary({day,records:[]}),null);
    const cancelled=AbortSignal.abort();
    await assert.rejects(model.writeLargeDiary({day,records},{signal:cancelled}),{name:'AbortError'});
    const short=await model.writeLargeDiary({day,records:records.slice(0,1)});
    assert.equal(short.text,records[0].content);
    assert.equal(short.comment,'读过这条，我还想多了解一些。');
    assert.equal(sent.length,0);
    const rejected=[record('超限')];
    assert.equal((await model.writeLargeDiary({day,records:rejected})).text,'整批正文');
    const pending=model.writeLargeDiary({day,records});
    await entered.promise;
    assert.deepEqual(await model.memory('是否收到','判断',{type:'object',required:['answer'],
      properties:{answer:{enum:['是','否']}}},undefined,{name:'fixture',stage:'judgment',aiKind:'judgment'}),{answer:'是'});
    release.resolve();
    const result=await pending;
    assert.deepEqual(sent.map(({records})=>records),[rejected,records]);
    assert.equal(result.text,'整批正文');
    await assert.rejects(model.writeLargeDiary({day,records}),{code:'DIARY_DEEPSEEK_HTTP_429'});
    assert.deepEqual(trace,['shortDiary','shortDiary','judgment']);
  }finally{release.resolve();await model.close();}
});

test('DeepSeek 直连只上传一次，Flash 低档思考、JSON 形式，客户端不设长度上限',async()=>{
  const records=[record('同一事件的第一次记录'),record('同一事件的第二次记录')];
  const long='完整正文。'.repeat(1600);
  const threads=['付款方式还没确认','预约时间未定','施工结果待核实','是否同行还没答复','次要事项待确认'];
  let calls=0;
  const result=await writeDeepSeekDiary({day,records},undefined,{key:'fixture-key',
    fetcher:async(url,options)=>{
      calls++;
      assert.equal(url,'https://sub.bandaoapi.com/v1/chat/completions');
      assert.equal(options.headers.authorization,'Bearer fixture-key');
      const payload=JSON.parse(options.body);
      assert.equal(payload.model,'deepseek-v4.1-flash');
      assert.equal(payload.thinking,undefined);
      assert.equal(payload.reasoning_effort,'low');
      assert.deepEqual(payload.response_format,{type:'json_object'});
      assert.equal(Object.hasOwn(payload,'max_tokens'),false);
      assert.match(payload.messages[0].content,/交付前自行核对原材料/);
      assert.match(payload.messages[0].content,/11 月 24 日普通安排写“明天”/);
      assert.match(payload.messages[0].content,/按重要性从高到低排列，最多 4 件/);
      assert.equal(JSON.parse(payload.messages[1].content).情绪基础,'平静');
      assert.deepEqual(JSON.parse(payload.messages[1].content).原材料.map(row=>row.at(-1)),records.map(row=>row.content));
      return Response.json({choices:[{finish_reason:'stop',message:{
        reasoning_content:'内部思考不能进入应用结果',content:JSON.stringify({
          paragraphs:generated(long,'短评').paragraphs,threads:['',threads[0],threads[0],...threads.slice(1)]
        })
      }}]});
    }});
  assert.deepEqual(result,{paragraphs:generated(long,'短评').paragraphs,threads:threads.slice(0,4)});
  assert.equal(calls,1);
});

test('没有密钥和不完整 JSON 均返回安全错误，避免把半份结果当成手记',async()=>{
  const data={day,records:[record('测试')]};
  await assert.rejects(writeDeepSeekDiary(data,undefined,{key:'',fetcher:()=>assert.fail('没有凭据不可发送')}),
    {code:'DIARY_DEEPSEEK_KEY_MISSING'});
  for(const [finish_reason,content] of [['stop',' '],['stop','{"paragraphs":[{"body":"缺短评"}],"thread":""}'],['length','{}']]){
    await assert.rejects(writeDeepSeekDiary(data,undefined,{key:'fixture',
      fetcher:()=>Response.json({choices:[{finish_reason,message:{content}}]})}),{code:'DIARY_DEEPSEEK_RESULT_INVALID'});
  }
});

test('到期写手记无材料不成文，一条材料即可成文，长成稿按已有篇长保存',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-diary-narration-'));
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8'));
  const at=Date.parse(day+'T12:00:00+09:00');
  const source={task_id:'one',at,title:'一条归档',action:'整理清单',detail:'保留原来的截止日'};
  let available=false,calls=0;
  const model={
    async memory(text,_prompt,schema){
      const values={text:schema.required.includes('review')?text:'归档记录',review:'看到了原来的截止日。',
        mood:'平静',summary:'整理清单',tags:'',thread:''};
      return Object.fromEntries(schema.required.map(key=>[key,values[key]??'']));
    },
    async writeDiaryNarration(input){
      calls++;
      assert.equal(input.records.length,1);
      return {text:'已经成稿',comment:'短评',thread:'',paragraphs:[
        {body:'原始材料内容。'.repeat(750),comment:'第一段短评。'},
        {body:'后续事项照旧。'.repeat(130),comment:'最后一段短评。'}
      ]};
    }
  };
  const diary=createPersonalityDiary({profile,model,now:()=>at,weather:()=>[],
    memory:{read:()=>[],readTasks:value=>available&&value===day?[source]:[]},
    request:(path,options)=>{
      if(path.startsWith('/api/memory/sources?'))return Response.json({records:[]});
      if(path.startsWith('/api/memory/expenses?'))return Response.json({records:[],complete:true});
      return personalityMemory(new Request('https://fixture.test'+path,options),{DB},'diary-test');
    }});
  t.after(()=>{diary.close();close();rmSync(profile,{recursive:true,force:true});});
  await diary.run('diary',new AbortController().signal);
  assert.equal(calls,0);
  available=true;
  await diary.run('diary',new AbortController().signal);
  const pages=diary.pages(day);
  assert.equal(calls,1);
  assert.ok(pages.length>=2);
  assert.ok(pages.every(page=>[...page.body].length<=5000));
  assert.ok(pages.some(page=>page.body.includes('最后一段短评。')));
  await diary.run('diary',new AbortController().signal);
  assert.equal(calls,1,'已经保存的材料不能重复成文');
});

test('整批手记的失败保留待办，成功后只保存一次，交给模拟接口前清洗密钥',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-large-diary-'));
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8'));
  const at=Date.parse(day+'T12:00:00+09:00');
  const tasks=Array.from({length:4},(_,i)=>({task_id:'task-'+i,at:at+i,title:'每日记录 '+i,
    action:'保留原来的截止日',detail:i===0?'API key: sk-private-fixture-123456':'待办已核对'}));
  let calls=0;
  const model={
    shortDiaryReviews:true,
    async memory(){assert.fail('手记成稿前不应逐条补评');},
    async writeLargeDiary(input){
      calls++;
      assert.equal(input.records.length,4);
      assert.ok(input.records.every(row=>row.day===day));
      assert.doesNotMatch(JSON.stringify(input.records),/private-fixture/);
      assert.doesNotMatch(JSON.stringify(input.records),/仅限本机的问答/);
      assert.doesNotMatch(JSON.stringify(input.records),/旧直连内容|无出处的历史正文/);
      if(calls===1)throw Object.assign(Error('模拟接口限流'),{code:'DIARY_DEEPSEEK_HTTP_429'});
      return {paragraphs:generated('整批已核对后成文。','这是整批短评。').paragraphs,
        threads:['待确认一','待确认二','待确认三','待确认四','待确认五']};
    },
    writeDiaryNarration(){assert.fail('整批路线不可再逐片生成');}
  };
  const diary=createPersonalityDiary({profile,model,now:()=>at,weather:()=>[],
    memory:{read:value=>value===day?[{id:'private',at,question:'仅限本机的问答',text:'保留本机',state:'answer',localOnly:true}]:
      value==='2026-11-10'?[{id:'legacy-direct',at,question:'旧直连内容',text:'本地回答',state:'answer',direct:true}]:[],
      readTasks:value=>value===day?tasks:[]},
    request:(path,options)=>{
      if(path.startsWith('/api/memory/sources?'))return Response.json({records:[]});
      if(path.startsWith('/api/memory/expenses?'))return Response.json({records:[],complete:true});
      return personalityMemory(new Request('https://fixture.test'+path,options),{DB},'large-diary-test');
    }});
  t.after(()=>{diary.close();close();rmSync(profile,{recursive:true,force:true});});
  const archive=new DatabaseSync(join(profile,'personality-memory.sqlite'));
  try{
    for(const [source,content] of [['legacy-direct','旧直连内容'],['legacy-unknown','无出处的历史正文']]){
      archive.prepare('INSERT INTO cleaned VALUES(?,?)').run(source,content);
      archive.prepare('INSERT INTO materials(id,day,review) VALUES(?,?,?)').run(source,'2026-11-10','旧短评');
      archive.prepare('INSERT INTO material_sources VALUES(?,?,?)').run(source,source,at);
    }
  }finally{archive.close();}
  await assert.rejects(diary.run('diary',new AbortController().signal),/DIARY_DEEPSEEK_HTTP_429/);
  assert.equal(diary.pages(day).length,0);
  await diary.run('diary',new AbortController().signal);
  assert.match(diary.pages(day)[0].body,/整批短评/);
  assert.deepEqual(diary.pages(day)[0].threads.map(({no,text})=>[no,text]),
    [[1,'待确认一'],[2,'待确认二'],[3,'待确认三'],[4,'待确认四']]);
  await diary.run('diary',new AbortController().signal);
  assert.equal(calls,2);
});
