import {run} from './media.mjs';
import {mkdirSync} from 'node:fs';
const dir=new URL('../output/idle-basic/',import.meta.url);mkdirSync(dir,{recursive:true});
for(const compact of [false,true])run(['-loglevel','error','-y','-i','G:/picsample/待机基础循环.mp4','-an','-vf',`scale=${compact?'372:552':'464:688'}:force_original_aspect_ratio=decrease,pad=${compact?'372:552':'464:688'}:(ow-iw)/2:(oh-ih)/2:color=0x00FF00,format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5,format=yuva420p`,'-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',new URL(compact?'compact.webm':'normal.webm',dir).pathname.replace(/^\//,'')]);
