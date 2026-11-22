import {resolve} from 'node:path';
import {showPanel} from './panel-window.mjs';
import {pathToFileURL} from 'node:url';

// 自绘右键菜单：仍由主进程的原生 Menu 提供条目、勾选状态和点击逻辑，这里只负责显示。
// 菜单项按下标路径回传，主进程调用对应 MenuItem.click()，勾选项的切换与原生菜单一致。
const SHADOW=12,WIDTH=262; // 透明边距留给阴影
export function createMenuPopup(electron,{bundle,root,readCycle=()=>null,onOpen=()=>{},onClose=()=>{}}){
  const {BrowserWindow,screen}=electron;
  const page=resolve(bundle,'menu.html'),url=pathToFileURL(page).href;
  let win=null,loading=null,menu=null,anchor=null,shown=false,pending=false;
  const own=event=>win&&!win.isDestroyed()&&event.senderFrame===win.webContents.mainFrame;
  function items(list){
    return list.filter(item=>item.visible!==false).map(item=>item.type==='separator'?{type:'separator'}:{
      label:item.label,icon:item.fyIcon||'',image:item.fyImage||'',tone:item.fyTone||'',type:item.type,enabled:item.enabled!==false,checked:Boolean(item.checked),
      submenu:item.submenu?items(item.submenu.items):undefined,
    });
  }
  function find(path){
    let list=menu?.items.filter(item=>item.visible!==false),item=null;
    for(const index of path){
      item=list?.[index];
      list=item?.submenu?.items.filter(entry=>entry.visible!==false);
    }
    return item;
  }
  function place(width,height){
    const area=screen.getDisplayNearestPoint(anchor).workArea;
    height=Math.min(Math.ceil(height),area.height);
    // 托盘在屏幕底部，菜单默认向上展开；空间不够时改向下，并夹在工作区内。
    const below=anchor.y+height<=area.y+area.height;
    const y=below?anchor.y-SHADOW/2:anchor.y-height+SHADOW/2;
    const x=anchor.x+width<=area.x+area.width?anchor.x-SHADOW/2:anchor.x-width+SHADOW/2;
    win.setBounds({x:Math.round(Math.min(Math.max(x,area.x),area.x+area.width-width)),
      y:Math.round(Math.min(Math.max(y,area.y),area.y+area.height-height)),width,height});
  }
  function hide(){
    pending=false;
    if(!shown)return;
    shown=false;
    if(win&&!win.isDestroyed())win.hide();
    onClose();
  }
  function create(){
    win=new BrowserWindow({width:WIDTH+SHADOW*2,height:120,show:false,frame:false,transparent:true,resizable:false,
      skipTaskbar:true,alwaysOnTop:true,focusable:true,hasShadow:false,backgroundColor:'#00000000',title:'绯月菜单',
      webPreferences:{preload:resolve(root,'desktop/menu-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    win.setAlwaysOnTop(true,'pop-up-menu');
    const contents=win.webContents;
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    contents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
    contents.ipc.handle('menu:read',event=>own(event)?items(menu?.items??[]):[]);
    contents.ipc.on('menu:size',(event,height)=>{
      if(!own(event)||!Number.isFinite(height)||!anchor)return;
      // 只有本次 show() 等待中的首个尺寸才显示窗口；关闭后迟到的尺寸消息不会把菜单重新弹出。
      if(!pending&&!shown)return;
      place(WIDTH+SHADOW*2,height+SHADOW*2);
      if(pending){pending=false;shown=true;showPanel(win);win.focus();onOpen();}
    });
    contents.ipc.on('menu:choose',(event,path)=>{
      if(!own(event)||!Array.isArray(path)||!path.every(Number.isInteger))return;
      const item=find(path);
      hide();
      if(item&&item.enabled!==false&&!item.submenu&&item.type!=='separator')setImmediate(()=>item.click());
    });
    contents.ipc.on('menu:close',event=>{if(own(event))hide();});
    win.on('blur',()=>{if(shown)hide();}); // 隐藏窗口会迟到一个 blur，不能让它取消下一次打开
    win.on('closed',()=>{win=null;loading=null;if(shown){shown=false;onClose();}});
    loading=win.loadFile(page);
    return loading;
  }
  return {
    get open(){return shown;},
    async show(nextMenu,point=screen.getCursorScreenPoint()){
      menu=nextMenu;anchor=point;
      if(!win||win.isDestroyed())create();
      await loading;
      if(shown){shown=false;win.hide();onClose();}
      pending=true;
      win.webContents.send('menu:show',readCycle());
    },
    hide,
    close(){if(win&&!win.isDestroyed())win.destroy();},
  };
}
