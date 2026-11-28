// 常用链接薄宿主：核心逻辑与前端源码来自 extratools/quick-links/，此文件仅负责 Electron 窗口与 IPC 接线。
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow,showPanel} from './panel-window.mjs';
import {createQuickLinksStore,normalizeHttpUrl} from './quick-links-core.mjs';

export function attachQuickLinks(electron,{root,bundle,profile,onChange=()=>{},onOpenError=()=>{}}){
  const {ipcMain,shell}=electron;
  const entry=resolve(bundle,'quick-links.html');
  const dataDir=join(profile,'quick-links');
  let panel=null,loading=null,closed=false;

  const store=createQuickLinksStore({
    dataDir,
    onChange:snapshot=>onChange(snapshot),
  });

  function trusted(event){
    if(!panel||panel.isDestroyed()||event.sender!==panel.webContents||event.senderFrame!==panel.webContents.mainFrame){
      throw Error('请从绯月的应用链接设置页面操作');
    }
  }

  const channels=[
    ['quick-links:list',()=>store.snapshot()],
    ['quick-links:reload',()=>store.reload()],
    ['quick-links:create',(_event,input)=>store.create(input)],
    ['quick-links:update',(_event,id,input)=>store.update(id,input)],
    ['quick-links:remove',(_event,id)=>store.remove(id)],
    ['quick-links:reorder',(_event,ids)=>store.reorder(ids)],
    ['quick-links:open',(_event,rawUrl)=>{
      const valid=normalizeHttpUrl(rawUrl);
      if(!valid)throw Error('仅支持打开 http:// 或 https:// 网址');
      return shell.openExternal(valid);
    }],
  ];
  for(const [channel,handler] of channels){
    ipcMain.handle(channel,(event,...args)=>{
      trusted(event);
      return handler(event,...args);
    });
  }

  async function open(){
    if(closed)return;
    if(!panel||panel.isDestroyed()){
      const win=createPanelWindow(electron,{
        title:'绯月 · 应用链接设置',
        width:590,
        height:540,
        minWidth:360,
        minHeight:380,
        show:false,
        autoHideMenuBar:true,
        webPreferences:{
          preload:resolve(root,'desktop/quick-links-preload.cjs'),
          sandbox:true,
          contextIsolation:true,
          nodeIntegration:false,
        },
      },root);
      panel=win;
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(entry).href)event.preventDefault();});
      win.once('closed',()=>{if(panel===win)panel=null;});
      loading=win.loadFile(entry).catch(error=>{if(!win.isDestroyed())win.destroy();throw error;});
    }
    const current=panel;
    await loading;
    if(current!==panel||current.isDestroyed())return;
    showPanel(current);
    current.focus();
  }

  function menuItems(){
    const snap=store.snapshot();
    const list=[
      {label:'应用链接设置',fyIcon:'⚙',fyTitle:'打开应用链接设置',click:()=>{void open().catch(onOpenError);}},
      {type:'separator'},
    ];
    if(snap.status!=='ready'){
      list.push({label:'（链接读取失败）',enabled:false,fyTitle:snap.error||'读取常用链接失败'});
      return list;
    }
    const links=store.menuItems();
    if(!links.length){
      list.push({label:'（暂无已登记链接）',enabled:false});
      return list;
    }
    for(const item of links){
      list.push({
        label:item.label,
        fyIcon:'🌐',
        fyTitle:item.tooltip,
        click:()=>{void Promise.resolve(shell.openExternal(item.url)).catch(onOpenError);},
      });
    }
    return list;
  }

  return {
    open,
    get panel(){return panel;},
    snapshot:()=>store.snapshot(),
    menuItems,
    close(){
      if(closed)return;
      closed=true;
      for(const [channel] of channels)ipcMain.removeHandler(channel);
      panel?.destroy();
    },
  };
}
