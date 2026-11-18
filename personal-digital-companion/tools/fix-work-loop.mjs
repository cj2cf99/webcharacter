// 根据首尾匹配结果收紧工作循环，不缩放/变形人物，不丢弃进入及退出动作。
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {run,inspect} from './media.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const old=resolve(root,'output/four-states-v2'),dir=resolve(root,'output/four-states-v3');mkdirSync(dir,{recursive:true});
const source='G:/picsample/工作三段2.mp4';
const manifest=JSON.parse(readFileSync(resolve(old,'manifest.json'),'utf8'));
assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),manifest.sources['工作三段2'].sha256,'源片改变时须重新测定切点');
for(const id of ['idle','click','hover']){
  const item=manifest.clips[id],bytes=readFileSync(resolve(old,item.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  if(!existsSync(resolve(dir,item.file)))copyFileSync(resolve(old,item.file),resolve(dir,item.file));
}
if(!existsSync(resolve(dir,'baseline.png')))copyFileSync(resolve(old,'baseline.png'),resolve(dir,'baseline.png'));
// 在24fps源片中：[0,186)进入，[186,232)循环，[232,361)退出。
// 首尾实际匹配是源帧186和231，约7.75～9.667秒。
const parts=[['work-enter',0,186],['work-loop',186,232],['work-exit',232,361]];
for(const [id,start,end] of parts){
  const output=resolve(dir,`${id}.webm`);
  if(!existsSync(output))run(['-loglevel','error','-n','-i',source,'-map','0:v:0','-vf',
    `trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5,format=yuva420p`,
    '-an','-c:v','libvpx-vp9','-crf','24','-b:v','0','-deadline','good','-cpu-used','4','-auto-alt-ref','0',output]);
  const info=inspect(output,['-c:v','libvpx-vp9']);assert.equal(info.frames.length,end-start);
  const raw=run(['-loglevel','error','-c:v','libvpx-vp9','-i',output,'-vf','scale=116:172',
    '-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
  const frameBytes=116*172*4;assert.equal(raw.length,frameBytes*(end-start));
  let diff=0;for(let i=0;i<frameBytes;i++)diff+=Math.abs(raw[i]-raw[raw.length-frameBytes+i]);
  let corners=0;for(let i=0;i<end-start;i++)if(raw[i*frameBytes+3]!==0)corners++;
  assert.equal(corners,0);
  const bytes=readFileSync(output);
  manifest.clips[id]={file:`${id}.webm`,bytes:bytes.length,frames:end-start,seconds:info.seconds,
    cornerEffectFrames:corners,firstLastMeanDiff:diff/frameBytes,
    sha256:createHash('sha256').update(bytes).digest('hex')};
}
assert.equal(parts.reduce((n,p)=>n+p[2]-p[1],0),361,'源工作片无丢帧');
manifest.version=3;manifest.workCuts=[186/24,232/24];manifest.workFrameCuts=[186,232];
const oldLoop=JSON.parse(readFileSync(resolve(old,'manifest.json'),'utf8')).clips['work-loop'];
assert(manifest.clips['work-loop'].firstLastMeanDiff<oldLoop.firstLastMeanDiff*.5,'编码后接缝差异须至少降低一半');
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2));
// 顺序为旧首、旧尾、新首、新尾，直接比对截取位置，而不是美化后的示意。
run(['-loglevel','error','-y','-i',source,'-vf',
  "select='eq(n,168)+eq(n,186)+eq(n,227)+eq(n,231)',scale=232:344,tile=2x2",'-frames:v','1',resolve(dir,'endpoints-chronological.png')]);
console.log(JSON.stringify({directory:dir,workCuts:manifest.workCuts,frames:parts.map(p=>p[2]-p[1]),
  oldSeamDiff:oldLoop.firstLastMeanDiff,newSeamDiff:manifest.clips['work-loop'].firstLastMeanDiff}));
