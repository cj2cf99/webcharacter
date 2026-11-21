import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openTestDatabase} from './sqlite-d1.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {personalityMemory} from './fixtures/personality-memory.mjs';
import {createOriginalFiles,maskOriginal,longSource} from '../../desktop/long-originals.mjs';
import {validateTxt,automaticLimit} from './fixtures/txt-files.mjs';

import {bucketFixture} from './txt-test-bucket.mjs';
test('同一超限报告同时检查只显示一次，显示失败后可重新提示',async t=>{
  const {sqlite,close}=openTestDatabase();t.after(close);
  let calls=0,release;
  const displayed=new Promise(resolve=>{release=resolve;});
  const files=createOriginalFiles({db:sqlite,report:async()=>{
    calls++;await displayed;if(calls===1)throw Error('测试窗口已关闭');
  }});
  files.confirm({target:'diaries/2026-11-21.1',ids:['x'],path:'test.txt',bytes:1048577,oversize:true});
  const first=files.notify('diaries'),duplicate=files.notify('diaries');
  release();
  await Promise.allSettled([first,duplicate]);
  assert.equal(calls,1);
  await files.notify('diaries');await files.notify('diaries');
  assert.equal(calls,2);
});
test('附件问答的展示文件名不计入 500 字边界，也不写进长段原文',async t=>{
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('./fixtures/personality-memory.sql',import.meta.url),'utf8'));
  const bucket=bucketFixture(),day='2026-11-21',at=Date.parse(day+'T10:00:00+09:00');
  const profile=mkdtempSync(join(tmpdir(),'txt-source-question-'));
  const short='月'.repeat(500),long=' '+('🌙'.repeat(499))+'\n';
  const turns=[short,long].map((q,i)=>({id:'file-'+i,at:at+i,state:'answer',originalQuestion:q,question:q+' · 会议附件.txt',text:'收到。'}));
  const req=(path,init)=>/\/(sources|expenses)\?/.test(path)?Response.json({records:[],complete:true}):
    personalityMemory(new Request('https://fixture'+path,init),{DB,myMainStorage:bucket},'tester');
  const store=createPersonalityDiary({profile,now:()=>at,memory:{read:async d=>d===day?turns:[],readTasks:async()=>[]},
    weather:()=>[],request:req,model:{memory:async()=>({text:'材料已读。',comment:'记下了。',summary:'看过材料。',review:'已读。',tags:'手记',mood:'平静',thread:''})}});
  t.after(()=>{store.close();close();rmSync(profile,{recursive:true,force:true});});
  await store.run('diary',new AbortController().signal);
  const path='/api/memory/diaries/'+day+'.1';
  assert.equal((await (await req(path)).json()).automaticTxt.ids.length,1);
  assert.equal(await (await req(path+'/original')).text(),'【原文 1 · 你说】\n'+long);
});
test('缓存丢失或损坏时先核对已发布全文，超限本地唯一副本不能被覆盖',async t=>{
  const {sqlite,close}=openTestDatabase(),profile=mkdtempSync(join(tmpdir(),'original-cache-'));
  t.after(()=>{close();rmSync(profile,{recursive:true,force:true});});
  let uploaded='',uploads=0,remoteReads=0;
  const request=async (path,{method,body})=>{
    if(method==='GET'){remoteReads++;return new Response(uploaded);}
    uploads++;
    const file=body.get('file');uploaded=await file.text();
    const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())).toString('hex');
    return Response.json({hash,bytes:file.size});
  };
  const files=createOriginalFiles({db:sqlite,profile,request});
  const prepare=(head,parts)=>files.prepare('diaries','2026-11-21.1','2026-11-21',head,parts);
  const a=longSource('甲'.repeat(501),'甲','a'),b=longSource('乙'.repeat(501),'乙','b');
  const first=await prepare(null,[a]);files.confirm(first.group);
  const original=uploaded;
  writeFileSync(first.group.path,'被意外改写');
  const second=await prepare(first.head,[b]);files.confirm(second.group);
  assert(uploaded.startsWith(original));assert(uploaded.endsWith(b.text));assert.equal(remoteReads,1);
  unlinkSync(second.group.path);
  const replay=await prepare(second.head,[b]);assert.deepEqual(replay.head,second.head);assert.equal(remoteReads,2);
  const large=longSource('🌙'.repeat(265000),'超限','c');
  const oversize=await prepare(second.head,[large]);files.confirm(oversize.group);
  assert.equal(uploads,2);assert(oversize.group.oversize);
  writeFileSync(oversize.group.path,'本地副本不完整');
  await assert.rejects(prepare(second.head,[b]),/本地.*原文/);
  assert.equal(uploads,2);
  const blocker=join(profile,'模拟不可写的归档目录');
  writeFileSync(blocker,'已有文件');
  const blocked=createOriginalFiles({db:sqlite,profile,memory:{folder:()=>blocker},request});
  await assert.rejects(blocked.prepare('nags','n1','2026-11-21',null,[large]));
  assert.equal(uploads,2);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM original_reports WHERE target=?').get('nags/n1').n,0);
});
test('文件、合法编码和 1 MiB 的精确边界',async()=>{
  const file=bytes=>new File([bytes],'材料.TXT');
  for(const [bytes,encoding] of [[[0xff,0xfe,0x2d,0x4e],'utf-16le'],[[0xfe,0xff,0x4e,0x2d],'utf-16be'],[[0xef,0xbb,0xbf,0x41],'utf-8']]){
    assert.equal(await validateTxt(file(Uint8Array.from(bytes))),encoding);
  }
  for(const bytes of [[0xfe,0xff,0x41],[0xc0,0x80],[0xff,0xfe,0,0],[0x41,0]]){
    await assert.rejects(validateTxt(file(Uint8Array.from(bytes))),e=>e.status===415);
  }
  await assert.rejects(validateTxt('只是字符串'),e=>e.status===400);
  await assert.rejects(validateTxt(new File(['正常'],'x.csv')),e=>e.status===400);
  assert.equal(await validateTxt(file('a'.repeat(automaticLimit)),true),'utf-8');
  await assert.rejects(validateTxt(file('a'.repeat(automaticLimit+1)),true),e=>e.status===413);
  assert.equal(await validateTxt(file('a'.repeat(automaticLimit+1))),'utf-8');
  assert.equal(longSource('🌙'.repeat(500),'问','1'),null);
  assert.equal(Array.from(longSource('🌙'.repeat(501),'问','1').preview).length,200);
  assert.equal(maskOriginal('a'.repeat(186)+' password=syntheticfixture '+'结束',200),'a'.repeat(186)+' 〔凭据略〕');
});
for(const oversize of [false,true])test('写日记真实入口 · '+(oversize?'汇总超限后成功完成并报告':'两个长段一份完整附件'),async t=>{
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('./fixtures/personality-memory.sql',import.meta.url),'utf8'));
  const myMainStorage=bucketFixture(),env={DB,myMainStorage};
  const profile=mkdtempSync(join(tmpdir(),'feiyue-original-')),reports=[];
  const day='2026-11-21',at=Date.parse(day+'T07:00:00+09:00');
  const question='头\n'+'甲'.repeat(oversize?186000:500)+'\n```\nconst x = 1;\n```\n末尾独有事实。';
  const answer='回复\n'+'乙'.repeat(oversize?186000:800)+'\n末尾。';
  let loseReceipt=!oversize,hideHead=!oversize,corruptRead=!oversize,dropObject=!oversize;
  const request=async (path,options)=>{
    if(path.includes('/sources?'))return Response.json({records:[]});
    if(path.includes('/expenses?'))return Response.json({complete:true,records:[]});
    const result=await personalityMemory(new Request('https://fixture'+path,options),env,'fixture');
    if(loseReceipt&&path==='/api/memory/diaries'&&options?.method==='POST'&&JSON.parse(options.body).txtUpdate){
      assert.equal(result.status,200);loseReceipt=false;throw Error('模拟已写入后的断线');
    }
    if(!loseReceipt&&hideHead&&path==='/api/memory/diaries/'+day+'.1'&&result.ok){
      const page=await result.json();delete page.automaticTxt;hideHead=false;return Response.json(page);
    }
    if(corruptRead&&path==='/api/memory/diaries/'+day+'.1/original'&&options?.method==='GET'){
      corruptRead=false;return new Response('临时返回的错误文件');
    }
    if(dropObject&&path==='/api/memory/diaries/'+day+'.1/original'&&options?.method==='GET'){
      dropObject=false;myMainStorage.objects.clear();return new Response(null,{status:404});
    }
    return result;
  };
  const store=createPersonalityDiary({profile,now:()=>at,memory:{read:async d=>d===day?[{id:'conversation1',state:'answer',at,question,text:answer}]:[],readTasks:async()=>[]},
    model:{async memory(text,prompt,s,signal,skill){if(skill.name==='original-summary')return {text:text.includes('末尾')?'包含末尾。':'片段概要。'};
      return {review:'已有出处。',text:'今日读过原文。',comment:'下次再读。',summary:'读过材料。',tags:'阅读',mood:'好奇',thread:''};}},
    weather:()=>[],request,reportOriginals:detail=>{assert(sqlite.prepare('SELECT 1 FROM companion_diary WHERE day=?').get(day));reports.push(detail);}});
  t.after(()=>{store.close();close();rmSync(profile,{recursive:true,force:true});});
  const run=()=>store.run('diary',new AbortController().signal);
  if(!oversize){
    await assert.rejects(run(),/模拟已写入后的断线/);
    await assert.rejects(run(),/附件.*回读/);
    await assert.rejects(run(),/附件.*回读/);
  }
  await run();
  assert.equal(dropObject,false);
  const saved=await (await request('/api/memory/diaries/'+day+'.1')).json();
  assert.equal(Array.from(saved.body.matchAll(/〔附件原文 /gu)).length,2);
  const original=await request('/api/memory/diaries/'+day+'.1/original');
  if(oversize){
    assert.equal(original.status,404);assert.equal(myMainStorage.objects.size,0);assert.equal(reports.length,1);assert.match(reports[0],/异常附件/);
    const text=readFileSync(reports[0].split('\n').at(-1),'utf8');assert(text.includes(question));assert(text.includes(answer));
  }else{
    assert.equal(original.status,200);const text=await original.text();assert(text.includes(question));assert(text.includes(answer));
    assert.equal(saved.automaticTxt.ids.length,2);assert.equal(myMainStorage.objects.size,1);
  }
  await run();
  const again=await (await request('/api/memory/diaries/'+day+'.1')).json();
  assert.equal(again.revision,saved.revision);assert.equal(reports.length,oversize?1:0);
});

test('普通唠叨的多轮追加、超限文件、重启与收笔后的报告',async t=>{
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('./fixtures/personality-memory.sql',import.meta.url),'utf8'));
  const env={DB,myMainStorage:bucketFixture()},profile=mkdtempSync(join(tmpdir(),'feiyue-nag-original-')),reports=[];
  const req=(p,o)=>personalityMemory(new Request('https://fixture'+p,o),env,'fixture');
  const signal=new AbortController().signal,at='2026-11-21T01:05:00.000Z';
  const n={id:'nag-test',revision:0,source:'paylog',source_id:'p1',source_day:'2026-11-21',created_at:at,title:'书店',reason:'付款',status:'等待回应',mood:'好奇',questions:1,talk:[{who:'绯月',text:'是哪本书？',at}]};
  const opts={profile,request:req,model:{memory:async()=>({text:'买书的经过。'})},reportOriginals:detail=>reports.push(detail)};
  let store=createPersonalityDiary(opts);
  t.after(()=>{store.close();close();rmSync(profile,{recursive:true,force:true});});
  async function add(raw){
    const text=await store.nagText(n,raw,signal);n.talk.push({who:'你',at,text});store.saveNag(n);await store.syncNags(signal);
  }
  const a='甲'.repeat(600),b='乙'.repeat(600),large='丙'.repeat(360000);
  await add(a);await add(b);
  const get=async s=>(await req('/api/memory/nags/nag-test'+s));
  const stored=await (await get('')).json();
  assert.equal(stored.automaticTxt.ids.length,2);assert(!JSON.stringify(stored).includes(a));assert(!stored.localOriginals);
  const original=await (await get('/original')).text();assert(original.includes(a)&&original.includes(b));
  const count=env.myMainStorage.objects.size;
  await add(large);
  assert.equal(env.myMainStorage.objects.size,count);assert.deepEqual(reports,[]);
  store.close();store=createPersonalityDiary(opts);
  const resumed=store.nags()[0];resumed.status='已解释';store.saveNag(resumed);await store.syncNags(signal);
  assert.equal(reports.length,1);assert.equal((await (await get('')).json()).status,'已解释');
  assert.equal(await (await get('/original')).text(),original);
  const text=readFileSync(reports[0].split('\n').at(-1),'utf8');assert(text.includes(a)&&text.includes(b)&&text.includes(large));
  await store.syncNags(signal);assert.equal(reports.length,1);
});
