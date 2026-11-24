import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rename,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryArchive} from '../../desktop/memory-archive.mjs';
import {createScreenQuestionClient} from '../../desktop/screen-question-client.mjs';
import {migrateMemory} from '../../desktop/migrate-memory.mjs';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';

const turn={id:'test-one',question:'请读出编号',at:Date.parse('2026-11-19T23:59:59+09:00')};
const source={getSize:()=>({width:640,height:320}),toPNG:()=>Buffer.from('synthetic-png'),
  isEmpty:()=>false,resize(){return this;},toJPEG:()=>Buffer.from([255,216,255])};
function screenClient(options){
  return createScreenQuestionClient({screen:{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({id:1,size:source.getSize()})},
    desktopCapturer:{getSources:async()=>[{display_id:'1',thumbnail:source}]},...options});
}

test('旧独立问答只有普通文字回执且无附件痕迹时才进入手记取材',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-diary-origin-')),day='2026-11-19';
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const memory=createMemoryArchive(dir);
  const traffic=createTaskTrafficLog(dir,{memory,clock:()=>turn.at});
  const cases=[
    ['ordinary','文字问题','文字问答',undefined,false],
    ['screen','问题','截图问答',undefined,true],
    ['attachment','问题 · 粘贴的图片','文字问答',undefined,true],
    ['missing','无回执',null,undefined,true],
    ['new-text','已有文字标记',null,false,false],
    ['new-local','已有本机标记','文字问答',true,true]
  ];
  for(const [id,question,operation,localOnly] of cases){
    await memory.save({...turn,id,question,text:'隔离合成回包',localOnly},{index:false});
    if(operation)await traffic.write({route:'问绯月',stage:'处理结束',turn_id:id,operation});
  }
  await traffic.write({route:'问绯月',stage:'处理结束',turn_id:'screen',operation:'文字问答'});
  const checked=new Map((await memory.readForDiary(day)).map(row=>[row.id,row.localOnly]));
  for(const [id,,,,expected] of cases)assert.equal(checked.get(id),expected,id);
  const unchanged=new Map((await memory.read(day)).map(row=>[row.id,row.localOnly]));
  assert.equal(unchanged.get('missing'),undefined);
});

test('多步生图归档独立于作业目录，可重复补档并与普通任务同时复盘',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-report-')),memory=createMemoryArchive(join(dir,'记忆'));
  const job='ab'.repeat(16),png=join(dir,'source.png'),missing=join(dir,'later.png');
  await writeFile(png,source.toPNG());
  const row={job,at:turn.at,state:'done',original:'先画，再放大',text:'已完成',completed:[
    {step:1,operation:'generate',output:png,width:640,height:320},{step:2,operation:'upscale',output:missing,width:2560,height:1280}]};
  const day='2026-11-19';
  assert.equal((await memory.archiveImageTask(row)).complete,false);
  await rename(png,missing);
  const result=await memory.archiveImageTask(row);
  assert.equal(result.complete,true);
  assert.equal(result.output,memory.taskImage(day,job,2));
  await memory.saveTasks(day,[{task_id:'register',at:row.at,title:'提醒',action:'已登记'}]);
  assert.equal((await memory.readTasks(day)).length,2);
  const report=await memory.readImageReport(day,job);
  assert.equal(report.report.steps.length,2);
  assert.ok(report.report.steps.every(s=>s.image.startsWith('对话/图片/')));
  const moved=join(dir,'移动后的日期包');
  await rename(memory.folder(day),moved);
  for(const s of report.report.steps)assert.deepEqual(await readFile(join(moved,s.image)),source.toPNG());
  assert.match(await readFile(join(moved,'复盘.html'),'utf8'),/对话\/图片\//);
  assert.throws(()=>memory.taskImage(day,'../escape',1));
});

test('东京日期包搬走后可直接查看对话、任务、图片和跨午夜完成的日志',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-portable-')),memory=createMemoryArchive(dir);
  const ref=await memory.storeImage(turn,source);
  const traffic=createTaskTrafficLog(dir,{memory,clock:()=>turn.at+5000});
  await Promise.all([memory.save({...turn,image:ref,state:'answer',text:'<编号>'}),
    memory.saveTasks(ref.day,[{at:turn.at,title:'测试任务',action:'成功'}]),
    traffic.write({archive_day:ref.day,turn_id:turn.id})]);
  const moved=join(dir,'已搬走');await rename(memory.folder(ref.day),moved);
  const html=await readFile(join(moved,'复盘.html'),'utf8');
  assert.ok(html.includes('&lt;编号&gt;')&&html.includes('测试任务'));
  for(const file of [ref.original,ref.thumbnail,'日志/任务通信.jsonl']){
    assert.ok(html.includes('"'+file+'"'));assert.ok((await stat(join(moved,file))).isFile());
  }
  assert.equal(JSON.parse(await readFile(join(moved,'对话',turn.id+'.json'),'utf8')).time,'2026-11-19T23:59:59.000+09:00');
  assert.throws(()=>memory.original(ref.day,'../escape'));
  assert.throws(()=>memory.folder('../escape'));
});

test('截图落盘失败或用户取消时，均不上传',async()=>{
  let uploads=0,started=0;
  const request=async()=>{uploads++;throw Error('不应上传');};
  const disk=await screenClient({memory:{storeImage:async()=>{throw Error('磁盘满');}},vision:async()=>{started++;},request});
  assert.equal((await disk.captureAndAsk(turn.question,{turn})).code,'ARCHIVE_FAILED');
  assert.equal(started,0);
  const abort=new AbortController();
  const cancel=await screenClient({memory:{storeImage:async()=>({})},vision:async()=>{abort.abort();return {reason:'已取消'};},request});
  assert.equal((await cancel.captureAndAsk(turn.question,{turn,signal:abort.signal})).code,'REQUEST_CANCELLED');
  assert.equal(uploads,0);
});

test('无云端连接可本地识图，跨日重试使用同一份截图',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-retry-')),memory=createMemoryArchive(dir);
  let captures=0,calls=0;
  const client=await screenClient({memory,request:null,desktopCapturer:{getSources:async()=>{captures++;return [{display_id:'1',thumbnail:source}];}},
    vision:async()=>++calls===1?{reason:'看不清'}:{text:'编号 18'}});
  assert.equal((await client.captureAndAsk(turn.question,{turn})).code,'LOCAL_VISION_UNAVAILABLE');
  const later={...turn,at:turn.at+2000,id:'test-two'};
  assert.equal((await client.retryLast({turn:later})).text,'编号 18');
  assert.equal(captures,1);
  assert.deepEqual(await readFile(memory.original('2026-11-19',turn.id)),await readFile(memory.original('2026-11-20',later.id)));
});

test('旧日志预导入可重跑，已打包的旧日期不会因启动补录而重建',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-import-')),memory=createMemoryArchive(join(dir,'archive'));
  const file=join(dir,'task-traffic.jsonl');
  const entry=day=>JSON.stringify({time:day+'T12:00:00+09:00',route:'测试'});
  const day='2026-11-19',lines=[entry(day),entry(day),entry('2026-11-20')];
  await writeFile(file,lines.join('\n')+'\n');
  await migrateMemory(dir,memory,null,{preview:true});
  const moved=join(dir,'moved');await rename(memory.folder(day),moved);
  lines.push(entry('2026-11-20'));
  await writeFile(file,lines.join('\n')+'\n');
  await migrateMemory(dir,memory,null);await migrateMemory(dir,memory,null);
  await assert.rejects(stat(memory.folder(day)),{code:'ENOENT'});
  for(const folder of [moved,memory.folder('2026-11-20')]){
    const log=await readFile(join(folder,'日志','历史通信.jsonl'),'utf8');
    assert.equal(log.trimEnd().split('\n').length,2);
  }
});
