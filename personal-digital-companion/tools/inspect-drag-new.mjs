import {run,inspect} from './media.mjs';
for(const [id,name]of [['transition','拖拽进入和退出'],['loop','拖拽循环']]){const src='G:/picsample/'+name+'.mp4',i=inspect(src);console.log(JSON.stringify({id,frames:i.frames.length,seconds:i.seconds}));run(['-loglevel','error','-y','-i',src,'-vf','fps=2,scale=116:172,tile=6x3','-frames:v','1','personal-digital-companion/output/'+id+'-new.png']);}
