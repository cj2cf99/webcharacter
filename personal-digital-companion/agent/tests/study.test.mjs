import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {bankMaterial,cacheStudyImage,importStudyMaterials,languageMaterial} from '../../desktop/study-materials.mjs';
import {createStudyStore,drawStudy,mastery} from '../../desktop/study-store.mjs';
import {createStudyRelay} from '../../desktop/study-relay.mjs';
import {credentialFilename,loadStudyConnection} from '../../desktop/cloud-connection.mjs';
import {pairChoice} from '../../desktop/pair-choice.mjs';

const key=randomBytes(32);
const protection={isEncryptionAvailable:()=>true,encryptString(text){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]);
},decryptString(bytes){
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString();
}};
function fixture(t){
  const folder=mkdtempSync(join(tmpdir(),'feiyue-study-'));
  let now=1800000000000;
  let store=createStudyStore(folder,()=>now,protection);
  t.after(()=>{store.close();rmSync(folder,{recursive:true,force:true});});
  return {folder,get store(){return store;},advance:ms=>now+=ms,now:()=>now,reopen(){store.close();store=createStudyStore(folder,()=>now,protection);}};
}
const options=[{id:'x',text:'红'},{id:'y',text:'蓝'},{id:'z',text:'绿'}];
const question=(id,extra={})=>({id,bank_id:'bank',stem:'题干 '+id,title:'题目 '+id,status:'active',type:'single',options,tag_ids:['color'],
  answer_option_ids:['x'],shuffle_policy:'preserve',explanation:'仅交卷后可见的解析',...extra});
const matching=question('match',{type:'matching',pairs:[{id:'p',text:'甲'},{id:'q',text:'乙'}],answer_pairs:[{pair_id:'p',option_id:'x'},{pair_id:'q',option_id:'y'}]});

test('正式知序通过已有 Access 连接访问 subscriptions-api',async t=>{
  const {folder}=fixture(t);
  writeFileSync(join(folder,credentialFilename),'fixture');
  const requests=[];
  const connection=await loadStudyConnection(folder,{
    decrypt:async()=>Buffer.from(JSON.stringify({client_id:'local-service-id',client_secret:'local-service-secret'})),
    fetcher:async(url,options)=>{requests.push({url,options});return Response.json({items:[]});},
  });
  assert.equal(connection.mode,'Access');
  await connection.request('/api/study/v1/banks?limit=20');
  await connection.request('/api/language/dialogues');
  assert.equal(requests[1].url.pathname,'/api/companion/language/dialogues');
  assert.throws(()=>connection.request('/api/language/dialogues',{method:'PUT'}),/该材料尚未接入/);
  assert.throws(()=>connection.request('/api/language/private'),/该材料尚未接入/);
  assert.equal(requests.length,2);
  const [{url,options}]=requests;
  assert.equal(url.pathname+url.search,'/api/companion/study/v1/banks?limit=20');
  assert.equal(options.headers.Origin,url.origin);
  assert.equal(options.headers['CF-Access-Client-Id'],'local-service-id');
  assert.equal(options.redirect,'error');
});

test('缓存和本地模考接受知序允许的长配对编号和冒号', t=>{
  const f=fixture(t);
  const left='左'.repeat(128),right='右'.repeat(128);
  const bank=bankMaterial({bank_id:'edge',questions:[question('long',{
    type:'matching',answer_option_ids:[],pairs:[{id:left,text:'长编号'},{id:'pair:2',text:'含冒号'}],
    options:[{id:right,text:'长答案'},{id:'option:2',text:'含冒号的答案'}],
    answer_pairs:[{pair_id:left,option_id:right},{pair_id:'pair:2',option_id:'option:2'}],
  })]});
  f.store.cache([bank]);
  const {id}=f.store.create(bank.id,{mode:'exam'});
  f.store.operate(id,'answer',{value:[pairChoice(left,right),pairChoice('pair:2','option:2')]});
  assert.equal(f.store.operate(id,'finish').correct,1);
});

test('取材缓存带点号的图号，离线保留题图，解析图考后显示，外部缺图单独提示',async t=>{
  const f=fixture(t);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFuoAAAAASUVORK5CYII=';
  const asset={id:'diagram.v1',provider:'git',url:'https://raw.githubusercontent.com/example/fixtures/main/diagram.png'};
  const assets=new Map([[asset.id,asset],['solution.1',{id:'solution.1',provider:'local',mime_type:'image/png',data_base64:png}]]);
  const q=question('picture',{stem:'题干 ![图](asset:diagram.v1) ![缺图](asset:missing.png)',explanation:'解析 ![图](asset:solution.1)'});
  const reads=[];
  const relay=createStudyRelay(f.store,async()=>({async request(path){
    if(path.includes('/questions?'))return Response.json({items:[q]});
    if(path.includes('/tags?')||path.includes('/review?'))return Response.json({items:[]});
    if(path.endsWith('/banks/bank'))return Response.json({name:'图片题库'});
    const id=path.split('/').at(-1);
    reads.push(id);
    return assets.has(id)?Response.json(assets.get(id)):Response.json({error:{message:'图片不存在'}},{status:404});
  }}),{fetchImage:async(url,options)=>{
    assert.equal(url.href,asset.url);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    return new Response(Buffer.from(png,'base64'),{headers:{'Content-Type':'image/png'}});
  }});
  await relay.download('bank','bank');
  assert.deepEqual(reads,['diagram.v1','missing.png','solution.1']);
  f.reopen();
  let session=f.store.create(bank.id,{mode:'exam'});
  assert.deepEqual(session.items[0].question.media.map(row=>row.id),['diagram.v1']);
  assert.equal(session.items[0].question.missingImages,1);
  session=f.store.operate(session.id,'finish');
  assert.deepEqual(session.items[0].question.media.map(row=>row.id),['diagram.v1','solution.1']);
  let requestedOutsideSource=false;
  await cacheStudyImage({provider:'git',url:'https://127.0.0.1/a.png'},()=>{requestedOutsideSource=true;});
  assert.equal(requestedOutsideSource,false);
  const denied=await cacheStudyImage({...asset,sha256:'0'.repeat(64)},async()=>new Response(Buffer.from(png,'base64'),{headers:{'Content-Type':'image/png'}}));
  assert.equal(denied.data_base64,undefined);
  const mislabeled=await cacheStudyImage(asset,async()=>new Response('invalid',{headers:{'Content-Type':'image/png'}}));
  assert.equal(mislabeled.data_base64,undefined);
});
const bank=bankMaterial({bank_id:'bank',questions:[question('a'),question('b',{type:'multiple',answer_option_ids:['x','y']}),matching]},
  {title:'加密样例题库',tags:[{id:'parent',name:'父标签'},{id:'color',parent_id:'parent',name:'颜色'}]});
const script=(id='meeting',answer='明日です。')=>({id,revision:1,scene:{title:'模拟会议',roleA:'同事',roleB:'我'},plan:{background:'安排会议'},
  closing:{ja:'また明日。'},turns:[{step:1,a:{ja:'いつですか。'},b:{ja:answer},
    concepts:[{id:'time',span:answer.slice(0,2),explanationZh:'表达时间'}],chunks:[{t:answer.slice(0,2)},{t:answer.slice(2)}]},
    {step:2,a:{ja:'どこですか。'},b:{ja:'駅です。'}}]});

test('只有明确陪练指令打开学习面板',()=>{
  for(const request of ['陪我学习','绯月，请打开语言对练','陪我做题。'])assert.equal(conversationRoute(request).kind,'study');
  assert.notEqual(conversationRoute('我近期要学习日语').kind,'study');
  assert.equal(conversationRoute('陪我学习','direct').kind,'direct');
});

test('真实交换形状、分卷合并、题目版本、原答案及受保护的本机续作',t=>{
  const f=fixture(t);
  const materials=importStudyMaterials({version:1,fixed:{scripts:[script()]},legacy:{private:'不应导入'}});
  f.store.cache(materials);
  const [lang]=materials;
  const s=f.store.create(lang.id,{mode:'script'});
  assert.equal(s.items[0].question.reference,undefined);
  assert.equal(s.items[0].question.chunks,undefined);
  assert.equal(s.items[1].question,undefined);
  f.store.operate(s.id,'draft',{value:'加密的原始回答'});
  f.reopen();
  assert.equal(f.store.view(s.id).items[0].draft,'加密的原始回答');
  assert(!readFileSync(join(f.folder,'study.sqlite')).includes(Buffer.from('加密的原始回答')));
  assert.throws(()=>f.store.operate(s.id,'position',{index:1}),/前面的轮次/u);
  assert.equal(f.store.operate(s.id,'answer',{value:'明日です！'}).items[0].result,'correct');
  const examFile=questions=>({format_version:'1.0',bank_id:'bank',source_key:'source',questions});
  f.store.cache(importStudyMaterials(examFile([question('a')])));
  f.store.cache(importStudyMaterials(examFile([matching])));
  assert.equal(f.store.material(bank.id).count,2);
  f.store.cache(importStudyMaterials(examFile([{id:'a',status:'draft'}])));
  assert.equal(f.store.material(bank.id).count,1);
  const changed=bankMaterial({bank_id:'bank',questions:[question('a',{answer_option_ids:['y']})]});
  assert.notEqual(changed.questions[0].id,bank.questions[0].id);
});

test('纯场景可从 A 的本机开场续作，新版剧本支持分词且不创造考点',t=>{
  const f=fixture(t);
  const scene={id:'travel',title:'问路',revision:1,setting:'车站',roleA:'站员',roleB:'乘客',topics:['最近的出口']};
  const data=script('new-script');
  data.flow='dialogue-first-v1';data.settings={distractors:1};delete data.turns[1].chunks;
  const [language,material]=importStudyMaterials({fixed:{scripts:[data],scenes:[scene,{...scene,archived:true}]}});
  assert.equal(language.turns[1].concepts.length,0);
  assert(language.turns[1].chunks.length>1);
  f.store.cache([language,material]);
  assert.equal(f.store.material(material.id).sceneOnly,true);
  assert.throws(()=>f.store.create(material.id,{mode:'script'}),/本机模型/u);
  const s=f.store.create(material.id,{mode:'free',opening:'どちらに行かれますか。',topic:scene.topics[0]});
  assert.equal(s.items[0].question.stem,'どちらに行かれますか。');
  f.store.operate(s.id,'draft',{value:'出口はどこですか。'});
  f.reopen();
  assert.equal(f.store.view(s.id).items[0].draft,'出口はどこですか。');
  assert.equal(f.store.operate(s.id,'finish').items[0].answer,'出口はどこですか。');
});

test('没把握优先、跨场升降、重复订正与争议撤回',t=>{
  const f=fixture(t),l=languageMaterial(script());
  f.store.cache([l,languageMaterial(script('variation','来週です。'))]);
  const complete=(answer,verdict,unsure=false)=>{
    const s=f.store.create(l.id,{mode:'script'});
    if(unsure)f.store.operate(s.id,'unsure',{value:true});
    f.store.operate(s.id,'answer',{value:answer,verdict,concepts:[l.turns[0].concepts[0].id]});
    f.store.operate(s.id,'retry',{value:'明日です。'});
    f.advance(100);
    return f.store.operate(s.id,'finish');
  };
  const a=complete('先週です。','wrong');
  const b=complete('先週です。','wrong');
  assert.equal(b.items[0].mastery.weight,5);
  assert(b.items[0].hasVariant);
  let value=complete('明日です。',undefined,true);
  assert.equal(value.items[0].mastery.streak,0);
  assert.equal(f.store.create(l.id,{mode:'sentence',count:1}).items[0].question.id,l.turns[0].id);
  for(let i=1;i<=4;i++){
    value=complete('明日です。');
    assert.equal(value.items[0].mastery.weight,[5,5,3,1][i-1]);
  }
  assert.equal(f.store.operate(a.id,'dispute',{reason:'variant'}).items[0].mastery.streak,4);
  assert.equal(f.store.operate(a.id,'resolve',{result:'original'}).items[0].result,'wrong');
  const again=complete('先週です。','wrong');
  assert.equal(again.items[0].mastery.weight,3);
  assert.equal(f.store.operate(again.id,'dispute',{reason:'dictation'}).items[0].mastery.weight,1);
  assert.equal(f.store.operate(again.id,'resolve',{result:'correct'}).items[0].result,'correct');
  const target={id:'q'};
  const state=mastery([[{question:target,result:'wrong'},{question:target,result:'wrong'},{question:target,result:'correct'}]]);
  assert.equal(state.get('q').tier,1);
  assert.equal(drawStudy([target,{id:'weak'}],1,new Map([['weak',{tier:0,unsure:true}]]),true,()=>0)[0].id,'weak');
});

test('模考隐藏配对、单选、多选答案，固定试卷、暂停续作、到期并按原答案评分',t=>{
  const f=fixture(t);f.store.cache([bank]);
  let s=f.store.create(bank.id,{mode:'exam'}),win=0;
  const ids=[];
  for(let index=0;index<s.items.length;index++){
    s=f.store.operate(s.id,'position',{index});
    const q=s.items[index].question;
    ids.push(q.id);
    assert(!('correct' in q));assert(!('explanation' in q));
    const answer=q.type==='matching'?['p:x','q:y']:q.type==='multiple'?['x','y']:['x'];
    f.store.operate(s.id,'answer',{index,value:answer});win++;
  }
  s=f.store.operate(s.id,'pause');
  f.advance(3_600_001);f.reopen();
  assert.equal(f.store.view(s.id).remaining,3_600_000);
  f.store.operate(s.id,'resume');f.advance(3_600_001);
  s=f.store.view(s.id);
  assert.equal(s.reason,'timeout');assert.equal(s.correct,win);assert(s.passed);
  assert.deepEqual(s.items.map(item=>item.question.id),ids);
  assert(s.items.every(item=>item.question.correct.length>0));
});

test('自由对练的验证只能引用对应的实际提问，保留场景来源及争议状态',t=>{
  const {store}=fixture(t),raw=script();
  raw.scene.id='actual-scene';
  const material=languageMaterial(raw);
  store.cache([material]);
  const s=store.create(material.id,{mode:'free'});
  store.freeCommit(s.id,0,'水曜日です。',{next:'何が必要ですか。'});
  store.freeCommit(s.id,1,'資料です。',{done:true,summary:'已说明计划'});
  assert.deepEqual(store.scriptOptions(s.id,0).map(q=>q.id),[material.turns[0].id]);
  assert.deepEqual(store.scriptOptions(s.id,1),[]);
  assert.throws(()=>store.next(s.id,0,'verify',material.turns[1].id),/暂无可验证/u);
  assert.equal(store.next(s.id,0,'verify',material.turns[0].id).items[0].question.id,material.turns[0].id);
  store.operate(s.id,'dispute',{index:0,reason:'dictation'});
  assert.deepEqual(store.scriptOptions(s.id,0),[]);
});

test('抽题筛选、猜对不降频、疑问题不改分并可恢复',t=>{
  const {store}=fixture(t);store.cache([bank]);
  let s=store.create(bank.id,{mode:'practice',count:9,tag:'color',reinforce:true});
  assert.equal(s.items.length,3);assert.equal(s.requested,9);
  store.operate(s.id,'unsure',{value:true});
  const first=s.items[0].question;
  const answer=bank.questions.find(q=>q.id===first.id).correct;
  store.operate(s.id,'answer',{value:answer});
  s=store.operate(s.id,'finish');
  assert.equal(s.correct,1);assert.equal(s.items[0].mastery.streak,0);
  assert.equal(store.operate(s.id,'doubt',{value:true}).correct,1);
  assert.equal(store.create(bank.id,{mode:'practice',count:3,reinforce:true}).items.length,2);
  store.operate(s.id,'doubt',{value:false});
  assert.equal(store.create(bank.id,{mode:'practice',count:3,reinforce:true}).items.length,3);
  assert.throws(()=>store.create(bank.id,{mode:'practice',tag:'absent'}),/没有符合/u);
});

test('正式回执脱网、重开、重试原幂等号、隐藏配对答案并只结算一次',async t=>{
  const f=fixture(t);f.store.cache([bank]);
  let dto=null,disconnect=false,loseResponse=false,ignoreSelection=false,wrongReceipt=false,invalidCurrent=false,sequence=0;
  const receipts=new Map(),attempts=[];
  const connect=async()=>({async request(path,init){
    if(disconnect)throw Error('断网');
    if(invalidCurrent&&path.endsWith('/current'))return new Response('invalid json');
    if(!init.method)return Response.json(path.endsWith('/current')&&dto?.status==='completed'?null:
      wrongReceipt?{...dto,id:'unexpected'}:dto);
    const body=JSON.parse(init.body),op=init.headers['Idempotency-Key'];
    attempts.push(op);
    if(receipts.has(op))return Response.json(receipts.get(op));
    if(path.endsWith('/sessions')){
      dto={id:`remote-${++sequence}`,bank_id:'bank',bank_name:'正式样例',mode:'exam',status:'running',revision:1,writer_epoch:1,
        writer_device_id:body.device_id,writer_instance_id:body.instance_id,started_at:f.now(),effective_remaining_ms:3_600_000,current_position:0,
        items:[{id:'r1',question_id:'match',snapshot:matching,option_order:['y','x','z'],pair_order:['p','q'],selected_ids:[],flagged:false}]};
    }else if(path.endsWith('/progress')){
      dto={...dto,revision:dto.revision+1,items:[{...dto.items[0],selected_ids:(!ignoreSelection&&body.selected_ids?.toReversed())||dto.items[0].selected_ids,
        flagged:body.flag??dto.items[0].flagged}]};
    }else if(path.endsWith('/finish')){
      dto={...dto,revision:dto.revision+1,status:'completed',finished_at:f.now(),finish_reason:'manual',correct_count:0,passed:false,
        items:[{...dto.items[0],correctness:'wrong'}]};
    }
    receipts.set(op,structuredClone(dto));
    if(loseResponse){loseResponse=false;throw Error('回执未到');}
    return Response.json(dto);
  }});
  let relay=createStudyRelay(f.store,connect,{clock:f.now});
  invalidCurrent=true;
  await assert.rejects(relay.open('bank',true),/无效数据/u);
  assert.equal(attempts.length,0);
  invalidCurrent=false;
  let s=await relay.open('bank',true);
  assert.equal(s.items[0].question.correct,undefined);
  assert.equal(s.items[0].question.explanation,undefined);
  relay.draft(s.id,0,'answer',['p:y','q:x']);
  loseResponse=true;
  s=await relay.send(s.id,'sync');assert(s.pending);assert(s.offline);
  disconnect=true;f.reopen();relay=createStudyRelay(f.store,connect,{clock:f.now});
  s=await relay.send(s.id,'sync');assert(s.pending);
  disconnect=false;s=await relay.send(s.id,'sync');
  assert(!s.pending);assert.equal(attempts.at(-1),attempts.at(-2));
  s=await relay.send(s.id,'finish');assert.equal(s.status,'completed');assert.deepEqual(s.items[0].question.correct,['p:x','q:y']);
  const first=s.id;
  wrongReceipt=true;
  s=await relay.refresh(first);
  assert.equal(s.id,first);assert.match(s.error,/不同场次/u);
  wrongReceipt=false;
  s=relay.draft(s.id,0,'doubt',true);
  assert(s.items[0].doubt);assert.equal(s.correct,0);
  assert.throws(()=>f.store.create(bank.id,{mode:'practice',count:1,scope:'review',reinforce:true}),/没有符合/u);
  relay.draft(s.id,0,'doubt',false);
  await relay.refresh(s.id);
  const review=f.store.create(bank.id,{mode:'practice',count:1,scope:'review',reinforce:true});
  f.store.operate(review.id,'answer',{value:['p:y','q:x']});
  assert.equal(f.store.operate(review.id,'finish').items[0].mastery.weight,5);
  f.advance(1000);
  s=await relay.open('bank',true);
  relay.draft(s.id,0,'answer',['p:x','q:y']);
  ignoreSelection=true;
  const start=attempts.length;
  s=await relay.send(s.id,'sync');
  assert.equal(attempts.length,start+1);assert(s.pending);assert.match(s.error,/不一致/u);
  ignoreSelection=false;
  s=await relay.send(s.id,'sync');assert(!s.pending);
  s=await relay.send(s.id,'finish');
  f.reopen();relay=createStudyRelay(f.store,connect,{clock:f.now});
  assert.deepEqual(f.store.history().filter(record=>record.mode==='formal').map(record=>record.id),[s.id,first]);
  assert.deepEqual(relay.view(first).items[0].question.correct,['p:x','q:y']);
  loseResponse=true;
  await assert.rejects(relay.open('bank',true),/回执未到/u);
  const createdId=dto.id;
  dto={...dto,revision:3,writer_epoch:2,status:'completed',finished_at:f.now(),finish_reason:'manual',
    writer_device_id:'browser',writer_instance_id:'web',correct_count:1,passed:true,
    items:[{...dto.items[0],selected_ids:['p:x','q:y'],correctness:'correct'}]};
  f.reopen();relay=createStudyRelay(f.store,connect,{clock:f.now});
  s=await relay.open();
  assert.equal(s.id,createdId);
  assert.equal(s.status,'completed');
  assert.equal(s.correct,1);
  assert.equal(s.writer,false);
  assert.equal(attempts.at(-1),attempts.at(-2));
  dto.items[0]={...dto.items[0],question_id:null,snapshot:{...dto.items[0].snapshot,id:null}};
  s=await relay.refresh(s.id);
  assert.equal(s.correct,1);
  assert.equal(s.items[0].canRetry,false);
  assert.equal(s.items[0].doubt,undefined);
  assert.throws(()=>f.store.formalRetry(s.id,0),/仅可回看/u);
});

test('旧版重练核对启用版本、排除标疑并保留历史；未见题按已提交原题去重',t=>{
  const {store}=fixture(t), old=bankMaterial({bank_id:'bank',questions:[question('a')]});
  store.cache([old]);
  const first=store.create(old.id,{mode:'practice'});
  store.operate(first.id,'answer',{value:['x']});
  store.operate(first.id,'unsure',{value:true});
  assert.throws(()=>store.create(old.id,{mode:'practice',scope:'unseen'}),/没有符合/u);
  const closed=store.operate(first.id,'finish');
  assert.equal(closed.correct,1);
  assert.equal(closed.items[0].mastery.streak,0);
  store.cache([bankMaterial({bank_id:'bank',questions:[question('a',{answer_option_ids:['y']})]})]);
  assert.throws(()=>store.create(old.id,{mode:'practice',scope:'unseen'}),/没有符合/u);
  const plan=store.next(first.id,0,'wrong');
  assert.equal(plan.retryStatus,'changed');
  assert.match(plan.changed[0],/参考答案/u);
  const retry=store.next(first.id,0,'wrong',null,plan.versions);
  assert.equal(retry.sourceTurn.id,first.id);
  assert.notEqual(retry.items[0].question.id,closed.items[0].question.id);
  store.operate(first.id,'doubt',{index:0,value:true});
  assert.throws(()=>store.next(first.id,0,'original'),/标疑/u);
  assert.deepEqual(store.view(first.id).items[0].question.correct,['x']);
});

test('语言目录按页读取且场景与剧本使用独立游标，异常响应保留本机材料',async t=>{
  const {store}=fixture(t),calls=[];
  const relay=createStudyRelay(store,async()=>({request:async path=>{
    calls.push(path);
    if(path.includes('/dialogues/removed'))return Response.json({error:{code:'NOT_FOUND'}},{status:404});
    if(path.includes('cursor=a'))return Response.json({version:1,items:[],cursor:'a'});
    if(path.includes('/dialogues/'))return Response.json({version:1,script:script('different-id')});
    return Response.json({version:1,items:[{id:'abc',title:'测试',revision:1}],cursor:'a'});
  }}));
  assert.equal((await relay.catalogPage('scripts')).next,'a');
  assert.equal(calls.length,1);
  await assert.rejects(relay.download('language','removed'),/已移除/u);
  assert.equal((await relay.catalogPage('scenes')).items[0].scene,true);
  await assert.rejects(relay.catalogPage('scripts','a'),/游标/u);
  await assert.rejects(relay.download('language','abc'),/变更/u);
  assert.deepEqual(store.overview().materials,[]);
});
