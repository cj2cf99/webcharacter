import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,appendFile,rename,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';
import {requestBandao} from '../../desktop/ai-gateway.mjs';
import {setCloudTaskAudit} from '../../desktop/ai-gateway.mjs';

test('只读分页从最新行开始，追加不挤走旧行，跨块中文和轮转文件完整显示',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-log-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const log=createTaskTrafficLog(dir),archive=join(dir,'task-traffic.previous.jsonl');
  assert.deepEqual((await log.readPage()).lines,[]);
  const lines=Array.from({length:84},(_,i)=>JSON.stringify({n:i,text:'中文'.repeat(i===72?9500:2)}));
  await writeFile(log.file,lines.join('\r\n')+'\r\n');
  await writeFile(archive,'旧格式日志\n');
  const first=await log.readPage();
  assert.deepEqual(first.lines,lines.slice(-12).reverse());
  await appendFile(log.file,'后来追加的记录\n');
  const pages=[first];
  while(pages.at(-1).next)pages.push(await log.readPage(pages.at(-1).next));
  const second=pages[1];
  assert.deepEqual(pages.flatMap(page=>page.lines),[...lines].reverse().concat('旧格式日志'));
  assert.equal(pages.length,8); // 84 行每页 12 行，最后一页带上轮转文件的旧行
  await rename(log.file,archive);
  await log.write({direction:'send'});
  assert.deepEqual((await log.readPage(first.next)).lines,second.lines);
  assert.equal((await readFile(archive,'utf8')).endsWith('后来追加的记录\n'),true);
});

test('DeepSeek 任务日志可回读加密的输入、响应和总时长，并保留失败回执',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-deepseek-log-'));
  const cipherKey=randomBytes(32);
  const safeStorage={isAsyncEncryptionAvailable:async()=>true,async encryptStringAsync(value){
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cipherKey,iv);
    const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
  },async decryptStringAsync(value){
    const decipher=createDecipheriv('aes-256-gcm',cipherKey,value.subarray(0,12));
    decipher.setAuthTag(value.subarray(12,28));
    return {result:Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]).toString()};
  }};
  const logs=createTaskTrafficLog(dir,{safeStorage});
  setCloudTaskAudit(logs.beginDeepSeek);
  t.after(async()=>{setCloudTaskAudit(undefined);await rm(dir,{recursive:true,force:true});});
  const key='synthetic-deepseek-auth-token',secretNote='独立日志原文';
  const input={model:'deepseek-flash',messages:[{role:'user',content:secretNote+' '+key}]};
  const success=await requestBandao(input,{key,purpose:'对话回复',fetcher:async(url,options)=>{
    const [line]= (await logs.readPage()).lines;
    const event=JSON.parse(line);
    assert.equal(event.direction,'send');
    assert.equal(event.operation,'对话回复');
    assert.equal((await logs.readDeepSeekStep(event.ai_step_id)).status,'running');
    assert.equal(options.headers.authorization,'Bearer '+key);
    await delay(25);
    return Response.json({model:'deepseek-flash',choices:[{finish_reason:'stop',
      message:{content:'可见答复 '+key,reasoning_content:'内部思考字段'}}]});
  }});
  assert.equal(success.content,'可见答复 '+key);
  await assert.rejects(requestBandao(input,{key,purpose:'手记成稿',fetcher:async()=>{
    return Response.json({error:{message:'限流 '+key}},{status:429});
  }}),{code:'DEEPSEEK_HTTP_429'});
  await assert.rejects(requestBandao(input,{key,purpose:'公开问答',timeoutMs:10,fetcher:async(_url,{signal})=>{
    await delay(1000,undefined,{signal});
  }}),{code:'DEEPSEEK_TIMEOUT'});
  await assert.rejects(requestBandao(input,{key,purpose:'异常响应',fetcher:async()=>
    Response.json({unexpected:'无 choices 正文'})}),{code:'DEEPSEEK_RESULT_INVALID'});
  const reopened=createTaskTrafficLog(dir,{safeStorage});
  const rows=(await reopened.readPage()).lines.map(line=>JSON.parse(line));
  const receipt=purpose=>rows.find(row=>row.direction==='receive'&&row.operation===purpose);
  const successRow=receipt('对话回复'),failedRow=receipt('手记成稿'),timeoutRow=receipt('公开问答');
  assert.ok(successRow.duration_ms>=25);
  assert.equal(failedRow.error,'DEEPSEEK_HTTP_429');
  assert.equal(timeoutRow.error,'DEEPSEEK_TIMEOUT');
  const result=await reopened.readDeepSeekStep(successRow.ai_step_id);
  assert.equal(result.durationMs,successRow.duration_ms);
  assert.equal(result.input.messages[0].content,secretNote+' [已隐藏 API 密钥]');
  assert.deepEqual(result.output,{content:'可见答复 [已隐藏 API 密钥]',finishReason:'stop',model:'deepseek-flash'});
  assert.equal((await reopened.readDeepSeekStep(failedRow.ai_step_id)).output.message,'限流 [已隐藏 API 密钥]');
  assert.equal((await reopened.readDeepSeekStep(timeoutRow.ai_step_id)).output,undefined);
  assert.deepEqual((await reopened.readDeepSeekStep(receipt('异常响应').ai_step_id)).output,{unexpected:'无 choices 正文'});
  const bytes=await readFile(join(dir,'deepseek-call-snapshots',successRow.ai_step_id+'.bin'));
  assert.doesNotMatch(bytes.toString(),new RegExp(key+'|'+secretNote+'|可见答复'));
  assert.doesNotMatch(await readFile(logs.file,'utf8'),new RegExp(key+'|'+secretNote+'|可见答复'));
  assert.equal(await reopened.readDeepSeekStep('../secret'),null);
});

test('DeepSeek 日志不能加密时，在发送之前失败',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-deepseek-no-audit-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const logs=createTaskTrafficLog(dir);
  await assert.rejects(requestBandao({model:'deepseek-flash'},{key:'fixture-key',audit:logs.beginDeepSeek,
    fetcher:()=>assert.fail('不能发送无日志的请求')}),{code:'DEEPSEEK_AUDIT_FAILED'});
  assert.match((await logs.readPage()).lines[0],/DEEPSEEK_AUDIT_UNAVAILABLE/);
});

test('巡检排除已被 DeepSeek 兜底恢复的失败，保留未恢复的 DeepSeek 错误',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-inspect-fallback-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let clock=Date.parse('2026-11-28T12:00:00+09:00');
  const logs=createTaskTrafficLog(dir,{clock:()=>clock});
  const from=clock-1000;
  // 正式版历史日志只有主通道回执携带编号，兜底回执没有该字段。
  await logs.write({direction:'receive',route:'DeepSeek',operation:'diary-audit · compare',ai_step_id:'deepseek-legacy',status:502,error:'DEEPSEEK_HTTP_502'});
  clock+=3000;
  await logs.write({direction:'local',route:'DeepSeek 兜底',operation:'diary-audit · compare',primary_error:'DEEPSEEK_HTTP_502',fallback:'Gemini',result:'已兜底恢复'});
  clock+=1000;
  await logs.write({direction:'receive',route:'DeepSeek',operation:'对话转录补拟',error:'DEEPSEEK_CANCELLED'});
  const summary=await logs.inspectRecent(from,clock+1000,new AbortController().signal);
  assert.deepEqual(summary,{scanned:3,completed:0,failed:1,top:[['DEEPSEEK_CANCELLED',1]]});
});

test('巡检按 ai_step_id 精确配对，同名交错、跨窗口及无对应主错误的恢复不误抵消真实失败',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-inspect-step-id-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let clock=Date.parse('2026-11-28T12:00:00+09:00');
  const logs=createTaskTrafficLog(dir,{clock:()=>clock});
  // A 先 502，之后窗口开始，B 502；接着 A 兜底成功（带 A 的 ai_step_id），B 兜底失败
  await logs.write({direction:'receive',route:'DeepSeek',operation:'diary-audit · compare',ai_step_id:'deepseek-a',status:502,error:'DEEPSEEK_HTTP_502'});
  clock+=10_000;
  const from=clock; // 窗口起点在 A 的 502 与 B 的 502 之间
  await logs.write({direction:'receive',route:'DeepSeek',operation:'diary-audit · compare',ai_step_id:'deepseek-b',status:502,error:'DEEPSEEK_HTTP_502'});
  clock+=1000;
  await logs.write({direction:'local',route:'DeepSeek 兜底',operation:'diary-audit · compare',ai_step_id:'deepseek-a',primary_error:'DEEPSEEK_HTTP_502',fallback:'Gemini',result:'已兜底恢复'});
  clock+=1000;
  await logs.write({direction:'local',route:'DeepSeek 兜底',operation:'diary-audit · compare',primary_error:'DEEPSEEK_HTTP_502',error:'DEEPSEEK_FALLBACK_FAILED',result:'兜底失败'});
  // 另有真实 RESULT_INVALID。调用方校验失败产生的恢复明确标记为 null，不能抵消前者。
  clock+=1000;
  await logs.write({direction:'receive',route:'DeepSeek',operation:'initiative-decision · propose',ai_step_id:'deepseek-c',status:200,error:'DEEPSEEK_RESULT_INVALID'});
  clock+=1000;
  await logs.write({direction:'local',route:'DeepSeek 兜底',operation:'initiative-decision · propose',ai_step_id:null,primary_error:'DEEPSEEK_RESULT_INVALID',fallback:'Gemini',result:'已兜底恢复'});
  const summary=await logs.inspectRecent(from,clock+1000,new AbortController().signal);
  assert.deepEqual({scanned:summary.scanned,completed:summary.completed,failed:summary.failed},{scanned:5,completed:0,failed:3});
  assert.deepEqual(Object.fromEntries(summary.top),{DEEPSEEK_HTTP_502:1,DEEPSEEK_FALLBACK_FAILED:1,DEEPSEEK_RESULT_INVALID:1});
});

test('旧版无编号恢复遇到同名交错请求时保留未能确认归属的失败',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'feiyue-inspect-legacy-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let clock=Date.parse('2026-11-29T00:00:00+09:00')-10_000;
  const logs=createTaskTrafficLog(dir,{clock:()=>clock});
  const main={direction:'receive',route:'DeepSeek',operation:'转录补拟',error:'DEEPSEEK_HTTP_502'};
  await logs.write({...main,ai_step_id:'deepseek-legacy-a'});
  clock+=10_000;
  const from=clock;
  await logs.write({...main,ai_step_id:'deepseek-legacy-b'});
  clock+=1_000;
  await logs.write({direction:'local',route:'DeepSeek 兜底',operation:main.operation,primary_error:main.error,result:'已兜底恢复'});
  const summary=await logs.inspectRecent(from,clock+1_000,AbortSignal.timeout(2_000));
  assert.deepEqual(summary,{scanned:2,completed:0,failed:1,top:[['DEEPSEEK_HTTP_502',1]]});
});
