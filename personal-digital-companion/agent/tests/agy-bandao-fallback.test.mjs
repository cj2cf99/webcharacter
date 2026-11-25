import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resetAgyResourceExhausted, stopAgyStandby} from '../../desktop/agy-cli-client.mjs';
import {createAgyCliModel} from '../../desktop/agy-local-model.mjs';
import {createLocalAi, createPrivateModel} from '../../desktop/ai-gateway.mjs';
import {createAgyVision} from '../../desktop/vision-client.mjs';

const verdictSchema = {
  type: 'object',
  properties: {answer: {enum: ['是', '否']}},
  required: ['answer'],
  additionalProperties: false
};

async function createFailingAgyScript(t, message = 'QUOTA_EXCEEDED') {
  const dir = await mkdtemp(join(tmpdir(), 'agy-fail-'));
  const script = join(dir, 'fail-agy.mjs');
  const countFile = join(dir, 'count.txt');
  await writeFile(
    script,
    `import {appendFileSync} from 'node:fs';
appendFileSync(${JSON.stringify(countFile)}, '1\\n');
if (process.argv.includes('--version')) { console.log('0.0.0-test'); process.exit(0); }
console.log(JSON.stringify({status: 'ERROR', error: ${JSON.stringify(message)}}));
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
  return {script, countFile};
}

function mockBandao(t, responder) {
  const calls = [];
  const prevKey = process.env.bandao_api_key;
  const realFetch = globalThis.fetch;
  process.env.bandao_api_key = 'fixture-bandao-key';
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({url, headers: init.headers, body});
    return responder(body, calls.length);
  };
  t.after(() => {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.bandao_api_key;
    else process.env.bandao_api_key = prevKey;
  });
  return calls;
}

test('createLocalAi 与 createPrivateModel 在 AGY 访问失败（如额度耗尽）时自动走半岛兜底', async t => {
  await createFailingAgyScript(t, 'RESOURCE_EXHAUSTED');
  const calls = mockBandao(t, body => {
    if (body.response_format?.type === 'json_object') {
      const sys = body.messages[0]?.content || '';
      if (sys.includes('"kind"')) {
        return Response.json({
          choices: [{
            finish_reason: 'stop',
            message: {content: JSON.stringify({kind: 'chat', summary: '打招呼', reply: '老公回来啦', review: false})}
          }]
        });
      }
      return Response.json({
        choices: [{finish_reason: 'stop', message: {content: JSON.stringify({answer: '是'})}}]
      });
    }
    return Response.json({
      choices: [{finish_reason: 'stop', message: {content: '好的老公，我在呢。'}}]
    });
  });

  const logs = [];
  const ai = createLocalAi({file: ':memory:', useAgy: true, log: entry => logs.push(entry)});
  t.after(() => ai.close());

  // 封闭判断原本留在本机（AGY），AGY 失败后自动切半岛兜底
  const judged = await ai.memory('材料', '判断是否属实', verdictSchema, AbortSignal.timeout(10_000), {
    name: 'personal-conversation',
    stage: 'explained'
  });
  assert.deepEqual(judged, {answer: '是'});

  // 非直连对话（auto 与 speech）同样由半岛兜底
  const autoRes = await ai.analyze('我回来了', {hint: 'auto'});
  assert.equal(autoRes.kind, 'chat');
  assert.equal(autoRes.reply, '老公回来啦');

  const speechRes = await ai.analyze('晚安', {replyMode: 'speech'});
  assert.equal(speechRes.kind, 'chat');
  assert.equal(speechRes.reply, '好的老公，我在呢。');

  // 直连只走本机：无本机模型时直接报错，不走 AGY 也不触发半岛兜底
  const callsBeforeDirect = calls.length;
  const directRes = await ai.analyze('直连测试', {hint: 'direct'});
  assert.equal(directRes.error, 'LOCAL_AI_NOT_READY');
  assert.equal(calls.length, callsBeforeDirect, '直连只走本机，不得触发半岛兜底');

  // 专聊模型同样具备半岛兜底
  const privateModel = createPrivateModel({useAgy: true, modelPath: join(tmpdir(), 'unused.gguf'), log: entry => logs.push(entry)});
  t.after(() => privateModel.close());
  const privRes = await privateModel.analyze('悄悄话', {hint: 'direct'});
  assert.equal(privRes.reply, '好的老公，我在呢。');

  assert.ok(calls.length >= 4);
  for (const call of calls) {
    assert.equal(call.url, 'https://sub.bandaoapi.com/v1/chat/completions');
    assert.equal(call.headers.authorization, 'Bearer fixture-bandao-key');
  }
  assert.ok(logs.some(entry => entry.fallback === 'bandao'), '任务日志应记录半岛兜底');
});

test('未配置半岛密钥时保留原始 AGY 错误，不发起外网请求', async t => {
  await createFailingAgyScript(t, 'QUOTA_EXCEEDED');
  const prevKey = process.env.bandao_api_key;
  const realFetch = globalThis.fetch;
  delete process.env.bandao_api_key;
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount++; throw new Error('不应发外网请求'); };
  t.after(() => {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.bandao_api_key;
    else process.env.bandao_api_key = prevKey;
  });

  const ai = createLocalAi({file: ':memory:', useAgy: true});
  t.after(() => ai.close());
  const res = await ai.analyze('你好', {hint: 'auto'});
  assert.equal(res.error, 'QUOTA_EXCEEDED');
  assert.equal(fetchCount, 0);
});

test('冷却机制：AGY 失败切半岛后冷却期内直达半岛，冷却期满自动恢复探测，半岛失败时立即解除冷却', async t => {
  const {countFile} = await createFailingAgyScript(t, 'QUOTA_EXCEEDED');
  const {readFileSync} = await import('node:fs');
  const agyCalls = () => {
    try { return readFileSync(countFile, 'utf8').trim().split('\n').filter(Boolean).length; }
    catch { return 0; }
  };

  let fbCalls = 0;
  let fbShouldFail = false;
  const model = createAgyCliModel({
    cooldownMs: 200,
    fallback: async ({schema}) => {
      fbCalls++;
      if (fbShouldFail) return {success: false, error: 'DEEPSEEK_UNAVAILABLE'};
      if (schema) return {success: true, structuredOutput: {answer: '是'}, response: '{"answer":"是"}', fallback: 'bandao'};
      return {success: true, response: '半岛回复', fallback: 'bandao'};
    }
  });
  t.after(() => model.close());

  // 第 1 次：先试 AGY（失败），再切半岛并进入冷却
  assert.deepEqual(await model.memory('m1', '判断', verdictSchema), {answer: '是'});
  const afterFirstAgy = agyCalls();
  assert.ok(afterFirstAgy >= 1);
  assert.equal(fbCalls, 1);

  // 第 2 次（冷却期内）：直接走半岛，不再调用 AGY
  assert.deepEqual(await model.memory('m2', '判断', verdictSchema), {answer: '是'});
  assert.equal(agyCalls(), afterFirstAgy, '冷却期内不应重复调用失败的 AGY');
  assert.equal(fbCalls, 2);

  // 冷却期内半岛临时失败：解除冷却并回到 AGY 尝试一次
  fbShouldFail = true;
  await assert.rejects(model.memory('m3', '判断', verdictSchema), {code: 'QUOTA_EXCEEDED'});
  assert.ok(agyCalls() > afterFirstAgy, '半岛失败后应解除冷却尝试 AGY');

  // 恢复半岛正常并等待冷却期满后，再次探测 AGY
  fbShouldFail = false;
  assert.deepEqual(await model.memory('m4', '判断', verdictSchema), {answer: '是'});
  const beforeExpire = agyCalls();
  await new Promise(r => setTimeout(r, 250));
  assert.deepEqual(await model.memory('m5', '判断', verdictSchema), {answer: '是'});
  assert.ok(agyCalls() > beforeExpire, '冷却期满后应自动探测 AGY 是否恢复');
});

test('用户主动取消时不触发半岛兜底', async t => {
  await createFailingAgyScript(t, 'QUOTA_EXCEEDED');
  let fbCalled = false;
  const model = createAgyCliModel({
    fallback: async () => { fbCalled = true; return {success: true, response: '不应触发'}; }
  });
  t.after(() => model.close());

  const ac = new AbortController();
  ac.abort();
  const res = await model.analyze('你好', {hint: 'direct', signal: ac.signal});
  assert.equal(res.error, 'LOCAL_AI_STOPPED');
  assert.equal(fbCalled, false);
});

test('AGY 识图运行失败（如额度耗尽）时自动回退备用视觉并清理临时图片', async t => {
  const tempDir = await mkdtemp(join(tmpdir(), 'agy-vision-fb-'));
  t.after(() => rm(tempDir, {recursive: true, force: true}));
  const image = {mime_type: 'image/png', data_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='};
  let fallbackCalls = 0;
  const vision = createAgyVision({
    tempDir,
    isAvailable: () => true,
    runAgy: async () => ({success: false, error: 'QUOTA_EXCEEDED'}),
    fallback: async () => { fallbackCalls++; return {text: '云端视觉兜底回答'}; }
  });
  assert.deepEqual(await vision('图里有什么？', image, AbortSignal.timeout(5000)), {text: '云端视觉兜底回答'});
  assert.equal(fallbackCalls, 1);
  assert.deepEqual(await readdir(tempDir), [], '回退后也应清理临时图片');
});
