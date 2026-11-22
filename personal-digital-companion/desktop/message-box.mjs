import {createPanelWindow,showPanel} from './panel-window.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// 每个窗口只能读取自己的题面，并交回调用方按钮数组中的一个下标。
export function createMessageBoxes(electron,{bundle,root}){
  const {BrowserWindow,screen,dialog}=electron;
  const windows=new Set();
  const page=resolve(bundle,'message-box.html'),url=pathToFileURL(page).href;
  let closed=false;
  async function showMessageBox(options){
    const {type='info',title='',message='',detail='',buttons=['确定'],defaultId=0,cancelId=0}=options;
    if(closed)return {response:cancelId};
    let panel,readyTimer;
    try{
      const parent=BrowserWindow.getFocusedWindow();
      const area=(parent?screen.getDisplayMatching(parent.getBounds()):screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).workArea;
      const width=Math.min(460,area.width),maxHeight=Math.min(680,area.height);
      const position=height=>({x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),width,height});
      panel=createPanelWindow(electron,{...position(maxHeight),show:false,frame:false,transparent:true,resizable:false,
        skipTaskbar:true,alwaysOnTop:true,title:title||'绯月',backgroundColor:'#00000000',
        ...(parent?{parent,modal:true}:{}),
        webPreferences:{preload:resolve(root,'desktop/message-box-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}},root);
      windows.add(panel);
      const contents=panel.webContents;
      const own=event=>event.senderFrame===contents.mainFrame;
      contents.setWindowOpenHandler(()=>({action:'deny'}));
      contents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
      let response=cancelId;
      const result=new Promise((done,reject)=>{
        panel.once('closed',()=>{windows.delete(panel);done({response});});
        readyTimer=setTimeout(()=>reject(Error('弹窗界面未就绪')),8000);
      });
      contents.ipc.handle('message-box:read',event=>{
        if(!own(event))throw Error('仅当前对话框可读取');
        return {type,title,message,detail,buttons,defaultId,cancelId};
      });
      contents.ipc.on('message-box:ready',(event,height)=>{
        if(!own(event)||!Number.isFinite(height)||panel.isVisible())return;
        panel.setBounds(position(Math.min(maxHeight,Math.max(120,Math.ceil(height)))));
        showPanel(panel);
        if(panel.isVisible())clearTimeout(readyTimer);
      });
      contents.ipc.on('message-box:choose',(event,index)=>{
        if(!own(event)||!Number.isInteger(index)||index<0||index>=buttons.length)return;
        response=index;panel.destroy();
      });
      contents.once('render-process-gone',()=>{if(!panel.isDestroyed())panel.destroy();});
      const [,answer]=await Promise.all([panel.loadFile(page),result]);
      return answer;
    }catch{
      if(closed||panel?.isDestroyed())return {response:cancelId};
      panel?.destroy();
      return dialog.showMessageBox(options);
    }finally{clearTimeout(readyTimer);}
  }
  return {showMessageBox,get active(){return windows.size>0;},get panels(){return [...windows];},close(){
    closed=true;
    for(const panel of windows)panel.destroy();
  }};
}
