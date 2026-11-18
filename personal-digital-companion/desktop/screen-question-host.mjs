import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createScreenQuestionClient} from './screen-question-client.mjs';

export function questionBounds(pet,area,preferredHeight=260){
  const width=Math.max(1,Math.min(360,area.width-16)),height=Math.max(1,Math.min(preferredHeight,area.height-16));
  let x=pet.x+pet.width/2-width/2,y=pet.y-height-4,tail='bottom';
  if(y<area.y+8){y=pet.y;if(pet.x+pet.width+width+8<=area.x+area.width){x=pet.x+pet.width+4;tail='left';}else if(pet.x-width-4>=area.x){x=pet.x-width-4;tail='right';}}
  x=Math.round(Math.max(area.x+8,Math.min(x,area.x+area.width-width-8)));y=Math.round(Math.max(area.y+8,Math.min(y,area.y+area.height-height-8)));
  return {bounds:{x,y,width,height},tail,tailX:Math.max(20,Math.min(width-60,pet.x+pet.width/2-x-20))};
}

export function attachScreenQuestion(electron,{win,profile,bundle,root,client,visible=true}={}){
  const {BrowserWindow,ipcMain,screen,desktopCapturer}=electron;
  let panel=null,servicePromise=null,controller=null,busy=false,disposed=false,generation=0,panelHeight=260,state={state:'idle',text:'有什么想让我帮你看看？'};
  const service=()=>servicePromise??=(client?Promise.resolve(client):createScreenQuestionClient({profile,screen,desktopCapturer}));
  const trusted=event=>panel&&!panel.isDestroyed()&&event.sender===panel.webContents&&event.senderFrame===panel.webContents.mainFrame;
  const cancelled=()=>({state:'error',code:'REQUEST_CANCELLED',text:'问答已取消',retryable:false});
  function place(){if(!panel||panel.isDestroyed()||win.isDestroyed())return;const pet=win.getBounds(),area=screen.getDisplayNearestPoint({x:Math.round(pet.x+pet.width/2),y:Math.round(pet.y+pet.height/2)}).workArea;const value=questionBounds(pet,area,panelHeight);panel.setBounds(value.bounds,false);panel.webContents.send('screen-qa:layout',value);}
  function publish(value,token){if(disposed||token!==generation||!panel||panel.isDestroyed())return;state=value;place();panel.webContents.send('screen-qa:changed',value);if(visible)panel.showInactive();}
  async function perform(question,retry=false){
    if(disposed||!panel)return cancelled();
    if(busy)return {state:'error',code:'BUSY',text:'正在回答上一个问题',retryable:false};
    if(!retry&&(typeof question!=='string'||!question.trim()||[...question.trim()].length>2000))return {state:'error',code:'INVALID_REQUEST',text:'请输入1至2000个字的问题',retryable:false};
    busy=true;const token=++generation;controller=new AbortController();const signal=controller.signal;
    try{
      const api=await service();if(signal.aborted||token!==generation)return cancelled();
      if(!retry){panel.hide();await new Promise(resolve=>setTimeout(resolve,80));}
      if(signal.aborted||token!==generation)return cancelled();
      const options={signal,onState:value=>publish(value,token)};
      const result=await (retry?api.retryLast(options):api.captureAndAsk(question.trim(),options));
      if(signal.aborted||token!==generation)return cancelled();
      publish(result,token);return result;
    }catch{const result={state:'error',code:'CLIENT_ERROR',text:'问答暂时不可用，请检查本机连接配置后重试。',retryable:false};publish(result,token);return result;}
    finally{if(token===generation){busy=false;controller=null;}}
  }
  function cancel(){generation++;controller?.abort();controller=null;busy=false;panelHeight=260;state={state:'idle',text:'有什么想让我帮你看看？'};servicePromise?.then(api=>api.forget()).catch(()=>{});}
  function hide(){cancel();if(panel&&!panel.isDestroyed()){const closing=panel;panel=null;closing.destroy();}}
  const handlers={'screen-qa:state':()=>state,'screen-qa:ask':(_e,q)=>perform(q),'screen-qa:retry':()=>perform(null,true)};
  for(const [name,fn]of Object.entries(handlers))ipcMain.handle(name,(event,arg)=>{if(!trusted(event))throw new Error('仅问答窗口可以调用');return fn(event,arg);});
  const dismiss=event=>{if(trusted(event))hide();};ipcMain.on('screen-qa:close',dismiss);
  const fit=(event,height)=>{if(!trusted(event)||!Number.isInteger(height)||height<260||height>420||height===panelHeight)return;panelHeight=height;place();};ipcMain.on('screen-qa:fit',fit);
  win.on('move',place);win.on('resize',place);
  async function open(){
    if(disposed)return;
    if(panel&&!panel.isDestroyed()){place();if(visible){panel.show();panel.focus();}return;}
    const created=new BrowserWindow({width:360,height:260,show:false,frame:false,transparent:true,resizable:false,hasShadow:false,skipTaskbar:true,alwaysOnTop:true,title:'绯月 · 看屏幕问答',
      webPreferences:{preload:resolve(root,'desktop/screen-question-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,offscreen:!visible}});
    panel=created;const entry=resolve(bundle,'screen-question.html'),url=pathToFileURL(entry).href;
    created.webContents.setWindowOpenHandler(()=>({action:'deny'}));created.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
    created.on('closed',()=>{if(panel===created){panel=null;cancel();}});
    await created.loadFile(entry);
    if(disposed||panel!==created||created.isDestroyed())return;
    place();created.webContents.send('screen-qa:changed',state);if(visible){created.show();created.focus();}
  }
  function close(){if(disposed)return;disposed=true;hide();for(const name of Object.keys(handlers))ipcMain.removeHandler(name);ipcMain.removeListener('screen-qa:close',dismiss);ipcMain.removeListener('screen-qa:fit',fit);win.removeListener('move',place);win.removeListener('resize',place);}
  return {open,hide,close,get panel(){return panel;}};
}
