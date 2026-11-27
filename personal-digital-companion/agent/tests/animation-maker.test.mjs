import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAnimationMaker, createVoiceStudio} from '../../desktop/animation-maker.mjs';

const ok = body => ({ok: true, json: async () => body});

test('动画生成器：服务已运行时直接打开页签，不重复启动', async () => {
  const opened = [], spawned = [];
  const maker = createAnimationMaker({openExternal: u => opened.push(u), spawn: (...a) => spawned.push(a), fetcher: async () => ok({app: 'webmcreator'}), base: 'http://x'});
  await maker.open('gif');
  await maker.open('local');
  assert.deepEqual(opened, ['http://x/#gif', 'http://x/#local']);
  assert.equal(spawned.length, 0);
  await assert.rejects(maker.open('bad'), /未知页签/);
});

test('动画生成器：未运行时以独立进程启动并清除 ELECTRON_RUN_AS_NODE，连点只启动一次', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wm-'));
  writeFileSync(join(dir, 'server.mjs'), '');
  process.env.ELECTRON_RUN_AS_NODE = '1';
  let up = false; const opened = [], spawned = [];
  const maker = createAnimationMaker({
    dir, base: 'http://x', sleep: async () => {}, openExternal: u => opened.push(u),
    fetcher: async () => { if (!up) throw Error('down'); return ok({app: 'webmcreator'}); },
    spawn: (cmd, args, opts) => { spawned.push({cmd, args, opts}); up = true; return {on() {}, unref() {}}; },
  });
  try {
    await Promise.all([maker.open('crop'), maker.open('gemini')]);
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].cmd, 'node');
    assert.equal(spawned[0].opts.detached, true);
    assert.equal(spawned[0].opts.env.ELECTRON_RUN_AS_NODE, undefined);
    assert.deepEqual(opened.sort(), ['http://x/#crop', 'http://x/#gemini']);
  } finally { delete process.env.ELECTRON_RUN_AS_NODE; rmSync(dir, {recursive: true, force: true}); }
});

test('动画生成器：目录缺失或启动超时给出明确错误', async () => {
  const down = async () => { throw Error('down'); };
  await assert.rejects(createAnimationMaker({dir: 'Z:/none', fetcher: down, openExternal() {}}).open('crop'), /找不到动画生成器/);
  const dir = mkdtempSync(join(tmpdir(), 'wm-'));
  writeFileSync(join(dir, 'server.mjs'), '');
  try {
    await assert.rejects(createAnimationMaker({dir, wait: 500, sleep: async () => {}, fetcher: down, openExternal() {}, spawn: () => ({on() {}, unref() {}})}).open('crop'), /未启动/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('语音制作：按自己的服务名识别，打开根地址，缺目录时报语音制作', async () => {
  const opened = [], spawned = [];
  const maker = createVoiceStudio({openExternal: u => opened.push(u), spawn: (...a) => spawned.push(a), fetcher: async () => ok({app: 'voicestudio'}), base: 'http://v'});
  await maker.open();
  assert.deepEqual([opened, spawned.length], [['http://v/'], 0]);
  // 端口上是别的服务时不当作已运行
  await assert.rejects(createVoiceStudio({dir: 'Z:/none', fetcher: async () => ok({app: 'webmcreator'}), openExternal() {}}).open(), /找不到语音制作/);
});
