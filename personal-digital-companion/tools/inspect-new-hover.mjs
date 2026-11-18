import {run,inspect} from './media.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),source='G:/picsample/鼠标悬浮循环.mp4';
console.log(JSON.stringify(inspect(source)));
run(['-loglevel','error','-y','-i',source,'-vf','fps=2,scale=155:230,tile=6x2','-frames:v','1',root+'output/new-hover-contact.png']);
