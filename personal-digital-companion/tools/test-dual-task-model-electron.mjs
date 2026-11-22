// 用独立 Electron 资料和内存数据库检查开发版的两个真实模型进程。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {createAiWorkflowModel} from '../desktop/ai-workflow-model.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..');
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-dual-task-')));
await electron.app.whenReady();
const records=[];
const create=taskDevice=>createBalancedLocalModel({utilityProcess:electron.utilityProcess,
  modelPath:desktopModelPath(electron.app,root),taskDevice});
const model=create('gpu'),assistant=create('cpu');
const file=join(electron.app.getPath('userData'),'ai.sqlite');
const ai=createAiWorkflowModel({model,assistant,file,log:event=>records.push({...event,end:performance.now()})});
const schema={type:'object',properties:{day:{enum:['周一','周三','周五']}},required:['day'],additionalProperties:false};
const instruction='抽取材料中最终确认的日期，保留原话的星期。';
const signal=AbortSignal.timeout(120000);
const run=(text,options={})=>ai.memory(text,instruction,schema,signal,{name:'双模型验收',maxTokens:48,aiBudget:45000,...options});
let code=1;
try{
  assert.deepEqual(await Promise.all([run('确定周一开会。'),run('确定周五散步。',{aiRole:'assist'})]),[{day:'周一'},{day:'周五'}]);
  assert.match(model.snapshot().model,/4B/);
  assert.ok(model.snapshot().gpuLayers>0);
  assert.match(assistant.snapshot().model,/2B/);
  assert.equal(assistant.snapshot().gpuLayers,0);
  const warm=records.splice(0);
  const [a,b]=await Promise.all([run('把周一的会改到周三。',{aiReview:true}),run('原先周三，最终确认周五。',{aiRole:'assist'})]);
  assert.deepEqual([a,b],[{day:'周三'},{day:'周五'}]);
  assert.ok(records.some(row=>row.stage==='check'));
  const first=records.find(row=>row.stage==='draft'),second=records.find(row=>row.stage==='处理');
  const overlap=Math.min(first.end,second.end)-Math.max(first.end-first.duration_ms,second.end-second.duration_ms);
  assert.ok(overlap>0,'热请求没有交叠');
  // 上一版停在 9B 补写的真实格式。新队列应保留草稿、反馈及其业务检查点，只调 CPU。
  const before=records.length;
  const db=new DatabaseSync(file);
  try{
    db.prepare("INSERT INTO ai_requests(id,group_id,checkpoint,priority,state,input) VALUES('old','old','sample-old',1,'parked',?)")
      .run(JSON.stringify({phase:'9-write',text:'原订周一，最终确认为周五。',instruction,schema,
        skill:{name:'双模型验收',maxTokens:64},candidate:{day:'周一'},reason:'day 写成了旧日期，请改成最终日期。'}));
  }finally{db.close();}
  const recovered=await run('恢复旧步骤',{aiReview:true,aiCheckpoint:'sample-old'});
  assert.deepEqual(recovered,{day:'周五'});
  assert.deepEqual(records.slice(before).map(row=>row.worker),['assist','assist']);
  console.log(JSON.stringify({gpu:model.snapshot(),cpu:assistant.snapshot(),warm:warm.map(r=>r.duration_ms),
    steps:records.map(r=>[r.stage,r.duration_ms]),overlapMs:Math.round(overlap),answers:[a,b],recovered}));
  code=0;
}catch(error){console.error(error,JSON.stringify({records,gpu:model.snapshot(),cpu:assistant.snapshot()}));}
finally{await ai.close();electron.app.exit(code);}
