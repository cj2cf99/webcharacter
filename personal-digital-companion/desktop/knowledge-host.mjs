import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow,showPanel} from './panel-window.mjs';
import {createKnowledgeStore} from './knowledge-store.mjs';
import {createKnowledgeBackups,knowledgePeriods} from './knowledge-backups.mjs';
import {createKnowledgeRuntime,explicitKnowledgeRule} from './knowledge-runtime.mjs';

export function attachKnowledge(electron,{root,bundle,profile,model,enabled=true,visible=true}){
  const {ipcMain,dialog,powerMonitor}=electron;
  const store=createKnowledgeStore(profile);
  const backups=createKnowledgeBackups(profile,store);
  const runtime=createKnowledgeRuntime({store,model,beforeAccess:()=>{
    if(closed)throw Object.assign(Error('知识库已关闭'),{code:'KNOWLEDGE_UNAVAILABLE'});
    backups.completeInterrupted();
  }});
  const entry=resolve(bundle,'knowledge.html');
  let panel,closed=false,period='';
  function backup(force=false){
    if(closed||!enabled)return;
    const current=JSON.stringify(knowledgePeriods(Date.now()));
    if(!force&&current===period)return;
    try{backups.rotate();period=current;}catch{/* 面板的备份入口显示读取或写入失败。 */}
  }
  const resumed=()=>backup();
  const timer=enabled?setInterval(resumed,60_000):null;
  timer?.unref();
  if(enabled){queueMicrotask(resumed);powerMonitor?.on?.('resume',resumed);}
  let selected;
  async function open(id){
    if(closed)return;
    if(typeof id==='string'&&/^[a-f\d-]{36}$/u.test(id))selected=id;
    if(panel&&!panel.isDestroyed()){
      if(selected){const target=selected;selected=undefined;panel.webContents.send('knowledge:select',target);}
      if(visible){showPanel(panel);panel.focus();}
      return;
    }
    const created=createPanelWindow(electron,{title:'绯月 · 知识库',width:625,height:658,minWidth:355,minHeight:380,
      show:false,autoHideMenuBar:true,webPreferences:{preload:resolve(root,'desktop/knowledge-preload.cjs'),
        sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:!visible}},root);
    panel=created;
    created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    created.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(entry).href)event.preventDefault();});
    created.once('closed',()=>{if(panel===created)panel=null;});
    try{
      await created.loadFile(entry);
      if(panel!==created||created.isDestroyed())return;
      if(visible){showPanel(created);created.focus();}
    }catch(error){if(!created.isDestroyed())created.destroy();throw error;}
  }
  const keyFilter={name:'绯月知识库密钥',extensions:['key']};
  const backupFilter={name:'绯月知识库 SQLite 备份',extensions:['sqlite']};
  async function choose(title,filter){
    const result=await dialog.showOpenDialog(panel,{title,properties:['openFile'],filters:[filter]});
    return result.canceled?null:result.filePaths[0];
  }
  async function saveAs(title,defaultPath,filter,save){
    const result=await dialog.showSaveDialog(panel,{title,defaultPath,filters:[filter]});
    if(result.canceled||!result.filePath)return false;
    try{save(result.filePath);}catch(error){
      if(error.code==='EEXIST')throw Error('目标文件已存在，请换一个文件名。');
      throw error;
    }
    return true;
  }
  const handlers={
    initial:()=>{const id=selected;selected=undefined;return id;},
    list:args=>store.items(args),
    detail:args=>store.detail(args.id,args.isGroup),
    save:args=>store.saveCard(args),
    group:args=>store.saveGroup(args),
    split:args=>store.split(args),
    backups:()=>backups.catalog(),
    backup:()=>{backups.rotate();return backups.catalog();},
    preview:args=>backups.preview(args.name),
    previewExternal:async()=>{
      const selected=await choose('选择要恢复的知识库备份',backupFilter);
      return selected?backups.previewFile(selected):null;
    },
    importKey:async()=>{
      const selected=await choose('导入另一台设备导出的知识库密钥',keyFilter);
      if(!selected)return false;
      store.importKey(selected,backups.protectedKey());
      period='';
      return true;
    },
    exportKey:()=>saveAs('导出知识库密钥','feiyue-knowledge.key',keyFilter,
      path=>store.keyring.exportKey(store.keyring.currentId()??store.currentKey(),path)),
    exportBackup:args=>saveAs('导出知识库备份','feiyue-knowledge-'+args.name,backupFilter,path=>backups.exportSnapshot(args.name,path)),
    restore:args=>{const result=backups.restore(args.token);period='';return result;},
  };
  ipcMain.handle('knowledge:action',(event,action,args={})=>{
    if(!panel||event.sender!==panel.webContents||event.senderFrame!==panel.webContents.mainFrame||!Object.hasOwn(handlers,action))
      throw Error('仅知识库面板可使用');
    if(!['initial','backups','preview','previewExternal','restore','importKey','exportKey','exportBackup'].includes(action))backups.completeInterrupted();
    return handlers[action](args);
  });
  async function inspect(input){
    if(!enabled||closed)return undefined;
    try{return await runtime.inspect(input);}
    catch(error){
      input.signal?.throwIfAborted();
      const explicit=input.direct&&explicitKnowledgeRule(input.text);
      if(error.code==='KNOWLEDGE_UNAVAILABLE'||error.code?.startsWith('ERR_SQLITE')||explicit)
        return {state:'unavailable',private:true,answer:'本机知识库当前无法完成核对，可重试或由知识库面板恢复。'};
      throw error;
    }
  }
  function readRules(references){
    if(closed||!enabled)return [];
    backups.completeInterrupted();
    return references.flatMap(({id,revision})=>{
      const card=store.card(id);
      return card?.state==='active'&&card.revision===revision?[{id,revision,kind:card.kind,body:card.body}]:[];
    });
  }
  return {open,inspect,readRules,get panel(){return panel;},close(){
    closed=true;clearInterval(timer);powerMonitor?.removeListener?.('resume',resumed);
    ipcMain.removeHandler('knowledge:action');panel?.destroy();store.close();
  }};
}
