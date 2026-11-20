// 本地素材工具：无 npm 依赖，只调用已有 FFmpeg；不覆盖输入或已有输出。
import { spawnSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
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

const vp9Decoder = ['-c:v', 'libvpx-vp9'];

function mediaInput(input) {
  return [...(/\.webm$/i.test(input) ? vp9Decoder : []), '-i', input];
}

function scanOutline(input, key, frameLimit) {
  const { stderr } = run(['-loglevel', 'info', '-nostats', ...mediaInput(input), '-map', '0:v:0',
    '-vf', `${key},alphaextract,showinfo=checksum=0,bbox=min_val=10`,
    ...(frameLimit === undefined ? [] : ['-frames:v', String(frameLimit)]),
    '-an', '-fps_mode', 'passthrough', '-f', 'null', '-']);
  const sizes = [...stderr.matchAll(/\bParsed_showinfo_.*?\bn:\s*\d+ .*?\bs:(\d+)x(\d+)\b/g)];
  const frameCount = frameLimit === undefined ? sizes.length : Math.min(sizes.length, frameLimit);
  if (!frameCount) throw new Error('没有读到视频帧');
  const [, width, height] = sizes[0].map(Number);
  if (sizes.some(entry => Number(entry[1]) !== width || Number(entry[2]) !== height)) {
    throw new Error('素材的画布尺寸在播放期间发生变化');
  }
  const frames = Array(frameCount).fill(null);
  for (const match of stderr.matchAll(/\bParsed_bbox_.*?\bn:(\d+) .*?\bx1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)) {
    const [, frame, left, right, top, bottom] = match.map(Number);
    if (frame < frameCount) frames[frame] = { left, right, top, bottom };
  }

  let bounds = null;
  let emptyFrames = 0;
  const edgeFrames = [];
  for (const [index, box] of frames.entries()) {
    if (box === null) {
      emptyFrames++;
      continue;
    }
    if (box.left === 0 || box.right === width - 1 || box.top === 0 || box.bottom === height - 1) edgeFrames.push(index);
    bounds = bounds === null ? box : {
      left: Math.min(bounds.left, box.left), right: Math.max(bounds.right, box.right),
      top: Math.min(bounds.top, box.top), bottom: Math.max(bounds.bottom, box.bottom),
    };
  }
  const report = { width, height, frameCount, emptyFrames, first: frames[0], last: frames.at(-1), bounds, edgeFrames };
  return { frames, report };
}

function pose(box, canvas, label) {
  if (!box) throw new Error(`${label}没有可用的前景轮廓`);
  if (box.left === 0 && box.right === canvas.width - 1 && box.top === 0 && box.bottom === canvas.height - 1) {
    throw new Error(`${label}的轮廓铺满画布，请检查绿幕色键或选择干净的基准帧`);
  }
  return { center: (box.left + box.right + 1) / 2, height: box.bottom - box.top + 1, bottom: box.bottom + 1 };
}

function frameAlignment(input, sourceBox, reference) {
  const sourcePose = pose(sourceBox, input, '源基准帧');
  const targetPose = pose(reference.first, reference, '目标基准帧');
  const canvas = { canvasWidth: reference.width, canvasHeight: reference.height };
  const withinPixel = ['center', 'height', 'bottom'].every(name => Math.abs(sourcePose[name] - targetPose[name]) <= 1);
  if (withinPixel && input.width === reference.width && input.height === reference.height) {
    return { ...canvas, scale: 1, width: input.width, height: input.height, x: 0, y: 0 };
  }
  const scale = targetPose.height / sourcePose.height;
  const width = Math.max(1, Math.round(input.width * scale));
  const height = Math.max(1, Math.round(input.height * scale));
  const x = Math.round(targetPose.center - sourcePose.center * width / input.width);
  const y = Math.round(targetPose.bottom - sourcePose.bottom * height / input.height);
  return { ...canvas, scale, width, height, x, y };
}

function alignmentFilter(input, alignment) {
  const { width, height, x, y, canvasWidth, canvasHeight } = alignment;
  const { left, right, top, bottom } = input.bounds;
  if (left * width / input.width + x < 0 || (right + 1) * width / input.width + x > canvasWidth ||
      top * height / input.height + y < 0 || (bottom + 1) * height / input.height + y > canvasHeight) {
    throw new Error('对齐会把可见内容移出画布，请检查基准帧或改用更宽裕的目标画布');
  }
  if (width === input.width && height === input.height && canvasWidth === width && canvasHeight === height && !x && !y) return '';
  const padX = Math.max(x, 0), padY = Math.max(y, 0);
  const cropX = Math.max(-x, 0), cropY = Math.max(-y, 0);
  const padWidth = Math.max(width + padX, canvasWidth + cropX);
  const padHeight = Math.max(height + padY, canvasHeight + cropY);
  return `,scale=${width}:${height}:flags=lanczos,pad=${padWidth}:${padHeight}:${padX}:${padY}:color=black@0` +
    `,crop=${canvasWidth}:${canvasHeight}:${cropX}:${cropY}:exact=1`;
}

function videoWebm(input, output, key, o) {
  if (!/\.(mp4|webm)$/i.test(input)) throw new Error('视频输入须为 MP4 或 VP9 WebM');
  const before = scanOutline(input, key);
  if (before.report.bounds === null) throw new Error('视频没有可用的前景轮廓');
  let alignment = null;
  let fit = '';
  if (o.reference) {
    const index = number(o, 'anchor-frame', 0, 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isInteger(index)) throw new Error('anchor-frame 须为从 0 开始的整数帧号');
    const anchor = o.anchor ? scanOutline(resolve(o.anchor), key, index + 1) : before;
    if (anchor.report.width !== before.report.width || anchor.report.height !== before.report.height) {
      throw new Error('同组源基准与输入视频的画布尺寸须一致');
    }
    const reference = scanOutline(resolve(o.reference), keyFilter({ ...o, key: o['reference-key'] }), 1).report;
    alignment = frameAlignment(before.report, anchor.frames[index], reference);
    fit = alignmentFilter(before.report, alignment);
  } else if (['anchor', 'anchor-frame', 'reference-key'].some(name => name in o)) {
    throw new Error('源基准参数须与 --reference 一起使用');
  }

  const staging = mkdtempSync(join(dirname(output), '.media-'));
  const pending = join(staging, 'video.webm');
  try {
    run(['-loglevel', 'error', '-n', ...mediaInput(input), '-map', '0:v:0', '-vf', `${key}${fit},format=yuva420p,setsar=1`,
      '-an', '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4',
      '-auto-alt-ref', '0', '-fps_mode', 'passthrough', '-enc_time_base', '1:1000', pending]);
    const after = scanOutline(pending, 'format=rgba').report;
    if (after.frameCount !== before.report.frameCount || after.emptyFrames !== before.report.emptyFrames ||
        after.width !== (alignment?.canvasWidth ?? before.report.width) ||
        after.height !== (alignment?.canvasHeight ?? before.report.height)) {
      throw new Error('输出画布、帧数或前景帧数量与预期不符');
    }
    copyFileSync(pending, output, constants.COPYFILE_EXCL);
    return { output, before: before.report, after, alignment };
  } finally {
    if (existsSync(pending)) unlinkSync(pending);
    rmdirSync(staging);
  }
}

export function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === 'help') {
    console.log(`用法（在项目根目录运行）：
  node tools/media.mjs doctor
  node tools/media.mjs still-gif --input 图片.png --output output/待机.gif --motion bob --key green
  node tools/media.mjs frames-gif --input "frames/frame-%04d.png" --output output/动作.gif --fps 20
  node tools/media.mjs gif-webm --input 动作.gif --output output/动作.webm --key green
  node tools/media.mjs outline --input 动作.mp4 --key green
  node tools/media.mjs video-webm --input 动作.mp4 --output output/动作.webm --key green --reference 基准.png
  node tools/media.mjs inspect --input 动作.gif
可选：--key none|green|0xRRGGBB（默认 none），--similarity 0.18，--blend 0.06。
video-webm：--reference 使用目标图片或视频的首帧，可用 --reference-key 去绿。
多段共用同一 --anchor 源视频或图片及 --anchor-frame 帧号（默认 0）。
still-gif：--motion hold|bob（默认 hold），--seconds 3，--fps 20。
bob 仅为整图轻微上下位移，不会自动产生眨眼、呼吸或挥手。GIF 仅支持二值透明。`);
    return;
  }
  const o = options(args);
  const allowed = {
    doctor: [], inspect: ['input'],
    outline: ['input', 'key', 'similarity', 'blend'],
    'video-webm': ['input', 'output', 'key', 'similarity', 'blend', 'reference', 'reference-key', 'anchor', 'anchor-frame'],
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
    for (const name of ['colorkey', 'palettegen', 'paletteuse', 'crop', 'alphaextract', 'bbox', 'pad', 'scale']) {
      if (!filters.includes(name)) throw new Error(`缺少滤镜 ${name}`);
    }
    console.log('就绪：图片/帧序列 → GIF；GIF/视频 → VP9 Alpha WebM；绿幕色键、轮廓检查与对齐。');
    return;
  }
  if (!o.input) throw new Error('缺少 --input');
  const input = resolve(o.input);
  if (command === 'inspect') {
    console.log(JSON.stringify(inspect(input, /\.webm$/i.test(input) ? vp9Decoder : []), null, 2));
    return;
  }
  const key = keyFilter(o);
  if (command === 'outline') {
    console.log(JSON.stringify(scanOutline(input, key).report, null, 2));
    return;
  }
  if (!o.output) throw new Error('缺少 --output');
  const output = resolve(o.output);
  if (input === output || existsSync(output)) throw new Error('输出已存在或等于输入，请换一个输出文件名');
  if (!output.toLowerCase().endsWith(command.endsWith('-webm') ? '.webm' : '.gif')) throw new Error('输出扩展名与命令不匹配');
  mkdirSync(dirname(output), { recursive: true });
  if (command === 'video-webm') {
    console.log(JSON.stringify(videoWebm(input, output, key, o), null, 2));
    return;
  }
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
