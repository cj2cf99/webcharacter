import {run,inspect} from './media.mjs';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=root+'output/hover-parts/';mkdirSync(dir,{recursive:true});
for(const [id,start,end] of [['hover',32,48],['hover-loop',48,64],['hover-exit',64,145]])for(const compact of [false,true]){
if(process.argv.includes('--enter-only')&&id!=='hover')continue;
const file=dir+id+(compact?'-compact':'')+'.webm';
run(['-loglevel','error','-y','-c:v','libvpx-vp9','-i',root+'output/four-states-v3/idle.webm','-an','-vf',`trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,${compact?'scale=372:552,':''}format=yuva420p`,'-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',file]);
if(inspect(file,['-c:v','libvpx-vp9']).frames.length!==end-start)throw Error('frame count');
}
