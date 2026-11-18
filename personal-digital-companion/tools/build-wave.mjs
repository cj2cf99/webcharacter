// 将已生成的 4×4 动作帧表拆分、色键去绿并合成点击挥手 GIF。
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { run, main, inspect } from './media.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const asset = resolve(root, 'assets/feiyue-click-wave-v1');
const frames = join(asset, 'frames');
const output = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'output/feiyue-click-wave-v1');
mkdirSync(frames, { recursive: true });
mkdirSync(output, { recursive: true });
const sheet = join(asset, 'wave-sheet-green.png');
const header = readFileSync(sheet);
assert.equal(header.readUInt32BE(16), 1024);
assert.equal(header.readUInt32BE(20), 1536);
const checks = [];
for (let n = 0; n < 16; n++) {
  const target = join(frames, `pose-${String(n).padStart(2, '0')}.png`);
  run(['-loglevel', 'error', '-y', '-i', sheet, '-vf',
    `crop=256:384:${n % 4 * 256}:${Math.floor(n / 4) * 384},format=rgba,colorkey=0x00FF00:0.20:0.10,despill=green:mix=0.5,scale=400:600:flags=lanczos`,
    '-frames:v', '1', target]);
  const raw = run(['-loglevel', 'error', '-i', target, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { binary: true }).stdout;
  assert.equal(raw.length, 400 * 600 * 4);
  let minX = 400, minY = 600, maxX = -1, maxY = -1, opaque = 0;
  for (let y = 0; y < 600; y++) for (let x = 0; x < 400; x++) {
    if (raw[(y * 400 + x) * 4 + 3] > 128) {
      minX = Math.min(x, minX); maxX = Math.max(x, maxX);
      minY = Math.min(y, minY); maxY = Math.max(y, maxY); opaque++;
    }
  }
  assert(minX > 5 && maxX < 395 && minY > 5 && maxY < 595, '角色不得出画');
  assert(opaque > 20000, '存在有效角色');
  assert.equal(raw[3], 0, '背景透明');
  checks.push({ pose: n, bbox: [minX, minY, maxX, maxY], opaquePixels: opaque });
}
// 首尾复用同一 PNG，避免生成图的收尾差异成为循环接缝。
const timeline = [[0,4],[1,2],[2,2],[3,2],[4,2],[5,3],[6,2],[7,3],[8,2],
  [9,3],[10,2],[11,3],[12,3],[13,2],[14,2],[15,2],[0,7]];
const timed = join(output, 'timed-frames');
mkdirSync(timed, { recursive: true });
let count = 0;
for (const [pose, ticks] of timeline) for (let i = 0; i < ticks; i++) {
  copyFileSync(join(frames, `pose-${String(pose).padStart(2, '0')}.png`),
    join(timed, `frame-${String(count++).padStart(4, '0')}.png`));
}
const gif = join(output, 'feiyue-happy-wave.gif');
main(['frames-gif', '--input', join(timed, 'frame-%04d.png'), '--output', gif, '--fps', '20']);
const info = inspect(gif);
assert.equal(info.frames.length, count);
assert(Math.abs(info.seconds - count / 20) < 0.01);
const decoded = run(['-loglevel', 'error', '-ignore_loop', '1', '-i', gif, '-fps_mode', 'passthrough',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { binary: true }).stdout;
const frameBytes = 400 * 600 * 4;
assert.equal(decoded.length, frameBytes * count);
assert(decoded.subarray(0, frameBytes).equals(decoded.subarray(-frameBytes)), '首尾解码帧完全一致');
for (let n = 0; n < count; n++) assert.equal(decoded[n * frameBytes + 3], 0, 'GIF 每帧背景透明');
// 关键帧拼图保持 Alpha；浅色背景动图用于便于观察头发与轮廓。
run(['-loglevel', 'error', '-y', '-framerate', '1', '-i', join(frames, 'pose-%02d.png'),
  '-vf', 'scale=200:300,tile=4x4:color=0xDDD5CA', '-frames:v', '1', join(output, 'contact-sheet.png')]);
run(['-loglevel', 'error', '-n', '-f', 'lavfi', '-i', `color=c=0xEEE7DE:s=400x600:r=20:d=${info.seconds}`,
  '-ignore_loop', '1', '-i', gif, '-filter_complex',
  '[0:v][1:v]overlay=shortest=1:format=auto,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a[v]',
  '-map', '[v]', '-an', '-loop', '0', '-final_delay', '5', join(output, 'feiyue-happy-wave-preview.gif')]);
const report = { width: 400, height: 600, fps: 20, frames: count, seconds: info.seconds,
  keyPoses: 16, timeline, checks, decodedAlphaChecked: true, firstLastFrameIdentical: true,
  note: '生成式连续关键帧小样；不是图生视频或完整骨骼动画，人物细节和动作平滑度待用户确认。' };
writeFileSync(join(output, 'checks.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ gif, count, seconds: info.seconds, checks: join(output, 'checks.json') }));
