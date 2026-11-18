// 本地素材工具：无 npm 依赖，只调用已有 FFmpeg；不覆盖输入或已有输出。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = resolve(root, '.local-tools.json');
export const ffmpeg = process.env.COMPANION_FFMPEG ||
  (existsSync(local) ? JSON.parse(readFileSync(local, 'utf8')).ffmpeg : null) || 'ffmpeg';

export function run(args, { binary = false } = {}) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', ...args], {
    encoding: binary ? undefined : 'utf8', maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error || r.status !== 0) throw new Error(r.error?.message || String(r.stderr));
  return r;
}

function options(args) {
  const o = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || args[i + 1] === undefined || args[i + 1].startsWith('--')) {
      throw new Error('参数格式：--名称 值');
    }
    const key = args[i].slice(2);
    if (key in o) throw new Error(`重复参数：${key}`);
    o[key] = args[i + 1];
  }
  return o;
}

function number(o, key, fallback, min, max) {
  const n = Number(o[key] ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${key} 必须在 ${min}～${max} 之间`);
  return n;
}

function keyFilter(o) {
  if (!o.key || o.key === 'none') return 'format=rgba';
  const color = o.key === 'green' ? '0x00FF00' : o.key;
  if (!/^0x[0-9a-f]{6}$/i.test(color)) throw new Error('key 只支持 none、green 或 0xRRGGBB');
  const similarity = number(o, 'similarity', 0.18, 0.00001, 1);
  const blend = number(o, 'blend', 0.06, 0, 1);
  return `format=rgba,colorkey=${color}:${similarity}:${blend}`;
}

export function inspect(input, decoder = []) {
  // showinfo 在实际解码后提供帧时间；WebM 必须用 libvpx-vp9 解码才能检查 Alpha。
  const r = run(['-loglevel', 'info', ...decoder, ...(/\.gif$/i.test(input) ? ['-ignore_loop', '1'] : []), '-i', input,
    '-vf', 'showinfo', '-an', '-fps_mode', 'passthrough', '-f', 'null', '-']);
  const frames = [...String(r.stderr).matchAll(/\bn:\s*(\d+)\s+pts:\s*\S+\s+pts_time:([\d.e+-]+)\s+duration:\s*\S+\s+duration_time:([\d.e+-]+)/g)]
    .map(m => ({ frame: Number(m[1]), time: Number(m[2]), duration: Number(m[3]) }));
  if (!frames.length) throw new Error('没有读到有效帧');
  return { frames, seconds: frames.at(-1).time + frames.at(-1).duration };
}

export function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === 'help') {
    console.log(`用法（在项目根目录运行）：
  node tools/media.mjs doctor
  node tools/media.mjs still-gif --input 图片.png --output output/待机.gif --motion bob --key green
  node tools/media.mjs frames-gif --input "frames/frame-%04d.png" --output output/动作.gif --fps 20
  node tools/media.mjs gif-webm --input 动作.gif --output output/动作.webm --key green
  node tools/media.mjs inspect --input 动作.gif
可选：--key none|green|0xRRGGBB（默认 none），--similarity 0.18，--blend 0.06。
still-gif：--motion hold|bob（默认 hold），--seconds 3，--fps 20。
bob 仅为整图轻微上下位移，不会自动产生眨眼、呼吸或挥手。GIF 仅支持二值透明。`);
    return;
  }
  const o = options(args);
  const allowed = {
    doctor: [], inspect: ['input'],
    'still-gif': ['input', 'output', 'motion', 'seconds', 'fps', 'key', 'similarity', 'blend'],
    'frames-gif': ['input', 'output', 'fps', 'key', 'similarity', 'blend'],
    'gif-webm': ['input', 'output', 'key', 'similarity', 'blend'],
  }[command];
  if (!allowed) throw new Error('未知命令，运行 help 查看用法');
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`不支持的参数：${k}`);
  if (command === 'doctor') {
    console.log(String(run(['-version']).stdout).split('\n')[0]);
    const enc = String(run(['-encoders']).stdout);
    const filters = String(run(['-filters']).stdout);
    for (const name of ['libvpx-vp9', 'gif', 'png']) if (!enc.includes(name)) throw new Error(`缺少编码器 ${name}`);
    for (const name of ['colorkey', 'palettegen', 'paletteuse', 'crop']) if (!filters.includes(name)) throw new Error(`缺少滤镜 ${name}`);
    console.log('就绪：图片/帧序列 → GIF；GIF → VP9 Alpha WebM；绿幕色键。');
    return;
  }
  if (!o.input) throw new Error('缺少 --input');
  const input = resolve(o.input);
  if (command === 'inspect') {
    console.log(JSON.stringify(inspect(input, /\.webm$/i.test(input) ? ['-c:v', 'libvpx-vp9'] : []), null, 2));
    return;
  }
  if (!o.output) throw new Error('缺少 --output');
  const output = resolve(o.output);
  if (input === output || existsSync(output)) throw new Error('输出已存在或等于输入，请换一个输出文件名');
  if (!output.toLowerCase().endsWith(command === 'gif-webm' ? '.webm' : '.gif')) throw new Error('输出扩展名与命令不匹配');
  mkdirSync(dirname(output), { recursive: true });
  const key = keyFilter(o);
  if (command === 'gif-webm') {
    if (!existsSync(input) || !/\.gif$/i.test(input)) throw new Error('输入必须是存在的 GIF 文件');
    const info = inspect(input);
    run(['-loglevel', 'error', '-n', '-ignore_loop', '1', '-i', input, '-vf', `${key},format=yuva420p`,
      '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-deadline', 'good', '-cpu-used', '4',
      '-auto-alt-ref', '0', '-fps_mode', 'vfr', '-enc_time_base', '1:1000', output]);
    console.log(JSON.stringify({ output, inputFrames: info.frames.length, inputSeconds: info.seconds,
      note: '保留单轮时序；WebM 的循环由播放器控制；Alpha 需解码实测，不能只看元数据。' }));
    return;
  }
  const fps = number(o, 'fps', 20, 1, 50);
  // GIF 的延时精度为 10ms，采用可精确表示的帧率，避免时序悄悄改变。
  if (!Number.isInteger(100 / fps)) throw new Error('GIF fps 请选 10、20、25、50 等能整除 100 的值');
  let sourceArgs, filter, extra = [];
  if (command === 'still-gif') {
    if (!existsSync(input)) throw new Error('输入图片不存在');
    const motion = o.motion || 'hold';
    if (!['hold', 'bob'].includes(motion)) throw new Error('motion 只支持 hold 或 bob');
    const seconds = number(o, 'seconds', 3, 0.1, 30);
    const count = Math.round(seconds * fps);
    const actualSeconds = count / fps;
    sourceArgs = ['-loop', '1', '-framerate', String(fps), '-t', String(actualSeconds), '-i', input];
    // 四边扩 8px，再保留 4px 边距；不缩放人物，不裁掉原图，整图位移最大 2px。
    filter = `${key},pad=iw+16:ih+16:8:8:color=black@0,crop=iw-8:ih-8:4:` +
      (motion === 'bob' ? `'4+2*sin(2*PI*t/${actualSeconds})'` : '4');
    extra = ['-frames:v', String(count)];
  } else {
    sourceArgs = ['-framerate', String(fps), '-start_number', '0', '-i', input];
    filter = key;
  }
  run(['-loglevel', 'error', '-n', ...sourceArgs, '-filter_complex',
    `[0:v]${filter},split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=128[v]`,
    '-map', '[v]', ...extra, '-an', '-fps_mode', 'vfr', '-loop', '0', '-final_delay', String(100 / fps), output]);
  console.log(JSON.stringify({ output, ...inspect(output) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
