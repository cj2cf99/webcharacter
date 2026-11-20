import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tokyoDay} from './conversation-history.mjs';
import {createPanelWindow} from './panel-window.mjs';

export function attachConversationDetails(electron,{root,bundle,history,memory,readTasks,readTraffic,edits,visible,onReview}) {
  const {ipcMain,shell}=electron;
  let initialView='chat';
  let panel=null, selection=null, shownSources=new Set(), loading=null;
  const entry=resolve(bundle,'conversation.html');
  const trusted = event => panel && !panel.isDestroyed() && event.sender===panel.webContents && event.senderFrame===panel.webContents.mainFrame;
  ipcMain.handle('conversation:read',async(event,day,view=initialView,cursor)=>{
    if (!trusted(event)) throw Error('仅对话记录窗口可读');
    const selected=selection;
    day=day??(selected?tokyoDay(selected.at):tokyoDay(Date.now()));
    if(view==='log'){
      try{return {day,view,dated:Boolean(memory),...await readTraffic(cursor,day)};}
      catch{return {day,view,lines:[],next:null,warning:'日志已轮转或暂时无法读取，请刷新日志。'};}
    }
    if(view==='pending'){
      if(!edits)throw Error('提醒确认未就绪。');
      return {day,view,...await edits.view()};
    }
    if(view==='tasks'){
      if(!readTasks)throw Error('任务记录未连接');
      return {day,view,events:await readTasks(day)};
    }
    let turns,warning;
    try{turns=await history.read(day);}catch(error){
      if(!selected||tokyoDay(selected.at)!==day)throw error;
      turns=[selected];warning='当天记录读取失败，目前仅显示气泡中的这一轮。';
    }
    if (selected && tokyoDay(selected.at)===day){
      const index=turns.findIndex(row=>row.id===selected.id);
      if(index<0)turns.unshift(selected);else turns[index]=selected;
    }
    shownSources=new Set(turns.flatMap(turn=>(turn.sources??[]).map(source=>source.url)));
    return {day,view:'chat',turns,selectedId:selected?.id,warning};
  });
  ipcMain.handle('conversation:source',(event,url)=>{
    if(trusted(event)&&shownSources.has(url)&&/^https?:\/\//i.test(url))return shell.openExternal(url);
  });
  ipcMain.handle('conversation:image',(event,day,id,open)=>{
    if(!trusted(event)||!memory)throw Error('仅复盘窗口可查看归档图片');
    return open===true?shell.openPath(memory.original(day,id)):memory.thumbnail(day,id);
  });
  ipcMain.on('conversation:reviewed',reviewed);
  function reviewed(event,token){if(trusted(event)&&typeof token==='string')onReview?.(token);}
  ipcMain.handle('conversation:reminder-decision',async(event,input)=>{
    if(!trusted(event)||!edits)throw Error('请从待确认窗口操作。');
    try{
      const text=await edits.decide(input);
      if(input.action==='approve'||input.action==='reject'){
        const turn={id:crypto.randomUUID(),at:Date.now(),question:input.action==='approve'?'同意这组提醒修改':'放弃这组提醒修改',state:'answer',text};
        try{await history.save(turn);}catch{return text+'\n本地对话记录保存失败。';}
      }
      return text;
    }catch(error){return error.message;}
  });
  async function open(turn,view='chat') {
    initialView=view;
    selection=turn??null;
    const opening=!panel || panel.isDestroyed();
    if (opening) {
      const created = createPanelWindow(electron,{width:560,height:540,minWidth:330,minHeight:300,show:false,autoHideMenuBar:true,
        title:'绯月 · 本地复盘',webPreferences:{preload:resolve(root,'desktop/conversation-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:!visible}},root);
      panel=created;
      created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      created.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(entry).href)event.preventDefault();});
      created.on('closed',()=>{if(panel===created){panel=null;selection=null;shownSources.clear();}});
      loading=created.loadFile(entry).catch(error=>{if(!created.isDestroyed())created.destroy();throw error;});
    }
    const current=panel;
    await loading;
    if(panel!==current||current.isDestroyed())return;
    if(!opening)current.webContents.send('conversation:select');
    if(visible){current.show();current.focus();}
  }
  return {open,get panel(){return panel;},close(){
    ipcMain.removeHandler('conversation:read');ipcMain.removeHandler('conversation:source');ipcMain.removeHandler('conversation:reminder-decision');ipcMain.removeHandler('conversation:image');
    ipcMain.removeListener('conversation:reviewed',reviewed);
    if(panel&&!panel.isDestroyed())panel.destroy();
  }};
}
