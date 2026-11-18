import{run}from'./media.mjs';
import{writeFileSync,mkdirSync}from'node:fs';
import{fileURLToPath}from'node:url';
import{resolve}from'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'output/drag-v1');mkdirSync(dir,{recursive:true});
const source='G:/picsample/拖拽.mp4';
const r=run(['-loglevel','error','-i',source,'-vf','scale=116:172,format=rgba,colorkey=0x00FF00:0.20:0.08','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-'],{binary:true}).stdout;
const size=116*172*4,list=[];
for(let a=20;a<77;a++)for(let b=a+14;b<92;b++){
  let d=0,n=0;for(let p=0;p<size;p+=16){const i=a*size+p,j=b*size+p;if(r[i+3]>100||r[j+3]>100){for(let c=0;c<4;c++)d+=Math.abs(r[i+c]-r[j+c]);n+=4}}
  list.push({startFrame:a,endFrame:b+1,seconds:(b-a+1)/24,score:d/n});
}
list.sort((a,b)=>a.score-b.score);writeFileSync(resolve(dir,'short-candidates.json'),JSON.stringify(list.slice(0,20),null,2));console.log(JSON.stringify(list.slice(0,8)));
const frames=[0,42,79,91,114,120,126,132,144];
run(['-loglevel','error','-y','-i',source,'-vf',`select='${frames.map(n=>'eq(n,'+n+')').join('+')}',scale=186:276,tile=3x3`,'-frames:v','1',resolve(dir,'detail.png')]);
