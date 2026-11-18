import {run,inspect} from './media.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=root+'output/animation-speed/';mkdirSync(dir+'compact',{recursive:true});const clips={};
for(const [id,seconds,frames,source]of [['drag-enter',1,72,'drag-v2'],['drag-exit',1,73,'drag-v2'],['drag-loop',3,144,'drag-v2'],['hover-loop',2,72,'hover-parts']])for(const compact of [false,true]){
 if(process.argv.includes('--hover-only')&&id!=='hover-loop')continue;
 const input=root+'output/'+source+'/'+(source==='drag-v2'?(compact?'compact/':'')+id:id+(compact?'-compact':''))+'.webm',output=dir+(compact?'compact/':'')+id+'.webm';
 run(['-loglevel','error','-y','-c:v','libvpx-vp9','-i',input,'-an','-vf',`setpts=${seconds*24/frames}*(PTS-STARTPTS),fps=24,tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame=${seconds*24},format=yuva420p`,'-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',output]);
 const data=inspect(output,['-c:v','libvpx-vp9']);if(data.frames.length!==seconds*24)throw Error('帧数不符');clips[id]={seconds,frames:data.frames.length};console.log(JSON.stringify({id,compact,...clips[id]}));
}writeFileSync(dir+'manifest.json',JSON.stringify(clips,null,2));
