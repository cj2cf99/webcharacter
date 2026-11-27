import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBorrow} from '../../desktop/borrow.mjs';
import {openLocalREST} from '../../desktop/local-rest.mjs';

process.env.FEIYUE_AGY_PATH = fileURLToPath(new URL('./fixtures/fake-agy.mjs', import.meta.url));
process.env.FEIYUE_AGY_WORKDIR = mkdtempSync(join(tmpdir(), 'feiyue-agy-borrow-'));
const {agyActiveCalls, runAgyIsolated, runAgyPrompt, createAgyConversation} = await import('../../desktop/agy-cli-client.mjs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async check => { for (let i = 0; i < 400; i++) { const v = check(); if (v) return v; await sleep(5); } throw Error('超时'); };
const make = extra => createBorrow({gemini: async () => ({}), upscale: async () => ({}), cli: async () => ({stdout: ''}), quietMs: 30, pollMs: 5, ...extra});

test('agy 借用：让位给绯月与冷却，空闲够久才开始，逐个执行', async () => {
  let busy = 'busy';
  const started = [];
  const borrow = make({agy: async ({prompt}) => { started.push(prompt); return {success: true, response: '{"text":"好"}'}; }, agyBusy: () => busy});
  borrow.submit({id: 'a1', channel: 'agy', prompt: '一'});
  borrow.submit({id: 'a2', channel: 'agy', prompt: '二'});
  await sleep(60);
  assert.deepEqual([started.length, borrow.get('a1').state, borrow.get('a1').waiting, borrow.get('a2').queue.position], [0, 'queued', 'busy', 2]);
  busy = 'cooldown';
  await until(() => borrow.get('a1').waiting === 'cooldown');
  busy = null;
  await until(() => borrow.get('a2').state === 'done');
  assert.deepEqual(started, ['一', '二']);
  assert.deepEqual(borrow.get('a1').result, {text: '{"text":"好"}'});
  assert.equal(borrow.get('a1').task, undefined);
  assert.equal(borrow.get('a1').waiting, undefined);
});

test('agy 借用不阻塞生图与放大；失败写原因', async () => {
  const borrow = make({agy: async () => ({success: false, error: 'RESOURCE_EXHAUSTED'}), agyBusy: () => 'busy'});
  borrow.submit({id: 'w1', channel: 'agy', prompt: '等'});
  borrow.submit({id: 'c1', channel: 'cli', command: 'python-version'});
  await until(() => borrow.get('c1').state === 'done');
  assert.equal(borrow.get('w1').state, 'queued');
  borrow.cancel('w1');
  const other = make({agy: async () => ({success: false, error: 'RESOURCE_EXHAUSTED'})});
  other.submit({id: 'f1', channel: 'agy', prompt: 'x'});
  await until(() => other.get('f1').state === 'failed');
  assert.match(other.get('f1').error, /额度/);
});

test('取消：排队的移除，执行中的中断；其他通道不可取消', async () => {
  let aborted = false;
  const borrow = make({agy: ({signal}) => new Promise(done => signal.addEventListener('abort', () => { aborted = true; done({success: false, error: 'ABORTED'}); }))});
  borrow.submit({id: 'r1', channel: 'agy', prompt: '跑'});
  borrow.submit({id: 'r2', channel: 'agy', prompt: '排'});
  await until(() => borrow.get('r1').state === 'running');
  assert.deepEqual(borrow.cancel('r2'), {id: 'r2', cancelled: true});
  borrow.cancel('r1');
  await until(() => aborted);
  assert.deepEqual([borrow.get('r1'), borrow.get('r2'), borrow.cancel('none')], [null, null, null]);
  borrow.submit({id: 'r3', channel: 'agy', prompt: '再来'});
  await until(() => borrow.get('r3').state === 'running');
  borrow.cancel('r3');
  borrow.submit({id: 'c9', channel: 'cli', command: 'python-version'});
  assert.throws(() => borrow.cancel('c9'), /只能取消/);
});

test('未装 agy 返回 503，提示词有长度限制', () => {
  assert.throws(() => make().submit({id: 'n1', channel: 'agy', prompt: 'x'}), e => e.status === 503);
  assert.throws(() => make({agy: async () => ({})}).submit({id: 'n2', channel: 'agy', prompt: 'x'.repeat(4001)}), /1～4000/);
});

test('一次性调用经标准输入传提示词，不计入绯月调用数；绯月调用计数', async () => {
  const tricky = '台词 "引号" $HOME `echo x` <b> & | 换行\n第二行';
  const one = runAgyIsolated({prompt: tricky});
  assert.equal(agyActiveCalls(), 0);
  const r = await one;
  assert.equal(r.success, true);
  assert.match(r.response, /第1轮/);
  const own = runAgyPrompt({prompt: '问'});
  assert.equal(agyActiveCalls(), 1);
  await own;
  assert.equal(agyActiveCalls(), 0);
  const chat = createAgyConversation();
  const turn = chat.ask('你好');
  await until(() => agyActiveCalls() === 1);
  await turn;
  assert.equal(agyActiveCalls(), 0);
  chat.close();
});

test('REST：DELETE 取消与说明列出 agy 通道', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'feiyue-borrow-agy-'));
  const borrow = make({agy: async () => ({success: true, response: 'ok'}), agyBusy: () => 'busy'});
  const api = await openLocalREST({profile, pool: {}, borrow, listenPort: 0});
  try {
    const headers = {authorization: 'Bearer ' + readFileSync(join(profile, 'local-api.token'), 'utf8'), 'content-type': 'application/json'};
    assert.equal((await fetch(api.address + '/v1/borrow', {method: 'POST', headers, body: JSON.stringify({id: 'vs-1', channel: 'agy', prompt: '改写'})})).status, 202);
    assert.equal((await fetch(api.address + '/v1/borrow/vs-1', {method: 'DELETE'})).status, 401);
    assert.equal((await fetch(api.address + '/v1/borrow/vs-1', {method: 'DELETE', headers})).status, 200);
    assert.equal((await fetch(api.address + '/v1/borrow/vs-1', {headers})).status, 404);
    assert.equal((await fetch(api.address + '/v1/borrow/vs-1', {method: 'DELETE', headers})).status, 404);
    const guide = await (await fetch(api.address + '/infoguide')).json();
    assert.deepEqual([guide.version, guide.borrow.channels.includes('agy')], [9, true]);
  } finally { await api.close(); rmSync(profile, {recursive: true, force: true}); }
});

test.after(async () => { const {stopAgyStandby} = await import('../../desktop/agy-cli-client.mjs'); stopAgyStandby(); setTimeout(() => process.exit(), 8000).unref(); });
