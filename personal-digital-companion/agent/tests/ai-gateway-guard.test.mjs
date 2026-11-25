import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

// 架构守卫：对 AI 的出站调用和本机模型装配只能在 ai-gateway.mjs 里发生。
const dir=join(import.meta.dirname,'../../desktop');
const files=readdirSync(dir).filter(name=>name.endsWith('.mjs')).map(name=>({name,text:readFileSync(join(dir,name),'utf8')}));
const layer=new Set(['ai-gateway.mjs','agy-local-model.mjs','agy-cli-client.mjs','balanced-local-model.mjs','ai-workflow-model.mjs','local-model.mjs','ai-request-queue.mjs']);

test('只有 ai-gateway 装配本机模型，业务模块不直接 import 模型层',()=>{
  const bad=files.filter(({name,text})=>!layer.has(name)&&/from '\.\/(?:balanced-local-model|ai-workflow-model|local-model|agy-local-model|agy-cli-client|ai-request-queue)\.mjs'/.test(text));
  assert.deepEqual(bad.map(f=>f.name),[]);
});

test('AI 端点和密钥变量只出现在 ai-gateway',()=>{
  const pattern=/api\.deepseek\.com|sub\.bandaoapi\.com|generativelanguage\.googleapis\.com|bandao_api_key|gemini_aoxing_API_KEY|DEEPSEEK_API_KEY/;
  const bad=files.filter(({name,text})=>name!=='ai-gateway.mjs'&&pattern.test(text.replace(/\/\/[^\n]*/g,'')));
  assert.deepEqual(bad.map(f=>f.name),[]);
});

test('网关导出本机装配、云端文字、视觉、生图和路由策略',async()=>{
  const gateway=await import('../../desktop/ai-gateway.mjs');
  for(const name of ['createLocalAi','createPrivateModel','requestBandao','askBandaoJson','cloudVision','agyVision','createVision','requestGeminiImage','routesToCloud'])
    assert.equal(typeof gateway[name],'function',name);
});
