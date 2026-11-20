import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {tokyoDay} from './conversation-history.mjs';
import {createPanelWindow} from './panel-window.mjs';
import {readTaskReviews} from './personality-diary.mjs';

export function attachConversationDetails(electron,{root,profile,bundle,history,memory,readTasks,readTraffic,checks,edits,auditPending=()=>null,resumeAudit,visible,onReview}) {
  const {ipcMain,shell}=electron;
  let initialView='chat';
  let panel=null, selection=null, shownSources=new Set(), loading=null;
  let reportDay='',shownTasks=new Set(),activeReport=null,imageFullscreen=false;
  const entry=resolve(bundle,'conversation.html');
  const trusted = event => panel && !panel.isDestroyed() && event.sender===panel.webContents && event.senderFrame===panel.webContents.mainFrame;
  ipcMain.handle('conversation:read',async(event,day,view=initialView,cursor)=>{
    if (!trusted(event)) throw Error('仅对话记录窗口可读');
    const selected=selection;
    day=day??(selected?tokyoDay(selected.at):tokyoDay(Date.now()));
    if(view==='checks')return {day,view,...checks.read(day,cursor)};
    if(view==='notices')return {day,view,...checks.notices(cursor?.filter,cursor?.page)};
    if(view==='log'){
      try{return {day,view,dated:Boolean(memory),...await readTraffic(cursor,day)};}
      catch{return {day,view,lines:[],next:null,warning:'日志已轮转或暂时无法读取，请刷新日志。'};}
    }
    if(view==='pending'){
      return {day,view,choices:[],entries:[],...await edits?.view(),audit:auditPending()};
    }
    if(view==='tasks'){
      if(!readTasks)throw Error('任务记录未连接');
      const events=await readTasks(day);
      reportDay=day;shownTasks=new Set(events.map(e=>e.task_id));
      return {day,view,events};
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
    reportDay=day;shownTasks=new Set(turns.filter(t=>t.report?.job===t.id).map(t=>t.id));
    return {day,view:'chat',turns,selectedId:selected?.id,warning};
  });
  ipcMain.handle('conversation:resume-audit',(event,id)=>{
    if(!trusted(event)||!id||auditPending()?.id!==id)throw Error('这条手记质问已经结束。');
    return resumeAudit();
  });
  ipcMain.handle('conversation:report',async(event,day,id)=>{
    if(!trusted(event)||day!==reportDay||!shownTasks.has(id))throw Error('请选择任务复盘中的记录');
    const turn=await memory?.readImageReport?.(day,id);
    let events=turn?[]:await memory?.taskHistory?.(id)??[];
    if(!turn&&!events.length)events=(await readTasks(day)).filter(e=>e.task_id===id);
    activeReport={day,id,steps:new Set(turn?.report?.steps.filter(s=>s.image).map(s=>s.step))};
    try{
      const reviewEvents=turn&&profile&&readTasks?(await readTasks(day)).filter(e=>e.task_id===id):events;
      const reviews=profile?readTaskReviews(profile,id,reviewEvents,turn?day:undefined):[];
      return {turn,events,reviews};
    }catch{return {turn,events,reviews:[],reviewWarning:'评价暂时读取失败，可重新打开详情。'};}
  });
  ipcMain.handle('conversation:report-image',async(event,day,id,step,full)=>{
    if(!trusted(event)||activeReport?.day!==day||activeReport.id!==id||!activeReport.steps.has(step))throw Error('请先打开对应任务报告');
    const file=memory.taskImage(day,id,step);
    if(full==='copy'){electron.clipboard.writeText(file);return true;}
    if(full===true)return 'data:image/png;base64,'+(await readFile(file)).toString('base64');
    return (await electron.nativeImage.createThumbnailFromPath(file,{width:950,height:850})).toDataURL();
  });
  ipcMain.handle('conversation:report-fullscreen',(event,enable)=>{
    if(!trusted(event)||typeof enable!=='boolean')throw Error('无法切换图片全屏');
    if(enable&&activeReport?.steps.size&&!panel.isFullScreen()){panel.setFullScreen(true);imageFullscreen=true;}
    if(!enable&&imageFullscreen){imageFullscreen=false;panel.setFullScreen(false);}
  });
  ipcMain.handle('conversation:source',(event,url)=>{
    if(trusted(event)&&shownSources.has(url)&&/^https?:\/\//i.test(url))return shell.openExternal(url);
  });
  ipcMain.handle('conversation:image',(event,day,id,open)=>{
    if(!trusted(event)||!memory)throw Error('仅复盘窗口可查看归档图片');
    return open===true?shell.openPath(memory.original(day,id)):memory.thumbnail(day,id);
  });
  ipcMain.on('conversation:reviewed',reviewed);
  ipcMain.handle('conversation:read-notices',(event,id)=>{
    if(!trusted(event)||!checks)throw Error('仅复盘窗口可标记提醒');
    checks.markRead(id);
  });
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
      created.on('closed',()=>{if(panel===created){panel=null;selection=null;shownSources.clear();shownTasks.clear();activeReport=null;imageFullscreen=false;}});
      loading=created.loadFile(entry).catch(error=>{if(!created.isDestroyed())created.destroy();throw error;});
    }
    const current=panel;
    await loading;
    if(panel!==current||current.isDestroyed())return;
    if(!opening)current.webContents.send('conversation:select');
    if(visible){
      current.show();
      // Windows 隐藏启动时，第一次 show() 可能仍让窗口保持隐藏。
      if(process.platform==='win32'&&!current.isVisible())current.show();
      current.focus();
    }
  }
  return {open,get panel(){return panel;},close(){
    ipcMain.removeHandler('conversation:read-notices');
    for(const name of ['report','report-image','report-fullscreen','resume-audit'])ipcMain.removeHandler('conversation:'+name);
    ipcMain.removeHandler('conversation:read');ipcMain.removeHandler('conversation:source');ipcMain.removeHandler('conversation:reminder-decision');ipcMain.removeHandler('conversation:image');
    ipcMain.removeListener('conversation:reviewed',reviewed);
    if(panel&&!panel.isDestroyed())panel.destroy();
  }};
}
