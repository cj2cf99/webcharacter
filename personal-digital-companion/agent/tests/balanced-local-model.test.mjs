import test from 'node:test';
import assert from 'node:assert/strict';
import {createBalancedLocalModel,correctionTurn,modelChoices} from '../../desktop/balanced-local-model.mjs';

test('按 GPU 双指标挑选档位，读数缺失或繁忙时用 CPU',()=>{
  const first=(utilization,freeMiB,correcting,resident=0)=>modelChoices({utilization,freeMiB},correcting,resident)[0];
  assert.deepEqual(first(49,2304,false),{size:'2',device:'gpu'});
  assert.deepEqual(first(50,7000,false),{size:'0.8',device:'gpu'});
  assert.deepEqual(first(10,6000,true,656),{size:'9',device:'gpu'});
  const aggressive={size:'9',file:'Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf'};
  assert.deepEqual(first(79,6656,true),{...aggressive,device:'gpu'});
  assert.deepEqual(first(79,4000,true),{...aggressive,device:'cpu'});
  assert.deepEqual(first(80,8000,true),{...aggressive,device:'cpu'});
  assert.deepEqual(first(0,1200,false),{size:'0.8',device:'cpu'});
  assert.deepEqual(modelChoices(null,true),[{...aggressive,device:'cpu'}]);
});

test('辨认纠正上一轮和引用纠正用语',()=>{
  for(const text of ['你理解错了','你刚才说反了','不是我的意思','我问的是说这句话的人','不对，重新看一下']){
    assert.ok(correctionTurn(text,{用户:'上一轮'}),text);
  }
  for(const text of ['我今天改了日记','阿岚说“你理解错了”。','不是很开心','这份表不对']){
    assert.equal(correctionTurn(text,{用户:'上一轮'}),false,text);
  }
});

test('普通交互默认 Aggressive 9B，显存不足降档，候补用标准 9B，直连仍用 Aggressive',async()=>{
  const aggressive='Qwen3.5-9B-Uncensored-HauhauCS-Aggressive';
  let gpu={utilization:10,freeMiB:6656},failAggressive=false;
  const m=createBalancedLocalModel({modelPath:'models/test.gguf',localFirst:true,readGpu:async()=>gpu,
    create:({modelPath,device})=>{
      const name=/Qwen3\.5-.+(?=-Q4_K_M\.gguf$)/u.exec(modelPath)[0];
      return {start:async()=>{},close(){},snapshot:()=>({state:name===aggressive&&device==='gpu'&&failAggressive?'unavailable':'ready',gpuLayers:device==='gpu'?25:0}),
        analyze:async()=>({reply:name+' · '+device})};
    }});
  const work=async(tier='main',session={})=>(await m.work('普通交互',{tier,session})).reply;
  const direct=async()=>(await m.analyze('你好',{hint:'direct'})).reply;
  try{
    const first={};
    await m.start();
    assert.equal(await work('main',first),aggressive+' · gpu');
    gpu={utilization:10,freeMiB:5000};
    assert.equal(await work('main',first),aggressive+' · gpu'); // 同一轮生成和复审用同档。
    assert.equal(await work('upgrade'),'Qwen3.5-9B · cpu');
    assert.equal(await work(),'Qwen3.5-4B · gpu');
    assert.equal(await direct(),aggressive+' · cpu');
    gpu.freeMiB=2500;
    assert.equal(await work(),'Qwen3.5-2B · gpu');
    gpu=null;
    assert.equal(await work(),'Qwen3.5-2B · cpu');
    gpu={utilization:10,freeMiB:7000};
    assert.equal(await work('upgrade'),'Qwen3.5-9B · gpu');
    failAggressive=true;
    assert.equal(await work(),'Qwen3.5-4B · gpu');
    failAggressive=false;
    assert.equal(await direct(),aggressive+' · gpu');
  }finally{await m.close();}
});

test('换档保留上轮、等旧进程退出、加载失败降档，重复失败升级',async()=>{
  let active=0,ready=true,fail=false;
  const created=[];
  const previous={用户:'我的名字是阿澄',绯月:'我记得了'};
  const m=createBalancedLocalModel({modelPath:'models/test.gguf',readGpu:async()=>({utilization:10,freeMiB:7200}),
    create:({modelPath,device})=>{
      assert.equal(active++,0);
      const size=modelPath.includes('HauhauCS-Aggressive')?'Aggressive':/Qwen3.5-([\d.]+)B/u.exec(modelPath)[1];created.push(size);
      return {start:async()=>{},close:async()=>{await new Promise(r=>setImmediate(r));active--;},
        snapshot:()=>({state:size==='9'&&!ready?'unavailable':'ready',gpuLayers:device==='gpu'?25:0}),
        analyze:async(text,options)=>{assert.equal(options.previous,previous);return fail?{error:'LOCAL_AI_INFERENCE_FAILED'}:{kind:'chat',reply:size};}};
    }});
  const ask=s=>m.analyze(s,{hint:'auto',previous});
  try{
    const warm=m.start();assert.equal((await ask('你好')).reply,'Aggressive');await warm;
    assert.equal((await ask('你理解错了')).reply,'9');await new Promise(r=>setImmediate(r));assert.equal(active,0);
    ready=false;
    assert.equal((await ask('你理解错了')).reply,'Aggressive');await new Promise(r=>setImmediate(r));assert.equal(active,0);
    fail=true;await ask('同一问题');await ask('同一问题');fail=false;
    assert.equal((await ask('同一问题')).reply,'Aggressive');
    assert.deepEqual(created,['Aggressive','9','9','Aggressive','Aggressive','9','Aggressive']);
    assert.equal((await ask('另一件事')).reply,'Aggressive');
  }finally{await m.close();}
});

test('三轮未通过时转交原草稿及反馈，改进模型上限两轮，已耗尽的时间不能再用',async()=>{
  const calls=[],revision={draft:'弄反了称呼',feedback:'纠正称呼方向'};
  const m=createBalancedLocalModel({modelPath:'models/test.gguf',readGpu:async()=>({utilization:50,freeMiB:6500}),
    create:()=>({start:async()=>{},close(){},snapshot:()=>({state:'ready',gpuLayers:25}),
      async analyze(text,opts){calls.push({text,limit:opts.reviewLimit,revision:opts.revision});return {error:'LOCAL_AI_REPLY_REVIEW_REJECTED',revision};}})});
  try{
    const result=await m.analyze('我们该怎么称呼彼此',{hint:'auto'});
    assert.deepEqual(result,{error:'LOCAL_CHAT_REVIEW_FAILED'});
    assert.deepEqual(calls.map(c=>c.limit),[3,2]);
    assert.deepEqual(calls[1].revision,revision);
    assert.equal(calls[0].text,calls[1].text);
    assert.deepEqual(await m.analyze('过期的问题',{hint:'auto',turnStart:performance.now()-61000}),{error:'LOCAL_CHAT_TIME_LIMIT'});
    assert.equal(calls.length,2);
    assert.deepEqual(await m.analyze('已花了三十五秒的问题',{hint:'auto',turnStart:performance.now()-35000}),
      {error:'LOCAL_CHAT_REVIEW_FAILED'});
    assert.deepEqual(calls.slice(2).map(c=>c.limit),[3,2]);
  }finally{await m.close();}
});
