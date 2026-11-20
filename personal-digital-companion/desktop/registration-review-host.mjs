import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow} from './panel-window.mjs';
import {validAttachment} from './question-attachment.mjs';

export function attachInquiry(electron,{root,bundle,visible=true}){
  const entry=resolve(bundle,'registration-review.html');
  let panel=null,view=null,reply=null,loading;
  function trusted(event){
    if(!panel||panel.isDestroyed()||event.sender!==panel.webContents||event.senderFrame!==panel.webContents.mainFrame)
      throw Error('请从登记确认窗口操作。');
  }
  const ipc=electron.ipcMain;
  ipc.handle('registration-review:get',event=>{trusted(event);return view;});
  ipc.handle('registration-review:decide',(event,id,answer)=>{
    trusted(event);
    return respond(id,answer);
  });
  async function respond(id,answer){
    if(!reply||view?.id!==id||view.status!=='pending')return {state:'error',text:'此询问已更新，请核对当前内容。'};
    if(!answer||!['confirm','send','cancel'].includes(answer.action))throw Error('无效的询问操作。');
    const {action,text='',values=[],attachment,photoTarget}=answer;
    if(typeof text!=='string'||text.length>6000||!Array.isArray(values)||values.length>100||
       values.some(v=>typeof v!=='string'||v.length>3500)||attachment!=null&&!validAttachment(attachment))throw Error('输入或附件无效。');
    const attach=action==='confirm'&&Number.isInteger(photoTarget)&&view.targets.some(t=>t.index===photoTarget)&&(attachment?.kind==='image'||!attachment&&view.photoName);
    if(photoTarget!=null&&!attach)throw Error('附图目标无效。');
    if(action==='confirm'&&(!view.canConfirm||text.trim()||attachment&&!attach||values.some(v=>v.trim())))throw Error('请先发送填写的内容。');
    if(action==='send'&&(values.length!==view.rows.length||!text.trim()&&!values.some(v=>v.trim())&&!attachment))
      throw Error('请填写缺项或提供回答。');
    update(id,'working',action==='confirm'?'正在确认…':'正在处理…');
    try{
      const result=await reply({action,text:text.trim(),values:values.map(v=>v.trim()),attachment,photoTarget});
      if(view?.id===id){
        if(action==='cancel')dismiss();
        else update(id,result?.state==='error'?'error':'done',result?.text??'已收到回答。');
      }
      return result;
    }catch(error){
      if(view?.id===id)update(id,action==='send'?'pending':'error',error.message);
      return {state:'error',text:error.message};
    }
  }
  function dismiss(){
    const previous=panel;
    panel=null;view=null;reply=null;
    if(previous&&!previous.isDestroyed())previous.destroy();
  }
  async function open(draft,callback){
    view={id:draft.id,prompt:draft.prompt,fields:draft.fields??'',source:draft.input??'',rows:draft.rows??[],
      canConfirm:draft.canConfirm===true,targets:draft.targets??[],photoName:draft.photo?.name??'',status:'pending',message:''};
    reply=callback;
    if(panel&&!panel.isDestroyed()){
      await loading;
      panel?.webContents.send('registration-review:changed',view);
      return;
    }
    const created=createPanelWindow(electron,{title:'绯月 · 询问与确认',width:680,height:560,minWidth:360,minHeight:310,
      show:false,autoHideMenuBar:true,webPreferences:{preload:resolve(root,'desktop/registration-preload.cjs'),
        sandbox:true,contextIsolation:true,nodeIntegration:false}},root);
    panel=created;
    created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    created.webContents.on('will-navigate',(e,url)=>{if(url!==pathToFileURL(entry).href)e.preventDefault();});
    created.once('closed',()=>{
      if(panel!==created)return;
      const cancel=['pending','working'].includes(view?.status)&&reply;
      panel=null;view=null;reply=null;
      if(cancel)void Promise.resolve(cancel({action:'cancel'})).catch(()=>{});
    });
    try{loading=created.loadFile(entry);await loading;}
    catch(error){if(panel!==created)return;dismiss();throw error;}
    if(panel===created&&visible){created.show();created.focus();}
  }
  function update(id,status,message){
    if(!view||view.id!==id)return;
    view={...view,status,message};
    panel.webContents.send('registration-review:changed',view);
  }
  return {open,update,respond,dismiss,get panel(){return panel;},get current(){return view;},close(){
    dismiss();ipc.removeHandler('registration-review:get');ipc.removeHandler('registration-review:decide');
  }};
}
