import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow,showPanel} from './panel-window.mjs';
import {questionBounds} from './screen-question-host.mjs';

export function attachPrivateChatPanel(electron,{root,bundle,win,chat,visible=true}){
  const entry=resolve(bundle,'private-chat.html');
  const url=pathToFileURL(entry).href;
  let panel,loading,state;
  function place(){
    if(!panel||win.isDestroyed())return;
    const pet=win.getBounds();
    const display=electron.screen.getDisplayMatching(pet);
    const {bounds}=questionBounds(pet,display.workArea,state?.phase==='invite'?164:338);
    panel.setBounds(bounds);
  }
  function update(next){
    state=next;
    if(!panel||loading)return;
    place();
    panel.webContents.send('private-chat:state',state);
  }
  async function show(next){
    state=next;
    if(!panel){
      const opened=createPanelWindow(electron,{width:360,height:338,show:false,frame:false,transparent:true,
        resizable:false,skipTaskbar:true,alwaysOnTop:true,title:'绯月 · 专聊',
        webPreferences:{preload:resolve(root,'desktop/private-chat-preload.cjs'),nodeIntegration:false,
          contextIsolation:true,sandbox:true,webSecurity:true,autoplayPolicy:'no-user-gesture-required'}},root);
      panel=opened;
      const contents=opened.webContents;
      contents.setWindowOpenHandler(()=>({action:'deny'}));
      contents.on('will-navigate',event=>event.preventDefault());
      contents.on('render-process-gone',()=>{if(panel===opened)chat().dismiss();});
      const trusted=event=>panel===opened&&event.senderFrame===contents.mainFrame&&event.senderFrame?.url===url;
      const actions={
        accept:()=>state?.phase==='invite'?chat().accept(state.id):null,
        segment:(_id,turn,index)=>chat().segment(state?.id,turn,index),
        played:(_id,turn)=>chat().played(state?.id,turn),
        reply:(_id,text)=>chat().reply(state?.id,text),
        dismiss:()=>chat().dismiss(),
        'playback-error':id=>{if(state?.id===id)chat().playbackError(id);},
      };
      for(const [action,handle] of Object.entries(actions))
        contents.ipc.handle('private-chat:'+action,(event,id,...args)=>{
          if(!trusted(event)||id!==state?.id)return null;
          return handle(id,...args);
        });
      opened.once('closed',()=>{
        if(panel!==opened)return;
        panel=undefined;
        loading=undefined;
        chat().dismiss();
      });
      loading=opened.loadFile(entry).finally(()=>{if(panel===opened)loading=undefined;});
    }
    const opened=panel;
    await loading;
    if(panel!==opened||opened.isDestroyed()||state.id!==next.id)return false;
    update(state);
    if(visible){if(state.phase==='invite')opened.showInactive();else showPanel(opened);}
    return true;
  }
  function close(){
    const opened=panel;
    panel=state=loading=undefined;
    opened?.destroy();
  }
  function focus(){if(panel&&!panel.isDestroyed()){showPanel(panel);panel.focus();}}
  for(const event of ['move','resize'])win.on(event,place);
  win.once('closed',()=>{close();chat().dismiss();});
  return {show,update,close,focus,owner:contents=>panel?.webContents===contents?state?.id:null};
}
