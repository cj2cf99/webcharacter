import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPrompt,classify,createCardDraw,fileName,usageCost,HD_PROMPT} from '../../desktop/card-draw.mjs';

const wordsFile=resolve(fileURLToPath(import.meta.url),'../../../desktop/card-draw-words.json');
const words=JSON.parse(readFileSync(wordsFile,'utf8'));
const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('sample')]);
const dataURL='data:image/png;base64,'+png.toString('base64');
const ok=()=>Response.json({data:[{b64_json:png.toString('base64')}],usage:{input_tokens:1100,input_tokens_details:{text_tokens:100,image_tokens:1000},output_tokens:200}});
const fail=(status,error={})=>Response.json({error},{status});

function setup(t,{respond=ok,stored='',root=mkdtempSync(join(tmpdir(),'card-draw-'))}={}){
  const env={root,clock:Date.parse('2026-11-28T12:00:00Z'),calls:[],notices:[],logs:[],trashed:[],key:stored,saves:0,respond};
  env.open=()=>createCardDraw({dataDir:join(root,'data'),pictureRoot:join(root,'pictures'),wordsFile,
    keyStore:{load:()=>env.key,save:value=>{env.key=value;env.saves++;return true;},clear:()=>{env.key='';}},
    trash:async file=>{env.trashed.push(file);rmSync(file);},
    fetcher:async(url,options)=>{env.calls.push({url,options,body:JSON.parse(options.body)});return env.respond(env.calls.length,url,options);},
    now:()=>env.clock,random:()=>0,onNotice:text=>env.notices.push(text),log:row=>env.logs.push(row)});
  env.draw=env.open();
  env.act=(type,args)=>env.draw.action(type,args);
  env.round=async(ms=60_000)=>{env.clock+=ms;await env.draw.tick();return env.draw.idle;};
  env.cards=()=>{try{return readdirSync(join(root,'pictures','抽卡')).sort();}catch{return [];}};
  env.hd=()=>{try{return readdirSync(join(root,'pictures','高清')).sort();}catch{return [];}};
  env.state=()=>JSON.parse(readFileSync(join(root,'data','state.json'),'utf8'));
  t.after(()=>{env.draw.close();rmSync(root,{recursive:true,force:true});});
  return env;
}
const ready=(env,key='test-key')=>{env.act('setKey',key);env.act('power',true);};

test('提示词按已填内容自适应',()=>{
  const none=buildPrompt({refs:[],prompt:'',words,random:()=>0});
  for(const label of ['人物：','服装：','动作：','画风：'])assert.ok(none.includes(label),label);
  const text=buildPrompt({refs:[],prompt:'雨夜的猫',words,random:()=>0});
  assert.ok(text.includes('补充要求：雨夜的猫')&&!text.includes('人物：')&&text.includes('画风：'));
  const some=buildPrompt({refs:['who','act'],prompt:'',words,random:()=>0});
  assert.ok(some.includes('第1张参考图是人物')&&some.includes('第2张参考图是动作'));
  assert.ok(some.includes('服装：')&&!some.includes('人物：')&&!some.includes('动作：'));
  assert.ok(!buildPrompt({refs:['wear'],prompt:'街头',words,random:()=>0}).includes('动作：'));
  assert.throws(()=>buildPrompt({refs:[],prompt:'',words:{},random:()=>0}),/词库缺少/);
  for(const key of ['who','wear','act','style','frame','light'])assert.ok(words[key].length>=12,key);
});

test('花费、错误归类与东京时间文件名',()=>{
  assert.equal(usageCost({input_tokens:1100,input_tokens_details:{text_tokens:100,image_tokens:1000},output_tokens:200}),(500+8000+6000)/1e6);
  assert.equal(usageCost({input_tokens:100,output_tokens:0}),800/1e6);
  assert.equal(usageCost(undefined),0);
  assert.equal(classify(401),'auth');assert.equal(classify(403),'forbidden');
  assert.equal(classify(429,{type:'insufficient_quota'}),'quota');
  assert.equal(classify(429,{code:'credit_balance_exhausted'}),'quota');
  assert.equal(classify(429,{code:'slow_down'}),'other');
  assert.equal(classify(400,{code:'moderation_blocked'}),'other');
  assert.equal(fileName(Date.parse('2026-11-27T15:30:05.007Z')),'20261128-003005-007.png');
});

test('没有密钥或开关关闭时不请求，每 60 秒一张',async t=>{
  const env=setup(t);
  env.act('power',true);await env.round();assert.equal(env.calls.length,0);
  env.act('power',false);env.act('setKey','test-key');await env.round();assert.equal(env.calls.length,0);
  assert.ok(!existsSync(join(env.root,'pictures')),'没出图前不建图片目录');
  env.act('power',true);await env.round(0);assert.equal(env.calls.length,1);
  assert.equal(env.calls[0].url,'https://api.openai.com/v1/images/generations');
  const {body}=env.calls[0];
  assert.deepEqual([body.model,body.size,body.quality,body.n],['gpt-image-2.6-flare','1024x1024','low',1]);
  assert.equal(env.calls[0].options.headers.Authorization,'Bearer test-key');
  await env.round(59_000);assert.equal(env.calls.length,1);
  await env.round(1000);assert.equal(env.calls.length,2);
  assert.equal(env.cards().length,2);
});

test('启动后先等一轮；有参考图走改图接口并按顺序发送',async t=>{
  const env=setup(t,{stored:'saved-key'});
  env.act('setRef',{slot:'act',data:dataURL});env.act('setRef',{slot:'who',data:dataURL});
  env.act('power',true);
  await env.round(30_000);assert.equal(env.calls.length,0);
  await env.round(30_000);
  assert.equal(env.calls[0].url,'https://api.openai.com/v1/images/edits');
  assert.equal(env.calls[0].body.images.length,2);
  assert.ok(env.calls[0].body.images[0].image_url.startsWith('data:image/png;base64,'));
  assert.match(env.calls[0].body.prompt,/第1张参考图是人物[\s\S]*第2张参考图是动作/);
  assert.ok(env.act('state').refs.who.includes('?v='));
  env.act('setRef',{slot:'who',data:null});assert.equal(env.act('state').refs.who,null);
  assert.throws(()=>env.act('setRef',{slot:'who',data:'data:image/png;base64,YWJj'}),/图片无效/);
  assert.throws(()=>env.act('setRef',{slot:'../x',data:dataURL}),/图片槽无效/);
});

test('第一次成功后才保存密钥，状态和日志里没有密钥',async t=>{
  const env=setup(t,{respond:n=>n===1?fail(500,{message:'boom'}):ok()});
  ready(env,'secret-123');
  await env.round();assert.equal(env.calls.length,1);assert.equal(env.saves,0);assert.equal(env.act('state').key,'pending');
  await env.round();assert.equal(env.saves,1);assert.equal(env.key,'secret-123');assert.equal(env.act('state').key,'saved');
  await env.round();assert.equal(env.saves,1);
  assert.ok(!JSON.stringify([env.state(),env.logs,env.act('state'),env.notices]).includes('secret-123'));
  assert.throws(()=>env.act('setKey','带 空格'),/格式无效/);
});

test('勾选后 5 秒内可撤回；高清优先于抽卡且不并发；完成后不重复',async t=>{
  const env=setup(t,{stored:'k'});
  env.act('power',true);await env.round();await env.round();await env.round();
  const [a,b,c]=env.cards();
  env.act('pick',{name:a,on:true});env.act('pick',{name:a,on:false});
  assert.equal(env.state().marks[a],undefined);
  env.act('pick',{name:b,on:true});env.clock+=100;env.act('pick',{name:c,on:true});
  const before=env.calls.length;
  await env.round();
  assert.equal(env.calls.length,before+1);
  const {body,url}=env.calls.at(-1);
  assert.equal(url,'https://api.openai.com/v1/images/edits');
  assert.deepEqual([body.model,body.size,body.quality,body.prompt,body.images.length],['gpt-image-2.6-sunburst','2048x2048','high',HD_PROMPT,1]);
  assert.equal(env.state().marks[b].st,'done');assert.equal(env.state().marks[c].st,'queued');
  await env.round();assert.equal(env.state().marks[c].st,'done');
  assert.equal(env.hd().length,2);assert.equal(env.cards().length,3);
  await env.round();assert.equal(env.cards().length,4,'高清做完回到抽卡');
  env.act('pick',{name:b,on:false});assert.deepEqual(env.state().marks[b].sel,false);
  env.act('pick',{name:b,on:true});assert.equal(env.state().marks[b].st,'done');
  assert.ok(env.notices.includes('高清完成'));
});

test('开关关闭时高清照常；撤回期内不发；请求在途时不开下一轮',async t=>{
  let release;
  const env=setup(t,{stored:'k'});
  env.act('power',true);await env.round();env.act('power',false);
  const [name]=env.cards();
  await env.round();assert.equal(env.calls.length,1);
  env.act('pick',{name,on:true});
  await env.round(4000);assert.equal(env.calls.length,1);
  env.respond=()=>new Promise(r=>{release=()=>r(ok());});
  env.clock+=60_000;const job=env.draw.tick();
  assert.equal(env.draw.busy,'hd');assert.equal(env.state().marks[name].st,'running');
  env.act('pick',{name,on:false});assert.equal(env.state().marks[name].sel,true,'生成中不可取消');
  env.clock+=120_000;assert.equal(env.draw.tick(),null);assert.equal(env.calls.length,2);
  release();await job;assert.equal(env.state().marks[name].st,'done');
});

test('认证、权限、额度错误立即暂停；401 删除密钥',async t=>{
  const env=setup(t,{stored:'sk-live-abcdef',respond:()=>fail(401,{message:'Incorrect API key provided: sk-live-***cdef.'})});
  env.act('power',true);await env.round();
  let s=env.act('state');assert.match(s.paused,/密钥无效/);assert.equal(s.on,false);assert.equal(s.key,'none');assert.equal(env.key,'');
  assert.ok(!/sk-live/.test(JSON.stringify([env.logs,s,env.state(),env.notices])),'报错里的密钥片段要打码');
  env.act('setKey','k2');env.act('resume');assert.equal(env.act('state').on,true,'继续后恢复开关');
  env.respond=()=>fail(429,{type:'insufficient_quota',code:'credit_balance_exhausted'});
  await env.round();assert.match(env.act('state').paused,/额度不足/);
  await env.round();assert.equal(env.calls.length,2,'暂停时不请求');
  env.act('resume');env.respond=()=>fail(403,{message:'verify organization'});
  await env.round();assert.match(env.act('state').paused,/无权限.*verify organization/);
});

test('其他失败连续 3 次暂停，成功清零，重试解除暂停',async t=>{
  const env=setup(t,{stored:'k'});
  env.act('power',true);await env.round();
  const [name]=env.cards();
  env.respond=()=>fail(400,{code:'moderation_blocked',message:'blocked'});
  await env.round();await env.round();assert.equal(env.act('state').paused,'');
  env.respond=ok;await env.round();
  env.respond=()=>{throw Error('network down');};
  env.act('pick',{name,on:true});
  await env.round();assert.equal(env.state().marks[name].st,'fail');
  await env.round();assert.equal(env.act('state').paused,'');
  await env.round();assert.match(env.act('state').paused,/连续失败 3 次：network down/);
  env.respond=()=>Response.json({data:[]});
  env.act('retry',name);assert.equal(env.act('state').paused,'');assert.equal(env.act('state').on,true);
  await env.round();assert.equal(env.state().marks[name].st,'fail');assert.match(env.logs.at(-1).error,/没有返回图片/);
});

test('重启后保留输入、开关和花费，在途高清记为失败',async t=>{
  const env=setup(t,{stored:'k'});
  env.act('setPrompt','  雨夜  ');env.act('power',true);await env.round();
  const [name]=env.cards();env.act('pick',{name,on:true});
  env.respond=(_n,_url,options)=>new Promise((_r,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason)));
  env.clock+=60_000;const job=env.draw.tick();
  const total=env.act('state').total;assert.ok(total>0);
  env.draw.close();await job;
  assert.equal(env.state().marks[name].st,'running');
  env.respond=ok;env.draw=env.open();
  const s=env.act('state');
  assert.deepEqual([s.prompt,s.on,s.total,s.session],['雨夜',true,total,0]);
  assert.equal(env.act('list',{kind:'cards'}).items[0].st,'fail');
  const calls=env.calls.length;await env.round();
  assert.equal(env.calls.length,calls+1);assert.equal(env.calls.at(-1).body.model,'gpt-image-2.6-flare','失败的高清不自动重发');
});

test('列表分页固定上界；清理只动清点到且仍未勾选的卡',async t=>{
  const env=setup(t,{stored:'k'});
  env.act('power',true);for(let i=0;i<23;i++)await env.round();
  const first=env.act('list',{kind:'cards'});
  assert.deepEqual([first.items.length,first.pages,first.fresh],[20,2,0]);
  assert.match(first.items[0].time,/\+09:00$/);
  const unchecked=env.act('unchecked');assert.equal(unchecked.length,23);
  env.act('pick',{name:unchecked[0],on:true});
  await env.round(); // 高清
  await env.round(); // 新卡
  const again=env.act('list',{kind:'cards',page:1,top:first.top});
  assert.deepEqual([again.items.length,again.fresh],[3,1]);
  const result=await env.act('clean',unchecked);
  assert.deepEqual(result,{moved:22,failed:0});
  assert.equal(env.cards().length,2,'勾选的和清点后新增的保留');
  assert.equal(env.hd().length,1);
  await assert.rejects(env.act('clean',['../../x.png']),/文件名无效/);
  assert.throws(()=>env.act('pick',{name:'a.png',on:true}),/文件名无效/);
  assert.throws(()=>env.act('constructor'),/未知操作/);
});

test('状态文件损坏时改名保留并提示；图片目录缺失不丢勾选',async t=>{
  const root=mkdtempSync(join(tmpdir(),'card-draw-bad-'));
  mkdirSync(join(root,'data'),{recursive:true});writeFileSync(join(root,'data','state.json'),'{bad');
  const env=setup(t,{root});
  assert.match(env.act('state').notice,/状态文件损坏/);
  assert.ok(readdirSync(join(root,'data')).some(name=>name.startsWith('state.json.bad-')));
  env.draw.close();
  writeFileSync(join(root,'data','state.json'),JSON.stringify({marks:{'20261128-000000-000.png':{sel:true,st:'done'}}}));
  env.draw=env.open();env.act('setPrompt','x');
  assert.equal(env.state().marks['20261128-000000-000.png'].sel,true);
});
