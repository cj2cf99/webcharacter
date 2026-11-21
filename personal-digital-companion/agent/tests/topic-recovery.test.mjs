import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTopicMemory} from '../../desktop/topic-memory.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'feiyue-backups-')),dir=join(root,'专题记忆');
  const open=()=>createTopicMemory({profile:root,memory:{root,archiveDays:async()=>[]}});
  let topics=open();const signal=new AbortController().signal;
  t.after(async()=>{await topics.close();await rm(root,{recursive:true,force:true});});
  const row=await topics.remember('救助翠鸟','chat/origin'),file=join(dir,row.id+'.md');
  async function reopen(){await topics.close();topics=open();await topics.ready;return topics;}
  async function saved(){const text=await readFile(file,'utf8');return JSON.parse(text.split('\n')[0].slice(5,-4));}
  return {dir,file,id:row.id,topics,reopen,saved,signal};
}

test('每个专题最多三版，跳过坏备份，主件缺失也按原编号恢复',async t=>{
  const f=await fixture(t);
  for(let n=1;n<=5;n++)await f.topics.queueCheck(f.id,'round'+n);
  const backups=(await readdir(f.dir)).filter(name=>name.includes('.bak')).sort();
  assert.equal(backups.length,3);
  const revisions=await Promise.all(backups.map(async name=>JSON.parse((await readFile(join(f.dir,name),'utf8')).split('\n')[0].slice(5,-4)).revision));
  assert.deepEqual(revisions,[5,4,3]);
  await unlink(f.file);await writeFile(f.file+'.bak1','坏');
  const restored=await f.reopen();assert.equal((await f.saved()).round,'round3');assert.equal((await f.saved()).id,f.id);
  await restored.queueCheck(f.id,'after-recovery');assert.ok((await f.saved()).revision>6);
});

test('旧格式可打开并获得首份备份；正文可用完整元数据修复',async t=>{
  const f=await fixture(t),data=await f.saved();
  const old='<!-- '+JSON.stringify(data)+' -->\n# '+data.title+'\n\n待确认\n\n';
  await writeFile(f.file,old);await unlink(f.file+'.bak1');await f.reopen();
  assert.equal(await readFile(f.file+'.bak1','utf8'),old);
  await writeFile(f.file,old.split('\n')[0]+'\n撕裂的正文');await writeFile(f.file+'.bak1','坏');
  const topics=await f.reopen();assert.match(await readFile(f.file,'utf8'),/# 救助翠鸟/);
  assert.equal((await f.saved()).revision,data.revision);await topics.offerRecoveryHelp(()=>assert.fail());
});

test('仅剩可读正文和来源时抢救为本机旧摘记，重新查证',async t=>{
  const f=await fixture(t);await writeFile(f.file,'坏头\n# 救助翠鸟\n\n旧结论\n\n- 真实线索（task/A）\n');
  await writeFile(f.file+'.bak1','坏');const topics=await f.reopen();
  const d=await f.saved();assert.equal(d.status,'pending');assert.ok(d.queued);assert.match(d.salvagedText,/真实线索/);
  assert.deepEqual(topics.facts('2026-11-21'),[]);await topics.offerRecoveryHelp(()=>assert.fail());
});

test('四份全坏保留一个原始坏样本，只重建本专题；求助、回复和取消跨重启去重',async t=>{
  const f=await fixture(t);await f.topics.remember('健康专题');
  const bytes=Buffer.from([0,255,10,13,100]);
  for(const ext of ['','.bak1','.bak2','.bak3'])await writeFile(f.file+ext,bytes);
  let topics=await f.reopen(),d=await f.saved();
  assert.deepEqual(await readFile(f.file+'.bad'),bytes);
  assert.deepEqual((await readdir(f.dir)).filter(n=>n.startsWith(f.id+'.md.')),[f.id+'.md.bad']);
  assert.equal(d.title,'救助翠鸟');assert.deepEqual(d.evidence,[]);assert.equal(d.recoveryHelp,'pending');
  assert.ok(topics.pending().some(x=>x.title==='健康专题'));
  const gate=Promise.withResolvers();let asked=0;
  const ask=async prompt=>{asked++;assert.match(prompt,/救助翠鸟/);return gate.promise;};
  const a=topics.offerRecoveryHelp(ask),b=topics.offerRecoveryHelp(ask);
  gate.resolve({action:'submit',text:'旧照片拍在河边'});await Promise.all([a,b]);assert.equal(asked,1);
  topics=await f.reopen();await topics.offerRecoveryHelp(()=>assert.fail());d=await f.saved();
  assert.equal(d.evidence[0].text,'旧照片拍在河边');assert.equal(d.queued,true);assert.equal(d.recoveryHelp,'answered');
  for(let i=0;i<5;i++)await topics.queueCheck(f.id,'r'+i);
  assert.equal((await readdir(f.dir)).filter(n=>n.startsWith(f.id+'.md.')).length,3);
  for(const ext of ['','.bak1','.bak2'])await writeFile(f.file+ext,'坏');
  topics=await f.reopen();await topics.offerRecoveryHelp(async()=>({action:'cancel'}));
  topics=await f.reopen();await topics.offerRecoveryHelp(()=>assert.fail());assert.equal((await f.saved()).recoveryHelp,'dismissed');
});

test('目录也损坏时等待用户辨认，用答复找回名称后进入原专题核查队列',async t=>{
  const f=await fixture(t);
  for(const path of [f.file,f.file+'.bak1',join(f.dir,'目录.md')])await writeFile(path,'坏');
  const topics=await f.reopen();assert.deepEqual(topics.pending(),[]);
  await topics.offerRecoveryHelp(async prompt=>{assert.ok(prompt.includes(f.id.slice(0,8)));return {action:'submit',text:'救助翠鸟'};});
  await topics.runQueued(f.signal);
  const d=await f.saved();assert.equal(d.title,'救助翠鸟');assert.equal(d.id,f.id);assert.equal(d.tries,1);
});
