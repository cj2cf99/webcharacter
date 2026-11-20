// electron.exe tools/test-pc-exercise-electron.mjs <isolated-directory> <main-project>
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openTestDatabase,initializeDatabase} from '../agent/tests/sqlite-d1.mjs';
import {handleCompanion} from '../agent/host/subscriptions.mjs';
import {createDesktopTasks} from '../desktop/task-lifecycle.mjs';
import {createServerTaskCommand} from '../desktop/server-task-command.mjs';
import {createLocalModel,LOCAL_MODEL_FILE} from '../desktop/local-model.mjs';

async function run(){
  assert.equal(process.argv.length,4,'需要隔离目录和主项目目录');
  const dir=resolve(process.argv[2]),main=resolve(process.argv[3]);
  mkdirSync(dir,{recursive:true});
  electron.app.setPath('userData',join(dir,'electron'));
  electron.app.disableHardwareAcceleration();
  await electron.app.whenReady();
  const {companionGateway}=await import(pathToFileURL(join(main,'src/features/companion/gateway.js')));
  const tasks=openTestDatabase(join(dir,'dispatch.sqlite')),business=openTestDatabase(join(dir,'exercise.sqlite'));
  const runtimes=[];
  const model=createLocalModel({utilityProcess:electron.utilityProcess,modelPath:fileURLToPath(new URL('../desktop/models/'+LOCAL_MODEL_FILE,import.meta.url))});
  try{
    initializeDatabase(tasks.sqlite);
    tasks.sqlite.exec(readFileSync(new URL('../agent/seeds/tasklist-pc.sql',import.meta.url),'utf8'));
    if(!business.sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE name='ra_hushi_records'").get()){
      business.sqlite.exec(readFileSync(join(main,'docs/design/database/schema.sql'),'utf8'));
    }
    const env={COMPANION_DB:tasks.DB,COMPANION_HOST:companionGateway({mymaindb:business.DB})};
    const send=(path,opts)=>handleCompanion(new Request('https://isolated.test/api/companion'+path.slice(4),opts),env,'isolated-test',false);
    const seen=new Set(),barrier=Promise.withResolvers(),done=[];
    for(const label of ['pc-a','pc-b']){
      const profile=join(dir,label);
      mkdirSync(profile,{recursive:true});
      const scanned=Promise.withResolvers();done.push(scanned.promise);
      const request=async(path,opts)=>{
        const response=await send(path,opts);
        if(path.endsWith('/pending')&&(await response.clone().json()).tasks?.length){
          seen.add(label);if(seen.size===2)barrier.resolve();
          await barrier.promise;
        }
        if(!response.ok)console.log(label,path,response.status,(await response.clone().text()).slice(0,200));
        return response;
      };
      runtimes.push(await createDesktopTasks({profile,request,dialog:{async showMessageBox(){return {response:0};}},
        pollerOptions:{setTimer(_fn,ms){assert.equal(ms,900000);scanned.resolve();return 1;},clearTimer(){}}}));
    }
    const lookup=()=>tasks.sqlite.prepare('SELECT * FROM tasks').all();
    if(!lookup().length){
      await model.start();assert.equal(model.snapshot().state,'ready');
      const submit=createServerTaskCommand({profile:join(dir,'pc-a'),tasks:runtimes[0],localModel:model,
        dialog:{async showMessageBox({detail}){
          assert.match(detail,/^pc\.exercise\.create\n目标 PC：all/);
          assert.deepEqual(JSON.parse(detail.slice(detail.indexOf('{'))),{body:'躺平'});
          return {response:1};
        }}});
      const reply=await submit('服务器任务：派给 all，登录一条当前时间的运动记录「躺平」');
      assert.match(reply,/目标 all/,reply);
    }
    const [task]=lookup();assert.equal(lookup().length,1);
    assert.equal(task.dispatch_all,1);assert.equal(task.type,'pc.exercise.create');
    if(task.status==='PENDING'){
      for(const r of runtimes)r.startPolling();
      await Promise.all(done);
      assert.equal(seen.size,2);
    }
    const [completed]=lookup();
    assert.equal(completed.status,'COMPLETED',JSON.stringify(completed));
    assert.equal(completed.attempt_count,1);
    const rows=business.sqlite.prepare('SELECT id,kind,body,created_at FROM ra_hushi_records').all();
    assert.equal(rows.length,1);const [row]=rows;
    assert.equal(row.kind,'exercise');assert.equal(row.body,'躺平');
    assert.deepEqual(JSON.parse(completed.result_json),{record_id:row.id,created_at:row.created_at});
    const path='/api/records/hu-shi/exercise/entries';
    assert.deepEqual(await env.COMPANION_HOST.lookup(task.task_id,path),{id:row.id,created_at:row.created_at});
    const replay=await send('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({submission_id:task.submission_id,target_device_id:'all',type:task.type,params:{body:row.body}})});
    assert.ok(replay.ok);assert.equal((await replay.json()).task_id,task.task_id);
    assert.equal(lookup().length,1);
    const persisted=await (await send('/api/tasks/'+task.task_id,{method:'GET'})).json();
    const report={device_id:completed.target_device_id,status:persisted.status,attempt_count:persisted.attempt_count,
      result:persisted.result,error:null,executions:persisted.executions};
    const reportToWorker=body=>send('/api/tasks/'+task.task_id+'/result',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await reportToWorker(report)).status,200);
    const wrong={...report.result,record_id:'unverified'};
    const rejected=await reportToWorker({...report,result:wrong,executions:report.executions.map(e=>({...e,result:wrong}))});
    assert.equal((await rejected.json()).error.code,'EXERCISE_RECEIPT_MISMATCH');
    const receipt={environment:'isolated',model:LOCAL_MODEL_FILE,submission_id:task.submission_id,task_id:task.task_id,
      target:'all',claimed_by:completed.target_device_id,status:completed.status,attempts:completed.attempt_count,
      record:row,time_jst:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'}).format(row.created_at)+' JST'};
    writeFileSync(join(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify(receipt));
  }finally{
    model.close();await Promise.all(runtimes.map(r=>r.stop()));tasks.close();business.close();
  }
}
run().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
