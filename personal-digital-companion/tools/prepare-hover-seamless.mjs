// 循环尾部与开头重叠混合，输出从重叠区后开始，避免回卷硬切。
import {run,inspect} from './media.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=root+'output/hover-seamless/';mkdirSync(dir,{recursive:true});
for(const compact of [false,true]){
const w=compact?372:464,h=compact?552:688,size=w*h*4,overlap=6,count=48;
const input=root+'output/animation-speed/'+(compact?'compact/':'')+'hover-loop.webm';
const raw=run(['-loglevel','error','-c:v','libvpx-vp9','-i',input,'-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
if(raw.length!==count*size)throw Error('输入帧数不符');
const out=Buffer.alloc((count-overlap)*size);raw.copy(out,0,overlap*size,(count-overlap)*size);
for(let n=0;n<overlap;n++){
 const t=(n+1)/overlap,weight=t*t*(3-2*t),offset=(count-2*overlap+n)*size;
 for(let p=0;p<size;p+=4){const a=(count-overlap+n)*size+p,b=n*size+p,alpha=raw[a+3]*(1-weight)+raw[b+3]*weight;
 out[offset+p+3]=Math.round(alpha);for(let c=0;c<3;c++)out[offset+p+c]=alpha?Math.round((raw[a+c]*raw[a+3]*(1-weight)+raw[b+c]*raw[b+3]*weight)/alpha):0;
 }
}
const file=dir+(compact?'compact':'normal')+'.webm',temp=dir+(compact?'compact':'normal')+'.rgba';writeFileSync(temp,out);
run(['-loglevel','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size',w+'x'+h,'-framerate','21','-i',temp,'-vf','fps=24,format=yuva420p','-an','-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',file]);
const info=inspect(file,['-c:v','libvpx-vp9']);if(info.frames.length!==48)throw Error('输出帧数不符');console.log(JSON.stringify({compact,frames:48,seconds:info.seconds}));
}
