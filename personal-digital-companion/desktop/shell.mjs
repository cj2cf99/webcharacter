// 桌面壳只处理透明窗、穿透、托盘及坐标；动作逻辑留在共享TS核心。
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {attachSettings} from './settings-host.mjs';
import {DEFAULT_SOUND,validSound,normalizeSound,SOUND_NODES} from './sound.mjs';
import {createDesktopTasks} from './task-lifecycle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function initialBounds(area,height=360){
  const h=Math.min(height,area.height-24),w=Math.round(h*464/688);
  return {x:Math.round(area.x+area.width-w-16),y:Math.round(area.y+area.height-h-12),width:w,height:h};
}
export async function startDesktop(electron,options={}){
  const {app,BrowserWindow,Tray,Menu,nativeImage,screen,ipcMain,session}=electron;
  const setEvery=options.setInterval||setInterval,clearEvery=options.clearInterval||clearInterval;
  const bundle=options.bundle||resolve(root,'output/desktop-bundle');
  const entry=resolve(bundle,'index.html'),entryURL=pathToFileURL(entry).href;
  let win=null,tray=null,poll=null,ignored=true,work=false,previousReady=false,drag=null;
  let pointerMessages=0,pointerOutside=false;
  if(!app.requestSingleInstanceLock()){app.quit();return;}
  app.setName('绯月桌宠试验');
  const profile=options.profile||resolve(root,'output/desktop-profile');mkdirSync(profile,{recursive:true});
  const soundFile=resolve(profile,'sound-settings.json');
  let sound=normalizeSound(DEFAULT_SOUND),settingsWindow=null;
  try{const saved=JSON.parse(readFileSync(soundFile,'utf8'));if(validSound(saved))sound=normalizeSound(saved);}catch{}
  app.setPath('userData',profile);
  await app.whenReady();
  const tasks=options.tasks||await createDesktopTasks({profile,dialog:electron.dialog});
  let quitApproved=false,quitPending=false,cleaned=false;
  // 只加载打包在本地的界面/视频；无网络、权限请求或远程页面。
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  const bounds=initialBounds(screen.getPrimaryDisplay().workArea);
  win=new BrowserWindow({...bounds,show:false,frame:false,transparent:true,backgroundColor:'#00000000',
    resizable:false,hasShadow:false,skipTaskbar:true,alwaysOnTop:true,focusable:false,
    webPreferences:{preload:resolve(root,'desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,
      webSecurity:true,backgroundThrottling:true,spellcheck:false,
      additionalArguments:options.benchmark?['--feiyue-benchmark']:[]}});
  const pcSettings=attachSettings(electron,{win,profile,bundle,root,legacySound:sound});
  win.setIgnoreMouseEvents(true,{forward:true});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==entryURL)event.preventDefault();});
  function own(event){return !win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;}
  function ignore(value){if(value!==ignored){ignored=value;win.setIgnoreMouseEvents(value,{forward:true});}}
  function stopPoll(){if(poll){clearEvery(poll);poll=null;}}
  function beginPoll(){
    stopPoll();
    poll=setEvery(()=>{
      if(win.isDestroyed()||!win.isVisible())return;
      const cursor=screen.getCursorScreenPoint();
      if(drag){
        const dx=cursor.x-drag.cursor.x,dy=cursor.y-drag.cursor.y;
        if(drag.moved||Math.hypot(dx,dy)>=5){
          drag.moved=true;
          const area=screen.getDisplayNearestPoint(cursor).workArea,b=drag.bounds;
          const x=Math.min(Math.max(b.x+dx,area.x),area.x+area.width-b.width);
          const y=Math.min(Math.max(b.y+dy,area.y),area.y+area.height-b.height);
          const target={x:Math.round(x),y:Math.round(y),width:bounds.width,height:bounds.height};
          const current=win.getBounds();
          // 不重复调用setPosition，也不将可能已发生DPI舍入的尺寸作为下一次输入。
          if(current.x!==target.x||current.y!==target.y||current.width!==target.width||current.height!==target.height)win.setBounds(target,false);
        }
        ignore(false);
      }
      const b=win.getBounds();
      const x=cursor.x-b.x,y=cursor.y-b.y;
      if(x<0||y<0||x>=b.width||y>=b.height){
        if(!drag)ignore(true);
        if(!pointerOutside){pointerMessages++;win.webContents.send('desktop:pointer',{x:-1,y:-1});}
        pointerOutside=true;
      }else{pointerOutside=false;pointerMessages++;win.webContents.send('desktop:pointer',{x,y});}
    },50);
  }
  function show(){pointerOutside=false;win.showInactive();win.webContents.send('desktop:visible',true);if(previousReady)beginPoll();}
  function hide(){drag=null;stopPoll();ignore(true);win.webContents.send('desktop:visible',false);win.hide();}
  function setWork(value){work=value;win.webContents.send('desktop:work',work);menu();}
  function openSoundSettings(){
    if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return;}
    settingsWindow=new BrowserWindow({width:480,height:650,resizable:false,autoHideMenuBar:true,title:'声音设置 · 绯月',alwaysOnTop:true,
      webPreferences:{preload:resolve(root,'desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const settingsURL=pathToFileURL(resolve(bundle,'sound-settings.html')).href;
    settingsWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    settingsWindow.webContents.on('will-navigate',(event,url)=>{if(url!==settingsURL)event.preventDefault();});
    settingsWindow.on('closed',()=>{settingsWindow=null;});
    settingsWindow.loadFile(resolve(bundle,'sound-settings.html'));
  }
  function soundOwner(event){return own(event)||(settingsWindow&&!settingsWindow.isDestroyed()&&event.sender===settingsWindow.webContents&&event.senderFrame===settingsWindow.webContents.mainFrame);}
  const soundReady=event=>{if(soundOwner(event))event.sender.send('desktop:sound',sound);};
  const soundChange=(event,value)=>{
    if(!soundOwner(event)||!validSound(value))return;
    const next=normalizeSound(value);
    try{writeFileSync(soundFile+'.tmp',JSON.stringify(next));renameSync(soundFile+'.tmp',soundFile);sound=next;}
    catch{event.sender.send('desktop:sound',{...sound,error:true});return;}
    win.webContents.send('desktop:sound',sound);
    if(settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.webContents.send('desktop:sound',sound);
  };
  const soundPreview=(event,id)=>{if(soundOwner(event)&&SOUND_NODES.some(node=>node.id===id))win.webContents.send('desktop:sound-preview',id);};
  ipcMain.on('desktop:sound-ready',soundReady);ipcMain.on('desktop:sound-change',soundChange);ipcMain.on('desktop:sound-preview',soundPreview);
  function menu(){
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:win.isVisible()?'隐藏':'显示',click:()=>{win.isVisible()?hide():show();menu();}},
      {label:work?'结束工作':'开始工作',click:()=>setWork(!work)},
      {label:'动画与声音设置 · 本地 PC',click:pcSettings.open},
      {label:'声音设置',click:pcSettings.open},
      {label:'中断任务与补传',click:()=>{void tasks.retryPending();}},
      {label:'回到右下角',click:()=>win.setBounds(initialBounds(screen.getPrimaryDisplay().workArea))},
      {type:'separator'}, {label:'退出',click:()=>app.quit()},
    ]));
  }
  // 仅接受布尔/空消息，拖动坐标取自主进程；不接受任意路径、脚本或窗口配置。
  const onHit=(event,hit)=>{if(own(event)&&typeof hit==='boolean'&&win.isVisible())ignore(drag?false:!hit);};
  const onReady=event=>{if(own(event)){previousReady=true;show();menu();}};
  const onDragStart=event=>{
    if(!own(event)||!win.isVisible()||ignored)return;
    const cursor=screen.getCursorScreenPoint(),b=win.getBounds();
    if(cursor.x>=b.x&&cursor.y>=b.y&&cursor.x<b.x+b.width&&cursor.y<b.y+b.height)drag={cursor,bounds:{...b,width:bounds.width,height:bounds.height},moved:false};
  };
  const onDragEnd=event=>{if(own(event))drag=null;};
  ipcMain.on('desktop:hit',onHit);ipcMain.on('desktop:ready',onReady);
  ipcMain.on('desktop:drag-start',onDragStart);ipcMain.on('desktop:drag-end',onDragEnd);
  const icon=nativeImage.createFromPath(resolve(bundle,'tray.png'));
  tray=new Tray(icon);tray.setToolTip('绯月 · 右键菜单可隐藏或退出');
  win.webContents.on('context-menu',()=>tray.popUpContextMenu());
  tray.on('double-click',()=>{win.isVisible()?hide():show();menu();});menu();
  app.on('second-instance',()=>{show();menu();});
  function cleanup(){
    if(cleaned)return;cleaned=true;
    pcSettings.close();
    stopPoll();ipcMain.removeListener('desktop:sound-ready',soundReady);ipcMain.removeListener('desktop:sound-change',soundChange);ipcMain.removeListener('desktop:sound-preview',soundPreview);
    if(settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.destroy();
    ipcMain.removeListener('desktop:hit',onHit);ipcMain.removeListener('desktop:ready',onReady);
    ipcMain.removeListener('desktop:drag-start',onDragStart);ipcMain.removeListener('desktop:drag-end',onDragEnd);
    if(tray){tray.destroy();tray=null;}
  }
  win.on('close',event=>{if(!quitApproved){event.preventDefault();app.quit();}});
  app.on('before-quit',event=>{
    if(quitApproved){cleanup();return;}
    if(quitPending){event?.preventDefault();return;}
    tasks.beginQuitCheck();
    if(!tasks.activeCount()){
      quitApproved=true;cleanup();void tasks.stop();return;
    }
    event?.preventDefault();quitPending=true;
    void (async()=>{
      const choice=await electron.dialog.showMessageBox({type:'warning',title:'确认退出',
        message:'有任务正在执行，退出可能中断任务',detail:'结果未知的任务会在下次启动时提示处理。',
        buttons:['取消退出','确认退出'],defaultId:0,cancelId:0});
      if(choice.response!==1){tasks.cancelQuitCheck();quitPending=false;return;}
      await tasks.stop();quitApproved=true;quitPending=false;app.quit();
    })().catch(()=>{tasks.cancelQuitCheck();quitPending=false;});
  });
  // 显示器变化只做最低限度可见性兜底，不实现多屏漫游或窗口攀爬。
  screen.on('display-removed',()=>{if(!win.isDestroyed())win.setBounds(initialBounds(screen.getPrimaryDisplay().workArea));});
  await win.loadFile(entry);
  void tasks.startup();
  return {win,show,hide,stopPoll,setWork,pcSettings,tasks,getStats:()=>({pointerMessages,visible:win.isVisible(),ready:previousReady})};
}
