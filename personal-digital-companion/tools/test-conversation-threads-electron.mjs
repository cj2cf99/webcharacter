import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {createConversationTranscription} from '../desktop/conversation-transcription.mjs';
import {createAiWorkflowModel} from '../desktop/ai-workflow-model.mjs';
import {createLocalModel,desktopModelPath} from '../desktop/local-model.mjs';
import {tokyoDate} from '../desktop/calendar-date.mjs';

const root=resolve(import.meta.dirname,'..'),bundle=resolve(root,'output/desktop-bundle');
const profile=mkdtempSync(join(tmpdir(),'feiyue-thread-ui-'));
electron.app.setPath('userData',profile);
electron.app.commandLine.appendSwitch('disable-gpu');
const out=resolve(root,'output/conversation-thread-qa');
mkdirSync(out,{recursive:true});
const mode=process.argv.includes('--organize')?'organize':process.argv.includes('--real')?'real':process.argv.includes('--dark')?'dark':'light';
async function wait(read,timeout=10000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(value)return value;await delay(60);}
  throw Error('隔离窗口等待结果超时');
}
let worker,queue,host,transcription,pet;

async function testReal(){
  const logs=[];
  const gpu=process.argv.includes('--gpu');
  const modelPath=resolve(desktopModelPath(electron.app,root),'..',gpu?'Qwen3.5-4B-Q4_K_M.gguf':'Qwen3.5-2B-Q4_K_M.gguf');
  worker=createLocalModel({utilityProcess:electron.utilityProcess,modelPath,device:gpu?'gpu':'cpu',log:event=>logs.push(event),loadTimeout:25000});
  await worker.start();
  assert.equal(worker.snapshot().state,'ready');
  const snapshot=worker.snapshot();
  if(process.argv.includes('--adaptive-retry')){
    const exact=Array.from({length:123},(_,i)=>'项'+(i+1)).join(' ');
    const schema={type:'object',properties:{text:{const:exact}},required:['text'],additionalProperties:false};
    const skillInstruction={name:'conversation-transcription',version:'budget-fixture',stage:'organize',
      instruction:'按字段格式输出完整回执。',schema,boundedOutput:true,adaptiveOutput:'organize',maxTokens:1550};
    const run=(turns,fullOutputBudget=false)=>worker.analyze(JSON.stringify({turns}),{hint:'personalityMemory',
      skillInstruction:{...skillInstruction,fullOutputBudget},signal:AbortSignal.timeout(105000)});
    const guard=await run([{text:'红 黄 蓝 绿 白 紫 黑 灰 '.repeat(110)},{text:'另一条材料'}]);
    assert.equal(guard.error,'LOCAL_AI_BATCH_BUDGET');
    const short=[{text:'短材料'}];
    const clipped=await run(short);
    assert.equal(clipped.error,'LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET');
    const complete=await run(short,true);
    assert.equal(complete.text,exact);
    const info=logs.filter(event=>event.output_limit).map(({error,duration_ms,material_tokens,output_tokens,output_limit,budget_mode,context_tokens})=>
      ({error,duration_ms,material_tokens,output_tokens,output_limit,budget_mode,context_tokens}));
    assert.equal(info[0].output_tokens,0);
    assert.equal(info[2].output_limit,snapshot.gpuLayers>0?1550:1024);
    console.log(JSON.stringify({backend:snapshot.backend,adaptiveRetry:info}));
    return;
  }
  const exact=Array.from({length:220},(_,i)=>'项'+(i+1)).join(' ');
  const schema={type:'object',properties:{text:{const:exact}},required:['text'],additionalProperties:false};
  const skill={name:'diary-writing',version:'budget-fixture',stage:'reviewAction',instruction:'按格式原样输出完整的行动摘录。',schema};
  const baseline=await worker.analyze(exact,{hint:'personalityMemory',skillInstruction:skill,signal:AbortSignal.timeout(115000)});
  assert.equal(baseline.error,'LOCAL_AI_OUTPUT_BUDGET','固定 420 token 上限应返回具体截断原因');
  const deliberate=await worker.analyze(exact,{hint:'personalityMemory',skillInstruction:{...skill,boundedOutput:true,maxTokens:64},
    signal:AbortSignal.timeout(115000)});
  assert.equal(deliberate.error,'LOCAL_AI_OUTPUT_BUDGET');
  const recovered=await worker.analyze(exact,{hint:'personalityMemory',skillInstruction:{...skill,boundedOutput:true,maxTokens:2200},
    signal:AbortSignal.timeout(115000)});
  assert.equal(recovered.text,exact);
  const summaries=logs.filter(item=>item.ai_phase==='reviewAction').map(({error,duration_ms,input_tokens,output_tokens,output_limit})=>({
    error,duration_ms,input_tokens,output_tokens,output_limit}));
  assert.equal(summaries.at(-1).output_limit,snapshot.gpuLayers>0?2048:1024);
  const contextFailure=await worker.analyze('甲乙丙丁戊己庚辛壬癸'.repeat(5000),{
    hint:'personalityMemory',skillInstruction:{...skill,boundedOutput:true,maxTokens:1024},signal:AbortSignal.timeout(10000)});
  assert.equal(contextFailure.error,'LOCAL_AI_CONTEXT_BUDGET');
  console.log(JSON.stringify({backend:snapshot.backend,gpuLayers:snapshot.gpuLayers,baseline:baseline.error,summaries,context:contextFailure.error}));
}

async function testRealOrganization(){
  const logs=[],calls=[];
  const fixedOutput=process.argv.includes('--fixed-output');
  const modelPath=resolve(desktopModelPath(electron.app,root),'..','Qwen3.5-4B-Q4_K_M.gguf');
  worker=createLocalModel({utilityProcess:electron.utilityProcess,modelPath,device:'gpu',log:event=>logs.push(event),loadTimeout:25000});
  await worker.start();
  assert.equal(worker.snapshot().state,'ready');
  queue=createAiWorkflowModel({file:join(profile,'ai-requests.sqlite'),safeStorage:electron.safeStorage,model:{
    async memory(text,instruction,schema,signal,skill){
      calls.push(skill.stage);
      if(text.includes('隔离截断标记'))throw Object.assign(Error('LOCAL_AI_OUTPUT_BUDGET'),{code:'LOCAL_AI_OUTPUT_BUDGET'});
      const result=await worker.analyze(text,{hint:'personalityMemory',signal,
        skillInstruction:{...skill,...(fixedOutput?{adaptiveOutput:undefined}:{}),instruction,schema}});
      if(result.error)throw Object.assign(Error(result.error),{code:result.error});
      return result;
    },async close(){},
  }});
  transcription=createConversationTranscription({profile,safeStorage:electron.safeStorage,model:queue});
  const at=Date.now();
  const batch=(id,texts)=>({id,thread:id,first:1,last:texts.length,at,history:[],
    turns:texts.map((text,index)=>({id:id+'-'+index,text,who:'你',at:at+index}))});
  const long=batch('long',['隔离环境的虚构背景，用来核对上限。'.repeat(75),'昨天我跑了三公里。']);
  const failing=batch('budget',['隔离截断标记']);
  const following=batch('following',['明天提醒我给田中回信。']);
  for(const item of [long,failing,following])transcription.fromThread(item);
  await wait(()=>[long,failing,following].every(item=>['failed','ready','empty'].includes(transcription.detail(item.id).state)),170000);
  const results=[long,failing,following].map(({id})=>transcription.detail(id));
  const info=logs.filter(event=>event.output_limit).map(({ai_phase,duration_ms,input_tokens,output_tokens,output_limit,output_ceiling,
    budget_mode,material_tokens,context_tokens,error})=>
    ({ai_phase,duration_ms,input_tokens,output_tokens,output_limit,output_ceiling,budget_mode,material_tokens,context_tokens,error}));
  console.log(JSON.stringify({backend:worker.snapshot().backend,fixedOutput,calls,results:results.map(({state,count,claims})=>({state,count,
    workers:[...new Set(claims.map(claim=>claim.worker))]})),info}));
  assert.equal(results[1].state,'failed');
  assert.ok(results[2].result?.rows.some(row=>row.type==='reminders.create'));
  assert.ok(results[0].result?.rows.some(row=>row.type==='hu-shi.exercise.create'));
  assert.ok(results[0].steps.filter(step=>step.id.includes('organize')).length>=2);
  if(!fixedOutput)assert.ok(info.some(call=>call.budget_mode==='adaptive'&&call.output_limit<call.output_ceiling&&call.material_tokens>0));
}

async function testWindows(){
  electron.nativeTheme.themeSource=mode;
  pet=new electron.BrowserWindow({x:-2400,y:100,width:180,height:280,show:false});
  const delayed=Promise.withResolvers();
  const calls=[],notices=[];
  const model={async memory(text,_instruction,_schema,_signal,options){
    const input=JSON.parse(text);calls.push({stage:options.stage,input});
    if(options.stage==='对话回复'){
      const lines=input.最新发言.map(item=>item.原话);
      if(lines.includes('A 的第一句'))return delayed.promise;
      return {reply:'绯月回应：'+lines.join('｜'),next:'回应'};
    }
    if(options.stage==='classify')return {candidates:[],notes:[]};
    return {actions:[],requests:[],signals:[],recentFactIds:[]};
  },async close(){}};
  queue=createAiWorkflowModel({model,file:join(profile,'ai-requests.sqlite'),safeStorage:electron.safeStorage});
  transcription=createConversationTranscription({profile,safeStorage:electron.safeStorage,model:queue,notify:item=>notices.push(item)});
  const question={id:'audit-fixture',source:'diary',source_id:'2026-11-22.3/2',title:'听雨的约定',next:'下次一起听雨？',reason:'昨晚听见雨声',created_at:new Date().toISOString(),
    citation:{label:'手记对话摘录',reference:'第 3 篇 · 悬念 2',excerpt:'「下次想和你一起听雨。」'},
    talk:[{who:'绯月',text:'下次一起听雨？',at:new Date().toISOString()}]};
  const proactive=[];
  host=attachScreenQuestion(electron,{win:pet,profile,bundle,root,localModel:queue,transcription,visible:false,
    client:{async askStandalone(){return {state:'error'};},forget(){}},
    threadOptions:{questions:()=>[question],answerQuestion:async(line,messages,options)=>{
      proactive.push({line:line.id,messages,options});return {reply:'好呀，那到时候一起听。我先收起手记啦。',next:'结束'};
    }},
  });
  const execute=(panel,code)=>panel.webContents.executeJavaScript(code).catch(error=>{
    throw Error('隔离页面脚本失败：'+code,{cause:error});
  });
  const bubble=code=>execute(host.panel,code);
  const review=code=>execute(host.details,code);
  await host.openReview();
  await wait(()=>review("document.querySelector('#questionCount').textContent==='1'"));
  assert.equal(await review("document.querySelector('.thread-preview').innerText"),'下次一起听雨？');
  await review("document.querySelector('details[data-thread]').open=true");
  await wait(()=>review("document.querySelector('.thread-talk')?.textContent.includes('绯月')"));
  assert.equal(await review("getComputedStyle(document.querySelector('.thread-preview')).display"),'none');
  assert.equal(await review("document.querySelector('.thread-message p').innerText"),'下次一起听雨？');
  await review("document.querySelector('.thread-source').open=true");
  assert.match(await review("document.querySelector('.thread-source p').innerText"),/「下次想和你一起听雨。」/u);
  await review("document.querySelector('details[data-thread]').open=false");
  assert.equal(await review("document.querySelector('.thread-preview').innerText"),'下次一起听雨？');
  await review("document.querySelector('details[data-thread]').open=true");
  await wait(()=>review("document.querySelector('.thread-talk')"));
  assert.equal(await review("document.querySelectorAll('.thread-message[data-who=你]').length"),0);
  assert.equal(proactive.length,0);
  assert.equal(transcription.list().length,0);
  await review("[...document.querySelectorAll('.thread-actions button')].find(b=>b.textContent==='继续聊天').click()");
  await wait(()=>host.panel&&bubble("document.querySelector('#answer').textContent.includes('一起听雨')"));
  assert.deepEqual(await bubble("[document.querySelector('#asked').textContent,document.querySelector('#answer').textContent]"),
    ['来源 · 第 3 篇 · 悬念 2\n「下次想和你一起听雨。」','下次一起听雨？']);
  await bubble("document.querySelector('#question').value='好啊';document.querySelector('#questionForm').requestSubmit()");
  await wait(()=>bubble("!document.querySelector('#finishThread').hidden && document.querySelector('#questionForm').hidden"));
  assert.equal(proactive.length,1);
  assert.equal(proactive[0].messages.length,1);
  assert.equal(proactive[0].messages[0].text,'好啊');
  await wait(()=>!host.panel,8000);
  await host.open();
  const a=await bubble('window.screenQuestion.state().then(value=>value.threadId)');
  await bubble("document.querySelector('#question').value='A 的第一句';document.querySelector('#questionForm').requestSubmit()");
  await wait(()=>calls.find(item=>item.input?.最新发言?.some(row=>row.原话==='A 的第一句')));
  await bubble("document.querySelector('#question').value='未发送草稿';document.querySelector('#withScreen').checked=true;window.screenQuestion.idleClose()");
  await wait(()=>!host.panel);
  await host.open();
  assert.equal(await bubble('window.screenQuestion.state().then(value=>value.threadId)'),a);
  assert.deepEqual(await bubble("[document.querySelector('#question').value,document.querySelector('#withScreen').checked]"),['',false]);
  await bubble("document.querySelector('#newThread').click()");
  await wait(()=>host.panel&&bubble('window.screenQuestion?.state().then(v=>v.threadId)').then(id=>id&&id!==a).catch(()=>false));
  const b=await bubble('window.screenQuestion.state().then(value=>value.threadId)');
  assert.notEqual(a,b);
  await bubble("document.querySelector('#question').value='B 的独立话题';document.querySelector('#questionForm').requestSubmit()");
  delayed.resolve({reply:'A 的迟到回复',next:'回应'});
  await wait(()=>bubble("document.querySelector('#answer').textContent.includes('B 的独立话题')"));
  assert.ok(!(await bubble("document.querySelector('#answer').textContent")).includes('A 的迟到回复'));
  await host.openReview();
  await review("document.querySelector('[data-category=active]').click()");
  await wait(()=>review("document.querySelector('#activeCount').textContent==='2'"));
  await review("Array.from(document.querySelectorAll('[data-thread]')).find(node=>node.dataset.thread==="+JSON.stringify(a)+").open=true");
  await wait(()=>review("document.querySelector('.thread-talk')?.textContent.includes('A 的迟到回复')"));
  await review("[...document.querySelectorAll('.thread-actions button')].find(b=>b.textContent==='简单回复').click()");
  await review("document.querySelector('.thread-note textarea').value='留在 A 的便签';document.querySelector('.thread-note').requestSubmit()");
  await wait(()=>calls.find(item=>item.input?.最新发言?.some(row=>row.原话==='留在 A 的便签')));
  assert.ok(!(await bubble("document.querySelector('#answer').textContent")).includes('留在 A 的便签'));
  await wait(()=>transcription.list().some(item=>item.state==='empty'));
  await review("document.querySelector('[data-category=history]').click()");
  await wait(()=>review("document.querySelector('#day').value==="+JSON.stringify(tokyoDate())+"&&document.querySelectorAll('[data-thread]').length===3"));
  host.details.setSize(360,540);
  host.details.showInactive();
  await wait(()=>review("[...document.querySelectorAll('[data-thread]')].every(node=>Number(getComputedStyle(node).opacity)>.98)"));
  const widths=await review('[document.documentElement.scrollWidth,innerWidth]');
  assert.deepEqual(widths,[360,360]);
  writeFileSync(join(out,'threads-'+mode+'.png'),(await host.details.webContents.capturePage()).toPNG());
  await host.open('registration');
  await wait(()=>bubble("document.querySelector('#mode').value==='registration'"));
  await bubble("document.querySelector('#question').value='登记';document.querySelector('#questionForm').requestSubmit()");
  await wait(()=>bubble("document.querySelector('#answer').textContent.includes('直接输入正文')"));
  assert.equal(await bubble("document.querySelector('#mode').value"),'registration');
  const diaryLines=['刚才把窗台上的花挪到了桌边。','傍晚回来发现花开了。'];
  for(const text of diaryLines){
    await bubble(`document.querySelector('#question').value=${JSON.stringify(text)};document.querySelector('#questionForm').requestSubmit()`);
    await wait(()=>bubble("!document.querySelector('#question').value"));
    assert.equal(await bubble("document.querySelector('#mode').value"),'registration');
  }
  const diary=await wait(()=>transcription.list().flatMap(job=>transcription.detail(job.id).result?.rows??[])
    .find(row=>row.type==='diaries.create'&&row.params.content.includes(diaryLines.join('\n\n'))));
  assert.equal(diary.params.content,`记录\n${diaryLines.join('\n\n')}\n❤️`);
  console.log('通过 '+mode+'，JST 三页签、主动首问、结束收窗、草稿清空、切线与迟到回复、静默便签、气泡展开时后台整理、360px 布局。');
}

try{
  await electron.app.whenReady();
  if(mode==='real')await testReal();else if(mode==='organize')await testRealOrganization();else await testWindows();
  host?.close();pet?.destroy();await transcription?.close();await queue?.close();await worker?.close();
  try{rmSync(profile,{recursive:true,force:true});}catch{}
  electron.app.exit(0);
}catch(error){
  console.error(error);
  host?.close();pet?.destroy();await transcription?.close();await queue?.close();await worker?.close();
  electron.app.exit(1);
}
