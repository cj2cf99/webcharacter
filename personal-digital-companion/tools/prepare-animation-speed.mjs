import { run, inspect } from './media.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../output/', import.meta.url));
const dir = join(root, 'animation-speed');
mkdirSync(join(dir, 'compact'), { recursive: true });
const clips = {};
// 切点使用调速后的 24 fps 帧号，结束帧不包含在内。
const recipes = [
  { id: 'drag-enter', source: 'drag-v2', timeScale: 24 / 72, start: 0, end: 24 },
  { id: 'drag-exit', source: 'drag-v2', timeScale: 24 / 73, start: 0, end: 24 },
  { id: 'drag-loop', source: 'drag-v2', timeScale: 0.5, start: 39, end: 63 },
  { id: 'hover-loop', source: 'hover-parts', timeScale: 48 / 72, start: 0, end: 48 },
];

for (const { id, source, timeScale, start, end } of recipes) {
  if (process.argv.includes('--hover-only') && id !== 'hover-loop') continue;
  for (const compact of [false, true]) {
    const variant = compact ? 'compact' : '';
    const input = source === 'drag-v2'
      ? join(root, source, variant, id + '.webm')
      : join(root, source, id + (compact ? '-compact.webm' : '.webm'));
    const output = join(dir, variant, id + '.webm');
    const filter = `setpts=${timeScale}*(PTS-STARTPTS),fps=24,tpad=stop_mode=clone:stop_duration=0.1,` +
      `trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,format=yuva420p`;
    run(['-loglevel', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', input, '-an', '-vf', filter,
      '-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-cpu-used', '4', '-auto-alt-ref', '0', output]);
    const data = inspect(output, ['-c:v', 'libvpx-vp9']);
    if (data.frames.length !== end - start) throw Error(id + ' 帧数不符');
    clips[id] = { seconds: (end - start) / 24, frames: data.frames.length };
    console.log(JSON.stringify({ id, compact, ...clips[id] }));
  }
}
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(clips, null, 2));
