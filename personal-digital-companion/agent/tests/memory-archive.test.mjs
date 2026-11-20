import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rename,writeFile,stat} from 'node:fs/promises';
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
  assert.equal((await client.captureAndAsk(turn.question,{turn})).code,'CONFIG_NOT_CONFIGURED');
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
