import {run,inspect} from './media.mjs';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url)),source='G:/picsample/鼠标悬浮循环.mp4',dir=root+'output/hover-parts/';
const raw=run(['-loglevel','error','-i',source,'-vf','scale=464:688,drawbox=x=400:y=600:w=64:h=88:color=0x00FF00:t=fill,format=rgba,colorkey=0x00FF00:0.20:0.08,scale=116:172,format=rgba','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout,size=116*172*4;
for(let i=0;i<raw.length;i+=4)for(let c=0;c<3;c++)raw[i+c]=Math.round(raw[i+c]*raw[i+3]/255);
function diff(a,b){let d=0;for(let i=0;i<size;i++)d+=Math.abs(raw[a*size+i]-raw[b*size+i]);return d/size;}
const target=run(['-loglevel','error','-c:v','libvpx-vp9','-i',root+'output/hover-parts/hover.webm','-vf','trim=start_frame=15,scale=116:172,format=rgba','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
for(let i=0;i<target.length;i+=4)for(let c=0;c<3;c++)target[i+c]=Math.round(target[i+c]*target[i+3]/255);
function entry(start){let d=0;for(let i=0;i<size;i++)d+=Math.abs(raw[start*size+i]-target[i]);return d/size;}
let best={start:0,score:Infinity};for(let start=0;start<=73;start++){const score=entry(start)*3+diff(start,start+71);if(score<best.score)best={start,score,entry:entry(start),seam:diff(start,start+71)};}
console.log(JSON.stringify({sourceSeconds:inspect(source).seconds,firstCycleSeam:diff(0,71),secondCycleSeam:diff(72,143),selected:best}));
for(const compact of [false,true]){
const file=dir+'hover-loop'+(compact?'-compact':'')+'.webm';
run(['-loglevel','error','-y','-i',source,'-an','-vf',`trim=start_frame=${best.start}:end_frame=${best.start+72},setpts=PTS-STARTPTS,scale=464:688,drawbox=x=400:y=600:w=64:h=88:color=0x00FF00:t=fill,format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5,${compact?'scale=372:552,':''}format=yuva420p`,'-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',file]);
const info=inspect(file,['-c:v','libvpx-vp9']);if(info.frames.length!==72)throw Error('帧数错误');console.log(JSON.stringify({compact,frames:info.frames.length,seconds:info.seconds}));
}
writeFileSync(dir+'new-loop-selection.json',JSON.stringify({source,start:best.start,end:best.start+72,frames:72,fps:24,seamMeanDifference:best.score},null,2));
