import {run,inspect} from './media.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=root+'output/drag-v2/';mkdirSync(dir+'compact',{recursive:true});
const manifest={clips:{},sources:{},cuts:72};
for(const [id,name,start,end]of [['drag-enter','拖拽进入和退出',0,72],['drag-loop','拖拽循环',0,144],['drag-exit','拖拽进入和退出',72,145]]){
const source='G:/picsample/'+name+'.mp4';manifest.sources[name]=createHash('sha256').update(readFileSync(source)).digest('hex');
for(const compact of [false,true]){
const file=dir+(compact?'compact/':'')+id+'.webm';
run(['-loglevel','error','-y','-i',source,'-an','-vf',`trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,scale=464:688,format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5,${compact?'scale=372:552,':''}format=yuva420p`,'-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',file]);
const data=inspect(file,['-c:v','libvpx-vp9']);if(data.frames.length!==end-start)throw Error('帧数错误');manifest.clips[id]={file:id+'.webm',frames:end-start,seconds:data.seconds};console.log(JSON.stringify({id,compact,frames:end-start}));
}}
writeFileSync(dir+'manifest.json',JSON.stringify(manifest,null,2));
