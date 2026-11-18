// 只生成小窗口用的播放副本；原素材、动作、帧序与全尺寸版本均保留。
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {run,inspect} from './media.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'output/desktop-videos-372');mkdirSync(dir,{recursive:true});
const full=JSON.parse(readFileSync(resolve(root,'output/four-states-v3/manifest.json'),'utf8'));
const clips={};
for(const[id,item]of Object.entries(full.clips)){
  const work=id.startsWith('work-'),source=full.sources[work?'工作三段2':id==='idle'?'待机':id==='click'?'点击':'悬停'].path;
  const cuts=full.workFrameCuts;const start=id==='work-loop'?cuts[0]:id==='work-exit'?cuts[1]:0;
  const end=id==='work-enter'?cuts[0]:id==='work-loop'?cuts[1]:work?361:145;
  const output=resolve(dir,id+'.webm');
  if(!existsSync(output))run(['-loglevel','error','-n','-i',source,'-map','0:v:0','-vf',
    `trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5,scale=372:552:flags=lanczos,format=yuva420p`,
    '-an','-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',output]);
  const data=inspect(output,['-c:v','libvpx-vp9']);assert.equal(data.frames.length,item.frames);
  const alpha=run(['-loglevel','error','-c:v','libvpx-vp9','-i',output,'-vf','alphaextract,scale=93:138','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','gray','-'],{binary:true}).stdout;
  assert.equal(alpha.length,item.frames*93*138);assert(alpha[0]<=2);assert(alpha[alpha.length-93*138]<=2);
  clips[id]={file:id+'.webm',frames:data.frames.length,seconds:data.seconds,bytes:readFileSync(output).length,
    startCornerAlpha:alpha[0],endCornerAlpha:alpha[alpha.length-93*138]};
  console.log(JSON.stringify({id,...clips[id]}));
}
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify({width:372,height:552,clips},null,2));
