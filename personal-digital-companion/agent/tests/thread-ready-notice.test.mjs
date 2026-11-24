import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createAgyCliModel} from '../../desktop/agy-local-model.mjs';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';

const codec={encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()};

test('后台整理完成后在对话里追加提示：不要求回复，带作业编号，标签变为待核对',t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-notice-'));
  const store=createConversationThreads(profile,codec);
  t.after(()=>{store.close();rmSync(profile,{recursive:true,force:true});});
  const line=store.create();
  const message=store.submit(line.id,{text:'登记下晚饭：跑main+挂面，3个鸡蛋',backgroundRegistration:true});
  store.finish(line.id,[message.id],'我会在后台整理这段话，有待确认的事项会提醒你。');
  const before=store.get(line.id);
  assert.equal(before.pending,0);

  const notice=store.notice(line.id,'已整理出 2 项待确认，点下面的“查看待确认卡”核对。',{transcriptId:'job-1'});
  assert.equal(notice.who,'绯月');
  const after=store.get(line.id);
  assert.equal(after.pending,0,'提示不需要用户回复');
  assert.equal(after.preview.transcriptId,'job-1','对话预览带作业编号，界面据此显示“待核对”');
  const talk=store.detail(line.id).messages;
  assert.equal(talk.at(-1).transcriptId,'job-1');
  assert.match(talk.at(-1).text,/2 项待确认/);

  store.end?.(line.id);
  assert.equal(store.notice('不存在的线','x'),null);
});

test('补行动评价类批处理进同一个 AGY 会话，不占用对话会话，每条带“忽略上方内容”的提示',async t=>{
  const fake=join(import.meta.dirname,'fixtures/fake-agy.mjs');
  const previous=process.env.FEIYUE_AGY_PATH;
  process.env.FEIYUE_AGY_PATH=fake;
  const model=createAgyCliModel({});
  t.after(async()=>{await model.close();if(previous===undefined)delete process.env.FEIYUE_AGY_PATH;else process.env.FEIYUE_AGY_PATH=previous;});
  await model.start();
  const schema={type:'object',properties:{answer:{enum:['是','否']}},required:['answer'],additionalProperties:false};
  const skill={name:'diary-writing',stage:'reviewAction',aiBatch:true};
  for(let i=0;i<3;i++)assert.deepEqual(await model.memory('第 '+i+' 条','评价',schema,undefined,skill),{answer:'是'});
  assert.equal(model.batch.turns,3,'三条在同一个批处理会话里');
  assert.equal(model.conversation.turns,0,'不占用面对面对话会话');
  assert.equal(model.batch.active,true);
});

test('补行动评价与来源补评不经云端：长短都留本机单次，且标为批处理',async t=>{
  const key=process.env.bandao_api_key,realFetch=globalThis.fetch;
  process.env.bandao_api_key='fixture-key';
  globalThis.fetch=async()=>{throw Error('不应访问云端');};
  t.after(()=>{globalThis.fetch=realFetch;if(key===undefined)delete process.env.bandao_api_key;else process.env.bandao_api_key=key;});
  const seen=[];
  const ai=createAiWorkflowModel({file:':memory:',model:{memory:async(text,_instruction,_schema,_signal,skill)=>{seen.push(skill);return {review:'我记住了。',text};},close:async()=>{}}});
  t.after(()=>ai.close());
  const schema={type:'object',properties:{review:{type:'string'},text:{type:'string'}},required:['review','text'],additionalProperties:false};
  for(const [stage,text] of [['reviewAction','短'],['reviewAction','较长的原文'.repeat(60)],['reviewSource','来源'.repeat(150)]])
    await ai.memory(text,'评价',schema,AbortSignal.timeout(5000),{name:'diary-writing',stage,aiReview:true});
  assert.equal(seen.length,3);
  assert.ok(seen.every(skill=>skill.aiBatch&&skill.aiSingleAttempt));
});
