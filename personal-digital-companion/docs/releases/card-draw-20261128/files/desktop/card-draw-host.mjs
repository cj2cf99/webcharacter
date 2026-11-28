// 抽卡窗口宿主：调度器常驻主进程，窗口只是它的界面，关窗后继续执行。
import {mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCardDraw} from './card-draw.mjs';
import {createPanelWindow,showPanel} from './panel-window.mjs';

// 密钥只用系统加密后落盘；系统加密不可用时仅留在内存。
export function createKeyStore(dir,safeStorage){
  const file=join(dir,'key.bin');
  const available=()=>safeStorage?.isEncryptionAvailable?.()===true;
  return {
    load(){
      if(!available())return '';
      try{return safeStorage.decryptString(readFileSync(file));}catch{return '';}
    },
    save(key){
      if(!available())return false;
      try{mkdirSync(dir,{recursive:true});writeFileSync(file,safeStorage.encryptString(key),{mode:0o600});return true;}
      catch{return false;}
    },
    clear(){rmSync(file,{force:true});},
  };
}

// overrides 供隔离检查替换时钟、fetch 与回收站。
export function attachCardDraw(electron,{root,bundle,profile,pictureRoot,enabled=true,visible=true,onNotice,log,overrides}){
  const {ipcMain,shell,app,safeStorage}=electron;
  const entry=resolve(bundle,'card-draw.html'),dataDir=join(profile,'card-draw');
  let panel=null,closed=false;
  const changed=()=>{if(panel&&!panel.isDestroyed())panel.webContents.send('card-draw:changed');};
  const draw=createCardDraw({dataDir,wordsFile:resolve(root,'desktop/card-draw-words.json'),
    pictureRoot:pictureRoot??(()=>join(app.getPath('pictures'),'绯月抽卡')),
    keyStore:createKeyStore(dataDir,safeStorage),trash:file=>shell.trashItem(file),onChange:changed,onNotice,log,...overrides});
  ipcMain.handle('card-draw:action',(event,type,args)=>{
    if(!panel||event.sender!==panel.webContents||event.senderFrame!==panel.webContents.mainFrame)throw Error('仅绯月抽卡面板可使用');
    return draw.action(type,args);
  });
  if(enabled)draw.start();

  async function open(){
    if(closed)return;
    if(panel&&!panel.isDestroyed()){
      if(visible){showPanel(panel);panel.focus();}
      return;
    }
    const created=createPanelWindow(electron,{title:'绯月 · 抽卡',width:760,height:800,minWidth:360,minHeight:480,
      show:false,autoHideMenuBar:true,webPreferences:{preload:resolve(root,'desktop/card-draw-preload.cjs'),
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
  return {open,core:draw,get panel(){return panel;},close(){
    if(closed)return;closed=true;draw.close();ipcMain.removeHandler('card-draw:action');panel?.destroy();
  }};
}
