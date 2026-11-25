import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resetAgyResourceExhausted, stopAgyStandby} from '../../desktop/agy-cli-client.mjs';
import {askBandaoJson, createLocalAi, requestBandao} from '../../desktop/ai-gateway.mjs';

const replySchema = {
  type: 'object',
  properties: {reply: {type: 'string', minLength: 1}},
  required: ['reply'],
  additionalProperties: false
};

function setupKeysAndFetch(t, {bandaoKey = 'fixture-bandao', geminiKey = 'fixture-gemini', handler}) {
  const prevBandao = process.env.bandao_api_key;
  const prevGemini = process.env.gemini_aoxing_API_KEY;
  const realFetch = globalThis.fetch;
  if (bandaoKey === null) delete process.env.bandao_api_key;
  else process.env.bandao_api_key = bandaoKey;
  if (geminiKey === null) delete process.env.gemini_aoxing_API_KEY;
  else process.env.gemini_aoxing_API_KEY = geminiKey;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({url, headers: init.headers, body});
    return handler(url, body, calls.length);
  };
  t.after(() => {
    globalThis.fetch = realFetch;
    if (prevBandao === undefined) delete process.env.bandao_api_key;
    else process.env.bandao_api_key = prevBandao;
    if (prevGemini === undefined) delete process.env.gemini_aoxing_API_KEY;
    else process.env.gemini_aoxing_API_KEY = prevGemini;
  });
  return calls;
}

test('requestBandao 半岛 502 时先问 Gemini，Gemini 成功不调 AGY CLI', async t => {
  const calls = setupKeysAndFetch(t, {
    handler: url => {
      if (url.includes('sub.bandaoapi.com')) {
        return new Response('Bad Gateway', {status: 502});
      }
      return Response.json({
        choices: [{finish_reason: 'stop', message: {content: '来自 Gemini 兜底'}}]
      });
    }
  });
  let agyCalled = 0;
  const res = await requestBandao(
    {model: 'deepseek-v4.1-flash', reasoning_effort: 'low', messages: [{role: 'user', content: '你好'}]},
    {
      purpose: '对话回复',
      agyReady: () => true,
      agyRun: async () => { agyCalled++; return {success: true, response: '不应走到 AGY'}; }
    }
  );
  assert.deepEqual(res, {content: '来自 Gemini 兜底', finishReason: 'stop'});
  assert.equal(agyCalled, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://sub.bandaoapi.com/v1/chat/completions');
  assert.equal(calls[0].body.model, 'deepseek-v4.1-flash');
  assert.equal(calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(calls[1].body.model, 'gemini-3.1-flash-lite');
  assert.equal(calls[1].headers.authorization, 'Bearer fixture-gemini');
});

test('requestBandao 半岛与 Gemini 均失败时再问 AGY CLI（支持 json_object 剥离代码块）', async t => {
  const order = [];
  setupKeysAndFetch(t, {
    handler: url => {
      if (url.includes('sub.bandaoapi.com')) {
        order.push('bandao');
        return new Response('Bad Gateway', {status: 502});
      }
      order.push('gemini');
      return new Response('Service Unavailable', {status: 503});
    }
  });
  const res = await requestBandao(
    {response_format: {type: 'json_object'}, messages: [{role: 'system', content: '返回 JSON'}, {role: 'user', content: '测试'}]},
    {
      purpose: '对话转录补拟',
      agyReady: () => true,
      agyRun: async ({prompt}) => {
        order.push('agy');
        assert.match(prompt, /只输出一个合法的 JSON 对象/);
        return {success: true, response: '```json\n{"ok":true}\n```'};
      }
    }
  );
  assert.deepEqual(order, ['bandao', 'gemini', 'agy']);
  assert.deepEqual(res, {content: '{"ok":true}', finishReason: 'stop'});
});

test('requestBandao 未配置 Gemini 时跳过 Gemini 直接问 AGY CLI；全部失败保留半岛原始错误码', async t => {
  const calls = setupKeysAndFetch(t, {
    geminiKey: null,
    handler: () => new Response('Bad Gateway', {status: 502})
  });
  let agyCalled = 0;
  const okRes = await requestBandao(
    {messages: [{role: 'user', content: '你好'}]},
    {
      agyReady: () => true,
      agyRun: async () => { agyCalled++; return {success: true, response: 'AGY 兜底答复'}; }
    }
  );
  assert.deepEqual(okRes, {content: 'AGY 兜底答复', finishReason: 'stop'});
  assert.equal(calls.length, 1);
  assert.equal(agyCalled, 1);

  await assert.rejects(
    requestBandao(
      {messages: [{role: 'user', content: '你好'}]},
      {
        agyReady: () => true,
        agyRun: async () => ({success: false, error: 'AGY_CLI_FAILED'})
      }
    ),
    {code: 'DEEPSEEK_HTTP_502'}
  );
});

test('askBandaoJson 在半岛 502 或返回非 JSON 时依次兜底 Gemini → AGY CLI', async t => {
  const order = [];
  setupKeysAndFetch(t, {
    handler: url => {
      if (url.includes('sub.bandaoapi.com')) {
        order.push('bandao');
        return new Response('Bad Gateway', {status: 502});
      }
      order.push('gemini');
      return Response.json({
        choices: [{finish_reason: 'stop', message: {content: JSON.stringify({reply: 'Gemini 结构化'})}}]
      });
    }
  });
  const fromGemini = await askBandaoJson({
    instruction: '回复用户',
    schema: replySchema,
    input: '你好',
    agyReady: () => true,
    agyRun: async () => { order.push('agy'); return {success: true, structuredOutput: {reply: '不应走到 AGY'}}; }
  });
  assert.deepEqual(fromGemini, {reply: 'Gemini 结构化'});
  assert.deepEqual(order, ['bandao', 'gemini']);

  // 半岛两次非 JSON + Gemini 也返回非 JSON → 落到 AGY CLI
  order.length = 0;
  setupKeysAndFetch(t, {
    handler: url => {
      order.push(url.includes('sub.bandaoapi.com') ? 'bandao' : 'gemini');
      return Response.json({choices: [{finish_reason: 'stop', message: {content: '不是 JSON'}}]});
    }
  });
  const fromAgy = await askBandaoJson({
    instruction: '回复用户',
    schema: replySchema,
    input: '你好',
    agyReady: () => true,
    agyRun: async ({schema}) => {
      order.push('agy');
      assert.deepEqual(schema, replySchema);
      return {success: true, structuredOutput: {reply: 'AGY 结构化'}};
    }
  });
  assert.deepEqual(fromAgy, {reply: 'AGY 结构化'});
  assert.deepEqual(order, ['bandao', 'bandao', 'gemini', 'gemini', 'agy']);
});

test('防环：AGY 失败切半岛且半岛也 502 时，可由 Gemini 兜底，但绝不再回兜 AGY CLI', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'agy-loop-guard-'));
  const script = join(dir, 'fail-agy.mjs');
  const countFile = join(dir, 'count.txt');
  await writeFile(
    script,
    `import {appendFileSync} from 'node:fs';
if (process.argv.includes('--version')) { console.log('0.0.0-test'); process.exit(0); }
appendFileSync(${JSON.stringify(countFile)}, '1\\n');
console.log(JSON.stringify({status: 'ERROR', error: 'TRANSIENT_FAILURE'}));
process.exit(0);
`,
    'utf8'
  );
  const prevPath = process.env.FEIYUE_AGY_PATH;
  process.env.FEIYUE_AGY_PATH = script;
  t.after(async () => {
    stopAgyStandby();
    resetAgyResourceExhausted();
    if (prevPath === undefined) delete process.env.FEIYUE_AGY_PATH;
    else process.env.FEIYUE_AGY_PATH = prevPath;
    await rm(dir, {recursive: true, force: true});
  });

  const verdictSchema = {
    type: 'object',
    properties: {answer: {enum: ['是', '否']}},
    required: ['answer'],
    additionalProperties: false
  };

  // 场景 1：AGY 失败 → 半岛 502 → Gemini 成功
  const calls = setupKeysAndFetch(t, {
    handler: url => {
      if (url.includes('sub.bandaoapi.com')) return new Response('Bad Gateway', {status: 502});
      return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify({answer: '是'})}}]});
    }
  });
  const ai = createLocalAi({file: ':memory:', useAgy: true});
  t.after(() => ai.close());
  const ok = await ai.memory('判断材料', '判断是否属实', verdictSchema, AbortSignal.timeout(5000), {
    name: 'personal-conversation',
    stage: 'explained'
  });
  assert.deepEqual(ok, {answer: '是'});
  assert.equal(calls.length, 2);
  const countAfterOk = (await readFile(countFile, 'utf8')).trim().split('\n').filter(Boolean).length;
  assert.equal(countAfterOk, 1, 'AGY 只应被调用 1 次');

  // 场景 2：AGY 失败 → 半岛 502 → Gemini 也 502，不得再次调用 AGY CLI
  const ai2 = createLocalAi({file: ':memory:', useAgy: true});
  t.after(() => ai2.close());
  setupKeysAndFetch(t, {
    handler: () => new Response('Bad Gateway', {status: 502})
  });
  await assert.rejects(
    ai2.memory('判断材料2', '判断是否属实', verdictSchema, AbortSignal.timeout(5000), {
      name: 'personal-conversation',
      stage: 'explained'
    }),
    {code: 'TRANSIENT_FAILURE'}
  );
  const countAfterFail = (await readFile(countFile, 'utf8')).trim().split('\n').filter(Boolean).length;
  assert.equal(countAfterFail, 2, '第二次请求 AGY 失败后不得被半岛再次回兜 AGY');
});

test('用户主动取消或缺少半岛密钥时不触发兜底', async t => {
  let geminiCalled = 0;
  let agyCalled = 0;
  await assert.rejects(
    requestBandao(
      {messages: [{role: 'user', content: '你好'}]},
      {
        key: '',
        geminiReady: () => true,
        geminiRequest: async () => { geminiCalled++; return {content: '不应触发', finishReason: 'stop'}; },
        agyReady: () => true,
        agyRun: async () => { agyCalled++; return {success: true, response: '不应触发'}; }
      }
    ),
    {code: 'DEEPSEEK_KEY_MISSING'}
  );
  assert.equal(geminiCalled, 0);
  assert.equal(agyCalled, 0);

  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    requestBandao(
      {messages: [{role: 'user', content: '你好'}]},
      {
        key: 'fixture-bandao',
        signal: ac.signal,
        geminiReady: () => true,
        geminiRequest: async () => { geminiCalled++; return {content: '不应触发', finishReason: 'stop'}; },
        agyReady: () => true,
        agyRun: async () => { agyCalled++; return {success: true, response: '不应触发'}; }
      }
    )
  );
  assert.equal(geminiCalled, 0);
  assert.equal(agyCalled, 0);
});

test('兜底单步超时时自动中止并跳过到下一条兜底', async t => {
  const order = [];
  setupKeysAndFetch(t, {
    handler: async (url, _body) => {
      if (url.includes('sub.bandaoapi.com')) {
        order.push('bandao');
        return new Response('Bad Gateway', {status: 502});
      }
      order.push('gemini');
      await new Promise(resolve => setTimeout(resolve, 500));
      return Response.json({choices: [{finish_reason: 'stop', message: {content: '太晚了'}}]});
    }
  });
  const res = await requestBandao(
    {messages: [{role: 'user', content: '超时跳过测试'}]},
    {
      timeoutMs: 40,
      agyReady: () => true,
      agyRun: async ({timeoutMs, signal}) => {
        order.push('agy');
        assert.equal(timeoutMs, 40);
        assert.equal(signal.aborted, false);
        return {success: true, response: 'Gemini 超时后 AGY 接棒'};
      }
    }
  );
  assert.deepEqual(res, {content: 'Gemini 超时后 AGY 接棒', finishReason: 'stop'});
  assert.deepEqual(order, ['bandao', 'gemini', 'agy']);
});

test('json_object 模式下 Gemini 返回非 JSON 时自动继续切 AGY CLI，返回代码块 JSON 时自动剥离', async t => {
  // 场景 1：Gemini 返回非 JSON 正文，自动切 AGY CLI
  const order = [];
  setupKeysAndFetch(t, {
    handler: url => {
      if (url.includes('sub.bandaoapi.com')) {
        order.push('bandao');
        return new Response('Bad Gateway', {status: 502});
      }
      order.push('gemini');
      return Response.json({choices: [{finish_reason: 'stop', message: {content: '抱歉我直接写了正文'}}]});
    }
  });
  const res1 = await requestBandao(
    {response_format: {type: 'json_object'}, messages: [{role: 'user', content: '返回对象'}]},
    {
      agyReady: () => true,
      agyRun: async () => {
        order.push('agy');
        return {success: true, response: '{"from":"agy"}'};
      }
    }
  );
  assert.deepEqual(res1, {content: '{"from":"agy"}', finishReason: 'stop'});
  assert.deepEqual(order, ['bandao', 'gemini', 'agy']);

  // 场景 2：Gemini 返回带 ```json 代码块的对象，自动剥离并直接返回
  setupKeysAndFetch(t, {
    handler: url => {
      if (url.includes('sub.bandaoapi.com')) return new Response('Bad Gateway', {status: 502});
      return Response.json({choices: [{finish_reason: 'stop', message: {content: '```json\n{"from":"gemini"}\n```'}}]});
    }
  });
  const res2 = await requestBandao(
    {response_format: {type: 'json_object'}, messages: [{role: 'user', content: '返回对象'}]},
    {agyReady: () => true, agyRun: async () => assert.fail('Gemini 已返回合法 JSON，不应再走 AGY')}
  );
  assert.deepEqual(res2, {content: '{"from":"gemini"}', finishReason: 'stop'});
});

