import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {handleCompanion} from '../host/subscriptions.mjs';
import {createDesktopTasks} from '../../desktop/task-lifecycle.mjs';
import {initializeDatabase, openTestDatabase} from './sqlite-d1.mjs';

const path = '/api/assistant/provider-test';
function gateway(t, providers, attempt) {
  const db = openTestDatabase();
  t.after(db.close);
  initializeDatabase(db.sqlite);
  db.sqlite.exec("INSERT INTO ai_route_cooldown VALUES ('companion-owner','groq',9999999999999)");
  const env = {COMPANION_DB: db.DB, COMPANION_HOST: {providers, attempt}};
  return (route, options, actor = 'fixture', browser = false) => handleCompanion(
    new Request('https://fixture.test/api/companion' + route.slice(4), options), env, actor, browser);
}
async function menu(t, request) {
  const profile = await mkdtemp(join(tmpdir(), 'feiyue-provider-test-'));
  const dialogs = [];
  const dialog = {async showMessageBox(options) {
    if (options.title === '绯月连接测试') {
      assert.ok(options.buttons.includes('AI 轮询测试'));
      return {response: options.buttons.indexOf('AI 轮询测试')};
    }
    dialogs.push(options);
    return {response: 0};
  }};
  const tasks = await createDesktopTasks({profile, dialog, request});
  t.after(async () => { await tasks.stop(); await rm(profile, {recursive:true, force:true}); });
  await tasks.showCloudConnection();
  await tasks.traffic.flush();
  const log = (await readFile(tasks.traffic.file, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(dialogs.length, 1);
  return {box:dialogs[0], log};
}

test('桌面手动轮询跳过重复项，先失败后成功，冷却中的 Groq 也能受测，成功即停', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-20T15:01:02Z'));
  const called = [];
  const request = gateway(t, () => ['cloudflare','gemini','gemini','groq','sakura'], (provider, input) => {
    called.push(provider);
    if (provider === 'cloudflare') return {error:'EMPTY_RESPONSE'};
    if (provider === 'gemini') return {error:'CREDENTIAL_REJECTED', upstream_status:401};
    const echo = input.messages.at(-1).content.split('\n').at(-1);
    assert.match(echo, /2026年11月21日00时01分02秒/);
    return {value:{provider, model:'openai/gpt-oss-20b', finishReason:'stop', text:'“'+echo.replace('！','! ').replace('：',':')+'”'}};
  });
  const {box, log} = await menu(t, request);
  assert.deepEqual(called,['cloudflare','gemini','groq']);
  assert.equal(box.message,'成功 · groq');
  assert.match(box.detail,/openai\/gpt-oss-20b/);
  assert.match(box.detail,/2026年11月21日00时01分02秒/);
  assert.equal(log[1].ai.attempts.at(-1).reply_check,'matched');
  assert.deepEqual(log[1].ai.attempts.map(a=>a.code),['EMPTY_RESPONSE','CREDENTIAL_REJECTED','OK']);
  assert.equal(log[1].ai.attempts[1].upstream_status,401);
  assert.equal(log.at(-1).result,'success');
});

test('模型返回可用文本即停止；时间错误或回复被截短只在日志注明不符', async t => {
  for (const finishReason of ['stop','length']) {
    const called=[];
    const request=gateway(t,()=>['groq','plamo'],provider=>{
      called.push(provider);
      return {value:{provider, model:'model', finishReason, text:'你好！现在是：2001年01月01日00时00分00秒。'}};
    });
    const {box,log}=await menu(t,request);
    assert.deepEqual(called,['groq']);
    assert.equal(box.message,'成功 · groq');
    assert.doesNotMatch(box.detail,/现在是/);
    assert.equal(log[1].ai.attempts[0].code,'OK');
    assert.equal(log[1].ai.attempts[0].reply_check,'mismatch');
    assert.doesNotMatch(JSON.stringify(log),/2001年/);
  }
});

test('全部实际尝试后只显示接口名，空白回答与上游异常分别在本地留痕', async t => {
  const request = gateway(t, () => ['groq','plamo'], provider => {
    if (provider === 'groq') return {value:{provider, model:'model', finishReason:'stop', text:'  '}};
    throw Object.assign(Error('private upstream details'), {code:'RATE_LIMITED'});
  });
  const {box, log} = await menu(t, request);
  assert.equal(box.message,'已测试的 AI 接口全部失败');
  assert.equal(box.detail,'groq、plamo');
  assert.deepEqual(log[1].ai.attempts.map(a=>a.code),['EMPTY_RESPONSE','RATE_LIMITED']);
  assert.equal(log.at(-1).result,'all_failed');
  assert.doesNotMatch(JSON.stringify(log),/private upstream details/);
});

test('接口目录不可读、无授权、跨站及旧版入口都不会冒报全部失败', async t => {
  const request = gateway(t, () => { throw Error('unavailable'); }, () => assert.fail());
  assert.equal((await request(path,{method:'POST'},null)).status,403);
  assert.equal((await request(path,{method:'POST',headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await request(path,{method:'POST'},'fixture',true)).status,404);
  assert.equal((await request(path,{method:'GET'})).status,405);
  const result = await menu(t, request);
  assert.deepEqual(result.log[1].ai.attempts,[]);
  const old = await menu(t, () => new Response('Not Found',{status:404}));
  for (const {box, log} of [result,old]) {
    assert.equal(box.message,'未能取得完整的服务器测试结果');
    assert.equal(log.at(-1).result,'incomplete');
  }
});
