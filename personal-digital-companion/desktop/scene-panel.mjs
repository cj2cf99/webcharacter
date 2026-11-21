import {join} from 'node:path';
import {createPanelWindow} from './panel-window.mjs';
export function attachScenePanel(electron,{root,bundle,finish,visible=true}){
  let panel=null,current=null,saving=false;
  const trusted=e=>panel&&!panel.isDestroyed()&&e.sender===panel.webContents&&e.senderFrame===panel.webContents.mainFrame;
  electron.ipcMain.handle('scene:get',e=>trusted(e)?current:null);
  electron.ipcMain.handle('scene:finish',async(e,id,text)=>{
    if(!trusted(e)||saving||current?.id!==id||typeof text!=='string'||text.length>2000)throw Error('场景已关闭');
    saving=true;
    try{await finish(current,text.trim()?text:'');panel?.close();}finally{saving=false;}
  });
  return {get panel(){return panel;},async show(scene){
    if(panel)return false;
    const area=electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea;
    const w=createPanelWindow(electron,{width:Math.min(690,area.width),height:Math.min(625,area.height),show:false,title:'绯月 · 此刻所想',
      webPreferences:{preload:join(root,'desktop/scene-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}},root);
    panel=w;current=scene;w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());
    let settled=false;
    w.on('close',e=>{
      if(settled||saving||!w.isVisible())return;
      e.preventDefault();saving=true;
      void finish(scene,'').then(()=>{settled=true;w.destroy();},()=>{}).finally(()=>{saving=false;});
    });
    w.once('closed',()=>{panel=null;current=null;});
    try{await w.loadFile(join(bundle,'scene.html'));if(w.isDestroyed())return false;if(visible)w.showInactive();return true;}
    catch(error){if(!w.isDestroyed())w.destroy();throw error;}
  },dismiss(){panel?.close();},close(){panel?.destroy();for(const name of ['scene:get','scene:finish'])electron.ipcMain.removeHandler(name);}};
}
