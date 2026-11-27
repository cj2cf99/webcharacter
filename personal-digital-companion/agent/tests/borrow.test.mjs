import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBorrow} from '../../desktop/borrow.mjs';
import {openLocalREST} from '../../desktop/local-rest.mjs';
import {requestGeminiImage} from '../../desktop/ai-gateway.mjs';

const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const until = async check => { for (let i = 0; i < 200; i++) { const v = check(); if (v) return v; await new Promise(r => setTimeout(r, 5)); } throw Error('超时'); };

test('借用：校验输入、同编号不重复执行、逐个执行、失败写原因', async () => {
  const calls = [], order = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const borrow = createBorrow({
    gemini: async input => { calls.push(input); order.push('ai-start'); await gate; order.push('ai-end'); return {mime: 'image/png', bytes: png(848, 1264)}; },
    upscale: async () => { order.push('comfy'); throw Error('ComfyUI 未运行'); },
    cli: async () => ({stdout: 'Python 3'}),
  });
  const img = {mime: 'image/png', base64: png(600, 900).toString('base64')};
  assert.throws(() => borrow.submit({id: 'A', channel: 'ai'}), /稳定编号/);
  assert.throws(() => borrow.submit({id: 'x1', channel: 'ai', kind: 'gemini-image', prompt: ''}), /提示词/);
  assert.throws(() => borrow.submit({id: 'x2', channel: 'ai', kind: 'gemini-image', prompt: 'p', aspectRatio: '7:3'}), /aspectRatio/);
  assert.throws(() => borrow.submit({id: 'x3', channel: 'cli', command: 'rm'}), /已登记命令/);
  assert.throws(() => borrow.submit({id: 'x4', channel: 'comfy', workflow: 'upscale', image: {mime: 'image/gif', base64: 'AA=='}}), /图片须为/);
  assert.equal(borrow.submit({id: 'g1', channel: 'ai', kind: 'gemini-image', prompt: '换绿幕', images: [img], aspectRatio: '2:3'}).existing, false);
  assert.equal(borrow.submit({id: 'g1', channel: 'ai', kind: 'gemini-image', prompt: '换绿幕'}).existing, true);
  assert.throws(() => borrow.submit({id: 'g1', channel: 'cli', command: 'python-version'}), /另一类/);
  borrow.submit({id: 'u1', channel: 'comfy', workflow: 'upscale', image: img});
  borrow.submit({id: 'c1', channel: 'cli', command: 'python-version'});
  assert.equal(borrow.get('u1').state, 'queued');
  assert.equal(borrow.get('u1').queue.position, 2);
  release();
  await until(() => borrow.get('c1').state === 'done');
  assert.deepEqual(order, ['ai-start', 'ai-end', 'comfy'], '逐个执行');
  assert.equal(calls.length, 1, '同编号只执行一次');
  assert.equal(calls[0].aspectRatio, '2:3');
  assert.ok(Buffer.isBuffer(calls[0].images[0].bytes));
  const g = borrow.get('g1');
  assert.deepEqual([g.state, g.result.image.width, g.result.image.height], ['done', 848, 1264]);
  assert.equal(g.task, undefined, '不回显输入');
  assert.deepEqual([borrow.get('u1').state, borrow.get('u1').error], ['failed', 'ComfyUI 未运行']);
  assert.equal(borrow.get('c1').result.stdout, 'Python 3');
  assert.equal(borrow.get('nope'), null);
});

test('借用：只保留最近 30 个结果', async () => {
  const borrow = createBorrow({gemini: async () => ({mime: 'image/png', bytes: png(1, 1)}), upscale: async () => ({}), cli: async () => ({stdout: ''})});
  for (let i = 0; i < 35; i++) borrow.submit({id: 'k' + i, channel: 'cli', command: 'python-version'});
  await until(() => borrow.get('k34')?.state === 'done');
  assert.equal(borrow.get('k0'), null);
  assert.equal(borrow.get('k5').state, 'done');
});

test('Gemini 客户端：aspectRatio 写入 imageConfig，未给时不带', async () => {
  const bodies = [];
  const fetcher = async (_u, init) => { bodies.push(JSON.parse(init.body)); return {ok: true, status: 200, text: async () => JSON.stringify({candidates: [{content: {parts: [{inlineData: {mimeType: 'image/png', data: 'AA=='}}]}}]})}; };
  await requestGeminiImage({prompt: 'p', aspectRatio: '2:3', key: 'k', fetcher});
  await requestGeminiImage({prompt: 'p', key: 'k', fetcher});
  assert.deepEqual(bodies[0].generationConfig.imageConfig, {aspectRatio: '2:3'});
  assert.equal(bodies[1].generationConfig.imageConfig, undefined);
});

test('REST：/v1/borrow 鉴权、大请求体、202/200/404 与说明 v9', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'feiyue-borrow-'));
  const borrow = createBorrow({gemini: async () => ({mime: 'image/png', bytes: png(400, 600)}), upscale: async () => ({}), cli: async () => ({stdout: ''})});
  const api = await openLocalREST({profile, pool: {}, borrow, listenPort: 0});
  try {
    const headers = {authorization: 'Bearer ' + readFileSync(join(profile, 'local-api.token'), 'utf8'), 'content-type': 'application/json'};
    const big = Buffer.alloc(3 * 1024 * 1024, 1).toString('base64');
    const body = JSON.stringify({id: 'wm-1', channel: 'ai', kind: 'gemini-image', prompt: '换绿幕', images: [{mime: 'image/png', base64: big}], aspectRatio: '2:3'});
    assert.equal((await fetch(api.address + '/v1/borrow', {method: 'POST', headers: {'content-type': 'application/json'}, body})).status, 401);
    const r1 = await fetch(api.address + '/v1/borrow', {method: 'POST', headers, body});
    assert.equal(r1.status, 202);
    assert.equal((await fetch(api.address + '/v1/borrow', {method: 'POST', headers, body})).status, 200);
    const done = await until(async () => true) && await (async () => { for (;;) { const j = await (await fetch(api.address + '/v1/borrow/wm-1', {headers})).json(); if (j.state === 'done') return j; await new Promise(r => setTimeout(r, 10)); } })();
    assert.equal(done.result.image.width, 400);
    assert.equal((await fetch(api.address + '/v1/borrow/wm-none', {headers})).status, 404);
    const bad = await fetch(api.address + '/v1/borrow', {method: 'POST', headers, body: JSON.stringify({id: 'wm-2', channel: 'x'})});
    assert.equal(bad.status, 400);
    const guide = await (await fetch(api.address + '/infoguide')).json();
    assert.equal(guide.version, 9);
    assert.deepEqual(guide.borrow.channels, ['ai', 'comfy', 'cli']);
    assert.ok(guide.routes.some(r => r.path === '/v1/borrow'));
    assert.deepEqual(guide.borrow.commands, ['python-version']);
  } finally { await api.close(); rmSync(profile, {recursive: true, force: true}); }
});
