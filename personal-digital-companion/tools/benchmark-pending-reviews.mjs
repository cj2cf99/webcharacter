import {app,safeStorage,utilityProcess} from 'electron';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createAiWorkflowModel,matchesAiSchema} from '../desktop/ai-workflow-model.mjs';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';
import {bindDiaryReviewCheckpoints,rateDiaryMaterial,diaryStepBudgetMs} from '../desktop/personality-diary.mjs';
import {diaryQuestionBudgetMs} from '../desktop/chat-budget.mjs';

const root=resolve(import.meta.dirname,'..'),source=process.env.FEIYUE_BENCH_PROFILE;
if(!source)throw Error('需指定只读来源资料目录 FEIYUE_BENCH_PROFILE');
const temp=mkdtempSync(join(tmpdir(),'feiyue-pending-benchmark-'));
app.setPath('userData',temp);
// 隔离进程借用同一用户的受保护密钥解读任务输入，不复制会话、访问令牌或业务库。
const {os_crypt}=JSON.parse(readFileSync(join(source,'Local State'),'utf8'));
if(os_crypt?.encrypted_key)writeFileSync(join(temp,'Local State'),JSON.stringify({os_crypt:{encrypted_key:os_crypt.encrypted_key}}));
await app.whenReady();
const report={captured:new Date().toISOString(),batchSize:4,runs:[]};
const originalOnly=process.env.FEIYUE_BENCH_MODE==='daily-original';
const daily=originalOnly||process.env.FEIYUE_BENCH_MODE==='daily',inventory=process.env.FEIYUE_BENCH_MODE==='inventory';
const output=join(root,'output',originalOnly?'pending-24-execution-budget.json':daily?'pending-daily-recovery.json':inventory?'pending-recovery-inventory.json':'pending-24-scheduling.json');
const store=()=>writeFileSync(output,JSON.stringify(report,null,2));
const device=taskDevice=>createBalancedLocalModel({utilityProcess,modelPath:desktopModelPath(app,root),taskDevice});
async function samples(){
 const db=new DatabaseSync(join(source,'ai-requests.sqlite'),{readOnly:true});
 try{
  const previous={asOf:'2026-11-22T21:36:45.661Z',sampleDigest:'b0d114fd16b7e30060f0185a0c2852d4afa440a2907eb7c127b88b431c7436b9'};
  const cutoff=Date.parse(process.env.FEIYUE_BENCH_AS_OF??previous.asOf);
  report.asOf=new Date(cutoff).toISOString();
  // 原批次已有两步在正式队列推进。按原顺序取历史步骤，再核验上次保存的整批密文摘要。
  const original=[47,155,156,163,169,173,178,179,180,184,191,202,212,215,218,221,224,229,232,239,242,247,252,255];
  const live=db.prepare('SELECT input,priority FROM ai_requests WHERE seq=?');
  const historic=db.prepare('SELECT input,1 AS priority FROM ai_attempt_snapshots WHERE id=? AND input IS NOT NULL');
  const receipts=new Map([[47,'2a5d79d8-8b67-4427-a94e-43d78c4362d8-1'],[173,'1fccc438-8244-4730-b774-d6d36bef73c6-1'],
    [215,'128912c6-aa43-43e2-9625-910010f6b162-1'],[229,'4220c056-70b5-4509-949a-7188672e7ddd-1']]);
  const rows=original.map(seq=>live.get(seq)??(receipts.has(seq)&&historic.get(receipts.get(seq))));
  if(rows.some(row=>!row))throw Error('来源不再是原先的 24 个检查点');
  const hash=createHash('sha256');
  for(const row of rows)hash.update(row.input);
  report.sampleDigest=hash.digest('hex');
  if(report.sampleDigest!==previous.sampleDigest)throw Error('原批次检查点摘要不符');
  const cases=await Promise.all(rows.map(async({input,priority},i)=>{
   const v=JSON.parse(typeof input==='string'?input:(await safeStorage.decryptStringAsync(Buffer.from(input))).result);
   if(v.skill?.stage!=='reviewAction'||typeof v.text!=='string'||!v.schema)throw Error('检查点缺少原输入');
   return {id:i+1,...v,priority,original:true};
  }));
  if(originalOnly||!daily&&!inventory)return cases;
  const identity=v=>JSON.stringify([v.skill?.name,v.skill?.stage,v.text,v.keep,v.schema,v.instruction]);
  const known=new Map(cases.map(c=>[identity(c),c]));
  const failures=report.history={attempts:0,withoutInput:0,unreadable:0,overlap:new Set(),stages:{},codes:{},caseErrors:{}};
  const end=Date.parse(process.env.FEIYUE_BENCH_FAILURES_AS_OF??report.captured);
  report.failuresAsOf=new Date(end).toISOString();
  for(const row of db.prepare("SELECT input,output FROM ai_attempt_snapshots WHERE status='failed' AND finished<=? ORDER BY started,id").all(end)){
   failures.attempts++;
   if(!row.input){failures.withoutInput++;continue;}
   const decode=v=>JSON.parse(typeof v==='string'?v:safeStorage.decryptString(Buffer.from(v)));
   let v;
   try{v=decode(row.input);}catch{failures.unreadable++;continue;}
   if(typeof v.text!=='string'||!v.schema||typeof v.instruction!=='string'){failures.unreadable++;continue;}
   const stage=(v.skill?.name??'通用')+'/'+(v.skill?.stage??'通用');
   let code='UNKNOWN';
   try{const e=decode(row.output)?.failure?.code;if(/^[a-zA-Z_0-9]+$/.test(e))code=e;}catch{}
   failures.codes[code]=(failures.codes[code]??0)+1;
   const key=identity(v),match=known.get(key);
   const counts=failures.caseErrors[match?.id??cases.length+1]??={};
   counts[code]=(counts[code]??0)+1;
   if(match){if(match.original)failures.overlap.add(match.id);continue;}
   failures.stages[stage]=(failures.stages[stage]??0)+1;
   const c={...v,id:cases.length+1,priority:1};
   known.set(key,c);cases.push(c);
  }
  failures.overlap=[...failures.overlap].sort((a,b)=>a-b);
  report.historicalLimits=[...new Set(cases.filter(c=>c.skill?.stage!=='reviewAction').map(c=>
    JSON.stringify({name:c.skill?.name,stage:c.skill?.stage,maxTokens:c.skill?.maxTokens,bounded:c.skill?.boundedOutput,background:c.skill?.backgroundBudget})))].map(s=>JSON.parse(s));
  return cases;
 }finally{db.close();}
}
async function run(mode,cases){
 const model=device('gpu'),assistant=mode!=='single'?device('cpu'):undefined;
 const steps=[];
 const ai=createAiWorkflowModel({file:':memory:',model,assistant,log:r=>steps.push({stage:r.stage,device:r.worker,ms:r.duration_ms,error:r.error})});
 const result={mode,completed:0,empty:0,passes:[],steps};report.runs.push(result);store();
 try{
  const warmStart=performance.now();
  const warm=role=>ai.memory('返回好。','只填指定值。',{type:'object',properties:{ok:{enum:['好']}},required:['ok']},undefined,{aiRole:role,maxTokens:32,aiBudget:null});
  await Promise.all([warm('main'),...(assistant?[warm('assist')]:[])]);
  result.loadMs=Math.round(performance.now()-warmStart);
  if(!model.snapshot().gpuLayers||assistant&&assistant.snapshot().gpuLayers!==0)throw Error('设备路径未核实');
  steps.length=0;
  const start=performance.now();
  let pending=cases;
  const rejections=new Map(),unresolved=[];
  for(let pass=1;pending.length;pass++){
   const round={pass,done:0,failed:[]};result.passes.push(round);
   const next=[];
   for(let i=0;i<pending.length;i+=4){
    const batch=pending.slice(i,i+4);
    const outputs=await Promise.allSettled(batch.map(c=>ai.memory(c.text,c.instruction,c.schema,undefined,{...c.skill,
     aiReview:true,aiAllowAssistantDraft:mode==='adaptive',aiBudget:null,aiCheckpoint:'sample-'+c.id,aiPriority:c.priority,aiKeep:c.keep,aiFallback:c.fallback})));
    for(const [index,o] of outputs.entries()){
     const c=batch[index];
     if(o.status==='fulfilled'){
      round.done++;result.completed++;
      if(!o.value.text?.trim())result.empty++;
      ai.aiAck('sample-'+c.id);
     }else{
      const code=o.reason?.code??'FAILED';
      round.failed.push({id:c.id,code:/^[A-Za-z_]+$/.test(code)?code:'FAILED'});
      const hardware=['LOCAL_AI_GPU_DEFERRED','LOCAL_AI_TIER_WAIT','LOCAL_AI_BUSY'].includes(code);
      if(!hardware)rejections.set(c.id,(rejections.get(c.id)??0)+1);
      if((rejections.get(c.id)??0)<3)next.push(c);else unresolved.push(c.id);
     }
    }
    result.ms=Math.round(performance.now()-start);store();
    console.log(JSON.stringify({mode,pass,processed:i+batch.length,completed:result.completed,ms:result.ms}));
   }
   pending=next;
   if(pending.length&&round.failed.some(f=>['LOCAL_AI_GPU_DEFERRED','LOCAL_AI_TIER_WAIT','LOCAL_AI_BUSY'].includes(f.code)))await delay(3000);
  }
  result.pending=unresolved;result.ms=Math.round(performance.now()-start);store();
 }finally{await ai.close();}
}
async function runDaily(cases){
 const model=device('gpu'),assistant=device('cpu'),steps=[];
 const writers=new Map();
 const file=join(temp,'daily-replay.sqlite');
 const ai=createAiWorkflowModel({file,model,assistant,safeStorage,log:r=>steps.push({
  stage:r.stage,kind:r.ai_kind,device:r.worker,ms:r.duration_ms,inferenceMs:r.inference_ms,taskExecutionMs:r.task_execution_ms,error:r.error})});
 const round=ai.beginAiRound();
 const result={mode:'daily',completed:0,emptyRatings:0,recoveries:[],outcomes:[],steps,hardwareWaits:0,hardwareCooldownMs:0};
 report.runs.push(result);
 const start=performance.now();
 async function processCase(c,allowDraft){
  const rating=c.skill?.name==='diary-writing'&&c.skill.stage==='reviewAction';
  const longBudget=c.skill?.name==='diary-audit'||c.skill?.name==='initiative-decision'||c.skill?.stage==='diaryOpeningCheck';
  const budget=longBudget?diaryQuestionBudgetMs:diaryStepBudgetMs;
  const id='sample-'+c.id,skill={...c.skill};
  // 历史原材料、业务指令和字段用于复现。执行预算取现行业务入口，包括未写入旧快照的默认值。
  if(skill.name==='emotion-appraisal')Object.assign(skill,{stage:'情绪复盘',maxTokens:384,boundedOutput:true,backgroundBudget:true});
  if(skill.name==='diary-audit')Object.assign(skill,{maxTokens:460,boundedOutput:true,backgroundBudget:true});
  if(skill.stage==='diaryOpeningCheck')Object.assign(skill,{maxTokens:220,boundedOutput:true,aiRole:'assist'});
  if(skill.name==='initiative-decision')skill.stage=c.schema.properties?.entries?'propose':'decide';
  if(rating&&!writers.has(skill.version)){
   const writer={};bindDiaryReviewCheckpoints(writer,skill.version??'historical',ai);writers.set(skill.version,writer);
  }
  const writer=writers.get(skill.version);
  const rate=(input,key)=>{
   const checkpoint=rating?writer.key(input,'reviewAction',key):key;
   const options=rating?{maxTokens:Math.max(450,Math.min(2048,Math.ceil(Array.from(input).length*1.4)+280)),boundedOutput:true,backgroundBudget:true}:{};
   return ai.memory(input,c.instruction,c.schema,undefined,{...skill,...options,
    aiReview:rating,aiAllowAssistantDraft:allowDraft,aiBudget:budget,aiPriority:c.priority,
    aiCheckpoint:checkpoint,aiKeep:c.keep,aiFallback:input===c.text?c.fallback:undefined});
  };
  const value=rating?await rateDiaryMaterial({id,content:c.text,rate,
    resumeParts:(key,input,parts)=>writer.resumeParts(key,input,parts,'reviewAction'),
    splittable:!Object.keys(c.keep??{}).length&&!/^(?:你说|绯月当时回复)[：:]/mu.test(c.text),
    onRecovery:(action,part,code)=>result.recoveries.push({id:c.id,action,part,code})}):await rate(c.text,id);
  if(!matchesAiSchema(value,c.schema))throw Object.assign(Error(),{code:'INVALID_FIELDS'});
  if(rating)writer.finishReview(id);else ai.aiAck(id);
  return {empty:rating&&!value.text?.trim(),budget};
 }
 try{
  // 先完成原批次并单独计时，再处理历史增量；冷启动包含在原批次和总计时内。
  for(const subset of [cases.filter(c=>c.original),cases.filter(c=>!c.original)]){
   let pending=subset;
   while(pending.length){
    const later=[];
    for(let i=0;i<pending.length;i+=4){
     const group=pending.slice(i,i+4);
     const answers=await Promise.allSettled(group.map(c=>processCase(c,group.length<4)));
     for(const [j,a] of answers.entries()){
      const c=group[j],code=a.reason?.code??a.reason?.name;
      if(['LOCAL_AI_GPU_DEFERRED','LOCAL_AI_TIER_WAIT','LOCAL_AI_BUSY'].includes(code)){
       later.push(c);result.hardwareWaits++;continue;
      }
      if(a.status==='fulfilled'){result.completed++;if(a.value.empty)result.emptyRatings++;}
      result.outcomes.push({id:c.id,original:!!c.original,stage:c.skill?.stage??c.skill?.name,
       ok:a.status==='fulfilled',...(a.value??{}),error:code});
     }
     result.ms=Math.round(performance.now()-start);store();
     console.log(JSON.stringify({group:subset[0]?.original?'original':'history',completed:result.completed,processed:result.outcomes.length,ms:result.ms}));
    }
    if(later.length===pending.length&&later.length){
     const wait=performance.now();await delay(60_000);result.hardwareCooldownMs+=Math.round(performance.now()-wait);
    }
    pending=later;
   }
   if(subset[0]?.original){result.originalMs=Math.round(performance.now()-start);store();}
  }
  result.devices={gpuLayers:model.snapshot().gpuLayers,cpuLayers:assistant.snapshot().gpuLayers};
  result.pending=result.outcomes.filter(row=>!row.ok).map(row=>row.id);
  result.ms=Math.round(performance.now()-start);store();
  if(!result.devices.gpuLayers||result.devices.cpuLayers!==0)throw Error('设备路径未核实');
  return result;
 }finally{round.release();await ai.close();unlinkSync(file);}
}
let code=1;
try{
 const cases=await samples();report.cases=cases.length;store();
 if(inventory){
  console.log(JSON.stringify({cases:cases.length,attempts:report.history.attempts,overlap:report.history.overlap.length,stages:report.history.stages}));code=0;
 }else if(daily){
  const result=await runDaily(cases);code=result.completed===cases.length?0:2;
 }else{
  for(const mode of ['single','dual','adaptive'])await run(mode,cases);
  code=0;
 }
}catch(error){console.error('对照回放未完成',error.code??error.name,/来源|检查点|设备/.test(error.message)?error.message:'无法读取样本或运行模型');}
finally{app.exit(code);}
