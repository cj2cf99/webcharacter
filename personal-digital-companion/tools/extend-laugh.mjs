import {run} from './media.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='personal-digital-companion/assets/voice/nodes-20261118/',src=dir+'laugh-bell-v3.wav',out=dir+'laugh-bell-v3-long.wav';
const raw=run(['-loglevel','error','-i',src,'-ar','48000','-ac','1','-f','f32le','-'],{binary:true}).stdout;
const seconds=raw.length/4/48000,target=seconds+1;let rate=seconds/target;const filters=[];while(rate<.5){filters.push('atempo=0.5');rate/=.5}filters.push('atempo='+rate,'apad','atrim=duration='+target);
run(['-loglevel','error','-y','-i',src,'-af',filters.join(','),'-c:a','pcm_s16le',out]);
const check=run(['-loglevel','error','-i',out,'-ar','48000','-ac','1','-f','f32le','-'],{binary:true}).stdout;console.log(JSON.stringify({before:seconds,after:check.length/4/48000}));
const page='personal-digital-companion/prototype/settings.html';let html=readFileSync(page,'utf8');html=html.replace('let previewAudio=null',`voices.push(['laugh-bell-v3-long','轻笑 A · 加长1秒','../assets/voice/nodes-20261118/laugh-bell-v3-long.wav']);let previewAudio=null`);writeFileSync(page,html);
