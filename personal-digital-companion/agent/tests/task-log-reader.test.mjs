import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,appendFile,rename,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';

test('只读分页从最新行开始，追加不挤走旧行，跨块中文和轮转文件完整显示',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-log-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const log=createTaskTrafficLog(dir),archive=join(dir,'task-traffic.previous.jsonl');
  assert.deepEqual((await log.readPage()).lines,[]);
  const lines=Array.from({length:84},(_,i)=>JSON.stringify({n:i,text:'中文'.repeat(i===72?9500:2)}));
  await writeFile(log.file,lines.join('\r\n')+'\r\n');
  await writeFile(archive,'旧格式日志\n');
  const first=await log.readPage();
  assert.deepEqual(first.lines,lines.slice(-40).reverse());
  await appendFile(log.file,'后来追加的记录\n');
  const second=await log.readPage(first.next),third=await log.readPage(second.next),fourth=await log.readPage(third.next);
  assert.deepEqual([...first.lines,...second.lines,...third.lines,...fourth.lines],[...lines].reverse().concat('旧格式日志'));
  assert.equal(fourth.next,null);
  await rename(log.file,archive);
  await log.write({direction:'send'});
  assert.deepEqual((await log.readPage(first.next)).lines,second.lines);
  assert.equal((await readFile(archive,'utf8')).endsWith('后来追加的记录\n'),true);
});
