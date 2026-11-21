import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow} from './panel-window.mjs';

export function attachTaskInbox(electron,{bundle,root,flow,visible=true}) {
  const {ipcMain}=electron;
  const entry=resolve(bundle,'task-inbox.html');
  const url=pathToFileURL(entry).href;
  const methods=['local','tasks','chains','detail','receipts','claim','inspect','resume','transcripts','transcript','transcriptDecision','transcriptRetry'];
  let panel=null;
  for(const method of methods){
    ipcMain.handle('task-inbox:'+method,async(event,value)=>{
      if(!panel||panel.isDestroyed()||event.sender!==panel.webContents||event.senderFrame!==panel.webContents.mainFrame)
        throw Error('仅任务窗口可以操作。');
      if(['claim','inspect','detail','resume','chains'].includes(method)&&(method!=='chains'||value!=null)
        &&(typeof value!=='string'||!/^[\w-]{1,128}$/.test(value)))return {error:'任务标识无效'};
      try{
        if(method==='transcripts'&&!flow.transcripts)return {value:[]};
        if(!flow[method])throw Error('当前功能不可用。');
        const result=await flow[method](value);
        if(result?.paused)return {error:'任务暂缓，已保留原操作。'};
        if(['claim','resume'].includes(method)){
          if(result?.task?.status==='FAILED')return {error:'本轮执行失败，请查看任务记录。'};
          return {value:null};
        }
        return {value:result};
      }catch(error){return {error:error.message||'读取或操作任务失败。'};}
    });
  }
  return {
    async open(transcriptId){
      if(panel&&!panel.isDestroyed()){
        if(transcriptId)panel.webContents.send('task-inbox:show-transcript',transcriptId);
        if(visible){panel.show();panel.focus();}
        return;
      }
      const window=createPanelWindow(electron,{title:'绯月任务管理',width:550,height:440,minWidth:360,minHeight:320,
        show:false,autoHideMenuBar:true,webPreferences:{preload:resolve(root,'desktop/task-inbox-preload.cjs'),
          nodeIntegration:false,contextIsolation:true,sandbox:true}},root);
      panel=window;
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      window.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
      window.once('closed',()=>{if(panel===window)panel=null;});
      try{await window.loadFile(entry);}
      catch(error){if(!window.isDestroyed())window.destroy();throw error;}
      if(panel===window&&!window.isDestroyed()){
        if(transcriptId)window.webContents.send('task-inbox:show-transcript',transcriptId);
        if(visible){window.show();window.focus();}
      }
    },
    get panel(){return panel;},
    close(){
      for(const method of methods)ipcMain.removeHandler('task-inbox:'+method);
      if(panel&&!panel.isDestroyed())panel.destroy();
    },
  };
}
