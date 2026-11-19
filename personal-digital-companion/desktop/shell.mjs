// 桌面壳只处理透明窗、穿透、托盘及坐标；动作逻辑留在共享TS核心。
import {CORNER_TARGETS,MOVE_TARGETS,movementTarget,movementStep,movementGrid,snapMovement,displayRoutes,displayPosition,displaySize,WALK_START_TIME,WALK_SETTLE_TIME,WALK_BRAKE_DISTANCE,settlePosition} from './movement.mjs';
import {AttachmentController} from './attachment.mjs';
import {watchWindows} from './native-windows.mjs';
import {screenPosture} from './screen-posture.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {attachSettings} from './settings-host.mjs';
import {DEFAULT_SOUND,validSound,normalizeSound,SOUND_NODES} from './sound.mjs';
import {createDesktopTasks} from './task-lifecycle.mjs';
import {attachScreenQuestion} from './screen-question-host.mjs';
import {attachWeather} from './weather-host.mjs';
import {attachRegistration} from './registration-host.mjs';
import {attachReminderReview} from './reminder-review-host.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const ROAM_DELAY=45_000;
const displayEvents=['display-added','display-removed','display-metrics-changed'];
const roamInterrupts=['hover','click','drag','work'];
const boundsKeys=['x','y','width','height'];
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
  let movement=null,travelPosture=null,walkAcknowledged=false,runtimeState=null,nextRoamAt=Infinity;
  const now=options.now||Date.now,random=options.random||Math.random;
  let attachment=null,stopWindows=null,windowsReady=false,attachmentVisual='',attachmentSide=null;
  let pointerMessages=0,pointerOutside=false,posture='right',reportedScale=null;
  if(!app.requestSingleInstanceLock()){app.quit();return;}
  app.setName('绯月桌宠试验');
  const profile=options.profile||resolve(root,'output/desktop-profile');mkdirSync(profile,{recursive:true});
  const soundFile=resolve(profile,'sound-settings.json');
  let sound=normalizeSound(DEFAULT_SOUND),settingsWindow=null;
  try{const saved=JSON.parse(readFileSync(soundFile,'utf8'));if(validSound(saved))sound=normalizeSound(saved);}catch{}
  app.setPath('userData',profile);
  await app.whenReady();
  const tasks=options.tasks||await createDesktopTasks({profile,dialog:electron.dialog});
  let quitApproved=false,quitPending=false,restartRequested=false,cleaned=false;
  function taskNotice(work){void work.catch(()=>{
    if(!quitApproved&&!quitPending&&electron.dialog)void electron.dialog.showMessageBox({type:'error',title:'任务记录',message:'任务处理未完成，记录已保留，请从“中断任务与补传”重试。',buttons:['确定']}).catch(()=>{});
  });}
  // 渲染进程只加载本地界面和视频。天气由主进程访问已配置的 Worker。
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  const bounds=initialBounds(screen.getPrimaryDisplay().workArea);
  let displays=readDisplays(),lastDisplayId=screen.getPrimaryDisplay().id;
  function readDisplays(){
    return (screen.getAllDisplays?.()||[screen.getPrimaryDisplay()]).map(display=>({
      ...display,physicalArea:process.platform==='win32'?screen.dipToScreenRect?.(null,display.workArea):undefined
    }));
  }
  function displayAt(point){
    const nearest=screen.getDisplayNearestPoint({x:Math.round(point.x),y:Math.round(point.y)});
    return displays.find(display=>display.id===nearest.id)||displays[0];
  }
  function currentDisplay(){
    if(movement)return movement.display;
    const box=win.getBounds();
    return displayAt({x:box.x+box.width/2,y:box.y+box.height/2});
  }
  const primary=displays.find(display=>display.id===lastDisplayId)||displays[0];
  const startSize=displaySize(primary,bounds);
  win=new BrowserWindow({...displayPosition(bounds,primary,startSize),...startSize,show:false,frame:false,transparent:true,backgroundColor:'#00000000',
    resizable:false,hasShadow:false,skipTaskbar:true,alwaysOnTop:true,focusable:false,
    webPreferences:{preload:resolve(root,'desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,
      webSecurity:true,backgroundThrottling:true,spellcheck:false,
      additionalArguments:options.benchmark?['--feiyue-benchmark']:[]}});
  const pcSettings=attachSettings(electron,{win,profile,bundle,root,legacySound:sound,onDisplayChange:applyScreenLock});
  let confineToScreen=pcSettings.store.snapshot().config.confineToScreen;
  const screenQuestion=attachScreenQuestion(electron,{win,profile,bundle,root,client:options.screenQuestionClient});
  const weather=attachWeather(electron,{profile,bundle,root,service:options.weather,request:tasks.weatherRequest,background:!options.benchmark});
  const registration=tasks.registration?attachRegistration(electron,{bundle,root,flow:tasks.registration}):null;
  const reminderReview=tasks.reminderReview?attachReminderReview(electron,{bundle,root,flow:tasks.reminderReview}):null;
  attachment=new AttachmentController({
    areaFor:rect=>screen.getDisplayNearestPoint({x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}).workArea,
    onPlace:(p,state)=>{
      if(win.isDestroyed())return;
      if(drag?.top?.id===state.id)return;
      if(drag?.top)drag=null;
      const display=screen.getDisplayNearestPoint({x:p.x+p.width/2,y:p.y+p.height/2}),grid=movementGrid(display.scaleFactor);
      const next={x:snapMovement(p.x,grid),y:snapMovement(p.y,grid),width:snapMovement(p.width,grid),height:snapMovement(p.height,grid)},current=win.getBounds();
      const sideChanged=attachmentSide!==p.posture;attachmentSide=p.posture;
      if(['x','y','width','height'].some(k=>current[k]!==next[k]))win.setBounds(next,false);
      const key=[state.id,p.mode,p.edge,p.asset,p.elevator?.id].join(':');
      if(key!==attachmentVisual){attachmentVisual=key;win.webContents.send('desktop:attachment',{asset:p.asset,label:p.label,side:p.side,placeholder:p.placeholder,transition:p.transition,special:p.special,elevator:p.elevator,width:p.width,height:p.height});if(tray)menu();}
      if(sideChanged)updatePosture(true);
    },
    onDetach:reason=>{
      attachmentVisual='';attachmentSide=null;
      if(drag?.top)drag=null;
      if(win.isDestroyed())return;
      const current=win.getBounds();
      const next={...current,width:bounds.width,height:bounds.height};
      if(reason==='drag-far'){
        const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
        next.x=Math.round(Math.max(area.x,Math.min(area.x+area.width-next.width,current.x+(current.width-next.width)/2)));
        next.y=Math.round(Math.max(area.y,Math.min(area.y+area.height-next.height,current.y+(current.height-next.height)/2)));
      }
      win.setBounds(next,false);
      win.webContents.send('desktop:attachment',null);
      if(['unavailable','no-landing','service-error'].includes(reason))win.setBounds(initialBounds(screen.getPrimaryDisplay().workArea),false);
      if(reason==='no-landing')win.webContents.send('desktop:attachment-notice','当前窗口顶部放不下卧姿');
      updatePosture(true);if(tray)menu();
    }
  });
  function startAttachment(mode,edge,continuous=false){
    if(!windowsReady||!previousReady)return;
    if(!win.isVisible())show();
    if(!attachment.request(mode,edge)){
      const reason={
        'covered':'窗口边缘被其他窗口遮挡',
        'no-space':'当前窗口边缘空间不足',
        'no-window':'请先激活要依附的应用窗口'
      }[attachment.requestFailure];
      win.webContents.send('desktop:attachment-notice',reason);
      return;
    }
    cancelMovement();travelPosture=null;drag=null;
    attachment.continuous=continuous;
    const pending=attachment.active?.pending;
    win.webContents.send('desktop:attachment-pending',pending?attachment.profiles[pending].label:null);
    menu();
  }
  function detachAttachment(reason='manual'){if(attachment.active)attachment.detach(reason);}
  win.setIgnoreMouseEvents(true,{forward:true});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==entryURL)event.preventDefault();});
  function own(event){return !win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;}
  function ignore(value){if(value!==ignored){ignored=value;win.setIgnoreMouseEvents(value,{forward:true});}}
  function stopPoll(){if(poll){clearEvery(poll);poll=null;}}
  function updatePosture(force=false){
    if(!previousReady||win.isDestroyed())return;
    const display=currentDisplay();
    if(display.id!==lastDisplayId){lastDisplayId=display.id;if(tray)menu();}
    const scale=display.scaleFactor||1;
    if(force||scale!==reportedScale){reportedScale=scale;win.webContents.send('desktop:scale',scale);}
    if(attachmentSide){if(force)win.webContents.send('desktop:posture',attachmentSide);return;}
    if(travelPosture){if(force)win.webContents.send('desktop:posture',travelPosture);return;}
    const b=win.getBounds();
    const next=screenPosture(b,display.bounds||display.workArea,posture);
    if(force||next!==posture){posture=next;win.webContents.send('desktop:posture',posture);}
  }
  win.on('move',()=>updatePosture());
  function postponeRoam(){nextRoamAt=now()+ROAM_DELAY;}
  function cancelMovement(){
    if(!movement)return;
    movement=null;postponeRoam();win.webContents.send('desktop:move',false);
    if(win.isVisible())beginPoll();
  }
  function setWalkLeg(leg){
    Object.assign(movement,leg);
    const next=leg.target.x<movement.x?'right':leg.target.x>movement.x?'left':travelPosture||posture;
    if(next!==travelPosture){travelPosture=next;win.webContents.send('desktop:posture',next);}
  }
  function placeWalk(point){
    const {display,size,contain}=movement;
    const next={...displayPosition(point,display,size,contain),...size};
    // Windows 会把跨屏窗口换算回 DIP，等待解码帧时避免反复请求同一位置和尺寸。
    if(boundsKeys.every(key=>movement.lastBounds?.[key]===next[key]))return;
    movement.lastBounds=next;
    const current=win.getBounds();
    if(boundsKeys.some(key=>current[key]!==next[key]))win.setBounds(next,false);
  }
  function moveTo(id,destinationId,automatic=false){
    if(!previousReady)return;
    const start=currentDisplay();
    if(confineToScreen&&destinationId!==undefined&&destinationId!==start.id)return;
    const destination=destinationId===undefined?start:displays.find(display=>display.id===destinationId);
    if(!destination)return;
    const route=destination===start?[]:displayRoutes(displays,start,bounds).get(destination.id);
    if(!route)return;
    detachAttachment('move');
    const box=win.getBounds(), legs=[];
    for(const edge of route){
      const fromSize=displaySize(edge.from,bounds),toSize=displaySize(edge.to,bounds);
      legs.push(
        {display:edge.from,size:fromSize,contain:true,target:displayPosition(edge.exit,edge.from,fromSize)},
        {display:edge.from,size:fromSize,contain:false,target:edge.exit},
        {display:edge.to,size:toSize,contain:false,entry:edge.entry,target:displayPosition(edge.entry,edge.to,toSize)}
      );
    }
    const size=displaySize(destination,bounds),area=destination.workArea;
    const target=displayPosition(movementTarget(area,size,id),destination,size);
    if(!route.length&&Math.hypot(target.x-box.x,target.y-box.y)<1)return;
    legs.push({display:destination,size,contain:true,target});
    drag=null;walkAcknowledged=false;postponeRoam();
    movement={x:box.x,y:box.y,ready:movement?.ready&&!movement.finishing||false,last:now(),legs,automatic};
    setWalkLeg(legs.shift());
    if(!win.isVisible())show();else beginPoll();
    win.webContents.send('desktop:move',automatic?'roam':true);
  }
  function roam(){
    if(now()<nextRoamAt||runtimeState!=='idle'||work||drag||movement||attachment.active||pcSettings.panel?.isVisible())return;
    postponeRoam();
    const start=currentDisplay();
    const reachable=confineToScreen?[]:[...displayRoutes(displays,start,bounds).values()].filter(route=>route.length===1);
    const destination=reachable[Math.floor(random()*reachable.length)]?.[0].to??start;
    const current=win.getBounds(),size=displaySize(destination,bounds),area=destination.workArea;
    const corners=destination!==start?CORNER_TARGETS:CORNER_TARGETS.filter(([id])=>{
      const target=displayPosition(movementTarget(area,size,id),destination,size);
      return Math.abs(target.x-current.x)>1||Math.abs(target.y-current.y)>1;
    });
    const corner=corners[Math.floor(random()*corners.length)]?.[0];
    if(corner)moveTo(corner,destination.id,true);
  }
  function stopAtCurrentDisplay(){
    const display=currentDisplay(),box=win.getBounds(),size=displaySize(display,bounds);
    cancelMovement();travelPosture=null;
    win.setBounds({...displayPosition(box,display,size),...size},false);
    updatePosture(true);
  }
  function applyScreenLock(value){
    if(confineToScreen===value)return;
    confineToScreen=value;
    if(value&&movement&&(!movement.contain||movement.legs.some(leg=>leg.display.id!==movement.display.id))){
      stopAtCurrentDisplay();
    }
    if(tray)menu();
  }
  const onMovementRuntime=(event,value)=>{if(!own(event))return;
    if(runtimeState!==value?.state){
      if(roamInterrupts.includes(runtimeState)||roamInterrupts.includes(value?.state))postponeRoam();
      runtimeState=value?.state;
    }
    if(value?.state==='walk')walkAcknowledged=true;
    if(travelPosture&&walkAcknowledged&&value?.state&&value.state!=='walk'){travelPosture=null;updatePosture(true);}
    if(movement?.finishing&&value?.state!=='walk'&&!movement.brakeFrom){
      movement.brakeFrom={x:movement.x,y:movement.y};movement.exitTime=0;movement.exitAt=now();movement.settleTime=WALK_SETTLE_TIME;movement.freeBrake=true;
    }
    if(movement&&value?.state==='walk'){
      if(value.phase==='loop'||value.phase==='single')movement.ready=true;
      if(value.phase==='enter'&&Number.isFinite(value.frame?.time))movement.ready=value.frame.time>=(value.resource==='walk-enter'?WALK_START_TIME:0);
      if(value.phase==='exit'&&movement.finishing&&Number.isFinite(value.frame?.time)){
        movement.brakeFrom??={x:movement.x,y:movement.y};
        movement.exitTime=value.frame.time;movement.exitAt=now();
        movement.settleTime=value.resource==='walk-exit'?WALK_SETTLE_TIME:Math.max(.01,value.frame.duration||WALK_SETTLE_TIME);
      }
    }
  };
  ipcMain.on('pc:runtime',onMovementRuntime);
  function advanceAttachment(asset){
    if(asset.startsWith('cycle:'))attachment.completeCycle(asset.slice(6));
    else if(asset.startsWith('special:'))attachment.startSpecial(asset.slice(8));
    else if(asset.startsWith('special-done:'))attachment.finishSpecial(asset.slice(13));
    else attachment.finishTransition(asset);
  }
  const onAttachmentDone=(event,asset)=>{
    if(!own(event)||typeof asset!=='string')return;
    if(drag?.top){
      if(!asset.startsWith('cycle:')||attachment.active?.pending)drag.deferred=asset;
      return;
    }
    advanceAttachment(asset);
  };
  ipcMain.on('desktop:attachment-done',onAttachmentDone);
  const onElevatorPlayback=(event,value)=>{if(own(event))attachment.elevatorPlayback(value);};
  ipcMain.on('desktop:elevator-playback',onElevatorPlayback);
  function followDrag(cursor){
    const {bounds:b}=drag,dx=cursor.x-drag.cursor.x,dy=cursor.y-drag.cursor.y;
    if(!drag.moved&&Math.hypot(dx,dy)<5)return;
    drag.moved=true;
    const display=displayAt(cursor);
    const x=b.x+dx,y=b.y+dy;
    // 附着素材允许透明画布越过屏幕边缘，按住的位置跟随鼠标。
    const size=drag.top?{width:b.width,height:b.height}:displaySize(display,bounds);
    const position=drag.top?{x:Math.round(x),y:Math.round(y)}:displayPosition({x,y},display,size);
    const target={...position,...size};
    const current=win.getBounds();
    if(['x','y','width','height'].some(k=>current[k]!==target[k]))win.setBounds(target,false);
  }
  function beginPoll(){
    stopPoll();let pointerAt=-Infinity;
    poll=setEvery(()=>{
      if(win.isDestroyed()||!win.isVisible())return;
      roam();
      if(movement){
        const time=now(),dt=(time-movement.last)/1000;movement.last=time;
        if(movement.ready){
          if(!movement.legs.length&&!movement.finishing&&Math.hypot(movement.target.x-movement.x,movement.target.y-movement.y)<=WALK_BRAKE_DISTANCE){movement.finishing=true;win.webContents.send('desktop:move','finish');}
          // 收步从实际解码帧开始；资源切换期间保留位置，站稳后不再滑动。
          const next=movement.finishing
            ?movement.brakeFrom?settlePosition(movement.brakeFrom,movement.target,movement.exitTime+Math.min(movement.freeBrake?WALK_SETTLE_TIME:.05,(time-movement.exitAt)/1000),movement.settleTime):{x:movement.x,y:movement.y,done:false}
            :movementStep(movement,movement.target,dt);movement.x=next.x;movement.y=next.y;
          placeWalk(next);
          if(next.done&&movement.legs.length){
            const leg=movement.legs.shift();
            if(leg.entry)Object.assign(movement,leg.entry);
            setWalkLeg(leg);
            if(leg.entry){placeWalk(leg.entry);updatePosture();}
          }else if(next.done)cancelMovement();
        }
      }
      // 移动保持高频；鼠标命中仍以50ms采样，避免同步读像素/屏幕查询争用绘制。
      if(movement&&now()-pointerAt<50)return;pointerAt=now();
      const cursor=screen.getCursorScreenPoint();
      if(drag){followDrag(cursor);ignore(false);}
      updatePosture();
      const b=win.getBounds();
      const x=cursor.x-b.x,y=cursor.y-b.y;
      if(x<0||y<0||x>=b.width||y>=b.height){
        if(!drag)ignore(true);
        if(!pointerOutside){pointerMessages++;win.webContents.send('desktop:pointer',{x:-1,y:-1});}
        pointerOutside=true;
      }else{pointerOutside=false;pointerMessages++;win.webContents.send('desktop:pointer',{x,y});}
    },movement?16:50);
  }
  function show(){pointerOutside=false;postponeRoam();win.showInactive();win.webContents.send('desktop:visible',true);updatePosture(true);if(previousReady)beginPoll();}
  function hide(){screenQuestion.hide();detachAttachment('hidden');cancelMovement();travelPosture=null;drag=null;stopPoll();ignore(true);win.webContents.send('desktop:visible',false);win.hide();}
  function setWork(value){
    work=value;postponeRoam();
    if(work&&movement?.automatic)stopAtCurrentDisplay();
    win.webContents.send('desktop:work',work);menu();
  }
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
  function moveMenu(){
    const commands=[{label:'去',submenu:MOVE_TARGETS.map(([id,label])=>({label,click:()=>moveTo(id)}))}];
    if(displays.length>1){
      const start=currentDisplay(),routes=displayRoutes(displays,start,bounds);
      const other=displays.flatMap((display,index)=>display.id===start.id?[]:[{
        label:display.label?`屏幕 ${index+1} · ${display.label}`:`屏幕 ${index+1}`,
        enabled:!confineToScreen&&routes.has(display.id),
        click:()=>moveTo('center',display.id)
      }]);
      commands.push({label:'去另一块屏幕',enabled:other.some(item=>item.enabled),submenu:other});
    }
    return commands;
  }
  function primaryDisplay(){return displays.find(item=>item.id===screen.getPrimaryDisplay().id)||displays[0];}
  function goHome(display=confineToScreen?currentDisplay():primaryDisplay()){
    detachAttachment('home');cancelMovement();travelPosture=null;
    const home=initialBounds(display.workArea,bounds.height),size=displaySize(display,home);
    win.setBounds({...displayPosition(home,display,size),...size},false);
    updatePosture(true);
  }
  function menu(){
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:win.isVisible()?'隐藏':'显示',click:()=>{win.isVisible()?hide():show();menu();}},
      {label:'指令',submenu:[{label:windowsReady?'窗口依附':'窗口依附（检测中/不可用）',enabled:windowsReady,submenu:[{label:'左侧电梯上行',click:()=>startAttachment('climb','left')},{label:'右侧电梯上行',click:()=>startAttachment('climb','right')},{label:'上沿坐姿',click:()=>startAttachment('sit','top')},{label:'上沿侧卧',click:()=>startAttachment('lie','top')},{label:'坐卧连续循环',type:'checkbox',checked:!!attachment?.continuous,click:()=>{if(attachment.continuous){attachment.continuous=false;menu();}else startAttachment('lie','top',true);}},{type:'separator'},{label:'解除依附',enabled:!!attachment?.active,click:()=>detachAttachment()}]},{label:'移动指令',submenu:moveMenu()}]},
      {label:work?'结束工作':'开始工作',click:()=>setWork(!work)},
      {label:'动画与声音设置 · 本地 PC',click:pcSettings.open},
      {label:'声音设置',click:pcSettings.open},
      {label:'三地天气',click:()=>{void weather.open().catch(()=>{
        if(!quitApproved&&electron.dialog)void electron.dialog.showMessageBox({type:'error',title:'三地天气',message:'天气面板打不开，请重新启动绯月后重试。',buttons:['确定']}).catch(()=>{});
      });}},
      {label:'看屏幕提问（头顶气泡）',click:()=>{
        if(!win.isVisible()){show();menu();}
        void screenQuestion.open().catch(()=>{
          if(!quitApproved&&electron.dialog)void electron.dialog.showMessageBox({type:'error',title:'看屏幕提问',message:'问答气泡未能打开，请重新启动精灵后再试。',buttons:['确定']}).catch(()=>{});
        });
      }},
      ...(registration?[{label:'随口登记',click:()=>{
        void registration.open().catch(()=>{
          if(!quitApproved&&electron.dialog)void electron.dialog.showMessageBox({type:'error',title:'随口登记',
            message:'登记窗口没能打开。请重新构建绯月桌面包后再试。',buttons:['确定']}).catch(()=>{});
        });
      }}]:[]),
      {label:'任务',submenu:[
        ...(reminderReview?[{label:'查看今天的任务',click:()=>taskNotice(reminderReview.open())}]:[]),
        {label:'主动接取与任务链',click:()=>{if(tasks.showTasks)taskNotice(tasks.showTasks());}},
        {label:'中断任务与补传',click:()=>{taskNotice(tasks.retryPending());}},
      ]},
      ...(tasks.showCloudConnection?[{label:'云端连接',click:()=>taskNotice(tasks.showCloudConnection())}]:[]),
      ...(tasks.traffic&&electron.shell?[{label:'查看任务日志',click:()=>{void (async()=>{
        await tasks.traffic.flush();
        if(existsSync(tasks.traffic.file)){
          if(await electron.shell.openPath(tasks.traffic.file))electron.shell.showItemInFolder(tasks.traffic.file);
        }else if(electron.dialog)await electron.dialog.showMessageBox({type:'info',title:'任务日志',
          message:tasks.traffic.failed()?'任务日志暂时无法写入。':'还没有任务收发日志。',buttons:['确定']});
      })().catch(()=>{});}}]:[]),
      {label:'回到右下角',click:()=>goHome()},
      {type:'separator'}, {label:'重启绯月',click:()=>{
        if(quitPending||quitApproved||restartRequested)return;
        restartRequested=true;app.quit();
      }}, {label:'退出',click:()=>app.quit()},
    ]));
  }
  // 仅接受布尔/空消息，拖动坐标取自主进程；不接受任意路径、脚本或窗口配置。
  const onHit=(event,hit)=>{if(own(event)&&typeof hit==='boolean'&&win.isVisible())ignore(drag?false:!hit);};
  const onReady=event=>{if(own(event)){previousReady=true;show();menu();}};
  const onDragStart=event=>{
    if(!own(event)||!win.isVisible()||ignored)return;
    const cursor=screen.getCursorScreenPoint(),b=win.getBounds();
    if(cursor.x<b.x||cursor.y<b.y||cursor.x>=b.x+b.width||cursor.y>=b.y+b.height)return;
    const top=attachment.topDragAnchor();
    if(!top)detachAttachment('drag');
    cancelMovement();travelPosture=null;postponeRoam();
    drag={cursor,bounds:top?b:{...b,width:bounds.width,height:bounds.height},moved:false,top};
  };
  const onDragEnd=(event,canceled)=>{
    if(!own(event)||!drag)return;
    if(!drag.top){if(canceled!==true)followDrag(screen.getCursorScreenPoint());drag=null;updatePosture();return;}
    if(canceled!==true)followDrag(screen.getCursorScreenPoint());
    const {top,moved,deferred}=drag;
    drag=null;
    if(canceled===true||!moved)attachment.refreshPlacement();
    else if(!attachment.releaseTopDrag(top,win.getBounds()))return;
    if(deferred&&attachment.active?.id===top.id)advanceAttachment(deferred);
  };
  ipcMain.on('desktop:hit',onHit);ipcMain.on('desktop:ready',onReady);
  ipcMain.on('desktop:drag-start',onDragStart);ipcMain.on('desktop:drag-end',onDragEnd);
  const icon=nativeImage.createFromPath(resolve(bundle,'tray.png'));
  tray=new Tray(icon);tray.setToolTip('绯月 · 右键打开菜单');
  win.webContents.on('context-menu',()=>tray.popUpContextMenu());
  tray.on('double-click',()=>{win.isVisible()?hide():show();menu();});menu();
  app.on('second-instance',()=>{show();menu();});
  function handleDisplays(){
    if(win.isDestroyed())return;
    displays=readDisplays();
    const display=displays.find(item=>item.id===lastDisplayId);
    cancelMovement();travelPosture=null;drag=null;postponeRoam();
    if(!display)goHome(primaryDisplay());
    else if(!attachment.active){
      const size=displaySize(display,bounds),next={...displayPosition(win.getBounds(),display,size),...size};
      win.setBounds(next,false);
    }
    updatePosture(true);menu();
  }
  function cleanup(){
    if(cleaned)return;cleaned=true;
    ipcMain.removeListener('desktop:attachment-done',onAttachmentDone);
    ipcMain.removeListener('desktop:elevator-playback',onElevatorPlayback);
    stopWindows?.();stopWindows=null;
    screenQuestion.close();
    registration?.close();
    reminderReview?.close();
    weather.close();
    movement=null;ipcMain.removeListener('pc:runtime',onMovementRuntime);pcSettings.close();
    stopPoll();ipcMain.removeListener('desktop:sound-ready',soundReady);ipcMain.removeListener('desktop:sound-change',soundChange);ipcMain.removeListener('desktop:sound-preview',soundPreview);
    if(settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.destroy();
    ipcMain.removeListener('desktop:hit',onHit);ipcMain.removeListener('desktop:ready',onReady);
    ipcMain.removeListener('desktop:drag-start',onDragStart);ipcMain.removeListener('desktop:drag-end',onDragEnd);
    for(const event of displayEvents)screen.removeListener(event,handleDisplays);
    if(tray){tray.destroy();tray=null;}
  }
  win.on('close',event=>{if(!quitApproved){event.preventDefault();app.quit();}});
  app.once('will-quit',()=>{if(restartRequested)app.relaunch();});
  function cancelQuit(){
    restartRequested=false;tasks.cancelQuitCheck();quitPending=false;
  }
  app.on('before-quit',event=>{
    if(quitApproved){cleanup();return;}
    if(quitPending){event?.preventDefault();return;}
    tasks.beginQuitCheck();
    const hasActiveTasks=tasks.activeCount()>0;
    if(!hasActiveTasks&&!restartRequested){
      quitApproved=true;cleanup();void tasks.stop();return;
    }
    event?.preventDefault();quitPending=true;
    void (async()=>{
      if(hasActiveTasks){
        const action=restartRequested?'重启':'退出';
        const choice=await electron.dialog.showMessageBox({type:'warning',title:'确认'+action,
          message:'有任务正在执行，'+action+'可能中断任务',detail:'结果未知的任务会在下次启动时提示处理。',
          buttons:['取消'+action,'确认'+action],defaultId:0,cancelId:0});
        if(choice.response!==1){cancelQuit();return;}
      }
      await tasks.stop();quitApproved=true;quitPending=false;app.quit();
    })().catch(cancelQuit);
  });
  for(const event of displayEvents)screen.on(event,handleDisplays);
  await win.loadFile(entry);
  if(options.windowSource||process.platform==='win32'&&typeof win.getNativeWindowHandle==='function'){
    const source=options.windowSource||watchWindows;
    stopWindows=source({onSnapshot:data=>{
      if(win.isDestroyed())return;
      const windows=data.windows.map(w=>({...w,rect:screen.screenToDipRect(null,{x:w.x,y:w.y,width:w.width,height:w.height})}));
      const first=!windowsReady;windowsReady=true;attachment.update({foreground:data.foreground,windows},now());if(first)menu();
    },onError:()=>{windowsReady=false;if(attachment.active)attachment.detach('service-error');if(tray)menu();}});
  }
  tasks.startPolling?.();
  void weather.start();
  taskNotice(tasks.startup());
  return {win,show,hide,moveTo,attachment,startAttachment,stopPoll,setWork,pcSettings,tasks,screenQuestion,weather,getStats:()=>({pointerMessages,visible:win.isVisible(),ready:previousReady})};
}
