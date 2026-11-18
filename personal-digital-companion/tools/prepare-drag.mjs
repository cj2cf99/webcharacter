// 拖拽三段：选择相近循环首尾，退出最后半秒换成用户指定等待PNG。
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {run,inspect} from './media.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'output/drag-v1');
mkdirSync(resolve(dir,'compact'),{recursive:true});
const source='G:/picsample/拖拽.mp4',reference='G:/picsample/q版4头身等待基准400X600.png';
const key='format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5';
function png(args,out){run(['-loglevel','error','-y',...args,'-frames:v','1',out]);}
const normal=resolve(dir,'baseline-unfitted.png'),first=resolve(dir,'source-first.png'),baseline=resolve(dir,'baseline.png');
png(['-i',reference,'-vf',`scale=464:688:force_original_aspect_ratio=decrease,pad=464:688:(ow-iw)/2:(oh-ih)/2:color=0x00FF00,${key}`],normal);
png(['-i',source,'-map','0:v:0','-vf',key],first);
function bounds(file){
  const bytes=run(['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
  assert.equal(bytes.length,464*688*4);let top=688,bottom=-1,left=464,right=-1;
  for(let y=0;y<688;y++)for(let x=0;x<464;x++)if(bytes[(y*464+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  let sum=0,count=0;for(let y=bottom-12;y<=bottom;y++)for(let x=0;x<464;x++)if(bytes[(y*464+x)*4+3]>128){sum+=x;count++;}
  return {top,bottom,left,right,foot:sum/count};
}
const a=bounds(normal),b=bounds(first),scale=(b.bottom-b.top+1)/(a.bottom-a.top+1);
const w=Math.round(464*scale),h=Math.round(688*scale),dx=Math.round(b.foot-a.foot*scale),dy=Math.round(b.bottom-a.bottom*scale);
png(['-i',normal,'-vf',`scale=${w}:${h}:flags=lanczos,pad=1200:1700:300:400:color=black@0,crop=464:688:${300-dx}:${400-dy}`],baseline);
const fitted=bounds(baseline);assert(Math.abs(fitted.bottom-b.bottom)<=2);assert(Math.abs(fitted.foot-b.foot)<=2);assert(fitted.top>0&&fitted.bottom<687);
const manifest={source:{path:source,sha256:createHash('sha256').update(readFileSync(source)).digest('hex')},
  baseline:{path:reference,sha256:createHash('sha256').update(readFileSync(reference)).digest('hex'),scale,dx,dy},
  cuts:[52,92],replacementStartFrame:133,width:464,height:688,fps:24,clips:{}};
for(const [id,start,end]of [['drag-enter',0,52],['drag-loop',52,92],['drag-exit',92,145]]){
  for(const compact of [false,true]){
    const output=resolve(dir,compact?'compact':'.',id+'.webm');
    const size=compact?'scale=372:552:flags=lanczos,':'';
    {
      if(id==='drag-exit'){
        run(['-loglevel','error','-y','-i',source,'-loop','1','-framerate','24','-t','0.5','-i',baseline,
          '-filter_complex',`[0:v:0]trim=start_frame=92:end_frame=133,setpts=PTS-STARTPTS,${key},setsar=1[v];[1:v]trim=end_frame=12,setpts=PTS-STARTPTS,format=rgba,setsar=1[s];[v][s]concat=n=2:v=1:a=0,${size}format=yuva420p[out]`,
          '-map','[out]','-an','-c:v','libvpx-vp9','-crf',compact?'20':'24','-b:v','0','-cpu-used','4','-auto-alt-ref','0','-fps_mode','cfr','-r','24',output]);
      }else run(['-loglevel','error','-y','-i',source,'-map','0:v:0','-vf',
        `trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,${key},${size}format=yuva420p`,
        '-an','-c:v','libvpx-vp9','-crf',compact?'20':'24','-b:v','0','-cpu-used','4','-auto-alt-ref','0',output]);
    }
    const data=inspect(output,['-c:v','libvpx-vp9']);assert.equal(data.frames.length,end-start);
    const raw=run(['-loglevel','error','-c:v','libvpx-vp9','-i',output,'-vf','scale=116:172','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
    const bytes=116*172*4;assert.equal(raw.length,data.frames.length*bytes);
    if(id==='drag-exit'){
      // 替换尾部各帧相同；量化误差不当作动作变化。
      let maxMean=0;for(let n=data.frames.length-11;n<data.frames.length;n++){let diff=0;for(let i=0;i<bytes;i++)diff+=Math.abs(raw[n*bytes+i]-raw[(n-1)*bytes+i]);maxMean=Math.max(maxMean,diff/bytes);}
      assert(maxMean<1,'PNG收尾不应继续变脸');
    }
    if(!manifest.clips[id])manifest.clips[id]={file:id+'.webm',frames:data.frames.length,seconds:data.seconds};
    manifest.clips[id][compact?'compactBytes':'bytes']=readFileSync(output).length;
    console.log(JSON.stringify({id,compact,frames:data.frames.length,seconds:data.seconds}));
  }
}
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2));
png(['-c:v','libvpx-vp9','-sseof','-0.05','-i',resolve(dir,'drag-exit.webm')],resolve(dir,'exit-last.png'));
console.log(JSON.stringify({baselineFit:manifest.baseline,cuts:manifest.cuts,replacementStartFrame:133}));
