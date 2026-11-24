import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createBalancedLocalModel,correctionTurn,modelChoices} from '../../desktop/balanced-local-model.mjs';
import {createLocalModel} from '../../desktop/local-model.mjs';

test('转录持有同一模型，阶段之间普通推理和换档排队',async()=>{
  const calls=[],starts=[],signal=AbortSignal.timeout(1000);
  const first=Promise.withResolvers(),resume=Promise.withResolvers();
  const model=createBalancedLocalModel({modelPath:'models/test.gguf',readGpu:async()=>({utilization:5,freeMiB:7000}),
    create:({modelPath})=>({start:async()=>{starts.push(modelPath);},close:async()=>{},
      snapshot:()=>({state:'ready',gpuLayers:20}),async analyze(text){calls.push(text);return {reply:text};}})});
  try{
    const job=model.withWorkSession('job',signal,async query=>{
      await query('归纳',{});first.resolve();await resume.promise;
      await query('拟稿',{});await query('复核',{});
    });
    await first.promise;
    assert.equal(await model.suspend(),false);
    const competing=model.work('新请求',{tier:'upgrade',session:{},signal});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,['归纳']);assert.equal(starts.length,1);
    resume.resolve();await job;await competing;
    assert.deepEqual(calls,['归纳','拟稿','复核','新请求']);assert.equal(starts.length,1);
  }finally{resume.resolve();await model.close();}
});

test('后台日记跳过 GPU 采样，固定分工照常推理，普通路由可在 GPU 加载失败后回退 CPU',async()=>{
  for(const [taskDevice,expectedDevices] of [['gpu',['gpu']],['cpu',['cpu']],[undefined,['gpu','cpu']]]){
    const devices=[];
    let samples=0;
    const model=createBalancedLocalModel({modelPath:'models/test.gguf',taskDevice,
      readGpu:async()=>{samples++;return {utilization:100,freeMiB:0};},
      create:({device})=>{
        devices.push(device);
        const failed=!taskDevice&&device==='gpu';
        return {start:async()=>{},close:async()=>{},
          snapshot:()=>({state:failed?'error':'ready',gpuLayers:device==='gpu'?20:0}),
          analyze:async()=>({text:'已写完'})};
      }});
    try{
      const result=await model.memory('日记素材','写成手记',{},new AbortController().signal,
        {name:'diary-writing',stage:'narrate',backgroundBudget:true,aiTier:'4'});
      assert.deepEqual(result,{text:'已写完'});
      assert.equal(samples,0);
      assert.deepEqual(devices,expectedDevices);
    }finally{await model.close();}
  }
});

test('对话模型连续空闲五分钟才释放，进行中的推理会重置计时',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const entered=Promise.withResolvers(),finish=Promise.withResolvers();
  let unloaded=0;
  const model=createBalancedLocalModel({modelPath:'models/test.gguf',readGpu:async()=>({utilization:0,freeMiB:7100}),
    create:()=>({start:async()=>{},close:async()=>{unloaded++;},
      snapshot:()=>({state:'ready',gpuLayers:20,backend:'vulkan'}),
      async analyze(){entered.resolve();await finish.promise;return {reply:'完成'};}})});
  try{
    assert.equal((await model.preheatConversation('main')).ready,true);
    t.mock.timers.tick(299_999);
    assert.equal(unloaded,0);
    const running=model.work('合成测试',{session:{}});
    await entered.promise;
    t.mock.timers.tick(300_000);
    assert.equal(unloaded,0);
    finish.resolve();await running;
    t.mock.timers.tick(299_999);
    assert.equal(unloaded,0);
    t.mock.timers.tick(1);
    assert.equal(unloaded,1);
    assert.equal(model.snapshot().state,'idle');
  }finally{finish.resolve();await model.close();}
});

test('辨认纠正上一轮和引用纠正用语',()=>{
  for(const text of ['你理解错了','你刚才说反了','不是我的意思','我问的是说这句话的人','不对，重新看一下']){
    assert.ok(correctionTurn(text,{用户:'上一轮'}),text);
  }
  for(const text of ['我今天改了日记','阿岚说“你理解错了”。','不是很开心','这份表不对']){
    assert.equal(correctionTurn(text,{用户:'上一轮'}),false,text);
  }
});

test('修订取消后等模型停止，正常停止继续复用，无响应才重启',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const workers=[];
  let acknowledge=true;
  let started=Promise.withResolvers();
  const utilityProcess={fork(){
    const worker=new EventEmitter();
    worker.postMessage=message=>{
      if(message.type==='cancel'){
        if(acknowledge)worker.emit('message',{type:'result',id:message.id,result:{error:'LOCAL_AI_TIMEOUT'}});
      }else if(message.text==='耗时推理'){
        started.resolve();
      }else{
        worker.emit('message',{type:'result',id:message.id,result:{text:'已拟稿'}});
      }
    };
    worker.kill=()=>worker.emit('exit');
    workers.push(worker);
    queueMicrotask(()=>worker.emit('message',{type:'ready',backend:'cpu',gpuLayers:0,vramMiB:0}));
    return worker;
  }};
  const modelPath=fileURLToPath(import.meta.url);
  const model=createBalancedLocalModel({utilityProcess,modelPath,readGpu:async()=>null,
    create:options=>createLocalModel({...options,modelPath})});
  const ask=(text,signal=new AbortController().signal)=>model.memory(text,'拟稿',{},signal,{name:'memory-refinement'});
  try{
    for(const responded of [true,false]){
      acknowledge=responded;
      started=Promise.withResolvers();
      const abort=new AbortController();
      const request=ask('耗时推理',abort.signal);
      const stopped=assert.rejects(request,{name:'TimeoutError'});
      await started.promise;
      abort.abort(new DOMException('推理超时','TimeoutError'));
      if(!responded){
        assert(model.isBusy());
        context.mock.timers.tick(1000);
      }
      await stopped;
      assert.deepEqual(await ask('补做段落'),{text:'已拟稿'});
      assert.equal(workers.length,responded?1:2);
    }
  }finally{await model.close();}
});
test('本地只用 Qwen3.5 4B：显存够用走 GPU，繁忙或缺读数走 CPU',async()=>{
  const first=(utilization,freeMiB,resident=0)=>modelChoices({utilization,freeMiB},resident)[0];
  assert.deepEqual(first(10,4000),{size:'4',device:'gpu'});
  assert.deepEqual(first(80,8000),{size:'4',device:'cpu'});
  assert.deepEqual(first(10,3000),{size:'4',device:'cpu'});
  assert.deepEqual(first(10,3000,900),{size:'4',device:'gpu'});
  assert.deepEqual(modelChoices(null),[{size:'4',device:'cpu'}]);
  const loaded=[];
  const m=createBalancedLocalModel({modelPath:'models/dir/test.gguf',readGpu:async()=>({utilization:10,freeMiB:7000}),
    create:({modelPath,device})=>{loaded.push(modelPath);
      return {start:async()=>{},close:async()=>{},snapshot:()=>({state:'ready',gpuLayers:device==='gpu'?25:0}),
        analyze:async()=>({reply:device})};}});
  try{
    assert.equal((await m.analyze('你好',{hint:'auto'})).reply,'gpu');
    assert.equal((await m.work('普通交互',{tier:'main',session:{}})).reply,'gpu');
    assert.deepEqual(loaded.map(file=>file.split(/[\\/]/).pop()),['Qwen3.5-4B-Q4_K_M.gguf']);
  }finally{await m.close();}
});

