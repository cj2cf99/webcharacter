import {copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, extname, join} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {watchChanges,warnLiveUpdate} from './live-files.mjs';

// 构建与热加载使用同一份页面依赖。每次只更新受影响的窗口。
export const pages = {
  'news-panel.html':['feiyue-surface.css','news-panel.css','news-weekly.css','news-layout.mjs','news-panel-ui.mjs'],
  'scene.html':['feiyue-surface.css','scene.css','scene-ui.mjs'],
  'poll-settings.html':['feiyue-surface.css','poll-settings.css','poll-settings-ui.mjs'],
  'index.html':['style.css','configured-renderer.mjs','renderer.mjs','companion-player.mjs','companion-state.mjs','behavior-controller.mjs','screen-posture.mjs','sound.mjs','window-nodes.mjs'],
  'settings.html':['feiyue-surface.css','settings.css','settings-ui.mjs','effect-preview.mjs','companion-player.mjs','behavior-controller.mjs','window-nodes.mjs'],
  'message-box.html':['feiyue-surface.css','message-box.css','message-box-ui.mjs'],
  'menu.html':['feiyue-surface.css','menu.css','menu-ui.mjs'],
  'registration.html':['feiyue-surface.css','registration.css','registration-ui.mjs'],
  'registration-review.html':['feiyue-surface.css','registration.css','registration-review-ui.mjs','question-attachment.mjs'],
  'reminder-review.html':['feiyue-surface.css','reminder-review.css','reminder-review-ui.mjs'],
  'task-inbox.html':['feiyue-surface.css','task-inbox.css','task-inbox-ui.mjs'],
  'sound-settings.html':['feiyue-surface.css','sound-settings.css','sound-settings.mjs','sound.mjs'],
  'conversation.html':['feiyue-surface.css','conversation-ui.mjs','conversation.css'],
  'screen-question.html':['feiyue-surface.css','screen-question.css','question-attachment.mjs','screen-question-ui.mjs'],
  'weather.html':['feiyue-surface.css','weather.css','weather-ui.mjs'],
};
export const desktopFiles = [...new Set(Object.entries(pages).flatMap(([page,files])=>[page,...files]))]
  .filter(name=>!['companion-player.mjs','companion-state.mjs'].includes(name));
export const withClipCatalog = html => html.replace('<script type="module"','<script src="local-clips.js"></script><script type="module"');
const mediaDirs = {'desktop-media':'','voice':'voice','walk-20261118':'walk','attachment-human-20261118':'attachment-human','elevator-20261118':'elevator'};
const mediaExtensions = new Set(['.png','.wav','.mp3','.m4a','.flac','.ogg','.webm']);

export function prepareDesktopPages(root,bundle) {
  function prepare(file,target,transform=text=>text) {
    const content=transform(readFileSync(file,'utf8')),dest=join(bundle,target);
    if(existsSync(dest)&&readFileSync(dest,'utf8')===content)return;
    const temp=dest+'.'+process.pid+'.live-tmp';
    writeFileSync(temp,content);renameSync(temp,dest);
  }
  for(const name of desktopFiles)prepare(join(root,'desktop',name),name,name==='index.html'?withClipCatalog:undefined);
  for(const name of ['companion-player','companion-state'])prepare(join(root,'src',name+'.ts'),name+'.mjs',stripTypeScriptTypes);
}

export function watchDesktopSources({root,bundle,updated,restartNeeded}) {
  const stops=[];
  function listen(directory,accept,apply,recursive=false) {
    if(existsSync(directory))stops.push(watchChanges(directory,accept,apply,recursive));
  }
  function install(source,target,transform) {
    const dest=join(bundle,target),temp=dest+'.'+process.pid+'.live-tmp';
    mkdirSync(dirname(dest),{recursive:true});
    if(transform)writeFileSync(temp,transform(readFileSync(source,'utf8')));
    else copyFileSync(source,temp);
    renameSync(temp,dest);
  }
  function copyBatch(dir,names,targetName,transform) {
    const completed=[];
    for(const name of names){
      const target=targetName(name);
      try{install(join(dir,name),target,transform?.(name));completed.push(target);}
      catch(error){warnLiveUpdate('绯月未更新 '+name,error);}
    }
    if(completed.length)updated(completed);
  }
  const desktop=join(root,'desktop'),shared=join(root,'src');
  if(existsSync(join(desktop,'index.html')))prepareDesktopPages(root,bundle);
  listen(desktop,name=>desktopFiles.includes(name)||/\.(?:mjs|cjs|ps1)$/.test(name),names=>{
    const files=names.filter(name=>desktopFiles.includes(name));
    copyBatch(desktop,files,name=>name,name=>name==='index.html'?withClipCatalog:null);
    if(names.some(name=>!desktopFiles.includes(name)||['sound.mjs','window-nodes.mjs','screen-posture.mjs'].includes(name)))restartNeeded();
  });
  listen(shared,name=>['companion-player.ts','companion-state.ts'].includes(name),names=>{
    copyBatch(shared,names,name=>name.replace(/\.ts$/,'.mjs'),()=>stripTypeScriptTypes);
  });
  for(const [folder,prefix] of Object.entries(mediaDirs)){
    const dir=join(root,'assets',folder);
    listen(dir,name=>mediaExtensions.has(extname(name).toLowerCase()),names=>copyBatch(dir,names,name=>join(prefix,name)),true);
  }
  return ()=>stops.forEach(stop=>stop());
}
