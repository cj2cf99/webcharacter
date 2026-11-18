// 用人工生成的色块验证时序与 Alpha；不冒充真实角色动作验收。
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run, inspect } from './media.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(resolve(root, 'output'), { recursive: true });
const dir = mkdtempSync(resolve(root, 'output/media-check-'));
const cli = fileURLToPath(new URL('./media.mjs', import.meta.url));
function command(...args) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r;
}
function alpha(path) {
  return run(['-loglevel', 'error', '-c:v', 'libvpx-vp9', '-i', path,
    '-vf', 'alphaextract', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { binary: true }).stdout;
}
for (const [kind, w, h] of [['green', 64, 64], ['alpha', 96, 48]]) {
  const framesDir = join(dir, kind);
  mkdirSync(framesDir);
  for (let n = 0; n < 4; n++) {
    const raw = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const body = x >= 12 + n * 3 && x < 36 + n * 3 && y >= 10 && y < h - 8;
      const edge = x === 11 + n * 3 && y >= 10 && y < h - 8;
      raw[i] = body || edge ? 240 : 0;
      raw[i + 1] = body || edge ? 40 : kind === 'green' ? 255 : 0;
      raw[i + 2] = body || edge ? 30 : 0;
      raw[i + 3] = body ? 255 : edge && kind === 'alpha' ? 128 : kind === 'green' ? 255 : 0;
    }
    const rgba = join(framesDir, `frame-${n}.rgba`);
    writeFileSync(rgba, raw);
    run(['-loglevel', 'error', '-n', '-f', 'rawvideo', '-pixel_format', 'rgba',
      '-video_size', `${w}x${h}`, '-i', rgba, '-frames:v', '1', join(framesDir, `frame-${String(n).padStart(4, '0')}.png`)]);
  }
  const gif = join(dir, `${kind}.gif`);
  command('frames-gif', '--input', join(framesDir, 'frame-%04d.png'), '--output', gif, '--fps', '20');
  assert.equal(inspect(gif).frames.length, 4);
  // 测试不等间隔帧。修改合成 GIF 中四个图形控制块的延时（单位 10ms）。
  const data = readFileSync(gif), delays = [5, 15, 25, 35];
  let j = 0;
  for (let i = 0; i < data.length - 7; i++) {
    if (data[i] === 0x21 && data[i + 1] === 0xf9 && data[i + 2] === 4 && data[i + 7] === 0) {
      data.writeUInt16LE(delays[j++], i + 4);
    }
  }
  assert.equal(j, 4);
  const variable = join(dir, `${kind}-variable.gif`);
  writeFileSync(variable, data);
  const source = inspect(variable);
  assert(Math.abs(source.seconds - 0.8) < 0.001);
  const webm = join(dir, `${kind}.webm`);
  command('gif-webm', '--input', variable, '--output', webm, '--key', kind === 'green' ? 'green' : 'none');
  const converted = inspect(webm, ['-c:v', 'libvpx-vp9']);
  assert.equal(converted.frames.length, source.frames.length);
  for (let i = 0; i < source.frames.length; i++) {
    assert(Math.abs(converted.frames[i].time - source.frames[i].time) < 0.011, '帧起始时间保持');
  }
  console.log(JSON.stringify({ kind, source, converted }));
  assert(Math.abs(converted.seconds - source.seconds) < 0.011, '最后一帧时长保持');
  const a = alpha(webm);
  assert.equal(a.length, w * h * 4, '尺寸和帧数保持');
  for (let n = 0; n < 4; n++) {
    assert.equal(a[n * w * h], 0, '角落透明');
    assert(a[n * w * h + 20 * w + 20 + n * 3] > 240, '主体不透明');
  }
  command('still-gif', '--input', join(framesDir, 'frame-0000.png'), '--output', join(dir, `${kind}-bob.gif`),
    '--motion', 'bob', '--seconds', '1', '--fps', '20', '--key', kind === 'green' ? 'green' : 'none');
  assert.equal(inspect(join(dir, `${kind}-bob.gif`)).frames.length, 20);
  const retry = spawnSync(process.execPath, [cli, 'gif-webm', '--input', variable, '--output', webm]);
  assert.notEqual(retry.status, 0, '不得覆盖已有输出');
}
console.log(`PASS：两种画布尺寸、图片→GIF、帧序列→GIF、绿幕/透明GIF→WebM、不等间隔时序、Alpha、输出保护。\n产物：${dir}`);
