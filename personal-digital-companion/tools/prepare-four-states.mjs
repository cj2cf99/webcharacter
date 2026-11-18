// 固定映射四份用户素材；不改原片，六个透明播放片段均保留原比例。
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {run,inspect} from './media.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'output/four-states-v2');mkdirSync(out,{recursive:true});
const clips=[['idle','待机',0,null],['click','点击',0,null],['hover','悬停',0,null],
  ['work-enter','工作三段2',0,7],['work-loop','工作三段2',7,2.5],['work-exit','工作三段2',9.5,null]];
const manifest={version:2,width:464,height:688,fps:24,workCuts:[7,9.5],clips:{},sources:{}};
for(const [id,name,start,duration] of clips){
  const input=`G:/picsample/${name}.mp4`,output=resolve(out,`${id}.webm`);
  manifest.sources[name]={path:input,sha256:createHash('sha256').update(readFileSync(input)).digest('hex')};
  if(!existsSync(output))run(['-loglevel','error','-n','-i',input,...(start?['-ss',String(start)]:[]),
    ...(duration?['-t',String(duration)]:[]),'-map','0:v:0','-vf',
    'format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5,format=yuva420p',
    '-an','-c:v','libvpx-vp9','-crf','24','-b:v','0','-deadline','good','-cpu-used','4','-auto-alt-ref','0',output]);
  const info=inspect(output,['-c:v','libvpx-vp9']);
  // 实际解码Alpha和首尾，低分辨率仅用于检查，成品不缩放。
  const raw=run(['-loglevel','error','-c:v','libvpx-vp9','-i',output,'-vf','scale=116:172',
    '-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
  const frameBytes=116*172*4;
  if(raw.length/frameBytes!==info.frames.length)throw Error(`${id} 解码帧数不符`);
  let cornerFailures=0;for(let i=0;i<info.frames.length;i++)if(raw[i*frameBytes+3]!==0)cornerFailures++;
  // 悬停源片带白色冲击特效，局部触角落属于素材内容，不能当作抠绿失败删掉。
  if(raw[3]!==0||raw[raw.length-frameBytes+3]!==0)throw Error(`${id} 起止背景Alpha异常`);
  const first=raw.subarray(0,frameBytes),last=raw.subarray(-frameBytes);let diff=0;
  for(let i=0;i<frameBytes;i++)diff+=Math.abs(first[i]-last[i]);
  manifest.clips[id]={file:`${id}.webm`,bytes:readFileSync(output).length,frames:info.frames.length,
    seconds:info.seconds,cornerEffectFrames:cornerFailures,firstLastMeanDiff:diff/frameBytes,sha256:createHash('sha256').update(readFileSync(output)).digest('hex')};
  console.log(JSON.stringify({id,...manifest.clips[id]}));
}
// 从待机第一帧取得同画布的默认静态态，切换失败时仍有角色。
if(!existsSync(resolve(out,'baseline.png')))run(['-loglevel','error','-n','-c:v','libvpx-vp9','-i',resolve(out,'idle.webm'),'-frames:v','1',resolve(out,'baseline.png')]);
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));
