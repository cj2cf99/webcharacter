import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {createLocalTaskPool} from '../../desktop/local-task-pool.mjs';
import {openLocalREST} from '../../desktop/local-rest.mjs';
import {gardenRepo,loadPackage,remoteGarden} from '../../desktop/garden-backend.mjs';
import {canonical,hash,inputFields,schemaQuery} from '../../desktop/garden-registration.mjs';
import {pathToFileURL} from 'node:url';
import {inspectTargets,preparePlan,writePackage} from '../../tools/prepare-garden-registration.mjs';

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'fy-batch-')),db=new DatabaseSync(join(dir,'garden.db'));
  const cleanup=[];
  t.after(async()=>{try{for(const fn of cleanup)await fn();}finally{db.close();rmSync(dir,{recursive:true,force:true});}});
  db.exec("CREATE TABLE garden_revision(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL CHECK(revision>=0));INSERT INTO garden_revision VALUES(1,0);CREATE TABLE garden_project(id INTEGER PRIMARY KEY,name TEXT NOT NULL);INSERT INTO garden_project VALUES(16,'网页角色组件');CREATE TABLE garden_seed(id INTEGER PRIMARY KEY,project_id INTEGER,title TEXT)");
  const read=sql=>db.prepare(sql).all();
  const writes=[];
  const garden={read,write(sql){
    db.exec('BEGIN');try{db.exec(sql);db.exec('COMMIT');writes.push(sql);}catch(e){db.exec('ROLLBACK');throw e;}
  }};
  const file=join(dir,'queue.sqlite'),events=new Map();
  const poolOpts={file,garden,record:event=>events.set(event.key,event)};
  const seed={id:1,project_id:16,title:"用户的 '测试'; 🍀\r\n第二行"};
  const scope={projects:[{id:16,name:'网页角色组件'}],flowers:[]};
  const plan={format:1,id:'fixture-batch',title:'花园登记',kind:'garden',result:'隔离验收',noChanges:[],revision:0,
    schemaHash:hash(canonical(read(schemaQuery))),steps:[
      {label:'新增种子',scope,changes:[{table:'seed',before:null,after:seed}]},
      {label:'更新同一种子',scope,changes:[{table:'seed',before:seed,after:{...seed,title:'确认后的内容'}}]}]};
  return {dir,file,db,read,garden,events,poolOpts,plan,writes,cleanup,digest:hash(canonical(plan))};
}
const sha='1'.repeat(40);
test('导入进度前缀后是成功 JSON 时四步只通知完成一次，异常回执仍暂停',async t=>{
  const f=fixture(t),bin=join(f.dir,'node_modules/wrangler/bin');
  mkdirSync(bin,{recursive:true});
  writeFileSync(join(bin,'wrangler.js'),`
    const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
    const db=new DatabaseSync('garden.db');
    if(process.argv.includes('--command')){
      console.log(JSON.stringify([{success:true,results:db.prepare(process.argv.at(-1)).all()}]));
    }else{
      const sql=fs.readFileSync(process.argv[process.argv.indexOf('--file')+1],'utf8');
      db.exec('BEGIN');db.exec(sql);db.exec('COMMIT');
      console.log('├ Checking if file needs uploading\\r\\n│\\r\\n├ 🌀 Uploading step.sql\\r\\n│ 🌀 Uploading complete.\\r\\n│');
      console.log(fs.existsSync('reply.txt')?fs.readFileSync('reply.txt','utf8'):JSON.stringify([{success:true,results:[]}],null,2));
    }
    db.close();
  `);
  const garden=remoteGarden(f.dir),notices=[];
  const pool=createLocalTaskPool({...f.poolOpts,garden,onResult:b=>notices.push(b.state)});
  const steps=[...f.plan.steps];
  for(const title of ['三','四']){
    const last=steps.at(-1),before=last.changes[0].after;
    steps.push({label:title,scope:last.scope,changes:[{table:'seed',before,after:{...before,title}}]});
  }
  try{
    const plan={...f.plan,steps};
    pool.submit(plan,sha,hash(canonical(plan)));await pool.tick();
    assert.deepEqual(notices,['done']);assert.equal(f.events.size,1);
    assert.deepEqual(pool.get(plan.id).steps.map(s=>s.revision),[1,2,3,4]);
    const last=steps.at(-1),before=last.changes[0].after;
    const bad={...plan,id:'bad-receipt',revision:4,steps:[{...last,changes:[{table:'seed',before,after:{...before,title:'五'}}]}]};
    writeFileSync(join(f.dir,'reply.txt'),'[{"success":false}]');
    pool.submit(bad,sha,hash(canonical(bad)));await pool.tick();
    assert.deepEqual(notices,['done','blocked']);assert.match(pool.get(bad.id).error,/未确认成功/);
    writeFileSync(join(f.dir,'reply.txt'),'truncated');
    await assert.rejects(garden.write('SELECT 1;'),/无法解析 D1 导入回执/);
  }finally{await pool.close();}
});
test('按实际花园模型制单并逐步执行全部登记类型，复核外键、版本和单份归档',{skip:!existsSync(join(gardenRepo,'src/features/garden/store.mjs'))},async()=>{
  const db=new DatabaseSync(':memory:');
  const garden={read:sql=>db.prepare(sql).all(),write(sql){
    db.exec('BEGIN');try{db.exec(sql);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }};
  const events=[],pool=createLocalTaskPool({file:':memory:',garden,record:event=>events.push(event)});
  try{
    db.exec(readFileSync(join(gardenRepo,'migrations/0021_garden.sql'),'utf8'));
    const steps=[
      ['projects',{name:'甲项目'}],['projects',{name:'乙项目'}],
      ['relations',{project_a:1,project_b:2,type:'rel'}],
      ['flowers',{project_id:1,name:'甲功能',type:'service'}],
      ['seeds',{project_id:2,title:'乙功能种子'}],['land',{name:'乙功能'},1],
      ['deploy',{deployed_at:'2026-11-21T01:00:00+09:00',items:[{flower_id:1,note:'甲的更新'},{flower_id:2,note:'乙的更新'}]}],
      ['improvements',{flower_id:1,title:'改善甲'}],['bugs',{flower_id:2,title:'修复乙',severe:1}],
      ['platforms',{name:'隔离平台'}],['features',{name:'隔离平台功能',platform_id:1}],
      ['links',{flower_id:1,feature_id:1}],['sources',{name:'隔离数据源',runner_project_id:2,flower_ids:[1,2]}],
      ['sources',{flower_ids:[2]},1],
    ].map(([resource,data,id],i)=>({resource,data,...(id?{id}:{}),label:'核对 '+(i+1)+' '+resource}));
    assert.deepEqual(new Set(steps.map(s=>s.resource)),new Set(Object.keys(inputFields)));
    const plan=await preparePlan({id:'all-targets',title:'花园各目标',kind:'garden',result:'隔离验收',noChanges:[],steps},garden);
    assert.equal(garden.read('SELECT count(*) n FROM garden_project')[0].n,0);
    pool.submit(plan,sha,hash(canonical(plan)));await pool.tick();
    const receipt=pool.get(plan.id);assert.equal(receipt.state,'done',receipt.error);
    assert.deepEqual(receipt.steps.map(s=>s.revision),steps.map((_,i)=>i+1));
    assert.deepEqual(garden.read('PRAGMA foreign_key_check'),[]);
    assert.deepEqual(garden.read('SELECT * FROM garden_deploy_item ORDER BY id').map(r=>[r.project_id,r.flower_id,r.note,r.version_after]),[[1,1,'甲的更新','1.0'],[2,2,'乙的更新','1.0']]);
    assert.deepEqual(garden.read('SELECT flower_id FROM garden_data_source_flower').map(r=>r.flower_id),[2]);
    assert.equal(garden.read('SELECT flower_id FROM garden_seed')[0].flower_id,2);
    assert.equal(events.length,1);
  }finally{await pool.close();db.close();}
});
test('基线读取期间可查看进度，受控暂停后不发出新写入',async t=>{
  const f=fixture(t),entered=Promise.withResolvers(),resumeRead=Promise.withResolvers();
  let waitOnce=true;
  const pool=createLocalTaskPool({...f.poolOpts,garden:{...f.garden,async read(sql){
    if(waitOnce){waitOnce=false;entered.resolve();await resumeRead.promise;}
    return f.garden.read(sql);
  }}});
  try{
    pool.submit(f.plan,sha,f.digest);const run=pool.tick();await entered.promise;
    const during=pool.get(f.plan.id);
    const paused=pool.pause();resumeRead.resolve();await Promise.all([run,paused]);
    assert.equal(f.writes.length,0,'暂停到达后应保留未发送的步骤');
    assert.equal(during.state,'running');assert.equal(during.steps[0].state,'checking');
    pool.resume();await pool.tick();
    assert.equal(pool.get(f.plan.id).state,'done');assert.equal(f.writes.length,2);
  }finally{resumeRead.resolve();await pool.close();}
});
test('重新确认剩余步骤保留原编号与首步，最终生成一份记录',async t=>{
  const f=fixture(t);
  const backend={...f.garden,read:sql=>{
    if(f.writes.length===1&&sql.startsWith('SELECT revision')&&++reads===3)
      f.db.exec('UPDATE garden_revision SET revision=revision+1');
    return f.garden.read(sql);
  }};
  let reads=0;
  const pool=createLocalTaskPool({...f.poolOpts,garden:backend});
  try{
    pool.submit(f.plan,sha,f.digest);await pool.tick();
    assert.equal(pool.get(f.plan.id).state,'blocked');
    const next={...f.plan,continues:f.digest,revision:2,steps:[f.plan.steps[1]]};
    const digest=hash(canonical(next));
    await pool.revise(next,'2'.repeat(40),digest);await pool.tick();
    const completed=pool.get(f.plan.id);
    assert.equal(completed.state,'done');assert.deepEqual(completed.steps.map(s=>s.revision),[1,3]);
    assert.equal(completed.steps[0].commit,sha);assert.equal(f.events.size,1);assert.equal(pool.list().length,1);
  }finally{await pool.close();}
});
test('两批依次执行；最终归档失败可独立重试，同一天的复盘不重复',async t=>{
  const f=fixture(t),order=[];
  let failArchive=true;
  const pool=createLocalTaskPool({...f.poolOpts,record:event=>{
    if(!f.events.has(event.key))order.push(event.taskId);
    f.events.set(event.key,event);
    if(failArchive){failArchive=false;throw Error('模拟归档中断');}
  }});
  try{
    const second={...f.plan,id:'next-batch',revision:2,steps:[{...f.plan.steps[0],changes:[{
      table:'seed',before:null,after:{...f.plan.steps[0].changes[0].after,id:2}}]}]};
    pool.submit(f.plan,sha,f.digest);pool.submit(second,sha,hash(canonical(second)));
    await pool.tick();const blocked=pool.get(f.plan.id);assert.ok(blocked.finished);assert.equal(blocked.state,'blocked');
    await pool.tick();assert.equal(pool.get(second.id).state,'done');
    pool.retry(f.plan.id,f.digest);await pool.tick();assert.equal(pool.get(f.plan.id).finished,blocked.finished);
    assert.deepEqual(order,['garden-batch:fixture-batch','garden-batch:next-batch']);assert.equal(f.writes.length,3);
  }finally{await pool.close();}
});
async function settled(pool,id){
  for(let i=0;i<150;i++){const b=pool.get(id);if(['done','blocked'].includes(b.state))return b;await wait(20);}
  assert.fail('批次超时');
}
test('HTTP 确认、鉴权、固定 Git 清单、整批回读与一次复盘',async t=>{
  const f=fixture(t), root=join(f.dir,'repo'),repo=join(root,'myapp'),base=join(repo,'database','changes');
  mkdirSync(base,{recursive:true});
  const pkg=join(base,f.plan.id);
  assert.equal(await writePackage(f.plan,pkg),f.digest);
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();
  execFileSync('git',['-C',root,'init','-q'],{windowsHide:true});
  git('add','.');git('-c','user.name=fixture','-c','user.email=fixture@localhost','-c','commit.gpgsign=false','commit','-qm','fixture');
  const input={id:f.plan.id,commit:git('rev-parse','HEAD'),reviewHash:f.digest,userConfirmed:true};
  const progress=[];
  const pool=createLocalTaskPool({...f.poolOpts,onProgress:p=>progress.push(p)});
  const api=await openLocalREST({profile:f.dir,pool,listenPort:0,load:v=>loadPackage(v,repo)});
  f.cleanup.push(async()=>{await api.close();await pool.close();});
  const headers={authorization:'Bearer '+readFileSync(join(f.dir,'local-api.token'),'utf8'),'content-type':'application/json'};
  const post=v=>fetch(api.address+'/v1/batches',{method:'POST',headers,body:JSON.stringify(v)});
  const guide=await (await fetch(api.address+'/infoguide')).json();assert.equal(guide.baseURL,api.address);assert.equal(guide.routes.length,12);assert.equal(guide.version,6);
  assert.deepEqual(await (await fetch(api.address)).json(),guide);
  assert.equal((await fetch(api.address+'/v1/batches')).status,401);
  assert.equal((await fetch(api.address+'/v1/batches',{headers:{...headers,Origin:'https://other.invalid'}})).status,403);
  assert.equal((await post({...input,userConfirmed:false})).status,400);
  assert.equal((await post({...input,reviewHash:'0'.repeat(64)})).status,409);assert.equal(pool.list().length,0);
  const results=await Promise.all([post(input),post(input)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,202]);
  assert.equal((await settled(pool,input.id)).state,'done');
  assert.equal((await post({...input,reviewHash:'0'.repeat(64)})).status,409);
  const actual=await (await fetch(api.address+'/v1/batches/'+input.id,{headers})).json();
  assert.deepEqual(actual.steps.map(s=>s.revision),[1,2]);assert.equal(f.events.size,1);assert.equal(f.writes.length,2);
  assert.ok(progress.some(p=>p?.stage==='整批回读核对'&&p.done===2));
  assert.equal(f.read('SELECT title FROM garden_seed')[0].title,'确认后的内容');
  const inspect=new DatabaseSync(f.file);assert.equal(inspect.prepare('SELECT payload FROM batches').get().payload,null);inspect.close();
  writeFileSync(join(pkg,'step-001.sql'),'-- stale SQL\n');git('add','.');git('-c','user.name=fixture','-c','user.email=fixture@localhost','-c','commit.gpgsign=false','commit','-qm','wrong sql');
  await assert.rejects(loadPackage({...input,commit:git('rev-parse','HEAD')},repo),/SQL/);
});
test('提醒和花园共用正式工作的名额与顺序，花园查询只返回花园批次',async t=>{
  const f=fixture(t);
  const pool=createLocalTaskPool({...f.poolOpts,canWork:()=>false,hasRoom:()=>pool.unfinished()<3,
    registerReminder:async()=>1});
  f.cleanup.push(()=>pool.close());
  const reminder={id:f.plan.id,title:'先排提醒',deadline:'2099-12-07T09:30+09:00',content:''};
  assert.equal(pool.submitReminder(reminder).reminder.queue.position,1);
  assert.equal(pool.submit(f.plan,sha,f.digest).batch.queue.position,2);
  assert.equal(pool.submitReminder({...reminder,id:'last-reminder'}).reminder.queue.position,3);
  assert.deepEqual(pool.pending().map(row=>row.title),['先排提醒','花园登记','先排提醒']);
  assert.deepEqual(pool.list().map(row=>row.title),['花园登记']);
  assert.equal(pool.submitReminder(reminder).existing,true);
  assert.throws(()=>pool.submitReminder({...reminder,id:'overflow'}),{status:429});
});
test('已写入但回执丢失：重开原队列先读回，后续步骤只执行一次',async t=>{
  const f=fixture(t);
  let first=createLocalTaskPool({...f.poolOpts,garden:{...f.garden,write(sql){f.garden.write(sql);throw Error('回执丢失');}}});
  first.submit(f.plan,sha,f.digest);await first.tick();
  assert.equal(first.get(f.plan.id).steps[0].state,'applying');
  await first.close();
  const next=createLocalTaskPool(f.poolOpts);
  try{
    assert.equal(next.get(f.plan.id).state,'blocked');next.retry(f.plan.id,f.digest);await next.tick();
    assert.equal(next.get(f.plan.id).state,'done');assert.equal(f.writes.length,2);assert.equal(f.events.size,1);
  }finally{await next.close();}
});
test('REST 清单变更经重新确认方可续办，分页及重复请求使用同一批次',async t=>{
  const f=fixture(t);
  const next={...f.plan,continues:f.digest,revision:1};
  const newHash=hash(canonical(next)),pool=createLocalTaskPool(f.poolOpts);
  const api=await openLocalREST({profile:f.dir,pool,listenPort:0,load:async v=>v.reviewHash===newHash?next:f.plan});
  f.cleanup.push(async()=>{await api.close();await pool.close();});
  const headers={authorization:'Bearer '+readFileSync(join(f.dir,'local-api.token'),'utf8'),'content-type':'application/json'};
  const url=api.address+'/v1/batches',item=url+'/'+f.plan.id;
  const post=(path,data)=>fetch(path,{method:'POST',headers,body:JSON.stringify(data)});
  const original={id:f.plan.id,commit:sha,reviewHash:f.digest,userConfirmed:true};
  const revised={...original,commit:'2'.repeat(40),reviewHash:newHash};
  f.db.exec('UPDATE garden_revision SET revision=1');
  assert.equal((await post(url,original)).status,202);
  assert.equal((await settled(pool,f.plan.id)).state,'blocked');
  assert.equal((await post(item+'/retry',{reviewHash:newHash})).status,409);
  assert.equal((await post(item+'/retry',{reviewHash:f.digest})).status,200);
  await pool.tick();assert.equal((await settled(pool,f.plan.id)).state,'blocked');
  assert.equal((await post(item+'/revise',{...revised,userConfirmed:false})).status,400);
  assert.equal(pool.get(f.plan.id).reviewHash,f.digest);assert.equal(f.writes.length,0);
  assert.equal((await post(item+'/revise',revised)).status,200);
  await pool.tick();assert.equal((await settled(pool,f.plan.id)).state,'done');
  assert.equal((await post(item+'/revise',revised)).status,200);
  const page=await (await fetch(url+'?limit=1',{headers})).json();
  assert.equal(page.batches.length,1);assert.equal(page.batches[0].reviewHash,newHash);
  assert.deepEqual((await (await fetch(url+'?before='+page.batches[0].cursor,{headers})).json()).batches,[]);
  assert.equal(f.writes.length,2);assert.equal(f.events.size,1);
});
test('强制退出后由持久的 applying 自动续办，既有远端写入不重复',async t=>{
  const f=fixture(t);
  const moduleUrl=new URL('../../desktop/local-task-pool.mjs',import.meta.url).href;
  const child="import {DatabaseSync} from 'node:sqlite';import {createLocalTaskPool} from "+JSON.stringify(moduleUrl)+";const [dir,p,h]=process.argv.slice(1),db=new DatabaseSync(dir+'/garden.db');const pool=createLocalTaskPool({file:dir+'/queue.sqlite',record:()=>{},garden:{read:s=>db.prepare(s).all(),write:s=>{db.exec('BEGIN;'+s+'COMMIT;');process.exit(23)}}});pool.submit(JSON.parse(p),'"+sha+"',h);await pool.tick();";
  assert.throws(()=>execFileSync(process.execPath,['--input-type=module','-e',child,f.dir,JSON.stringify(f.plan),f.digest],{windowsHide:true}),e=>e.status===23);
  const pool=createLocalTaskPool(f.poolOpts);
  try{
    assert.equal(pool.get(f.plan.id).state,'running');await pool.tick();
    assert.equal(pool.get(f.plan.id).state,'done');assert.equal(f.writes.length,1);assert.equal(f.events.size,1);
  }finally{await pool.close();}
});
test('丢回执后花园又有更新，按用户重新确认的当前修订核实已到位的步骤',async t=>{
  const f=fixture(t);
  let lose=true;
  const pool=createLocalTaskPool({...f.poolOpts,garden:{...f.garden,write(sql){
    f.garden.write(sql);if(lose){lose=false;throw Error('回执丢失');}
  }}});
  try{
    pool.submit(f.plan,sha,f.digest);await pool.tick();f.db.exec('UPDATE garden_revision SET revision=2');
    pool.retry(f.plan.id,f.digest);await pool.tick();assert.equal(pool.get(f.plan.id).state,'blocked');
    const next={...f.plan,revision:2,continues:f.digest,steps:f.plan.steps.slice(1)};
    const stale={...next,revision:1};
    await assert.rejects(pool.revise(stale,sha,hash(canonical(stale))));
    await pool.revise(next,sha,hash(canonical(next)));await pool.tick();
    const result=pool.get(f.plan.id);
    assert.equal(result.state,'done');assert.deepEqual(result.steps.map(s=>s.revision),[2,3]);
    assert.equal(f.writes.length,2);assert.equal(f.events.size,1);
  }finally{await pool.close();}
});
test('目标发生变化和最后一轮不一致均保留缓存和回执',async t=>{
  const f=fixture(t);
  f.db.exec("UPDATE garden_project SET name='另一项目' WHERE id=16");
  const pool=createLocalTaskPool(f.poolOpts);
  try{
    pool.submit(f.plan,sha,f.digest);await pool.tick();assert.equal(pool.get(f.plan.id).state,'blocked');assert.equal(f.writes.length,0);
    f.db.exec("UPDATE garden_project SET name='网页角色组件' WHERE id=16");
    let revisions=0;
    const read=f.garden.read;
    f.garden.read=sql=>{
      if(sql.startsWith('SELECT revision')&&++revisions===9)f.db.exec("UPDATE garden_seed SET title='外部新值'");
      return read(sql);
    };
    pool.retry(f.plan.id,f.digest);await pool.tick();
    assert.match(pool.get(f.plan.id).error,/整批/);assert.equal(f.events.size,0);
    const inspect=new DatabaseSync(f.file);assert.ok(inspect.prepare('SELECT payload FROM batches').get().payload);inspect.close();
  }finally{await pool.close();}
});
test('制单复用花园真实模型，桌宠归属及部署明细版本可核对',{skip:!existsSync(join(gardenRepo,'src/features/garden/store.mjs'))},async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(readFileSync(join(gardenRepo,'migrations/0021_garden.sql'),'utf8'));
    const {configs}=await import(pathToFileURL(join(gardenRepo,'src/features/garden/model.mjs')));
    for(const [resource,[,fields]] of Object.entries(configs))
      assert.deepEqual(inputFields[resource],resource==='sources'?[...fields,'flower_ids']:fields);
    db.exec("INSERT INTO garden_project(id,name,created_at) VALUES(16,'网页角色组件','2026-11-20');INSERT INTO garden_flower(id,project_id,name,type,created_at) VALUES(61,16,'绯月（桌面精灵）','service','2026-11-20')");
    const request={id:'desktop-test',title:'安装后登记',kind:'desktop-update',release:'succeeded',result:'隔离模拟安装成功',noChanges:['种子'],steps:[
      {resource:'deploy',label:'登记本机版本',data:{deployed_at:'2026-11-21T01:00:00+09:00',items:[{flower_id:61,note:'[发布成功:desktop-test] 测试'}]}}]};
    const source={read:sql=>db.prepare(sql).all()};
    const plan=await preparePlan(request,source);
    const catalog=await inspectTargets(source,join(gardenRepo,'src/features/garden/store.mjs'));
    assert.equal(catalog.resources.flowers[0].version,'0.0');
    assert.deepEqual(catalog.resources.deploy,[]);
    await assert.rejects(preparePlan({...request,baseline:{...catalog.baseline,revision:100}},source),/重新查询/);
    await assert.rejects(preparePlan({...request,steps:[{...request.steps[0],targetId:7}]},source),/修改须使用 id/);
    await assert.rejects(preparePlan({...request,steps:[{...request.steps[0],data:{...request.steps[0].data,version:'9.0'}}]},source),/不支持的登记字段/);
    assert.equal(plan.steps[0].scope.flowers[0].id,61);
    const item=plan.steps[0].changes.find(c=>c.table==='deploy_item').after;
    assert.equal(item.version_after,'1.0');assert.equal(item.version_before,'0.0');assert.equal(item.note,request.steps[0].data.items[0].note);
    assert.equal(source.read('SELECT count(*) n FROM garden_deploy')[0].n,0);
    await assert.rejects(preparePlan({...request,release:'failed'},source),/失败发布/);
    db.exec("UPDATE garden_flower SET name='其他功能'");await assert.rejects(preparePlan(request,source),/既有绯月功能/);
  }finally{db.close();}
});


// 正式工作队列（docs/FORMAL_WORK_QUEUE.md）
const variant=(plan,id)=>{const p={...plan,id};return {plan:p,digest:hash(canonical(p))};};
test('本地待处理满员拒收新批次，重交原批次不受影响；排队位置计入已接取的本机任务',async t=>{
  const f=fixture(t);
  let pool;
  pool=createLocalTaskPool({...f.poolOpts,canWork:()=>false,hasRoom:()=>pool.unfinished()<2,
    queueInfo:()=>({used:pool.unfinished()+1,limit:2,running:'本机任务',tasks:1})});
  f.cleanup.push(()=>pool.close());
  const a=variant(f.plan,'queue-a'),b=variant(f.plan,'queue-b'),c=variant(f.plan,'queue-c');
  const first=pool.submit(a.plan,sha,a.digest);
  assert.deepEqual(first.batch.queue,{position:2,used:2,limit:2,running:'本机任务'});
  assert.equal(pool.submit(b.plan,sha,b.digest).batch.queue.position,3);
  assert.throws(()=>pool.submit(c.plan,sha,c.digest),e=>e.status===429&&/已满/.test(e.message));
  assert.equal(pool.submit(a.plan,sha,a.digest).existing,true);
  assert.equal(pool.unfinished(),2);
});
test('旧库补列后历史批次视为已取回；新完成的批次进入待回执，HTTP ack 后移出',async t=>{
  const f=fixture(t);
  const legacy=new DatabaseSync(f.file);
  legacy.exec("CREATE TABLE batches(id TEXT PRIMARY KEY,digest TEXT NOT NULL,source_commit TEXT NOT NULL,title TEXT NOT NULL,created TEXT NOT NULL,state TEXT NOT NULL,payload TEXT,steps TEXT NOT NULL,error TEXT,finished TEXT)");
  legacy.prepare("INSERT INTO batches VALUES('old-done','d','c','旧批次','2026-11-20T00:00:00Z','done',NULL,'[]',NULL,'2026-11-20T01:00:00Z')").run();
  legacy.close();
  const pool=createLocalTaskPool(f.poolOpts);
  const api=await openLocalREST({profile:f.dir,pool,listenPort:0});
  f.cleanup.push(async()=>{await api.close();await pool.close();});
  assert.equal(pool.get('old-done').acknowledged,'2026-11-20T01:00:00Z');
  assert.deepEqual(pool.unacknowledged(),[]);
  pool.submit(f.plan,sha,f.digest);
  assert.throws(()=>pool.ack(f.plan.id),/已完成/);
  assert.equal((await settled(pool,f.plan.id)).state,'done');
  const headers={authorization:'Bearer '+readFileSync(join(f.dir,'local-api.token'),'utf8')};
  const pending=await (await fetch(api.address+'/v1/batches?unacknowledged=1',{headers})).json();
  assert.deepEqual(pending.batches.map(b=>b.id),[f.plan.id]);
  const acked=await fetch(api.address+'/v1/batches/'+f.plan.id+'/ack',{method:'POST',headers});
  assert.equal(acked.status,200);
  const receipt=await acked.json();assert.ok(Date.parse(receipt.acknowledged));
  const again=await (await fetch(api.address+'/v1/batches/'+f.plan.id+'/ack',{method:'POST',headers})).json();
  assert.equal(again.acknowledged,receipt.acknowledged);
  assert.deepEqual((await (await fetch(api.address+'/v1/batches?unacknowledged=1',{headers})).json()).batches,[]);
  assert.equal((await fetch(api.address+'/v1/batches/old-done/ack',{method:'POST',headers})).status,200);
});
test('批次真正开工时才让闲时工作暂停；空队列与等待本机任务时不打扰',async t=>{
  const f=fixture(t);let starts=0,taskRunning=true;
  const pool=createLocalTaskPool({...f.poolOpts,canWork:()=>!taskRunning,onStart:()=>starts++});
  f.cleanup.push(()=>pool.close());
  await pool.tick();assert.equal(starts,0,'空队列不调用');
  pool.submit(f.plan,sha,f.digest);await pool.tick();
  assert.equal(starts,0,'本机任务执行中，批次等待且不打断');assert.equal(pool.get(f.plan.id).state,'queued');
  taskRunning=false;
  assert.equal((await settled(pool,f.plan.id)).state,'done');assert.equal(starts,1);
});
