// 桌面壳只处理透明窗、穿透、托盘及坐标；动作逻辑留在共享TS核心。
import {CORNER_TARGETS,MOVE_TARGETS,movementTarget,movementStep,movementGrid,snapMovement,displayRoutes,displayPosition,displaySize,fullscreenDisplays,WALK_START_TIME,WALK_SETTLE_TIME,WALK_BRAKE_DISTANCE,settlePosition} from './movement.mjs';
import {AttachmentController} from './attachment.mjs';
import {watchWindows} from './native-windows.mjs';
import {screenPosture} from './screen-posture.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {createMessageBoxes} from './message-box.mjs';
import {createPanelWindow} from './panel-window.mjs';
import {attachSettings} from './settings-host.mjs';
import {watchFileChanges,setLiveWarningLog,warnLiveUpdate} from './live-files.mjs';
import {menuTemplate} from './menu-layout.mjs';
import {pages,watchDesktopSources} from './source-updates.mjs';
import {DEFAULT_SOUND,validSound,normalizeSound,SOUND_NODES} from './sound.mjs';
import {createServerTaskCommand} from './server-task-command.mjs';
import {createDesktopTasks} from './task-lifecycle.mjs';
import {parseDeviceBinding,restoreDeviceIdentity} from '../agent/devices/identity.mjs';
import {hasLocalImageBackend} from './image-tasks.mjs';
import {createMemoryArchive} from './memory-archive.mjs';
import {migrateMemory} from './migrate-memory.mjs';
import {localVision} from './local-vision.mjs';
import {attachScreenQuestion} from './screen-question-host.mjs';
import {attachWeather} from './weather-host.mjs';
import {createReminderChecks,checkDueItems} from './reminder-checks.mjs';
import {attachPollSettings} from './poll-settings-host.mjs';
import {attachReminderReview} from './reminder-review-host.mjs';
import {attachTaskInbox} from './task-inbox-host.mjs';
import {createLocalModel,desktopModelPath} from './local-model.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const ROAM_DELAY=90_000;
const displayEvents=['display-added','display-removed','display-metrics-changed'];
const roamInterrupts=['hover','click','drag','work'];
const boundsKeys=['x','y','width','height'];
export function waitForStartupReminders(signal){
  return delay(60_000,true,{signal,ref:false}).catch(error=>{
    if(error.name==='AbortError')return false;
    throw error;
  });
}
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
  let lastSpecialAt=0,specialPending=false,menuOpen=false,lastInputAt=0;
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
  const messages=options.messageBoxes??createMessageBoxes(electron,{bundle,root});
  const memory=options.memory??(!options.profile&&!options.benchmark&&process.platform==='win32'?createMemoryArchive():null);
  const tasks=options.tasks||await createDesktopTasks({profile,dialog:messages,memory,
    generateImage:memory?.archiveImageTask&&await hasLocalImageBackend(root)?(prompt,id)=>screenQuestion.generateServerImage(prompt,id):undefined,
    desktopBusy:()=>quitPending||work||screenQuestion.hasLocalWork});
  setLiveWarningLog(tasks.traffic?.write);
  if(memory){
    try{await migrateMemory(profile,memory,electron.safeStorage);}
    catch(error){void messages.showMessageBox({type:'warning',title:'记忆归档',message:'旧记录暂未全部导入，原文件已保留，下次启动会重试。',detail:error.message,buttons:['确定']});}
  }
  let quitApproved=false,quitPending=false,restartRequested=false,cleaned=false;
  const reminderStartup=new AbortController();
  function taskNotice(work){void work.catch(()=>{
    if(!quitApproved&&!quitPending&&electron.dialog)void messages.showMessageBox({type:'error',title:'任务记录',message:'任务处理未完成，记录已保留，请从“中断任务与补传”重试。',buttons:['确定']}).catch(()=>{});
  });}
  // 渲染进程只加载本地界面和视频。天气由主进程访问已配置的 Worker。
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  const bounds=initialBounds(screen.getPrimaryDisplay().workArea);
  let displays=readDisplays(),lastDisplayId=screen.getPrimaryDisplay().id;
  let fullscreen=new Set(),lastWindows=[];
  function readDisplays(){
    const physical=rect=>rect && (process.platform==='win32'?(screen.dipToScreenRect?.(null,rect)??rect):rect);
    return (screen.getAllDisplays?.()||[screen.getPrimaryDisplay()]).map(display=>({
      ...display,physicalArea:physical(display.workArea),physicalBounds:physical(display.bounds)
    }));
  }
  const freeDisplays=()=>displays.filter(display=>!fullscreen.has(display.id));
  const pinned=()=>fullscreen.size===displays.length;
  function overlapsFullscreen(box){
    return displays.some(({id,bounds:r})=>fullscreen.has(id)&&box.x<r.x+r.width-1&&box.x+box.width>r.x+1&&
      box.y<r.y+r.height-1&&box.y+box.height>r.y+1);
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
  const localModel=options.localModel??(!options.benchmark&&electron.utilityProcess?createLocalModel({
    utilityProcess:electron.utilityProcess,modelPath:desktopModelPath(app,root),log:tasks.traffic?.write
  }):null);
  let pendingCheckVisible=false,menuUnread=0;
  const checks=createReminderChecks({profile,check:signal=>checkDueItems(tasks.weatherRequest,signal),
    handlers:{weather:()=>weather.check(),tasks:()=>{
      if(!tasks.pollOnce)throw Object.assign(Error('任务轮询未连接'),{code:'NO_CONNECTION'});
      return tasks.pollOnce();
    }},
    isBusy:id=>quitPending||work||screenQuestion.hasLocalWork||tasks.activeCount()>0||
      (id==='tasks'&&tasks.canPoll&&!tasks.canPoll()),
    changed:()=>{
      screenQuestion.details?.webContents.send('conversation:checks-changed');
      pollSettings.update();
      const unread=checks.unread;
      if(pendingCheckVisible!==checks.pending||menuUnread!==unread){
        pendingCheckVisible=checks.pending;menuUnread=unread;if(tray)menu();
      }
    }});
  menuUnread=checks.unread;pendingCheckVisible=checks.pending;
  const pollSettings=attachPollSettings(electron,{root,bundle,checks});
  const serverTask=createServerTaskCommand({profile,tasks,localModel,dialog:messages});
  const screenQuestion=attachScreenQuestion(electron,{win,profile,bundle,root,checks,serverTask,registration:tasks.registration,reminderRequest:tasks.weatherRequest,
    memory,vision:memory&&(options.vision??localVision(desktopModelPath(app,root))),readTasks:memory?.readTasks??tasks.executor?.review.read,
    readTraffic:tasks.traffic?.readPage,client:options.screenQuestionClient,requestRestart,localModel,log:tasks.traffic?.write});
  const weather=attachWeather(electron,{profile,bundle,root,service:options.weather,request:tasks.weatherRequest,background:!options.benchmark,recordCheck:checks.record,checks});
  const reminderReview=tasks.reminderReview?attachReminderReview(electron,{bundle,root,flow:tasks.reminderReview}):null;
  const taskInbox=tasks.taskInbox?attachTaskInbox(electron,{bundle,root,flow:tasks.taskInbox}):null;
  attachment=new AttachmentController({
    areaFor:rect=>screen.getDisplayNearestPoint({x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}).workArea,
    onPlace:(p,state)=>{
      if(win.isDestroyed())return;
      if(overlapsFullscreen(p)){attachment.detach('fullscreen');goHome();return;}
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
      if(['unavailable','no-landing','service-error'].includes(reason))goHome(primaryDisplay());
      if(reason==='no-landing')win.webContents.send('desktop:attachment-notice','当前窗口顶部放不下卧姿');
      updatePosture(true);if(tray)menu();
    }
  });
  function startAttachment(mode,edge,continuous=false){
    resetIdle();
    if(!windowsReady||!previousReady||pinned())return;
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
  function detachAttachment(reason='manual'){if(reason==='manual')resetIdle();if(attachment.active)attachment.detach(reason);}
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
  function resetIdle(){
    lastSpecialAt=now();
    if(specialPending){specialPending=false;win.webContents.send('desktop:idle-special',false);}
    postponeRoam();
    if(movement?.automatic)cancelMovement(true);
  }
  function postponeRoam(){nextRoamAt=now()+ROAM_DELAY;}
  function cancelMovement(interrupted=false){
    if(!movement)return;
    movement=null;
    win.webContents.send('desktop:move',interrupted?'interrupt':false);
    if(interrupted){travelPosture=null;updatePosture();}
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
    if(!previousReady||pinned())return;
    if(!automatic)resetIdle();
    const start=currentDisplay();
    if(confineToScreen&&destinationId!==undefined&&destinationId!==start.id)return;
    const destination=destinationId===undefined?start:displays.find(display=>display.id===destinationId);
    if(!destination||fullscreen.has(destination.id))return;
    const route=destination===start?[]:displayRoutes(freeDisplays(),start,bounds).get(destination.id);
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
    movement={startedAt:now(),x:box.x,y:box.y,ready:movement?.ready&&!movement.finishing||false,last:now(),legs,automatic};
    setWalkLeg(legs.shift());
    if(!win.isVisible())show();else beginPoll();
    win.webContents.send('desktop:move',automatic?'roam':true);
  }
  function idleActions(){
    const panelOpen=messages.active||screenQuestion.panel||pcSettings.panel?.isVisible()||weather.panel?.isVisible()||
      screenQuestion.details?.isVisible()||reminderReview?.panel?.isVisible()||taskInbox?.panel?.isVisible()||settingsWindow?.isVisible();
    if(menuOpen||panelOpen||drag||work||!ignored){
      resetIdle();
      return;
    }
    // 系统只提供距最近一次输入的秒数，不读取按键内容。先判定，再移动窗口。
    if(movement?.automatic&&electron.powerMonitor.getSystemIdleTime()*1000<ROAM_DELAY){
      cancelMovement(true);
      postponeRoam();
      return;
    }
    const interval=pcSettings.store.data.config.idleSpecialDelaySeconds*1000;
    const specialDue=now()-lastSpecialAt>=interval;
    if(movement){
      if(movement.automatic&&specialDue)cancelMovement(true);
      return;
    }
    const active=attachment.active;
    if(specialDue){
      if(active&&['windowLie','windowSit'].includes(runtimeState)&&!active.transition&&!active.special&&!active.pending){
        lastSpecialAt=now();
        attachment.startSpecial(attachment.profiles[active.mode].asset);
        return;
      }
      if(!active&&runtimeState==='idle'&&!specialPending){
        lastSpecialAt=now();
        specialPending=true;
        win.webContents.send('desktop:idle-special',true);
        return;
      }
    }
    if(active||specialPending||runtimeState!=='idle'||now()<nextRoamAt||electron.powerMonitor.getSystemIdleTime()*1000<ROAM_DELAY)return;
    postponeRoam();
    const start=currentDisplay();
    if(pinned())return;
    const reachable=confineToScreen?[]:[...displayRoutes(freeDisplays(),start,bounds).values()].filter(route=>route.length===1);
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
      if(roamInterrupts.includes(runtimeState)||roamInterrupts.includes(value?.state))resetIdle();
      runtimeState=value?.state;
    }
    if(value?.state!=='idle'||typeof value?.specialPending==='boolean')specialPending=value?.specialPending===true;
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
    if(!drag.moved&&drag.detachOnMove)detachAttachment('drag');
    drag.moved=true;
    const display=displayAt(cursor);
    if(fullscreen.has(display.id))return;
    const x=b.x+dx,y=b.y+dy;
    // 附着素材允许透明画布越过屏幕边缘，按住的位置跟随鼠标。
    const size=drag.top?{width:b.width,height:b.height}:displaySize(display,bounds);
    const position=drag.top?{x:Math.round(x),y:Math.round(y)}:displayPosition({x,y},display,size);
    const target={...position,...size};
    if(overlapsFullscreen(target))return;
    const current=win.getBounds();
    if(['x','y','width','height'].some(k=>current[k]!==target[k]))win.setBounds(target,false);
  }
  function beginPoll(){
    stopPoll();let pointerAt=-Infinity;
    poll=setEvery(()=>{
      if(win.isDestroyed()||!win.isVisible())return;
      idleActions();
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
  function show(){pointerOutside=false;resetIdle();win.showInactive();win.webContents.send('desktop:visible',true);updatePosture(true);if(previousReady)beginPoll();}
  function hide(){screenQuestion.hide();detachAttachment('hidden');cancelMovement();travelPosture=null;drag=null;stopPoll();ignore(true);win.webContents.send('desktop:visible',false);win.hide();}
  function setWork(value){
    work=value;resetIdle();
    win.webContents.send('desktop:work',work);menu();
  }
  function openSoundSettings(){
    if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return;}
    settingsWindow=createPanelWindow(electron,{width:480,height:650,resizable:false,autoHideMenuBar:true,title:'声音设置 · 绯月',alwaysOnTop:true,
      webPreferences:{preload:resolve(root,'desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}},root);
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
    const commands=MOVE_TARGETS.map(([id,label])=>({label,enabled:!pinned(),click:()=>moveTo(id)}));
    if(displays.length>1){
      const start=currentDisplay(),routes=displayRoutes(freeDisplays(),start,bounds);
      const other=displays.flatMap((display,index)=>display.id===start.id?[]:[{
        label:display.label?`屏幕 ${index+1} · ${display.label}`:`屏幕 ${index+1}`,
        enabled:!confineToScreen&&routes.has(display.id),
        click:()=>moveTo('center',display.id)
      }]);
      commands.push({type:'separator'},{label:'其他屏幕',enabled:other.some(item=>item.enabled),submenu:other});
    }
    return commands;
  }
  function primaryDisplay(){return displays.find(item=>item.id===screen.getPrimaryDisplay().id)||displays[0];}
  function goHome(display=confineToScreen?currentDisplay():primaryDisplay()){
    if(pinned()){
      const primary=primaryDisplay();
      display={...primary,workArea:primary.bounds};
    }else if(fullscreen.has(display.id)){
      const current=currentDisplay();
      display=fullscreen.has(current.id)?freeDisplays()[0]:current;
    }
    drag=null;
    resetIdle();detachAttachment('home');cancelMovement();travelPosture=null;
    const home=initialBounds(display.workArea,bounds.height),size=displaySize(display,home);
    win.setBounds({...displayPosition(home,display,size),...size},false);
    updatePosture(true);
  }
  function updateFullscreen(force=false){
    const next=fullscreenDisplays(displays,lastWindows);
    if(!force&&next.size===fullscreen.size&&[...next].every(id=>fullscreen.has(id)))return;
    const wasPinned=pinned();
    fullscreen=next;
    if(wasPinned||pinned()||fullscreen.has(currentDisplay().id)||overlapsFullscreen(win.getBounds())){
      goHome(currentDisplay());
    }else if(movement?.legs.some(leg=>fullscreen.has(leg.display.id))){
      stopAtCurrentDisplay();
    }
    if(tray)menu();
  }
  const layoutFile=options.menuFile||resolve(root,'desktop/menu-layout.json');
  const loginName='绯月桌面精灵';
  const loginScript=resolve(root,'desktop/login-start.js');
  const loginOptions={path:resolve(process.env.SystemRoot||'C:/Windows','System32/wscript.exe'),
    args:['//B','//NoLogo',loginScript,process.execPath]};
  function loginEnabled(){
    const {launchItems}=app.getLoginItemSettings(loginOptions);
    return launchItems.some(item=>item.name===loginName&&item.scope==='user'&&item.enabled&&item.args.includes(loginScript));
  }
  function refreshLoginItem(item){
    try{item.checked=loginEnabled();item.enabled=true;}
    catch{item.checked=false;item.enabled=false;}
  }
  function toggleLogin(item){
    const requested=item.checked;
    try{
      app.setLoginItemSettings({...loginOptions,name:loginName,openAtLogin:requested,enabled:true});
      if(loginEnabled()!==requested)throw Error('Windows 未保存此设置。');
    }catch(error){
      void messages.showMessageBox({type:'error',title:'登录自启动',message:'无法更改绯月的登录自启动设置。',
        detail:error.message,buttons:['确定']}).catch(()=>{});
    }
    refreshLoginItem(item);
  }
  let layout=[{action:'restart',label:'重启绯月'},{action:'quit',label:'退出'}];
  let restoringTerminal=false;
  async function restoreLocalTerminal(){
    if(restoringTerminal||quitPending||quitApproved)return;
    restoringTerminal=true;
    try {
      const selected=await electron.dialog.showOpenDialog({
        title:'选择绯月终端绑定文件',properties:['openFile'],filters:[{name:'终端绑定',extensions:['json']}],
      });
      if(selected.canceled||!selected.filePaths[0])return;
      const file=selected.filePaths[0];
      const size=await stat(file);
      if(!size.isFile()||size.size>4096)throw Error('请选择从任务终端管理下载的绑定文件');
      const id=parseDeviceBinding(await readFile(file,'utf8'));
      if(tasks.identity?.device_id===id){
        await messages.showMessageBox({type:'info',title:'任务终端绑定',message:'本机已绑定这台任务终端。'});
        return;
      }
      const choice=await messages.showMessageBox({type:'question',title:'恢复本机任务终端 ID',
        message:'采用所选终端 ID 并重启绯月？',detail:id,buttons:['取消','恢复并重启'],defaultId:0,cancelId:0});
      if(choice.response!==1)return;
      await requestRestart({fromMenu:true,beforeQuit:async()=>{
        tasks.checkTerminalRestore?.();
        await restoreDeviceIdentity(profile,id);
      }});
    } catch(error) {
      await messages.showMessageBox({type:'error',title:'恢复任务终端',message:error.message});
    } finally { restoringTerminal=false; }
  }
  function menu(candidate=layout){
    const attachedCommand=click=>({enabled:windowsReady,click});
    const actions={
      visibility:{label:win.isVisible()?'隐藏':'显示',click:()=>{win.isVisible()?hide():show();menu();}},
      attachment:{label:windowsReady?'窗口依附':'窗口依附（检测中/不可用）',enabled:windowsReady&&!pinned()},
      climbLeft:attachedCommand(()=>startAttachment('climb','left')),
      climbRight:attachedCommand(()=>startAttachment('climb','right')),
      sit:attachedCommand(()=>startAttachment('sit','top')),
      lie:attachedCommand(()=>startAttachment('lie','top')),
      continuous:{...attachedCommand(()=>{if(attachment.continuous){attachment.continuous=false;menu();}else startAttachment('lie','top',true);}),type:'checkbox',checked:!!attachment?.continuous},
      detach:{enabled:!!attachment?.active,click:()=>detachAttachment()},
      move:{submenu:moveMenu()},
      work:{label:work?'结束工作':'开始工作',click:()=>setWork(!work)},
      settings:{click:pcSettings.open},soundSettings:{click:pcSettings.open},
      loginStart:process.platform==='win32'&&{id:'loginStart',type:'checkbox',click:toggleLogin},
      weather:{click:()=>{void weather.open().catch(()=>{
        if(!quitApproved&&electron.dialog)void messages.showMessageBox({type:'error',title:'三地天气',message:'天气面板打不开，请重新启动绯月后重试。',buttons:['确定']}).catch(()=>{});
      });}},
      question:{click:openQuestion},
      registration:tasks.registration && {click:()=>{
        if(!win.isVisible()){show();menu();}
        taskNotice(screenQuestion.open('registration'));
      }},
      today:reminderReview && {click:()=>taskNotice(reminderReview.open())},
      tasks:taskInbox&&{click:()=>taskNotice(taskInbox.open())},
      restoreTerminal:electron.dialog?.showOpenDialog&&{click:()=>taskNotice(restoreLocalTerminal())},
      review:{click:()=>taskNotice(screenQuestion.openReview())},
      notices:menuUnread>0&&{label:'提醒（'+menuUnread+' 条未读）',click:()=>taskNotice(screenQuestion.openReview('notices'))},
      pendingCheck:checks.pending&&{click:()=>taskNotice(pollSettings.open(true))},
      pollSettings:{click:()=>taskNotice(pollSettings.open())},
      retry:{click:()=>{taskNotice(tasks.retryPending());}},
      connection:tasks.showCloudConnection && {click:()=>taskNotice(tasks.showCloudConnection(localModel))},
      log:tasks.traffic && {click:()=>taskNotice(screenQuestion.openLog())},
      home:{click:()=>goHome()},
      restart:{click:()=>{void requestRestart({fromMenu:true}).catch(error=>messages.showMessageBox({type:'info',title:'重启绯月',message:error.message,buttons:['确定']}));}},
      quit:{click:()=>app.quit()},
    };
    const template=menuTemplate(candidate,actions);
    if(!template.some(item=>item.type!=='separator'))throw Error('菜单中没有可用项');
    const contextMenu=Menu.buildFromTemplate(template);
    const loginItem=contextMenu.getMenuItemById?.('loginStart');
    if(loginItem)refreshLoginItem(loginItem);
    contextMenu.on?.('menu-will-show',()=>{if(loginItem)refreshLoginItem(loginItem);menuOpen=true;resetIdle();});
    contextMenu.on?.('menu-will-close',()=>{menuOpen=false;resetIdle();});
    tray.setContextMenu(contextMenu);
    layout=candidate;
  }
  // 仅接受布尔/空消息，拖动坐标取自主进程；不接受任意路径、脚本或窗口配置。
  const onHit=(event,hit)=>{if(own(event)&&typeof hit==='boolean'&&win.isVisible()){if(hit===ignored)resetIdle();ignore(drag?false:!hit);}};
  const onReady=event=>{
    if(!own(event))return;
    if(previousReady){
      win.webContents.send('desktop:visible',win.isVisible());
      win.webContents.send('desktop:work',work);
      updatePosture(true);
      if(attachment.active){attachmentVisual='';attachment.refreshPlacement();}
    }else{
      previousReady=true;show();menu();
      if(localModel)setImmediate(()=>{if(!cleaned)localModel.start();});
    }
  };
  function openQuestion(){
    if(!win.isVisible()){show();menu();}
    void screenQuestion.open().catch(()=>{
      if(!quitApproved&&electron.dialog)void messages.showMessageBox({type:'error',title:'问绯月',message:'问答气泡未能打开，请重新启动绯月后再试。',buttons:['确定']}).catch(()=>{});
    });
  }
  const onToggleConversation=event=>{
    if(!own(event)||!win.isVisible()||quitPending)return;
    resetIdle();
    if(screenQuestion.panel){screenQuestion.abandon();return;}
    openQuestion();
  };
  const onDragStart=(event,head)=>{
    if(!own(event)||!win.isVisible()||ignored||pinned())return;
    const cursor=screen.getCursorScreenPoint(),b=win.getBounds();
    if(cursor.x<b.x||cursor.y<b.y||cursor.x>=b.x+b.width||cursor.y>=b.y+b.height)return;
    const top=attachment.topDragAnchor();
    const detachOnMove=!top&&head===true&&Boolean(attachment.active);
    if(!top&&!detachOnMove)detachAttachment('drag');
    resetIdle();cancelMovement();travelPosture=null;
    drag={cursor,bounds:top?b:{...b,width:bounds.width,height:bounds.height},moved:false,top,detachOnMove};
  };
  const onDragEnd=(event,canceled)=>{
    if(!own(event)||!drag)return;
    resetIdle();
    if(!drag.top){if(canceled!==true)followDrag(screen.getCursorScreenPoint());drag=null;updatePosture();return;}
    if(canceled!==true)followDrag(screen.getCursorScreenPoint());
    const {top,moved,deferred}=drag;
    drag=null;
    if(canceled===true||!moved)attachment.refreshPlacement();
    else if(!attachment.releaseTopDrag(top,win.getBounds()))return;
    if(deferred&&attachment.active?.id===top.id)advanceAttachment(deferred);
  };
  ipcMain.on('desktop:toggle-conversation',onToggleConversation);
  ipcMain.on('desktop:hit',onHit);ipcMain.on('desktop:ready',onReady);
  ipcMain.on('desktop:drag-start',onDragStart);ipcMain.on('desktop:drag-end',onDragEnd);
  const icon=nativeImage.createFromPath(resolve(bundle,'tray.png'));
  tray=new Tray(icon);tray.setToolTip('绯月 · 右键打开菜单');
  win.webContents.on('context-menu',()=>{resetIdle();tray.popUpContextMenu();});
  tray.on('double-click',()=>{win.isVisible()?hide():show();menu();});
  const readLayout=()=>menu(JSON.parse(readFileSync(layoutFile,'utf8').replace(/^\uFEFF/,'')));
  const stopLayout=watchFileChanges(layoutFile,readLayout);
  try{readLayout();}catch(error){warnLiveUpdate('绯月菜单',error);menu();}
  let refreshTimer;
  function refreshCharacter(){
    clearTimeout(refreshTimer);
    if(drag||movement){refreshTimer=setTimeout(refreshCharacter,300);return;}
    win.webContents.reloadIgnoringCache();
  }
  function updated(files){
    const media=files.filter(name=>/\.(webm|wav|mp3|ogg|flac|m4a)$/i.test(name));
    if(media.length)pcSettings.mediaChanged(media.map(name=>resolve(bundle,name)));
    if(files.includes('tray.png'))tray.setImage(nativeImage.createFromPath(resolve(bundle,'tray.png')));
    for(const [page,panel] of [['index.html',win],['settings.html',pcSettings.panel],['weather.html',weather.panel],
      ['conversation.html',screenQuestion.details],['reminder-review.html',reminderReview?.panel],['poll-settings.html',pollSettings.panel],
      ['task-inbox.html',taskInbox?.panel],
      ['screen-question.html',screenQuestion.panel],['registration-review.html',screenQuestion.inquiryPanel],['sound-settings.html',settingsWindow],
      ...(messages.panels??[]).map(panel=>['message-box.html',panel])]){
      if(!panel||panel.isDestroyed())continue;
      const changes=files.filter(name=>name===page||pages[page].includes(name)||(page==='index.html'&&name==='baseline.png'));
      if(!changes.length)continue;
      if(changes.every(name=>name.endsWith('.css'))){
        void panel.webContents.executeJavaScript(`for(const link of document.querySelectorAll('link[rel="stylesheet"]')){
          const url=new URL(link.href);url.searchParams.set('v',Date.now());link.href=url.href;
        }`).catch(error=>warnLiveUpdate('绯月样式更新',error));
      }else if(page==='message-box.html')continue; // 保留当前确认与取消回调，下一次打开即载入新页面。
      else if(page==='index.html')refreshCharacter();
      else if(page==='settings.html')panel.webContents.send('desktop:page-update');
      else if(['registration.html','screen-question.html','reminder-review.html'].includes(page)){
        void panel.webContents.executeJavaScript(`if(window.dispatchEvent(new Event('companion-page-update',{cancelable:true})))location.reload();`)
          .catch(error=>warnLiveUpdate('绯月面板更新',error));
      }else panel.webContents.reloadIgnoringCache();
    }
  }
  const stopSources=options.benchmark?null:watchDesktopSources({root:options.sourceRoot||root,bundle,updated,
    restartNeeded:()=>tray.setToolTip('绯月 · 后台代码有更新，可从右键菜单重启')});
  app.on('second-instance',(_event,argv)=>{if(!argv?.includes('--feiyue-login')){show();menu();}});
  function handleDisplays(){
    if(win.isDestroyed())return;
    displays=readDisplays();
    fullscreen=fullscreenDisplays(displays,lastWindows);
    const display=displays.find(item=>item.id===lastDisplayId);
    cancelMovement();travelPosture=null;drag=null;postponeRoam();
    if(!display)goHome(primaryDisplay());
    else if(!attachment.active){
      const size=displaySize(display,bounds),next={...displayPosition(win.getBounds(),display,size),...size};
      win.setBounds(next,false);
    }
    updateFullscreen(true);updatePosture(true);
  }
  function cleanup(){
    if(cleaned)return;cleaned=true;
    reminderStartup.abort();
    pollSettings.close();checks.close();
    stopLayout();
    clearTimeout(refreshTimer);stopSources?.();
    ipcMain.removeListener('desktop:attachment-done',onAttachmentDone);
    ipcMain.removeListener('desktop:elevator-playback',onElevatorPlayback);
    stopWindows?.();stopWindows=null;
    messages.close();
    screenQuestion.close();
    localModel?.close();
    reminderReview?.close();
    taskInbox?.close();
    weather.close();
    movement=null;ipcMain.removeListener('pc:runtime',onMovementRuntime);pcSettings.close();
    stopPoll();ipcMain.removeListener('desktop:sound-ready',soundReady);ipcMain.removeListener('desktop:sound-change',soundChange);ipcMain.removeListener('desktop:sound-preview',soundPreview);
    if(settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.destroy();
    ipcMain.removeListener('desktop:toggle-conversation',onToggleConversation);
    ipcMain.removeListener('desktop:hit',onHit);ipcMain.removeListener('desktop:ready',onReady);
    ipcMain.removeListener('desktop:drag-start',onDragStart);ipcMain.removeListener('desktop:drag-end',onDragEnd);
    for(const event of displayEvents)screen.removeListener(event,handleDisplays);
    if(tray){tray.destroy();tray=null;}
    setLiveWarningLog(undefined);
  }
  win.on('close',event=>{if(!quitApproved){event.preventDefault();app.quit();}});
  app.once('will-quit',()=>{if(restartRequested)app.relaunch();});
  async function requestRestart({fromMenu=false,valid=()=>true,progress=()=>{},beforeQuit=()=>{}}={}){
    if(quitPending||quitApproved)throw Error('已有退出或重启操作正在处理。');
    quitPending=true;
    try{
      if(!fromMenu){
        const choice=await messages.showMessageBox({type:'question',title:'重启绯月',message:'现在重新启动绯月吗？',
          detail:'确认后暂停未执行的任务。等查询和对话的回复保存、已发指令收到回执，再重启并继续待办。',buttons:['取消','确认重启'],defaultId:0,cancelId:0});
        if(choice.response!==1||!valid())return false;
      }
      progress('已确认重启，正在等待已发指令的回执…');
      const results=await Promise.allSettled([tasks.drainForRestart(),screenQuestion.drainForRestart()]);
      const failed=results.find(row=>row.status==='rejected');if(failed)throw failed.reason;
      await beforeQuit();
      await tasks.stop();
      restartRequested=true;quitApproved=true;app.quit();return true;
    }catch(error){
      tasks.cancelRestart?.();screenQuestion.cancelRestart();
      throw error;
    }finally{if(!quitApproved)quitPending=false;}
  }
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
        const choice=await messages.showMessageBox({type:'warning',title:'确认'+action,
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
      if(data.lastInputAt>lastInputAt){
        lastInputAt=data.lastInputAt;
        if(movement&&lastInputAt>movement.startedAt){
          cancelMovement(true);
          postponeRoam();
        }
      }
      const windows=data.windows.map(w=>({...w,rect:screen.screenToDipRect(null,{x:w.x,y:w.y,width:w.width,height:w.height})}));
      lastWindows=data.windows;
      updateFullscreen();
      if(fullscreen.size)for(const w of windows){
        const center={x:w.rect.x+w.rect.width/2,y:w.rect.y+w.rect.height/2,width:1,height:1};
        if(w.eligible&&overlapsFullscreen(center))w.eligible=false;
      }
      const first=!windowsReady;windowsReady=true;attachment.update({foreground:data.foreground,windows},now());if(first)menu();
    },onError:()=>{windowsReady=false;if(attachment.active)attachment.detach('service-error');if(tray)menu();}});
  }
  tasks.startPolling?.({managed:true});
  taskNotice(Promise.resolve(screenQuestion.resumePaused()));
  const remindersReady=waitForStartupReminders(reminderStartup.signal);
  if(!options.benchmark)checks.start();
  taskNotice(tasks.startup(remindersReady));
  return {win,show,hide,moveTo,attachment,startAttachment,stopPoll,setWork,pcSettings,tasks,screenQuestion,weather,localModel,getStats:()=>({pointerMessages,visible:win.isVisible(),ready:previousReady})};
}
