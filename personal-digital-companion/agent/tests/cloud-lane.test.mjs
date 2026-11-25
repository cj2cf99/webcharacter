import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';

const textSchema={type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false};
const verdictSchema={type:'object',properties:{answer:{enum:['是','否']}},required:['answer'],additionalProperties:false};

function setup(t,reply){
  const calls=[],local=[];
  const key=process.env.bandao_api_key,geminiKey=process.env.gemini_aoxing_API_KEY,realFetch=globalThis.fetch;
  process.env.bandao_api_key='fixture-key';
  delete process.env.gemini_aoxing_API_KEY;
  globalThis.fetch=async(url,options)=>{
    calls.push({url,headers:options.headers,body:JSON.parse(options.body)});
    return Response.json({choices:[{finish_reason:'stop',message:{content:reply}}]});
  };
  t.after(()=>{
    globalThis.fetch=realFetch;
    if(key===undefined)delete process.env.bandao_api_key;else process.env.bandao_api_key=key;
    if(geminiKey===undefined)delete process.env.gemini_aoxing_API_KEY;else process.env.gemini_aoxing_API_KEY=geminiKey;
  });
  const ai=createAiWorkflowModel({file:':memory:',model:{memory:async value=>{local.push(value);return {answer:'是'};},close:async()=>{}}});
  t.after(()=>ai.close());
  return {ai,calls,local};
}

test('非判断任务单次走半岛 deepseek-v4.1-flash，低档思考，JSON 输出',async t=>{
  const {ai,calls,local}=setup(t,JSON.stringify({text:'云端成稿'}));
  const result=await ai.memory('材料','写一段',textSchema,AbortSignal.timeout(5000),{name:'news-editorial',stage:'summary'});
  assert.deepEqual(result,{text:'云端成稿'});
  assert.equal(calls.length,1);assert.deepEqual(local,[]);
  const {url,headers,body}=calls[0];
  assert.equal(url,'https://sub.bandaoapi.com/v1/chat/completions');
  assert.equal(headers.authorization,'Bearer fixture-key');
  assert.equal(body.model,'deepseek-v4.1-flash');assert.equal(body.reasoning_effort,'low');
  assert.equal(body.thinking,undefined);assert.deepEqual(body.response_format,{type:'json_object'});
});

test('封闭判断留本机 4B，不请求云端',async t=>{
  const {ai,calls,local}=setup(t,'{}');
  const result=await ai.memory('材料','是否已说明',verdictSchema,AbortSignal.timeout(5000),{name:'personal-conversation',stage:'explained'});
  assert.deepEqual(result,{answer:'是'});assert.equal(local.length,1);assert.equal(calls.length,0);
});

test('私密任务留本机；云端结果与字段不符时报无效而非交付',async t=>{
  const {ai,calls,local}=setup(t,JSON.stringify({other:1}));
  await ai.memory('私密','写',textSchema,AbortSignal.timeout(5000),{name:'x',aiPrivate:true});
  assert.equal(local.length,1);assert.equal(calls.length,0);
  await assert.rejects(ai.memory('材料','写',textSchema,AbortSignal.timeout(5000),{name:'news-editorial',stage:'summary'}),
    {code:'DEEPSEEK_RESULT_INVALID'});
});

test('截图问答经 Gemini 官方兼容端点，使用 flash-lite，无证据时返回原因',async()=>{
  const {cloudVision}=await import('../../desktop/ai-gateway.mjs');
  const {requestGemini}=await import('../../desktop/ai-gateway.mjs');
  let seen;
  const make=content=>cloudVision({request:(payload,options)=>requestGemini(payload,{...options,key:'gem-key',fetcher:async(url,init)=>{
    seen={url,auth:init.headers.authorization,body:JSON.parse(init.body)};
    return Response.json({choices:[{finish_reason:'stop',message:{content}}]});
  }})});
  const image={mime_type:'image/png',data_base64:'AAAA'};
  assert.deepEqual(await make('图中是一只猫')('图里有什么？',image,AbortSignal.timeout(5000)),{text:'图中是一只猫'});
  assert.equal(seen.url,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(seen.auth,'Bearer gem-key');assert.equal(seen.body.model,'gemini-3.1-flash-lite');assert.equal(seen.body.reasoning_effort,'medium');
  assert.equal(seen.body.messages[1].content[0].image_url.url,'data:image/png;base64,AAAA');
  assert.match((await make('[UNCERTAIN]')('图里有什么？',image,AbortSignal.timeout(5000))).reason,/无法可靠判断/);
});

test('公用识图模块优先走本机 AGY CLI 并自动清理临时图片，未安装时回退备用视觉',async t=>{
  const {mkdtemp,readdir,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {createAgyVision}=await import('../../desktop/vision-client.mjs');
  const tempDir=await mkdtemp(join(tmpdir(),'agy-vision-unit-'));
  t.after(()=>rm(tempDir,{recursive:true,force:true}));
  const seen=[];
  const vision=createAgyVision({
    tempDir,
    isAvailable:()=>true,
    runAgy:async({prompt,model})=>{
      const files=await readdir(tempDir);
      seen.push({prompt,model,files});
      return {success:true,response:'画面里是一块红色方块'};
    }
  });
  const image={mime_type:'image/png',data_base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='};
  assert.deepEqual(await vision('图里有什么？',image,AbortSignal.timeout(5000)),{text:'画面里是一块红色方块'});
  assert.equal(seen.length,1);
  assert.equal(seen[0].files.length,1);
  assert.match(seen[0].files[0],/^vision-.*\.png$/);
  assert.match(seen[0].prompt,new RegExp(seen[0].files[0]));
  assert.deepEqual(await readdir(tempDir),[],'识图结束后应立即清理临时图片');
  assert.deepEqual(await vision('帮我抠图',image,AbortSignal.timeout(5000)),{reason:'视觉模型无法输出图像蒙版'});

  let fallbackCalls=0;
  const fallbackVision=createAgyVision({
    tempDir,
    isAvailable:()=>false,
    fallback:async()=>{fallbackCalls++;return {text:'备用视觉回答'};}
  });
  assert.deepEqual(await fallbackVision('图里有什么？',[],AbortSignal.timeout(5000)),{reason:'AGY CLI 识图参数无效'});
  assert.equal(fallbackCalls,0,'无效图片不应触发备用视觉');
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(()=>fallbackVision('图里有什么？',image,aborted.signal),/AbortError/);
  assert.equal(fallbackCalls,0,'已取消请求不应触发备用视觉');
  assert.deepEqual(await fallbackVision('图里有什么？',image,AbortSignal.timeout(5000)),{text:'备用视觉回答'});
  assert.equal(fallbackCalls,1);

  const multiSeen=[];
  const multiVision=createAgyVision({
    tempDir,
    isAvailable:()=>true,
    runAgy:async({prompt})=>{
      const files=(await readdir(tempDir)).sort();
      multiSeen.push({prompt,files});
      return {success:true,response:'图1是红块，图2是蓝块'};
    }
  });
  assert.deepEqual(await multiVision('对比两张图',[image,{mime_type:'image/jpeg',data_base64:image.data_base64}],AbortSignal.timeout(5000)),{text:'图1是红块，图2是蓝块'});
  assert.equal(multiSeen[0].files.length,2);
  assert.match(multiSeen[0].prompt,/图1（vision-.*）.*图2（vision-.*）/);
  assert.deepEqual(await readdir(tempDir),[],'多图识读结束后应清理全部临时图片');

  const schema={type:'object',properties:{seen:{type:'string'},action:{enum:['ask','quiet']}},required:['seen','action'],additionalProperties:false};
  const structuredVision=createAgyVision({
    tempDir,
    isAvailable:()=>true,
    runAgy:async({schema:passedSchema})=>{
      assert.deepEqual(passedSchema,schema);
      return {success:true,structuredOutput:{seen:'桌面有一张图',action:'ask'},response:'{"seen":"桌面有一张图","action":"ask"}'};
    }
  });
  assert.deepEqual(await structuredVision('看图并判断',image,AbortSignal.timeout(5000),{schema}),
    {data:{seen:'桌面有一张图',action:'ask'},text:'{"seen":"桌面有一张图","action":"ask"}'});
});

test('路由策略集中在 ai-gateway：判断、复核、私密、短评留本机，其余在配置半岛后走云端',async t=>{
  const {routesToCloud}=await import('../../desktop/ai-gateway.mjs');
  const key=process.env.bandao_api_key;
  t.after(()=>{if(key===undefined)delete process.env.bandao_api_key;else process.env.bandao_api_key=key;});
  delete process.env.bandao_api_key;
  assert.equal(routesToCloud({kind:'task'}),false);
  process.env.bandao_api_key='fixture-key';
  assert.equal(routesToCloud({kind:'task'}),true);
  assert.equal(routesToCloud({kind:'draft'}),true);
  for(const kind of ['judgment','review'])assert.equal(routesToCloud({kind}),false);
  assert.equal(routesToCloud({kind:'task',private:true}),false);
  assert.equal(routesToCloud({kind:'task',short:true}),false);
});

test('半岛返回正文而不是 JSON 时带提醒重试一次，仍不合格才报错',async t=>{
  const {askBandaoJson}=await import('../../desktop/ai-gateway.mjs');
  const key=process.env.bandao_api_key,realFetch=globalThis.fetch;
  process.env.bandao_api_key='fixture-key';
  const bodies=[];let replies;
  globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(options.body));
    return Response.json({choices:[{finish_reason:'stop',message:{content:replies.shift()}}]});};
  t.after(()=>{globalThis.fetch=realFetch;if(key===undefined)delete process.env.bandao_api_key;else process.env.bandao_api_key=key;});
  const schema={type:'object',properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false};
  replies=['直接写的正文',JSON.stringify({reply:'好的'})];
  assert.deepEqual(await askBandaoJson({instruction:'回答',schema,input:{问:'你好'}}),{reply:'好的'});
  assert.equal(bodies.length,2);
  assert.match(bodies[0].messages[1].content,/只返回一个 JSON 对象/);
  assert.match(bodies[1].messages.at(-1).content,/上一次输出不是/);
  bodies.length=0;replies=['正文一','正文二'];
  await assert.rejects(askBandaoJson({instruction:'回答',schema,input:'x',fallback:false}),{code:'DEEPSEEK_RESULT_INVALID',output:'正文二'});
  assert.equal(bodies.length,2);
});
