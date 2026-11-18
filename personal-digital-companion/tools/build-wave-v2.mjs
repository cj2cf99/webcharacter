// V2：指定等待图首尾 + 全身情绪关键帧；确定性 FFmpeg 拆帧与时间采样。
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { run, main, inspect } from './media.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const asset = resolve(root, 'assets/feiyue-click-wave-v2');
const output = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'output/feiyue-click-wave-v2');
const poses = join(output, 'poses');
const timed = join(output, 'keyframes');
const smooth = join(output, 'smooth');
for (const p of [poses, timed, smooth]) mkdirSync(p, { recursive: true });
const key = 'format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5';
function stats(path) {
  const raw = run(['-loglevel', 'error', '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { binary: true }).stdout;
  assert.equal(raw.length, 400 * 600 * 4);
  let minX=400,minY=600,maxX=-1,maxY=-1;
  for(let y=0;y<600;y++)for(let x=0;x<400;x++)if(raw[(y*400+x)*4+3]>128){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  let footX=0,footCount=0;
  for(let y=maxY-10;y<=maxY;y++)for(let x=0;x<400;x++)if(raw[(y*400+x)*4+3]>128){footX+=x;footCount++;}
  return {bbox:[minX,minY,maxX,maxY],footX:footX/footCount,raw};
}
const baseline=join(poses,'baseline.png');
run(['-loglevel','error','-n','-i',join(asset,'waiting-source.png'),'-vf',`scale=400:600:flags=lanczos,${key}`,'-frames:v','1',baseline]);
for(let n=0;n<16;n++)run(['-loglevel','error','-n','-i',join(asset,'wave-sheet-green.png'),'-vf',
  `crop=256:384:${n%4*256}:${Math.floor(n/4)*384},${key},scale=400:600:flags=lanczos`,
  '-frames:v','1',join(poses,`raw-${n}.png`)]);
const base=stats(baseline), first=stats(join(poses,'raw-0.png'));
const scale=(base.bbox[3]-base.bbox[1]+1)/(first.bbox[3]-first.bbox[1]+1);
const w=Math.round(400*scale),h=Math.round(600*scale);
const dx=Math.round(base.footX-first.footX*scale);
const dy=Math.round(base.bbox[3]-first.bbox[3]*scale);
const checks=[];
for(let n=0;n<16;n++){
  const file=join(poses,`pose-${n}.png`);
  run(['-loglevel','error','-n','-i',join(poses,`raw-${n}.png`),'-vf',
    `scale=${w}:${h}:flags=lanczos,pad=800:1200:200:300:color=black@0,crop=400:600:${200-dx}:${300-dy}`,
    '-frames:v','1',file]);
  const s=stats(file);
  assert(s.bbox[0]>3&&s.bbox[1]>3&&s.bbox[2]<396&&s.bbox[3]<596,'动作不得出画');
  checks.push({pose:n,bbox:s.bbox,footX:s.footX});
}
// 8fps 关键帧节拍；首尾是真实基准图，不以生成的近似等待姿态替代。
const timeline=[['baseline',4],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],
  [8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1],[15,1],['baseline',5]];
let count=0;
for(const [pose,ticks] of timeline)for(let i=0;i<ticks;i++){
  const png=pose==='baseline'?baseline:join(poses,`pose-${pose}.png`);
  // 用统一纯绿底输出，后续仅采样时序，不对人物做光流变形。
  const target=join(timed,`frame-${String(count++).padStart(4,'0')}.png`);
  run(['-loglevel','error','-n','-f','lavfi','-i','color=c=0x00FF00:s=400x600:r=8','-i',png,
    '-filter_complex','[0:v][1:v]overlay=shortest=1:format=auto','-frames:v','1',target]);
}
const seconds=count/8;
run(['-loglevel','error','-n','-framerate','8','-i',join(timed,'frame-%04d.png'),'-vf',
  `fps=25,${key}`,
  '-frames:v',String(Math.round(seconds*25)),'-fps_mode','passthrough',join(smooth,'frame-%04d.png')]);
// GIF 10ms 精度下，25fps 可精确表示。
const gif=join(output,'feiyue-happy-wave-v2.gif');
main(['frames-gif','--input',join(smooth,'frame-%04d.png'),'--output',gif,'--fps','25']);
const info=inspect(gif);
const rgba=run(['-loglevel','error','-ignore_loop','1','-i',gif,'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
const bytes=400*600*4;
assert(rgba.subarray(0,bytes).equals(rgba.subarray(-bytes)),'首尾 GIF 像素应相同');
for(let i=0;i<info.frames.length;i++)assert.equal(rgba[i*bytes+3],0,'每帧背景透明');
run(['-loglevel','error','-n','-f','lavfi','-i',`color=c=0xEEE7DE:s=400x600:r=25:d=${info.seconds}`,
  '-ignore_loop','1','-i',gif,'-filter_complex',
  '[0:v][1:v]overlay=shortest=1:format=auto,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a[v]',
  '-map','[v]','-an','-loop','0','-final_delay','4',join(output,'feiyue-happy-wave-v2-preview.gif')]);
run(['-loglevel','error','-n','-framerate','8','-i',join(timed,'frame-%04d.png'),'-vf',
  "select='between(n,4,19)',scale=200:300,tile=4x4",'-frames:v','1',join(output,'contact-sheet.png')]);
run(['-loglevel','error','-n','-framerate','25','-i',join(smooth,'frame-%04d.png'),'-vf',
  "select='not(mod(n,5))',scale=200:300,tile=4x4",'-frames:v','1',join(output,'interpolated-contact-sheet.png')]);
const report={baseline:'q版4头身等待基准400X600.png',width:400,height:600,keyPoses:16,timeline,
  interpolation:'none; clean key poses held at 25fps timeline; optical flow rejected for ghosting',scale,dx,dy,
  seconds:info.seconds,frames:info.frames.length,firstLastIdentical:true,alphaDecoded:true,checks};
writeFileSync(join(output,'checks.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({gif,seconds:info.seconds,frames:info.frames.length,scale,dx,dy}));
