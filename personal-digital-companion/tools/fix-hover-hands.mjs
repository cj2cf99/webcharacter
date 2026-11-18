// 仅修正循环视频的双手/前臂，边缘羽化；其他区域保持原帧。
import {run,inspect} from './media.mjs';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=root+'output/hover-parts/',w=464,h=688,size=w*h*4;
const raw=run(['-loglevel','error','-c:v','libvpx-vp9','-i',root+'output/four-states-v3/idle.webm','-vf','trim=start_frame=48:end_frame=64,format=rgba','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
const fixed=Buffer.from(raw),ref=raw.subarray(0,size);
// 覆盖手指与前臂运动范围，贴近耳旁的源首帧为固定姿态。
const zones=[[116,181,190,329],[253,183,305,334]];
for(let n=0;n<16;n++)for(const [x0,y0,x1,y1]of zones)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
 const weight=Math.min(1,Math.min(x-x0,x1-1-x,y-y0,y1-1-y)/7),p=(y*w+x)*4;
 for(let c=0;c<4;c++)fixed[n*size+p+c]=Math.round(raw[n*size+p+c]*(1-weight)+ref[p+c]*weight);
}
const input=dir+'hands-fixed.rgba';writeFileSync(input,fixed);
for(const compact of [false,true]){
 const file=dir+'hover-loop'+(compact?'-compact':'')+'.webm';
 run(['-loglevel','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','464x688','-framerate','24','-i',input,'-vf',(compact?'scale=372:552,':'')+'format=yuva420p','-an','-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',file]);
 if(inspect(file,['-c:v','libvpx-vp9']).frames.length!==16)throw Error('帧数异常');
}
run(['-loglevel','error','-y','-c:v','libvpx-vp9','-i',dir+'hover-loop.webm','-vf','framestep=5,tile=2x2','-frames:v','1',dir+'hands-check.png']);
