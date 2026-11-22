import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow,showPanel} from './panel-window.mjs';

export function attachTaskInbox(electron,{bundle,root,flow,visible=true}) {
  const {ipcMain}=electron;
  const entry=resolve(bundle,'task-inbox.html');
  const url=pathToFileURL(entry).href;
  const methods=['local','tasks','chains','detail','receipts','claim','inspect','resume','transcripts','transcript','transcriptEdit','transcriptDecision','transcriptRetry'];
  let panel=null,loading;
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
      if(!panel||panel.isDestroyed()){
        const created=createPanelWindow(electron,{title:'绯月任务管理',width:550,height:440,minWidth:360,minHeight:320,
          show:false,autoHideMenuBar:true,webPreferences:{preload:resolve(root,'desktop/task-inbox-preload.cjs'),
            nodeIntegration:false,contextIsolation:true,sandbox:true}},root);
        panel=created;
        created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        created.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
        created.once('closed',()=>{if(panel===created)panel=null;});
        loading=created.loadFile(entry).catch(error=>{if(!created.isDestroyed())created.destroy();throw error;});
      }
      const window=panel;
      await loading;
      if(panel===window&&!window.isDestroyed()){
        if(transcriptId)window.webContents.send('task-inbox:show-transcript',transcriptId);
        if(visible){showPanel(window);window.focus();}
      }
    },
    get panel(){return panel;},
    close(){
      for(const method of methods)ipcMain.removeHandler('task-inbox:'+method);
      if(panel&&!panel.isDestroyed())panel.destroy();
    },
  };
}
