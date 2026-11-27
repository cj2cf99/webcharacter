import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createConversationTranscription} from '../../desktop/conversation-transcription.mjs';
import {readInteractionSkill,setInteractionSkillProfile} from '../../desktop/interaction-skills.mjs';
import {openLocalREST} from '../../desktop/local-rest.mjs';

const execute=promisify(execFile);
const catalog=fileURLToPath(new URL('../../skills/catalog.py',import.meta.url));
const cli=async (...args)=>{
  const {stdout}=await execute('python',['-B',catalog,...args],{encoding:'utf8',windowsHide:true});
  return JSON.parse(stdout);
};
async function setup(t,close){
  const profile=await mkdtemp(join(tmpdir(),'feiyue-skills-'));
  t.after(async()=>{await close?.();await rm(profile,{recursive:true,force:true});});
  return {profile,update:(...args)=>cli('external','--profile',profile,...args),
    read:(hint,group='hints')=>cli(hint,group,'--profile',profile)};
}
const put=(file,item)=>writeFile(file,JSON.stringify(item),'utf8');
const transcript='conversation-transcription';

test('外置 Skill 发布、校验、回退及目录绑定只使用已发布快照',async t=>{
  const {profile,update,read}=await setup(t);
  const before=await read('auto');
  const {draft}=await update('export','personal-conversation','evening-chat');
  const prompts=join(draft,'local-ai.json');
  await put(prompts,{draft:'隔离第一版提示'});
  assert.deepEqual(await read('auto'),before);
  assert.equal((await update('publish','personal-conversation','evening-chat')).version,'1.0');
  const first=await read('auto');
  assert.equal(first.version,'evening-chat@1.0');
  assert.equal(first.skill,before.skill);
  assert.equal(first.localAi.profile,before.localAi.profile);
  assert.equal(first.localAi.draft,'隔离第一版提示');
  await put(prompts,{draft:'隔离第二版提示'});
  assert.equal((await update('publish','personal-conversation','evening-chat')).version,'1.1');
  assert.equal((await update('publish','personal-conversation','evening-chat')).version,'1.1');
  assert.equal((await read('speech','replyModes')).version,'evening-chat@1.1');
  await put(prompts,{profile:'不应可编辑'});
  await assert.rejects(update('publish','personal-conversation','evening-chat'),/阶段提示/u);
  assert.equal((await read('auto')).version,'evening-chat@1.1');
  await update('use','personal-conversation','evening-chat','1.0');
  assert.deepEqual(await read('auto'),first);
  await put(join(profile,'skills','personal-conversation','evening-chat','versions','1.0.json'),{invalid:true});
  const fallback=await read('auto');
  assert.match(fallback.warnings[0],/随附版本/u);
  delete fallback.warnings;
  assert.deepEqual(fallback,before);
  await update('reset','personal-conversation');
  assert.deepEqual(await read('auto'),before);
  await assert.rejects(update('export','comfy-image-workflows'),/未登记/u);
});

test('总纲目录接口经鉴权读取调用范例，正在运行时可发布新版',async t=>{
  let api;
  const {profile,update,read}=await setup(t,()=>api?.close());
  api=await openLocalREST({profile,listenPort:0});
  const path=api.address+'/v1/skills';
  const token=(await readFile(join(profile,'local-api.token'),'utf8')).trim();
  const headers={Authorization:'Bearer '+token};
  assert.equal((await fetch(path)).status,401);
  assert.equal((await fetch(path,{headers:{...headers,Origin:'http://localhost'}})).status,403);
  const guide=await (await fetch(api.address+'/infoguide')).json();
  assert.equal(guide.version,9);
  assert.ok(guide.routes.some(item=>item.path==='/v1/skills'&&item.method==='GET'&&item.auth));
  const catalogResponse=await fetch(path,{headers});
  assert.equal(catalogResponse.status,200);
  const first=await catalogResponse.json();
  assert.equal(first.router,'feiyue-interaction');
  const declared=JSON.parse(await readFile(new URL('../../skills/feiyue-interaction/capabilities.json',import.meta.url),'utf8'));
  const expected=await Promise.all(Object.keys(declared).map(id=>access(new URL(`../../skills/${id}/source/SKILL.md`,import.meta.url))
    .then(()=>id,error=>{if(error.code!=='ENOENT')throw error;return null;})));
  assert.deepEqual(first.skills.map(skill=>skill.id),expected.filter(Boolean));
  for(const entry of first.skills)assert.ok(entry.id&&entry.name&&entry.call&&entry.does&&entry.examples.length);
  const {draft}=await update('export','feiyue-interaction');
  const directory=join(draft,'capabilities.json');
  const entries=JSON.parse(await readFile(directory,'utf8'));
  entries[transcript].examples=['隔离调用示例'];
  await put(directory,entries);
  await writeFile(join(draft,'SKILL.md'),'---\nname: feiyue-interaction\n---\n隔离总纲正文','utf8');
  await update('publish','feiyue-interaction');
  const response=await fetch(path,{headers});
  assert.equal(response.status,200);
  const second=await response.json();
  assert.deepEqual(second.skills.find(row=>row.id===transcript).examples,['隔离调用示例']);
  assert.equal(second.skills.find(row=>row.id===first.router).source,'external');
  assert.ok(second.skills.every(row=>!Object.hasOwn(row,'body')&&!Object.hasOwn(row,'prompts')));
  // 总纲新版记录到版本号，正文不拼进给模型的指令。
  const selected=await read('conversationTranscription');
  assert.match(selected.routerVersion,/@/u);
  assert.doesNotMatch(selected.instruction,/隔离总纲正文/u);
});

test('外置步骤进入真实转录宿主，跨时隙及重开保持原版，下项使用更新版',async t=>{
  let store;
  const {profile,update}=await setup(t,()=>store?.close());
  const {draft}=await update('export',transcript,'reviewed-transcription');
  const workflow=join(draft,'workflow.json');
  await put(workflow,{steps:[{run:'classify'},{run:'organize'}]});
  await assert.rejects(update('check',transcript,'reviewed-transcription'),/依次执行/u);
  const steps=[{run:'organize',instruction:'隔离归纳说明'},{run:'classify'}];
  await put(workflow,{steps:[...steps,{run:'review',when:'has-candidates',instruction:'隔离复核说明'}]});
  await update('publish',transcript,'reviewed-transcription');
  setInteractionSkillProfile(profile);
  t.after(()=>setInteractionSkillProfile(undefined));
  const calls=[];
  const model={async memory(value,instruction,_schema,_signal,{stage,version}){
    calls.push({stage,version});
    const input=JSON.parse(value);
    if(stage==='organize'){
      assert.match(instruction,/隔离归纳说明/u);
      return {summary:'运动',actions:[{id:'run',summary:'跑步',state:'occurred',
        evidence:[{sourceId:input.turns[0].sourceId,quote:input.turns[0].text}]}],requests:[],signals:[],recentFactIds:['run']};
    }
    if(stage==='classify'){
      if(version.endsWith('@1.0')){
        await put(workflow,{steps});
        await update('publish',transcript,'reviewed-transcription');
      }
      return {candidates:[{id:'exercise',type:'hu-shi.exercise.create',matterIds:['run'],params:{body:'跑了三公里'}}],notes:[]};
    }
    assert.equal(stage,'review');
    assert.match(instruction,/隔离复核说明/u);
    return {issues:[{target:'candidate',id:input.candidates[0].id,kind:'unsupported',detail:'请核对运动详情'}]};
  }};
  let resume=false;
  const open=()=>createConversationTranscription({profile,model,safeStorage:{
    encryptString:value=>Buffer.from(value),decryptString:value=>value.toString(),
  },canStart:()=>resume||calls.length<2,prepareBatch:()=>assert.fail('只生成待确认结果')});
  const enqueue=id=>{
    const at=Date.now();
    store.fromThread({id,thread:id,first:1,last:1,at,history:[],turns:[{id:id+'-turn',text:'今天我跑了三公里。',who:'你',at}]});
  };
  async function until(id,condition){
    for(let count=0;count<100;count++){
      const result=store.detail(id);
      if(condition(result))return result;
      await delay(30);
    }
    assert.fail('隔离转录未结束');
  }
  const finished=result=>['ready','empty','failed'].includes(result.state);
  store=open();
  enqueue('first');
  await until('first',result=>result.state==='queued'&&result.steps.filter(step=>step.state==='done').length===2);
  await store.close();
  store=null;
  resume=true;
  store=open();
  store.start();
  const first=await until('first',finished);
  assert.equal(first.state,'ready',first.error);
  assert.ok(first.result.notes.some(note=>note.includes('请核对运动详情')));
  assert.ok(first.result.rows.every(row=>!row.missing.includes('请核对运动详情')));
  assert.deepEqual(calls.splice(0),['organize','classify','review'].map(stage=>({stage,version:'reviewed-transcription@1.0'})));
  enqueue('second');
  const second=await until('second',finished);
  assert.equal(second.state,'ready',second.error);
  assert.ok(second.result.notes.every(note=>!note.includes('请核对运动详情')));
  assert.deepEqual(calls,['organize','classify'].map(stage=>({stage,version:'reviewed-transcription@1.1'})));
});

test('沿用东京时分，拟稿格式错误时保留原文可确定的条目，完整草稿不展示缺项误报',async t=>{
  let store;
  const {profile,read,update}=await setup(t,()=>store?.close());
  const {draft}=await update('export',transcript,'reviewed-reminder');
  await put(join(draft,'workflow.json'),{steps:[{run:'organize'},{run:'classify'},{run:'review'}]});
  await update('publish',transcript,'reviewed-reminder');
  const stages=[];
  const at=Date.parse('2026-11-23T23:50:00+09:00');
  const text='明天上午九点提醒我给田中回信。';
  store=createConversationTranscription({profile,loadSkill:()=>read('conversationTranscription'),model:{
    async memory(raw,instruction,_schema,_signal,{stage}){
      stages.push(stage);
      const input=JSON.parse(raw);
      if(stage==='organize')return {summary:'回信',actions:[],requests:[],signals:[],recentFactIds:[]};
      if(stage==='classify')throw Object.assign(Error('拟稿格式无效'),{code:'LOCAL_AI_RESULT_INVALID'});
      assert.match(instruction,/漏写原话里的事项或条件用 unsupported/u);
      const [candidate]=input.candidates;
      assert.equal(candidate.params.deadline,'2026-11-24T09:00');
      return {issues:[
        {target:'candidate',id:candidate.id,kind:'missing',detail:'日期缺失'},
        {target:'candidate',id:candidate.id,kind:'duplicate',detail:'可能重复'},
        {target:'candidate',id:candidate.id,kind:'unsupported',detail:'原话中的附加条件需再核对'},
      ]};
    },
  },safeStorage:{encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()},
  prepareBatch:()=>assert.fail('待确认作业不得提交')});
  store.fromThread({id:'timed',thread:'timed',first:1,last:1,at,history:[],turns:[{id:'turn',text,who:'你',at}]});
  for(let attempt=0;attempt<100;attempt++){
    const job=store.detail('timed');
    if(job.state==='failed')assert.fail(job.error);
    if(job.state==='ready'){
      assert.deepEqual(stages,['organize','classify','review']);
      assert.equal(job.steps[1].attempts[0].error,'LOCAL_AI_RESULT_INVALID');
      const [row]=job.result.rows;
      assert.equal(row.params.deadline,'2026-11-24T09:00');
      assert.deepEqual(row.evidence.map(ref=>ref.quote),[text]);
      assert.deepEqual(row.missing,[]);
      assert.equal(job.result.notes.length,2);
      assert.ok(job.result.notes.some(note=>note.includes('可能重复')));
      assert.ok(job.result.notes.some(note=>note.includes('附加条件')));
      return;
    }
    await delay(30);
  }
  assert.fail('隔离转录超时');
});
