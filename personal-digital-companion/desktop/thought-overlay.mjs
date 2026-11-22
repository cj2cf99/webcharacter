import {join} from 'node:path';
import {createPanelWindow} from './panel-window.mjs';
import {warnLiveUpdate} from './live-files.mjs';

// 所有坐标均为 DIP。头顶放不下时优先贴在头侧，只移动提示窗。
export function thoughtBounds(pet,area){
  const width=Math.min(244,area.width),height=Math.min(100,area.height);
  const right=area.x+area.width,bottom=area.y+area.height;
  let x=pet.x+(pet.width-width)/2,y=pet.y-height;
  if(y<area.y){
    const after=pet.x+pet.width,before=pet.x-width;
    if(after+width<=right){x=after;y=pet.y;}
    else if(before>=area.x){x=before;y=pet.y;}
    else y=pet.y+pet.height;
  }
  return {x:Math.round(Math.max(area.x,Math.min(x,right-width))),
    y:Math.round(Math.max(area.y,Math.min(y,bottom-height))),width,height};
}

export function createThoughtOverlay(electron,{win,bundle,root}){
  let panel=null,ready=false,thought=null;
  function closePanel(){
    const old=panel;
    panel=null;ready=false;
    if(old&&!old.isDestroyed())old.destroy();
  }
  function bounds(){
    const pet=win.getBounds();
    const display=electron.screen.getDisplayNearestPoint({x:Math.round(pet.x+pet.width/2),y:Math.round(pet.y+pet.height/2)});
    return thoughtBounds(pet,display.workArea);
  }
  function place(){
    if(!panel||win.isDestroyed())return;
    const next=bounds(),current=panel.getBounds();
    if(Object.keys(next).some(key=>current[key]!==next[key]))panel.setBounds(next,false);
  }
  function sync(){
    if(!thought||win.isDestroyed()||!win.isVisible()){closePanel();return;}
    if(panel){
      if(ready)panel.webContents.send('desktop:thought',thought);
      return;
    }
    const current=createPanelWindow(electron,{...bounds(),parent:win,show:false,frame:false,transparent:true,
      backgroundColor:'#00000000',skipTaskbar:true,focusable:false,resizable:false,hasShadow:false,alwaysOnTop:true,
      webPreferences:{preload:join(root,'desktop/thought-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}},root);
    panel=current;
    current.setIgnoreMouseEvents(true);
    current.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    current.webContents.on('will-navigate',event=>event.preventDefault());
    current.once('closed',()=>{if(panel===current){panel=null;ready=false;}});
    current.webContents.on('did-finish-load',()=>{
      if(panel!==current||!thought||!win.isVisible())return;
      ready=true;place();
      current.webContents.send('desktop:thought',thought);
      current.showInactive();
      current.setAlwaysOnTop(true,'pop-up-menu');
    });
    current.loadFile(join(bundle,'thought.html')).catch(error=>{
      if(panel===current){closePanel();warnLiveUpdate('绯月头顶进度',error);}
    });
  }
  win.on('move',place);win.on('resize',place);
  return {get panel(){return panel;},set(value){thought=value;sync();},sync,place,
    close(){thought=null;closePanel();win.off('move',place);win.off('resize',place);}};
}
