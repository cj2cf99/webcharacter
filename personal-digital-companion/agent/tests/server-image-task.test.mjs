import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import worker from '../worker.mjs';
import {initializeDatabase,openTestDatabase} from './sqlite-d1.mjs';
import {createServerTaskCommand} from '../../desktop/server-task-command.mjs';
import {createDesktopTasks} from '../../desktop/task-lifecycle.mjs';
import {createImageTasks} from '../../desktop/image-tasks.mjs';
import {createMemoryArchive} from '../../desktop/memory-archive.mjs';
import {tokyoDay} from '../../desktop/conversation-history.mjs';

for(const upload of [true,false])test('自动生图明确汇报并打开归档图片，云端回执 '+upload,async t=>{
  const profile=await mkdtemp(join(tmpdir(),'feiyue-image-receipt-'));
  const db=openTestDatabase(),memory=createMemoryArchive(join(profile,'memory'));
  initializeDatabase(db.sqlite);
  db.sqlite.exec(await readFile(new URL('../seeds/tasklist-pc.sql',import.meta.url),'utf8'));
  const output=join(profile,'fixture.png');
  await writeFile(output,'test image');
  const images=createImageTasks({root:profile,profile,archive:memory.archiveImageTask,
    runPython:async(_cli,args)=>args[0]==='submit'?{job:args[2].replaceAll('-',''),state:'queued'}:
      {state:'done',width:512,height:768,output}});
  const reports=[],opened=Promise.withResolvers();
  const dialog={async showMessageBox(options){
    if(options.title==='绯月 · 自动任务汇报'){reports.push(options);return {response:0};}
    return {response:1};
  }};
  const request=(path,options={})=>{
    if(!upload&&path.endsWith('/result'))throw Error('模拟回传断线');
    return worker.fetch(new Request('https://test.invalid'+path,{...options,headers:{...options.headers,Authorization:'Bearer test'}}),{DB:db.DB,API_TOKEN:'test'});
  };
  const tasks=await createDesktopTasks({profile,dialog,request,generateImage:images.generateServerImage,
    openImage:job=>opened.resolve(images.result(job))});
  t.after(async()=>{await tasks.stop();images.close();db.close();await rm(profile,{recursive:true,force:true});});
  await createServerTaskCommand({profile,tasks,dialog})('服务器任务：派给 all，生图：一棵树');
  await tasks.pollOnce();await tasks.settled();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(reports.length,1);
  assert.match(reports[0].detail,upload?/云端已确认收到结果/:/云端回执待确认/);
  assert.match(reports[0].detail,/512 × 768 PNG/);
  assert.deepEqual(reports[0].buttons,['查看成图','知道了']);
  assert.equal(await readFile(await opened.promise,'utf8'),'test image');
  await tasks.pollOnce();await tasks.settled();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(reports.length,1);
});

test('服务器生图保留完整提示词；all 等待领取，失败复盘且回执重放不会重复作图',async t=>{
  const profile=await mkdtemp(join(tmpdir(),'feiyue-server-image-'));
  const db=openTestDatabase(),memory=createMemoryArchive(join(profile,'memory'));
  initializeDatabase(db.sqlite);
  let submissions=0;
  const images=createImageTasks({root:profile,profile,archive:memory.archiveImageTask,
    async runPython(_cli,args){
      if(args[0]==='wait')return {state:'failed',step:1,operation:'generate',error:'模拟 GPU 显存不足'};
      assert.equal(args[0],'submit');
      submissions++;
      return {job:args[2].replaceAll('-',''),state:'queued'};
    }});
  const dialog={async showMessageBox(){return {response:1};}};
  const request=(path,options={})=>worker.fetch(new Request('https://test.invalid'+path,{
    ...options,headers:{...options.headers,Authorization:'Bearer test'}}),{DB:db.DB,API_TOKEN:'test'});
  const tasks=await createDesktopTasks({profile,dialog,request,generateImage:images.generateServerImage});
  t.after(async()=>{await tasks.stop();images.close();db.close();await rm(profile,{recursive:true,force:true});});
  const serverTask=createServerTaskCommand({profile,tasks,dialog});
  const prompt='一个画家先画屋顶，然后把纸拿到窗前。';
  const command='服务器任务：派给 all，生图：'+prompt;
  assert.match(await serverTask(command),/没有.*模板/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,0);
  db.sqlite.exec(await readFile(new URL('../seeds/tasklist-pc.sql',import.meta.url),'utf8'));
  await assert.rejects(serverTask('服务器任务：生图：'),/图片描述/);
  const reply=await serverTask(command);
  assert.match(reply,/等待空闲电脑自动领取/);
  assert.equal(submissions,0);
  await tasks.pollOnce();await tasks.settled();await new Promise(resolve=>setTimeout(resolve,30));
  const row=db.sqlite.prepare('SELECT * FROM tasks').get();
  assert.deepEqual(JSON.parse(row.params_json),{prompt});
  assert.equal(row.status,'FAILED');
  assert.ok(reply.includes(row.task_id));
  assert.equal(submissions,1);
  assert.equal(row.result_json,null);
  assert.equal(row.error,'任务执行失败');
  const job=row.task_id.replaceAll('-','');
  const local=JSON.parse(await readFile(join(profile,'image-tasks',job+'.json'),'utf8'));
  const turn=await memory.readImageReport(tokyoDay(local.at),job);
  assert.equal(turn.report.serverTaskId,row.task_id);
  assert.match(turn.text,/第 1 步.*显存不足/);
});
