// X 视频下载的 Electron 宿主：「登记下载」小窗与「X视频管理」窗口、IPC、剪贴板和系统播放器。下载逻辑在 x-video.mjs。
import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createXVideo,parseXUrl,readTools} from './x-video.mjs';
import {createElectronArticleFetcher} from './x-article.mjs';
import {createPanelWindow,showPanel} from './panel-window.mjs';

const WINDOWS={
  quick:{page:'x-video-quick.html',title:'绯月 · X视频登记下载',width:450,height:400,minWidth:340,minHeight:340},
  manage:{page:'x-video.html',title:'绯月 · X视频管理',width:780,height:700,minWidth:360,minHeight:420},
};

// overrides 供隔离检查替换进程、时钟和版本查询。
export function attachXVideo(electron,{root,bundle,profile,downloadRoot,notify,visible=true,overrides}){
  const {ipcMain,shell,clipboard,dialog,safeStorage,BrowserWindow,session}=electron;
  const panels={quick:null,manage:null},loading={quick:null,manage:null};
  let closed=false,tab=null;
  function broadcast(){
    for(const panel of Object.values(panels))if(panel&&!panel.isDestroyed())panel.webContents.send('x-video:changed');
  }
  const core=createXVideo({profile,downloadRoot,safeStorage,notify,onChange:broadcast,tools:()=>readTools(root),
    openPath:path=>shell.openPath(path),showItem:path=>shell.showItemInFolder(path),
    fetchArticle:overrides?.fetchArticle??createElectronArticleFetcher({BrowserWindow,session}),...overrides});

  async function open(kind){
    if(closed)return;
    const spec=WINDOWS[kind],entry=resolve(bundle,spec.page);
    if(!panels[kind]||panels[kind].isDestroyed()){
      const {page,...options}=spec;
      const created=createPanelWindow(electron,{...options,show:false,autoHideMenuBar:true,webPreferences:{
        preload:resolve(root,'desktop/x-video-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:!visible}},root);
      panels[kind]=created;
      created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      created.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(entry).href)event.preventDefault();});
      created.once('closed',()=>{if(panels[kind]===created)panels[kind]=null;});
      loading[kind]=created.loadFile(entry).catch(error=>{if(!created.isDestroyed())created.destroy();throw error;});
    }
    const current=panels[kind];
    await loading[kind];
    if(current!==panels[kind]||current.isDestroyed())return;
    if(visible){showPanel(current);current.focus();}
  }
  async function openManage(target){
    tab=target==='queue'?'queue':target==='library'?'library':null;
    await open('manage');
    if(tab&&panels.manage&&!panels.manage.isDestroyed())panels.manage.webContents.send('x-video:tab');
  }

  const handlers={
    // 引擎或磁盘恢复后没有别的事件会推动队列，读取快照时顺带调度一次。
    snapshot:()=>{core.kick();return core.snapshot();},
    submit:input=>{
      if(input?.kind==='article'&&!core.snapshot().cookie.savedAt){
        return {status:'invalid',message:'长文归档需先在「X视频管理 → 🍪」导入 X 登录 Cookie。'};
      }
      return core.enqueue({url:input?.url,name:input?.name,decision:input?.decision,kind:input?.kind,replies:input?.replies,overwrite:Boolean(input?.overwrite),source:'ui'});
    },
    'check-update':async()=>{await core.checkVersion();return core.snapshot().update;},
    update:action=>core.decideUpdate(action),
    task:async(action,id,decision)=>{
      if(action==='resume'||action==='resume-all'){
        const hasVideo=action==='resume-all'?core.snapshot().tasks.some(t=>t.state==='paused'&&t.kind!=='article')
          :core.snapshot().tasks.find(t=>t.id===id)?.kind!=='article';
        if(hasVideo){
          const ask=await core.gate(decision);
          if(ask)return ask;
        }
      }
      return core.taskAction(action,id);
    },
    library:query=>core.library(query),
    thumb:id=>core.thumbnail(id),
    play:(id,index)=>core.play(id,index),
    reveal:id=>core.reveal(id),
    archive:id=>core.archive(id),
    clipboard:()=>parseXUrl(clipboard.readText(),{allowArticle:true})?.url??'',
    'cookie-import':text=>core.importCookies(text),
    'cookie-file':async()=>{
      const selected=await dialog.showOpenDialog(panels.manage,{title:'选择插件导出的 cookies.txt',properties:['openFile'],
        filters:[{name:'Cookie 文本',extensions:['txt']}]});
      const file=selected.filePaths?.[0];
      if(selected.canceled||!file)return null;
      if((await stat(file)).size>2_000_000)throw Error('文件过大，请选择插件导出的 cookies.txt。');
      return core.importCookies(await readFile(file,'utf8'));
    },
    'cookie-clear':()=>core.clearCookies(),
    'open-manage':target=>openManage(target),
    'take-tab':()=>{const value=tab;tab=null;return value;},
  };
  for(const [name,handler] of Object.entries(handlers))ipcMain.handle('x-video:'+name,(event,...args)=>{
    const owner=Object.values(panels).find(panel=>panel&&!panel.isDestroyed()&&event.sender===panel.webContents);
    if(!owner||event.senderFrame!==owner.webContents.mainFrame)throw Error('请从绯月的 X 视频窗口操作');
    return handler(...args);
  });

  return {
    core,
    openQuick:()=>open('quick'),
    openManage,
    // 提醒记录里的播放卡片。
    card:id=>core.card(id),
    play:(id,index)=>core.play(id,index),
    get quickPanel(){return panels.quick;},
    get managePanel(){return panels.manage;},
    close(){
      if(closed)return;
      closed=true;core.close();
      for(const panel of Object.values(panels))panel?.destroy();
      panels.quick=null;panels.manage=null;
      for(const name of Object.keys(handlers))ipcMain.removeHandler('x-video:'+name);
    },
  };
}
