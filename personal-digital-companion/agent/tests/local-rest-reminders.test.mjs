import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalREST} from '../../desktop/local-rest.mjs';
import {createLocalTaskPool} from '../../desktop/local-task-pool.mjs';
import {createRegistrationFlow} from '../../desktop/registration-flow.mjs';
import {createWorker} from '../worker.mjs';
import {initializeDatabase, openTestDatabase} from './sqlite-d1.mjs';

const input={id:'fixture-reminder',title:'复盘同步',content:'第一行提示词\n第二行含标点：。',deadline:'2099-12-07T09:30+09:00'};

function setup(t,{loseReceipt=false}={}){
  const db=openTestDatabase(),profile=mkdtempSync(join(tmpdir(),'fy-rest-reminder-'));
  const file=join(profile,'queue.sqlite'),writes=[],calls=[];
  initializeDatabase(db.sqlite);
  db.sqlite.exec(readFileSync(new URL('../seeds/tasklist-registration.sql',import.meta.url),'utf8'));
  const worker=createWorker({authorize:()=>({ownerId:'fixture-owner'}),async writeRegistrationEntry(operation){
    writes.push(operation);return {item:{seq:37}};
  }});
  async function request(path,options){
    calls.push(path);
    const res=await worker.fetch(new Request('https://isolated.test'+path,options),{DB:db.DB});
    if(loseReceipt&&path.endsWith('/execute')&&res.ok){loseReceipt=false;throw Error('模拟执行回执丢失');}
    return res;
  }
  let pool,api,allowed=false;
  async function close(){await api?.close();await pool?.close();api=pool=null;}
  t.after(async()=>{try{await close();}finally{db.close();rmSync(profile,{recursive:true,force:true});}});
  return {file,writes,calls,allow(){allowed=true;},close,async start(){
    const flow=createRegistrationFlow({profile,request});
    pool=createLocalTaskPool({file,registerReminder:flow.submitReminder,canWork:()=>allowed});
    api=await openLocalREST({profile,pool,listenPort:0});
    const headers={Authorization:'Bearer '+readFileSync(join(profile,'local-api.token'),'utf8'),'Content-Type':'application/json'};
    const path='/v1/reminders';
    const post=(value=input)=>fetch(api.address+path,{method:'POST',headers,body:JSON.stringify(value)});
    const get=()=>fetch(api.address+path+'/'+input.id,{headers});
    const retry=()=>fetch(api.address+path+'/'+input.id+'/retry',{method:'POST',headers});
    return {pool,api,headers,path,post,get,retry};
  }};
}

test('REST 提醒用原文和东京时分登记一次，且仅授权的本机程序可提交',async t=>{
  const f=setup(t);
  const {pool,api,headers,path,post,get,retry}=await f.start();
  assert.equal((await fetch(api.address+path,{method:'POST'})).status,401);
  assert.equal((await fetch(api.address+path,{method:'POST',headers:{...headers,Origin:'https://other.test'}})).status,403);
  assert.equal((await get()).status,404);
  for(const bad of [{deadline:'2099-02-30T09:30+09:00'},{deadline:'2099-12-07T09:30'},
    {deadline:'2099-12-07T24:00+09:00'},{deadline:'2000-12-07T09:30+09:00'},
    {content:null},{recurrence:'weekly'},{title:' '}]){
    assert.equal((await post({...input,...bad})).status,400);
  }
  const replies=await Promise.all([post(),post()]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,202]);
  const queued=(await replies.find(r=>r.status===202).json()).reminder;
  assert.equal(queued.state,'queued');assert.equal(queued.deadline,input.deadline);
  assert.equal(queued.queue.position,1);assert.equal(Object.hasOwn(queued,'content'),false);
  assert.equal((await post({...input,content:'不同正文'})).status,409);
  assert.equal(f.calls.length,0);
  f.allow();await pool.tick();
  const done=await (await get()).json();assert.equal(done.state,'done');assert.equal(done.recordId,37);
  assert.equal((await retry()).status,200);assert.equal((await post()).status,200);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].path,'/api/reminders');
  assert.deepEqual(f.writes[0].body,{title:input.title,content:input.content,deadline:'2099-12-07T09:30',level:'中'});
  assert.ok(f.calls.every(path=>!path.includes('/assistant/')));
  const db=new DatabaseSync(f.file);
  try{assert.equal(db.prepare('SELECT payload FROM reminder_requests').get().payload,null);}finally{db.close();}
});

test('写入已成功但回执丢失，重启后恢复原编号不重复建提醒',async t=>{
  const f=setup(t,{loseReceipt:true}),first=await f.start();
  assert.equal((await first.post()).status,202);
  f.allow();await first.pool.tick();
  assert.equal((await (await first.get()).json()).state,'blocked');
  assert.equal(f.writes.length,1);
  await f.close();
  const reopened=await f.start();
  assert.equal((await (await reopened.get()).json()).state,'blocked');
  assert.equal((await reopened.retry()).status,200);
  await reopened.pool.tick();
  const done=await (await reopened.get()).json();assert.equal(done.state,'done');assert.equal(done.recordId,37);
  assert.equal(f.writes.length,1);
  assert.equal(f.calls.filter(path=>path==='/api/task-submissions').length,1);
});
