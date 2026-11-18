// 不需要Electron即可准备共享渲染代码与本地资源；不安装依赖。
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {Script} from 'node:vm';
import {run} from './media.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'output/desktop-bundle'),media=resolve(root,'output/four-states-v3');
mkdirSync(out,{recursive:true});
for(const name of ['companion-state','companion-player'])writeFileSync(resolve(out,name+'.mjs'),stripTypeScriptTypes(readFileSync(resolve(root,'src',name+'.ts'),'utf8')));
for(const name of ['index.html','style.css','renderer.mjs','sound.mjs','sound-settings.html','sound-settings.css','sound-settings.mjs','settings.html','settings-ui.mjs','settings.css','configured-renderer.mjs','behavior-controller.mjs','effect-preview.mjs'])copyFileSync(resolve(root,'desktop',name),resolve(out,name));
mkdirSync(resolve(out,'voice'),{recursive:true});
cpSync(resolve(root,'assets/voice'),resolve(out,'voice'),{recursive:true});
// Git内正式资源可独立恢复；只有显式重做素材时才读取本机中间产物。
const committed=resolve(root,'assets/desktop-media');
if(existsSync(resolve(committed,'clip-catalog.json'))&&!process.argv.includes('--from-intermediates')){
  cpSync(committed,out,{recursive:true});
  const clips=JSON.parse(readFileSync(resolve(out,'clip-catalog.json'),'utf8'));
  writeFileSync(resolve(out,'local-clips.js'),'window.localClips='+JSON.stringify(clips)+';');
  const page=readFileSync(resolve(out,'index.html'),'utf8').replace('<script type="module"','<script src="local-clips.js"></script><script type="module"');
  writeFileSync(resolve(out,'index.html'),page);console.log('已从Git正式资源构建：'+out);process.exit(0);
}
copyFileSync(resolve(media,'baseline.png'),resolve(out,'baseline.png'));
const manifest=JSON.parse(readFileSync(resolve(media,'manifest.json'),'utf8')),clips={};
mkdirSync(resolve(out,'clips'),{recursive:true});
mkdirSync(resolve(out,'clips-compact'),{recursive:true});
for(const[id,clip]of Object.entries(manifest.clips)){
  clips[id]={normal:'./clips/'+clip.file};copyFileSync(resolve(media,clip.file),resolve(out,'clips',clip.file));
  const compact=resolve(root,'output/desktop-videos-372',clip.file);
  if(existsSync(compact)){clips[id].compact='./clips-compact/'+clip.file;copyFileSync(compact,resolve(out,'clips-compact',clip.file));}
}
const dragDir=resolve(root,'output/drag-v2'),dragManifest=JSON.parse(readFileSync(resolve(dragDir,'manifest.json'),'utf8'));
for(const[id,clip]of Object.entries(dragManifest.clips)){
  clips[id]={normal:'./clips/'+clip.file,compact:'./clips-compact/'+clip.file};
  copyFileSync(resolve(dragDir,clip.file),resolve(out,'clips',clip.file));
  copyFileSync(resolve(dragDir,'compact',clip.file),resolve(out,'clips-compact',clip.file));
}
clips['idle-special']={...clips.hover};
for(const id of ['hover','hover-loop','hover-exit']){
  clips[id]={normal:'./clips/'+id+'-parts.webm',compact:'./clips-compact/'+id+'-parts.webm'};
  copyFileSync(resolve(root,'output/hover-parts/'+id+'.webm'),resolve(out,'clips/'+id+'-parts.webm'));
  copyFileSync(resolve(root,'output/hover-parts/'+id+'-compact.webm'),resolve(out,'clips-compact/'+id+'-parts.webm'));
}
clips.idle={normal:'./clips/idle-basic.webm',compact:'./clips-compact/idle-basic.webm'};
copyFileSync(resolve(root,'output/idle-basic/normal.webm'),resolve(out,'clips/idle-basic.webm'));
copyFileSync(resolve(root,'output/idle-basic/compact.webm'),resolve(out,'clips-compact/idle-basic.webm'));
for(const id of ['drag-enter','drag-exit','drag-loop','hover-loop']){
  clips[id]={normal:'./clips/'+id+'-speed.webm',compact:'./clips-compact/'+id+'-speed.webm'};
  copyFileSync(resolve(root,'output/animation-speed/'+id+'.webm'),resolve(out,'clips/'+id+'-speed.webm'));
  copyFileSync(resolve(root,'output/animation-speed/compact/'+id+'.webm'),resolve(out,'clips-compact/'+id+'-speed.webm'));
}
clips['hover-loop']={normal:'./clips/hover-seamless.webm',compact:'./clips-compact/hover-seamless.webm'};
copyFileSync(resolve(root,'output/hover-seamless/normal.webm'),resolve(out,'clips/hover-seamless.webm'));
copyFileSync(resolve(root,'output/hover-seamless/compact.webm'),resolve(out,'clips-compact/hover-seamless.webm'));
writeFileSync(resolve(out,'clip-catalog.json'),JSON.stringify(clips));
const resources='window.localClips='+JSON.stringify(clips)+';';new Script(resources);writeFileSync(resolve(out,'local-clips.js'),resources);
const page=readFileSync(resolve(out,'index.html'),'utf8').replace('<script type="module"','<script src="local-clips.js"></script><script type="module"');writeFileSync(resolve(out,'index.html'),page);
run(['-loglevel','error','-y','-i',resolve(media,'baseline.png'),'-vf','crop=200:200:140:20,scale=32:32:flags=lanczos','-frames:v','1',resolve(out,'tray.png')]);
console.log('桌面本地资源已准备：'+out);
