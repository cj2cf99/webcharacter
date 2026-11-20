// 隔离的 Worker/SQLite 与桌面 IPC，显式 --live 才执行一次本机 ComfyUI。
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import worker from '../agent/worker.mjs';
import {openTestDatabase,initializeDatabase} from '../agent/tests/sqlite-d1.mjs';
import {fixture} from '../agent/tests/screen-question-fixture.mjs';
import {createMemoryArchive} from '../desktop/memory-archive.mjs';
import {createServerTaskCommand} from '../desktop/server-task-command.mjs';
import {createDesktopTasks} from '../desktop/task-lifecycle.mjs';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {hasLocalImageBackend} from '../desktop/image-tasks.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';

if(!process.argv.includes('--live'))throw Error('请使用 --live 运行真实本机生图验证');
const root=fileURLToPath(new URL('../',import.meta.url));
assert.equal(await hasLocalImageBackend(root),true,'当前电脑需要已配置的 ComfyUI 后端');
const output=join(root,'../work/server-image-qa');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(output,'run-'));
const memory=createMemoryArchive(join(profile,'archive')),db=openTestDatabase(),f=fixture();
initializeDatabase(db.sqlite);
db.sqlite.exec(await readFile(join(root,'agent/seeds/tasklist-pc.sql'),'utf8'));
const prompt='一只橘猫坐在雨后的窗台上，水彩插画，柔和的晨光';
const requests=[];
async function request(path,options={}){
  requests.push({path,body:options.body});
  return worker.fetch(new Request('https://test.invalid'+path,{...options,headers:{...options.headers,Authorization:'Bearer test'}}),
    {DB:db.DB,API_TOKEN:'test'});
}
let confirmed=false;
const dialog={async showMessageBox(options){
  if(!options.detail?.includes('pc.image.generate'))return {response:0};
  assert.ok(options.detail.includes(prompt));return {response:confirmed?1:0};
}};
let host;
const tasks=await createDesktopTasks({profile,memory,dialog,request,generateImage:(p,id)=>host.generateServerImage(p,id)});
try{
  db.sqlite.prepare('INSERT INTO devices VALUES (?,?,NULL,?)').run(tasks.identity.device_id,'生图联调',new Date().toISOString());
  const serverTask=createServerTaskCommand({profile,tasks,dialog});
  host=attachScreenQuestion(f.electron,{root,profile,bundle:profile,win:f.win,history:f.history,memory,serverTask});
  await host.open();
  const ask=text=>f.handlers.get('screen-qa:ask')(f.event(host.panel),{text});
  assert.match((await ask('服务器任务：列表')).text,/pc\.image\.generate/u);
  const command='服务器任务：生图：'+prompt;
  assert.match((await ask(command)).text,/已取消/u);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM tasks').get().n,0);
  confirmed=true;
  const reply=await ask(command);
  const task=db.sqlite.prepare('SELECT * FROM tasks').get();
  assert.equal(task.type,'pc.image.generate');
  assert.deepEqual(JSON.parse(task.params_json),{prompt});
  assert.ok(reply.text.includes(task.task_id));
  console.log(reply.text);
  const deadline=Date.now()+11*60_000;
  let row;
  do{
    row=db.sqlite.prepare('SELECT * FROM tasks WHERE task_id=?').get(task.task_id);
    if(['FAILED','COMPLETED'].includes(row.status))break;
    await delay(400);
  }while(Date.now()<deadline);
  assert.equal(row.status,'COMPLETED',JSON.stringify({state:row.status,error:row.error,profile}));
  const result=JSON.parse(row.result_json);
  assert.deepEqual(result,{job_id:task.task_id.replaceAll('-',''),format:'PNG',width:512,height:512,archived:true});
  const local=JSON.parse(await readFile(join(profile,'image-tasks',result.job_id+'.json'),'utf8'));
  const turn=await memory.readImageReport(tokyoDay(local.at),result.job_id);
  assert.equal(turn.report.serverTaskId,task.task_id);
  const bytes=await readFile(local.archivedOutput);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),result.width);
  assert.equal(bytes.readUInt32BE(20),result.height);
  assert.deepEqual(await host.generateServerImage(prompt,task.task_id),result);
  assert.equal(row.attempt_count,1);
  assert.ok(!requests.some(r=>r.body?.includes('base64')||r.body?.includes(profile)));
  console.log(JSON.stringify({task:task.task_id,status:row.status,result,archive:local.archivedOutput,bytes:bytes.length}));
}finally{await tasks.stop();host?.close();db.close();}
