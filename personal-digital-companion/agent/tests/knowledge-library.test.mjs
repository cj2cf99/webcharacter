import assert from 'node:assert/strict';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {createKnowledgeStore} from '../../desktop/knowledge-store.mjs';
import {createKnowledgeBackups,knowledgePeriods} from '../../desktop/knowledge-backups.mjs';
import {createKnowledgeRuntime,explicitKnowledgeRule} from '../../desktop/knowledge-runtime.mjs';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createThreadReplies} from '../../desktop/conversation-thread-replies.mjs';

const positive={title:'月报存放',aliases:['未定稿报告'],definition:'月报是月度报告',cases:[{when:'未定稿',do:'放草稿区'}]};
const privateText='合成知识隐私见证_6b1e52ed';
const negative={title:'先放一下',aliases:[privateText],condition:'先放一下',mistake:'立即归档',
  reason:'仍未定稿',instead:'保留草稿',exceptions:[{when:'已定稿且明确确认',do:'走原归档确认'}]};
const counter=(source,point='未定稿报告放哪',extra={})=>({kind:'positive',source,point,title:point,evidence:'未定稿报告是什么时候归档的？',...extra});
const noAnswer={state:'continue',cards:'',group:'',point:'',title:'',answer:'',evidence:'',condition:'',linked:'',mistake:''};
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'feiyue-knowledge-'));
  const stores=[];
  t.after(()=>{for(const store of stores.reverse())store.close();rmSync(root,{recursive:true,force:true});});
  function profile(name,now){
    const path=join(root,name);mkdirSync(path);
    const store=createKnowledgeStore(path,now);stores.push(store);
    return {path,store,backups:createKnowledgeBackups(path,store,now)};
  }
  return {root,profile,stores};
}

test('两库分开计数，原事件跨重启过三次只建一张草稿，拆组会重算',t=>{
  const {profile}=fixture(t),{path,store}=profile('origin');
  const p=store.record(counter('a'));
  store.record(counter('b'));
  const n=store.record({...counter('a'),kind:'negative'});
  assert.notEqual(p.id,n.id);
  store.close();
  const reopened=createKnowledgeStore(path);
  try{
    assert.equal(reopened.record(counter('c')).state,'pending');
    assert.equal(reopened.record(counter('c','换种说法',{groupId:p.id})).count,3);
    assert.equal(reopened.record(counter('d')).count,4);
    assert.equal(reopened.items({view:'pending'}).rows.length,1);
    const detail=reopened.detail(p.id,true);
    const {original,separated}=reopened.split({id:p.id,revision:detail.revision,title:'不同问题',
      instanceIds:detail.instances.slice(0,2).map(row=>row.id)});
    assert.equal(original.state,'collecting');
    assert.equal(separated.count,2);
    assert.equal(reopened.items({view:'pending'}).rows.length,0);
    assert.equal(reopened.record(counter('e')).count,3);
  }finally{reopened.close();}
});

test('结清选定缺口，保留另一个缺口的次数和旧基线',t=>{
  const {store}=fixture(t).profile('origin');
  const card=store.saveCard({kind:'positive',body:positive});
  const first=store.record(counter('a','哪时归档',{cardId:card.id}));
  const second=store.record(counter('b','草稿如何命名',{cardId:card.id}));
  store.record(counter('c','草稿如何命名',{cardId:card.id}));
  const edited=store.saveCard({id:card.id,revision:1,kind:'positive',body:positive,resolved:[first.id]});
  assert.equal(edited.revision,2);
  assert.equal(store.detail(first.id,true).state,'closed');
  assert.equal(store.record(counter('d','草稿如何命名',{cardId:card.id})).count,3);
  const draft=store.detail(second.id,true);
  assert.throws(()=>store.saveGroup({id:second.id,revision:draft.revision,body:positive,confirm:true}),/当前条目/u);
  assert.equal(store.saveGroup({id:second.id,revision:draft.revision,body:positive,confirm:true,useCurrent:true}).revision,3);
});

test('打开和写入均只用独立密钥，复制到新资料目录后恢复整库',t=>{
  const {root,profile}=fixture(t);
  const now=()=>Date.parse('2026-11-23T01:30:00+09:00');
  const origin=profile('first',now),newMachine=profile('second',now);
  const positiveCard=origin.store.saveCard({kind:'positive',body:positive});
  const rule=origin.store.saveCard({kind:'negative',body:{...negative,related:positiveCard.id}});
  const gap=origin.store.record(counter('a'));
  origin.store.record(counter('b'));
  origin.backups.rotate();
  const backup=origin.backups.list().find(row=>row.kind==='month');
  assert.equal(backup.counts.instances,2);
  const exported=join(root,'archive.sqlite'),key=join(root,'feiyue-knowledge.key'),wrongKey=join(root,'other.key');
  origin.backups.exportSnapshot(backup.name,exported);
  origin.store.keyring.exportKey(origin.store.currentKey(),key);
  for(const file of [origin.store.file,exported])assert(!readFileSync(file).includes(Buffer.from(privateText)));
  assert.equal(readFileSync(key).length,32);
  assert.throws(()=>newMachine.backups.previewFile(exported),/缺少匹配/u);
  writeFileSync(wrongKey,Buffer.alloc(32,2));
  newMachine.store.importKey(wrongKey);
  const empty=newMachine.store.currentKey();
  assert.throws(()=>newMachine.backups.previewFile(exported),/不匹配/u);
  newMachine.store.importKey(key);
  const preview=newMachine.backups.previewFile(exported);
  assert.equal(preview.difference.instances,2);
  const receipt=newMachine.backups.restore(preview.token);
  assert(receipt.healthy);
  assert.notEqual(newMachine.store.currentKey(),empty);
  assert.equal(newMachine.store.detail(rule.id).related.id,positiveCard.id);
  assert.equal(newMachine.store.items({view:'negative',query:privateText}).rows[0].id,rule.id);
  assert.equal(newMachine.store.record(counter('c')).count,3);
  assert.equal(newMachine.store.detail(gap.id,true).state,'pending');
  assert.throws(()=>newMachine.store.importKey(wrongKey),/原密钥已保留/u);
  assert.equal(newMachine.store.detail(rule.id).related.id,positiveCard.id);
  assert.throws(()=>origin.store.keyring.exportKey(origin.store.currentKey(),key),{code:'EEXIST'});
});

test('丢失密钥、记录篡改和损坏备份均停止，损坏现库可以保全后恢复',t=>{
  const {root,profile}=fixture(t),{store,backups,path}=profile('origin');
  store.saveCard({kind:'positive',body:positive});
  store.saveCard({kind:'negative',body:negative});
  backups.rotate();
  const good=backups.list()[0],key=join(root,'saved.key');
  store.keyring.exportKey(good.counts.keyId,key);
  const moved=join(path,'knowledge.key');
  store.close();rmSync(moved);
  assert.throws(()=>store.items({view:'positive'}),/缺少匹配/u);
  assert.throws(()=>backups.preview(good.name),/缺少匹配/u);
  assert(!existsSync(moved));
  store.importKey(key,backups.protectedKey());
  const bad=join(root,'bad.sqlite');
  backups.exportSnapshot(good.name,bad);
  const corrupt=new DatabaseSync(bad);
  corrupt.exec("UPDATE cards SET body=randomblob(length(body)) WHERE kind='negative'");
  corrupt.close();
  assert.throws(()=>backups.previewFile(bad),/完整性校验/u);
  const substitute=join(root,'substitute.sqlite');
  copyFileSync(bad,substitute);
  writeFileSync(substitute,Buffer.from('broken'));
  assert.throws(()=>backups.previewFile(substitute));
  store.close();
  writeFileSync(store.file,Buffer.from('故障原件'));
  const prepared=backups.preview(good.name);
  assert.equal(prepared.current,null);
  const restored=backups.restore(prepared.token);
  assert.equal(restored.healthy,false);
  assert.equal(readFileSync(join(path,'knowledge-backups',restored.original,'original-knowledge.sqlite'),'utf8'),'故障原件');
  assert.equal(store.items({view:'positive'}).rows.length,1);
});

test('读取已有知识库时采用原密钥，自动建立单一密钥文件',t=>{
  const {path,store}=fixture(t).profile('legacy');
  const row=store.saveCard({kind:'positive',body:positive}),id=store.currentKey();
  store.close();
  const oldKey=join(path,'knowledge-keys');
  mkdirSync(oldKey);
  renameSync(join(path,'knowledge.key'),join(oldKey,id+'.key'));
  assert.equal(store.detail(row.id).body.title,positive.title);
  assert.equal(store.currentKey(),id);
  assert(readFileSync(join(path,'knowledge.key')).equals(readFileSync(join(oldKey,id+'.key'))));
});

test('东京自然周月各保留一份，同一快照只显示一次，缺现库不会建空库',t=>{
  let stamp=Date.parse('2026-01-01T00:00:00+09:00');
  const {store,backups,path}=fixture(t).profile('origin',()=>stamp);
  assert.deepEqual(knowledgePeriods(Date.parse('2026-11-30T14:59:59Z')),{week:'2026-11-30',month:'2026-11'});
  assert.deepEqual(knowledgePeriods(Date.parse('2026-11-30T15:00:00Z')),{week:'2026-11-30',month:'2026-12'});
  store.saveCard({kind:'positive',body:positive});
  backups.rotate();
  assert.deepEqual(backups.catalog().map(row=>row.kinds.slice().sort()),[['month','week']]);
  for(let i=0;i<8;i++){stamp+=7*86400000;backups.rotate();}
  const rows=backups.list();
  assert.equal(rows.filter(row=>row.kind==='week').length,1);
  assert.equal(rows.filter(row=>row.kind==='month').length,1);
  store.close();rmSync(store.file);
  assert.throws(()=>store.connection(),/原知识库文件缺失/u);
  assert(!existsSync(store.file));
  assert.equal(backups.restore(backups.preview(rows[0].name).token).counts.positive,1);
  assert(existsSync(join(path,'knowledge.sqlite')));
});

test('三种目录每页六条，待确认按类型筛选，搜索后按匹配数分页',t=>{
  const {store}=fixture(t).profile('catalog');
  for(const [kind,body] of [['positive',positive],['negative',negative]]){
    for(let index=0;index<8;index++){
      store.saveCard({kind,body:{...body,title:kind+'目录 '+index,aliases:[index<7?'常用':'专项']}});
      for(let occurrence=0;occurrence<3;occurrence++)store.record({kind,source:kind+'/'+index+'/'+occurrence,
        point:'案例 '+index,title:kind+'案例 '+index,evidence:'独立实例 '+occurrence});
    }
    assert.equal(store.items({view:kind}).rows.length,6);
    assert.equal(store.items({view:kind,page:2}).rows.length,2);
    assert.equal(store.items({view:kind,query:'常用',page:2}).rows.length,1);
    assert.equal(store.items({view:'pending',kind}).pages,2);
    assert.equal(store.items({view:'pending',kind,page:3}).page,2);
  }
  assert.equal(store.items({view:'pending'}).pages,3);
  assert.equal(store.items({view:'pending',page:3}).rows.length,4);
});

test('恢复切换途中退出，重开沿已确认的暂存副本继续',t=>{
  const {store,backups,path}=fixture(t).profile('origin');
  const first=store.saveCard({kind:'positive',body:positive});
  backups.rotate();
  const name=backups.list()[0].name;
  store.saveCard({kind:'negative',body:negative});
  const directory=join(path,'knowledge-backups'),folder='recovery-20261123-1234567890abcdef';
  const recovery=join(directory,folder);
  mkdirSync(recovery);
  copyFileSync(join(directory,name),join(recovery,'replacement.sqlite'));
  store.close();
  copyFileSync(store.file,join(recovery,'original-knowledge.sqlite'));
  writeFileSync(join(directory,'restore-in-progress.json'),JSON.stringify({folder}));
  backups.completeInterrupted();
  assert(!existsSync(join(directory,'restore-in-progress.json')));
  assert.equal(store.card(first.id).body.definition,positive.definition);
  assert.equal(store.items({view:'negative'}).rows.length,0);
  assert(existsSync(join(recovery,'original-knowledge.sqlite')));
});

test('长期规则只认直接原话，例外和冲突交给本机核对，不传知识到云端',async t=>{
  const {profile,stores}=fixture(t),{store,path}=profile('origin');
  const model={memory:async payload=>{
    const input=JSON.parse(payload),candidate=input.知识[0];
    if(!candidate)return noAnswer;
    if(input.材料==='两条规则冲突')return {...noAnswer,state:'conflict',cards:input.知识.map(card=>card.id).join(',')};
    return {...noAnswer,state:'apply',cards:candidate.id,answer:input.材料.includes('已定稿')
      ?candidate.exceptions[0].do:candidate.instead};
  }};
  const runtime=createKnowledgeRuntime({store,model});
  const phrase='以后听到先放一下就保留草稿，除非已定稿且明确确认就走原归档确认。';
  assert.equal(explicitKnowledgeRule('他说「'+phrase+'」'),null);
  const saved=await runtime.inspect({text:phrase,source:'teaching',direct:true});
  assert.equal(saved.state,'reply');
  assert.equal((await runtime.inspect({text:phrase,source:'teaching',direct:true})).card,saved.card);
  assert.equal(store.items({view:'negative'}).rows.length,1);
  const used=await runtime.inspect({text:'先放一下',source:'one'});
  assert.equal(used.answer,'保留草稿');assert.equal(used.private,true);
  const except=await runtime.inspect({text:'已定稿且明确确认，这次先放一下',source:'two'});
  assert.equal(except.answer,'走原归档确认');
  assert((await runtime.inspect({text:phrase+'另外帮我归档',source:'mix',direct:true})).answer.includes('单独'));
  const lines=createConversationThreads(path,{
    encryptString:clear=>Buffer.from(clear),decryptString:buffer=>buffer.toString(),
  });
  stores.push(lines);
  const line=lines.create();
  lines.submit(line.id,{text:'先放一下'});
  let sent=0;
  const replies=createThreadReplies({store:lines,knowledge:runtime,cloud:async()=>sent++});
  await replies.run(line.id,{foreground:true});
  await replies.close();
  assert.equal(lines.detail(line.id).messages.at(-1).text,'保留草稿');
  assert.equal(lines.archiveTurns('2026-11-23').length,0);
  assert.deepEqual(lines.organizationLinks(),[]);
  assert.equal(sent,0);
  store.saveCard({kind:'negative',body:negative});
  const conflict=await runtime.inspect({text:'两条规则冲突',source:'three',scope:'question'});
  assert.equal(conflict.state,'conflict');
  assert.equal(conflict.cards.length,2);
});

test('主动疑问的已解回执跨重启复用，条目版本变化后重新核对',async t=>{
  const {profile,stores}=fixture(t),{store,path}=profile('origin');
  const card=store.saveCard({kind:'positive',body:positive});
  let modelCalls=0;
  const model={memory:async payload=>{
    modelCalls++;
    const input=JSON.parse(payload);
    return {...noAnswer,state:'apply',cards:input.知识[0].id,answer:input.知识[0].cases[0].do};
  }};
  const query={text:'月报存放怎么办？',scope:'active',source:'original/event',context:{状态:'未定稿'}};
  assert.equal((await createKnowledgeRuntime({store,model}).inspect(query)).answer,'放草稿区');
  store.close();
  const reloaded=createKnowledgeStore(path);stores.push(reloaded);
  const runtime=createKnowledgeRuntime({store:reloaded,model});
  assert.equal((await runtime.inspect(query)).answer,'放草稿区');
  assert.equal(modelCalls,1);
  reloaded.saveCard({id:card.id,revision:1,kind:'positive',body:{...positive,cases:[{when:'未定稿',do:'放项目草稿区'}]}});
  assert.equal((await runtime.inspect(query)).answer,'放项目草稿区');
  assert.equal(modelCalls,2);
});

test('真实入口合并近义疑问，重复纠正按原决定去重，工具故障不计数',async t=>{
  const {store}=fixture(t).profile('origin');
  const runtime=createKnowledgeRuntime({store,model:{memory:async payload=>{
    const data=JSON.parse(payload),feedback=Boolean(data.是否一次纠正);
    if(data.材料.includes('工具超时'))return noAnswer;
    const prior=data.已知疑问与错因.find(group=>group.kind===(feedback?'negative':'positive'));
    return {...noAnswer,state:feedback?'feedback':'unknown',point:feedback?'归档过早':'未定稿存放位置',
      title:feedback?'归档过早':'未定稿存放位置',evidence:data.材料,
      group:prior?.id??'',mistake:feedback?'未定稿时归档':'',condition:'未定稿',answer:feedback?'放进草稿区':''};
  }}});
  for(const [index,text] of ['月报没定稿，放哪？','月底报告还在改，怎么处理？','定稿前的报告怎么办？'].entries())
    await runtime.inspect({text,scope:'question',source:'message/'+index});
  await runtime.inspect({text:'定稿前的报告怎么办？',scope:'transcription',source:'message/2'});
  await runtime.inspect({text:'工具超时怎么办？',scope:'question',source:'tool'});
  const correction='这次做错了，未定稿时不该归档，应该放进草稿区。';
  for(const [index,id] of ['decision-1','decision-1','decision-2','decision-3'].entries())
    await runtime.inspect({text:correction,direct:true,source:'feedback/'+index,previous:{id,text:'未定稿时归档'}});
  const pending=store.items({view:'pending'}).rows;
  assert.deepEqual(pending.map(row=>[row.kind,row.count]).sort(),[['negative',3],['positive',3]]);
  assert.equal(store.items({view:'negative'}).rows.length,0);
});
