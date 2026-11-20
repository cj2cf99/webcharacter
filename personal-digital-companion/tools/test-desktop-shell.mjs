import {normalizeSound} from '../desktop/sound.mjs';
// 无Electron安装时执行真实壳逻辑，验证窗口参数/IPC/穿透/托盘；不替代Windows实机验证。
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {startDesktop,initialBounds} from '../desktop/shell.mjs';
assert.deepEqual(initialBounds({x:0,y:0,width:1440,height:900}),{x:1181,y:528,width:243,height:360});
const app=new EventEmitter();Object.assign(app,{requestSingleInstanceLock:()=>true,setName(){},setPath(){},whenReady:async()=>{},quit(){this.emit('before-quit')}});
let loginEntries=[],loginWrites=0,loginError=false;
app.getLoginItemSettings=()=>({launchItems:loginEntries});
app.setLoginItemSettings=settings=>{
  loginWrites++;
  if(loginError)return;
  assert.equal(settings.name,'绯月桌面精灵');
  assert.match(settings.path,/System32[\\/]wscript\.exe$/i);
  assert.match(settings.args[2],/desktop[\\/]login-start\.js$/);
  assert.equal(settings.args[3],process.execPath);
  loginEntries=settings.openAtLogin?[{...settings,scope:'user'}]:[];
};
function buildMenu(template){
  template.getMenuItemById=id=>template.flatMap(group=>group.submenu??[]).find(item=>item.id===id);
  const events=new EventEmitter();template.on=events.on.bind(events);template.emit=events.emit.bind(events);
  return template;
}
let win,tray,network,permission,timer=null,clears=0,intervalMs=0;
let systemIdle=1000,clock=0,publishWindows,roamRandom=0.999;
let cursor={x:1200,y:600};
const primary={id:1,scaleFactor:1,bounds:{x:0,y:0,width:1440,height:940},workArea:{x:0,y:0,width:1440,height:900}};
const left={id:2,scaleFactor:1.5,bounds:{x:-1120,y:80,width:960,height:680},workArea:{x:-1120,y:80,width:960,height:650},
 physicalBounds:{x:-1440,y:120,width:1440,height:1020},physicalArea:{x:-1440,y:120,width:1440,height:975}};
const gap={id:3,scaleFactor:1,bounds:{x:1500,y:0,width:900,height:690},workArea:{x:1500,y:0,width:900,height:650}};
let displayList=[primary];
const screen=new EventEmitter();screen.getPrimaryDisplay=()=>primary;screen.getCursorScreenPoint=()=>cursor;
screen.getAllDisplays=()=>displayList;
screen.getDisplayNearestPoint=({x,y})=>displayList.find(({workArea:r})=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height)||primary;
screen.screenToDipRect=(_window,rect)=>rect;
screen.dipToScreenRect=(_window,rect)=>displayList.find(item=>item.workArea===rect)?.physicalArea||displayList.find(item=>item.bounds===rect)?.physicalBounds||rect;
const ipcMain=new EventEmitter(),handlers=new Map();
ipcMain.handle=(channel,fn)=>handlers.set(channel,fn);ipcMain.removeHandler=channel=>handlers.delete(channel);
class Window extends EventEmitter{
  constructor(options){super();win=this;this.options=options;this.visible=false;this.bounds=options;this.ignore=[];this.sent=[];this.webContents=new EventEmitter();
    this.webContents.mainFrame={id:1};this.webContents.setWindowOpenHandler=fn=>this.open=fn;this.webContents.send=(...args)=>this.sent.push(args);}
  setIgnoreMouseEvents(...args){this.ignore.push(args)}isDestroyed(){return false}isVisible(){return this.visible}
  getBounds(){return this.bounds}setBounds(b){this.bounds={...b};this.boundsCalls=(this.boundsCalls||0)+1}setPosition(x,y){this.bounds={...this.bounds,x,y,width:this.bounds.width+1,height:this.bounds.height+1}}showInactive(){this.visible=true}hide(){this.visible=false}async loadFile(file){this.file=file}
}
class Tray {constructor(){tray=this;this.events={}}setToolTip(){}setContextMenu(menu){this.menu=menu}popUpContextMenu(){this.openedMenu=this.menu}on(name,fn){this.events[name]=fn}destroy(){this.destroyed=true}}
const session={defaultSession:{webRequest:{onBeforeRequest(_filter,fn){network=fn}},setPermissionRequestHandler(fn){permission=fn}}};
const profile=mkdtempSync(join(tmpdir(),'companion-sound-'));
let modelStarts=0,modelStops=0;
const model={start(){assert.equal(win.visible,true);modelStarts++;},close(){modelStops++;}};
const loginErrors=[];
const result=await startDesktop({app,shell:{},powerMonitor:{getSystemIdleTime:()=>systemIdle},BrowserWindow:Window,Tray,Menu:{buildFromTemplate:buildMenu},nativeImage:{createFromPath:x=>x},screen,ipcMain,session},
  {profile,localModel:model,messageBoxes:{showMessageBox:async data=>{loginErrors.push(data);return {response:0};},close(){}},windowSource:({onSnapshot})=>{publishWindows=onSnapshot;return ()=>{};},now:()=>clock,random:()=>roamRandom,
    setInterval:(fn,ms)=>{timer=fn;intervalMs=ms;return 1},clearInterval:()=>{timer=null;clears++}});
assert.equal(win.options.transparent,true);assert.equal(win.options.frame,false);assert.equal(win.options.webPreferences.nodeIntegration,false);
assert.equal(win.options.webPreferences.contextIsolation,true);assert.equal(win.options.webPreferences.sandbox,true);
assert.equal(win.visible,false,'首张角色图就绪前不显示空窗');assert.equal(win.ignore[0][0],true);
network({},r=>assert.equal(r.cancel,true));permission(null,'camera',value=>assert.equal(value,false));assert.equal(win.open().action,'deny');
const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
ipcMain.emit('desktop:ready',{sender:{},senderFrame:{}});assert.equal(win.visible,false,'拒绝无关窗口消息');
ipcMain.emit('desktop:ready',event);assert.equal(win.visible,true);assert(timer);
assert.equal(modelStarts,0,'首帧就绪先显示窗口');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(modelStarts,1,'窗口显示后启动本地模型');
ipcMain.emit('desktop:ready',event);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(modelStarts,1,'重复首帧通知不会重载模型');
ipcMain.emit('desktop:hit',event,true);assert.equal(win.ignore.at(-1)[0],false,'人物可命中');
ipcMain.emit('desktop:hit',event,false);assert.equal(win.ignore.at(-1)[0],true,'透明区域穿透');
const count=win.ignore.length;ipcMain.emit('desktop:hit',event,'false');assert.equal(win.ignore.length,count,'拒绝非布尔值');
ipcMain.emit('desktop:hit',{sender:win.webContents,senderFrame:{}},true);assert.equal(win.ignore.length,count,'拒绝子frame消息');
timer();assert.equal(win.sent.at(-1)[0],'desktop:pointer');
ipcMain.emit('desktop:hit',event,true);ipcMain.emit('desktop:drag-start',event);
const original={...win.getBounds()};cursor={x:1202,y:601};timer();assert.equal(win.getBounds().x,original.x,'小位移仍作为点击');
cursor={x:1300,y:650};timer();assert.equal(win.getBounds().x,1197,'拖动保持窗口在工作区内');assert.equal(win.getBounds().y,540,'底边保持在工作区内');
const updates=win.boundsCalls;
for(let i=0;i<200;i++)timer();assert.equal(win.boundsCalls,updates,'按住不移动不重复更新原生窗口');
for(let i=0;i<200;i++){cursor={x:1200+i%20,y:550+i%30};timer();assert.equal(win.getBounds().width,243);assert.equal(win.getBounds().height,360);}
ipcMain.emit('desktop:hit',event,false);assert.equal(win.ignore.at(-1)[0],false,'拖动期间不穿透');
ipcMain.emit('desktop:drag-end',event);ipcMain.emit('desktop:hit',event,false);assert.equal(win.ignore.at(-1)[0],true);
const actionsMenu=()=>tray.menu.find(item=>item.label==='桌宠动作').submenu;
const moveItems=()=>actionsMenu().find(item=>item.label==='移动到').submenu;
actionsMenu().find(item=>item.label==='开始工作').click();assert.deepEqual(win.sent.at(-1),['desktop:work',true]);
tray.menu.find(item=>item.label==='隐藏').click();assert.equal(win.visible,false);assert.equal(timer,null);
tray.menu.find(item=>item.label==='显示').click();assert.equal(win.visible,true);assert(timer);
let prevented=false;win.webContents.emit('will-navigate',{preventDefault(){prevented=true}},'https://example.com');assert(prevented);
ipcMain.emit('desktop:sound-ready',event);assert.deepEqual(win.sent.at(-1),['desktop:sound',normalizeSound()]);
ipcMain.emit('desktop:sound-change',{sender:{},senderFrame:{}},{enabled:false,volume:90});
ipcMain.emit('desktop:sound-ready',event);assert.equal(win.sent.at(-1)[1].enabled,true);
ipcMain.emit('desktop:sound-change',event,{enabled:false,volume:23});assert.deepEqual(JSON.parse(readFileSync(join(profile,'sound-settings.json'),'utf8')),normalizeSound({enabled:false,volume:23}));
ipcMain.emit('desktop:sound-change',event,{enabled:true,volume:999});ipcMain.emit('desktop:sound-ready',event);assert.equal(win.sent.at(-1)[1].volume,23);
const labels=items=>items.filter(item=>item.type!=='separator').map(item=>item.label);
assert.deepEqual(labels(tray.menu),['问绯月','三地天气','任务','桌宠动作','设置与维护','隐藏','退出']);
win.webContents.emit('context-menu');assert.equal(tray.openedMenu,tray.menu,'角色右键与托盘使用同一菜单');
assert.deepEqual(labels(tray.menu.find(item=>item.label==='任务').submenu),['今日任务','接取任务与任务链','中断任务与补传','本地复盘','任务日志']);
const settingsLabels=labels(tray.menu.find(item=>item.label==='设置与维护').submenu);
if(process.platform==='win32'){
  assert.deepEqual(settingsLabels,['动画与声音','轮询设定','登录 Windows 后延迟 1 分钟启动','云端连接','重启绯月']);
  const item=tray.menu.getMenuItemById('loginStart');
  assert.equal(item.type,'checkbox');assert.equal(item.checked,false);assert.equal(loginWrites,0);
  item.checked=true;item.click(item);assert.equal(item.checked,true);
  loginEntries[0].enabled=false;tray.menu.emit('menu-will-show');assert.equal(item.checked,false);
  tray.menu.emit('menu-will-close');
  item.checked=true;item.click(item);assert.equal(item.checked,true);
  loginError=true;item.checked=false;item.click(item);assert.equal(item.checked,true);
  assert.equal(loginErrors.at(-1).title,'登录自启动');
  loginError=false;item.checked=false;item.click(item);assert.equal(item.checked,false);assert.equal(loginEntries.length,0);
  result.hide();app.emit('second-instance',{},['--feiyue-login']);assert.equal(win.visible,false);
  app.emit('second-instance',{},[]);assert.equal(win.visible,true);
}else assert.deepEqual(settingsLabels,['动画与声音','轮询设定','云端连接','重启绯月']);
ipcMain.emit('desktop:sound-preview',event,'click');assert.equal(win.sent.at(-1)[0],'desktop:sound-preview');
const savedBounds={...win.getBounds()};
const postureMessages=()=>win.sent.filter(m=>m[0]==='desktop:posture');
for(const [x,side]of [[0,'left'],[600,'left'],[1100,'right'],[600,'right']]){win.setBounds({...savedBounds,x});timer();assert.equal(postureMessages().at(-1)[1],side);}
const beforePosture=postureMessages().length;timer();timer();assert.equal(postureMessages().length,beforePosture,'姿态不变不重复发IPC');win.setBounds(savedBounds);
const attachmentMenu=actionsMenu().find(m=>m.label?.startsWith('窗口依附'));assert.equal(attachmentMenu.enabled,false);assert.deepEqual(attachmentMenu.submenu.slice(0,2).map(m=>m.label),['左侧电梯上行','右侧电梯上行']);
const commands=moveItems();
assert.deepEqual(commands.map(m=>m.label),['左上','左下','右上','右下','正中间']);
let exitFrameTime=0;function walkTick(){clock+=50;timer();if(win.sent.filter(m=>m[0]==='desktop:move').at(-1)?.[1]==='finish'){ipcMain.emit('pc:runtime',event,{state:'walk',phase:'exit',resource:'walk-exit',frame:{time:exitFrameTime,duration:16/24}});exitFrameTime+=.05;}else exitFrameTime=0;}
const destinations=[[16,12],[16,528],[1181,12],[1181,528],[599,270]];
for(let i=0;i<commands.length;i++){
 commands[i].click();assert.equal(intervalMs,16,'仅移动时高频更新');const before={...win.getBounds()};clock+=50;timer();assert.equal(win.getBounds().x,before.x,'进入段结束前不移动');
 ipcMain.emit('pc:runtime',{sender:{},senderFrame:{}},{state:'walk',phase:'loop'});clock+=50;timer();assert.equal(win.getBounds().x,before.x,'拒绝伪造阶段');
 ipcMain.emit('pc:runtime',event,{state:'walk',phase:'enter',resource:'walk-enter',frame:{time:3/24,duration:20/24}});clock+=16;timer();assert(win.getBounds().x!==before.x||win.getBounds().y!==before.y,'进入末尾预告后提前位移');
 ipcMain.emit('pc:runtime',event,{state:'walk',phase:'loop'});
 win.bounds={...win.bounds,width:244,height:361};
 let finishRemaining=null;const count=win.sent.length;
 for(let tick=0;tick<200;tick++){walkTick();if(finishRemaining===null&&win.sent.slice(count).some(m=>m[0]==='desktop:move'&&m[1]==='finish')){finishRemaining=Math.hypot(win.getBounds().x-destinations[i][0],win.getBounds().y-destinations[i][1]);ipcMain.emit('pc:runtime',event,{state:'walk',phase:'exit'});}}
 assert(finishRemaining>0&&finishRemaining<=30,'按收步距离进入退出且减速到目标');
 assert.equal(win.sent.slice(count).filter(m=>m[0]==='desktop:move'&&m[1]==='finish').length,1,'只预告一次');
 assert.deepEqual([win.getBounds().x,win.getBounds().y],destinations[i]);assert.equal(intervalMs,50,'到达后恢复低频轮询');
 assert.equal(win.getBounds().width,243);assert.equal(win.getBounds().height,360);
 const locked=postureMessages().at(-1)[1];timer();assert.equal(postureMessages().at(-1)[1],locked,'到达但未退出仍锁定方向');
 ipcMain.emit('pc:runtime',event,{state:'walk',phase:'exit'});
 assert.equal(postureMessages().at(-1)[1],locked,'退出阶段保持行走朝向');
 ipcMain.emit('pc:runtime',event,{state:'idle',phase:'single'});
 if(i<4)assert.equal(postureMessages().at(-1)[1],i<2?'left':'right','退出完整结束切换下一状态后恢复屏幕姿态');
 assert.deepEqual(win.sent.filter(m=>m[0]==='desktop:move').at(-1),['desktop:move',false]);
}
commands[0].click();ipcMain.emit('pc:runtime',event,{state:'walk',phase:'loop'});clock+=50;timer();commands[3].click();
for(let tick=0;tick<200;tick++){walkTick();}assert.equal(win.getBounds().x,1181,'中途换目标');
commands[0].click();result.hide();assert.equal(timer,null);result.show();const stopped={...win.getBounds()};clock+=50;timer();assert.deepEqual(win.getBounds(),stopped,'隐藏取消移动');
const target={id:'top',x:260,y:340,width:880,height:500,eligible:true,minimized:false,maximized:false};
const snapshot={foreground:target.id,windows:[target]};
publishWindows(snapshot);
actionsMenu().find(m=>m.label==='窗口依附').submenu.find(m=>m.label==='上沿坐姿').click();
const seated=win.getBounds(),attachments=()=>win.sent.filter(m=>m[0]==='desktop:attachment');
const grabTop=()=>{
 const b=win.getBounds();cursor={x:b.x+240,y:b.y+200};
 ipcMain.emit('desktop:hit',event,true);
 ipcMain.emit('desktop:drag-start',event);
};
grabTop();
const prior=attachments().length;
cursor={x:cursor.x+84,y:cursor.y+30};timer();
assert.equal(win.getBounds().width,seated.width);
assert.equal(win.getBounds().x,seated.x+84);
assert.equal(attachments().length,prior,'拖动中不切播放器节点');
publishWindows(snapshot);
assert.equal(win.getBounds().y,seated.y+30,'按住时窗口快照不会拉回上沿');
ipcMain.emit('desktop:drag-end',event,false);
assert.equal(result.attachment.active.mode,'sit');
assert.equal(win.getBounds().x,seated.x+84);
assert.equal(win.getBounds().y,seated.y);
assert.equal(attachments().length,prior,'松手就近贴附不重播');
publishWindows({...snapshot,windows:[{...target,x:target.x+20}]});
assert.equal(win.getBounds().x,seated.x+104,'原窗口移动时继续跟随新锚点');
grabTop();
ipcMain.emit('pc:runtime',event,{state:'windowSit'});
clock+=60_000;timer();
assert(!result.attachment.active.special,'按住人物期间不发起特殊动作');
ipcMain.emit('desktop:drag-end',event,false);
ipcMain.emit('desktop:hit',event,false);
result.setWork(false);
clock+=59_999;timer();assert(!result.attachment.active.special);
clock++;timer();assert(result.attachment.active.special,'释放后重新等满60秒');
grabTop();
cursor={x:cursor.x,y:cursor.y+170};
ipcMain.emit('desktop:drag-end',event,false);
assert.equal(result.attachment.active,null);
assert.equal(attachments().at(-1)[1],null,'远处松手解除依附');
assert.equal(win.getBounds().width,243);
assert.notEqual(win.getBounds().x,1181,'保留松手附近位置');
console.log('PASS：上沿拖拽保持播放和尺寸、快照不抢位置、松手更新锚点、拖远退出。');

const crossMenu=()=>moveItems().find(m=>m.label==='其他屏幕');
const home=()=>actionsMenu().find(m=>m.label==='回到右下角').click();
const saveLock=value=>handlers.get('pc:save')(event,{config:{target:'pc',confineToScreen:value},domain:'display'});
const centerX=()=>win.getBounds().x+win.getBounds().width/2;
const lastWalk=()=>win.sent.filter(message=>message[0]==='desktop:move').at(-1)?.[1];
function assertCorner(display){
 const {x,y,width,height}=win.getBounds(),area=display.workArea;
 assert.ok([area.x+16,area.x+area.width-width-16].includes(x),'漫游结束时贴近屏幕左右边');
 assert.ok([area.y+12,area.y+area.height-height-12].includes(y),'漫游结束时贴近屏幕上下边');
}
function finishWalk(){
 ipcMain.emit('pc:runtime',event,{state:'walk',phase:'loop'});
 for(let i=0;i<600&&lastWalk()!==false;i++)walkTick();
 assert.equal(lastWalk(),false,'完整到达');
 ipcMain.emit('pc:runtime',event,{state:'idle',phase:'single'});
}
home();displayList=[primary,left,gap];screen.emit('display-added',{},left);
assert.equal(crossMenu().enabled,true);assert.equal(crossMenu().submenu[0].enabled,true);
assert.equal(crossMenu().submenu[1].enabled,false,'不跨越物理屏幕间隙');
crossMenu().submenu[0].click();assert.equal(lastWalk(),true);
finishWalk();
assert(centerX()<0,'跨到负坐标副屏');
assert.equal(win.getBounds().width,244,'150%屏宽度对齐物理像素网格');
assert.equal(win.getBounds().height,360);
assert.equal(win.sent.filter(m=>m[0]==='desktop:scale').at(-1)[1],1.5);
assert.equal(crossMenu().submenu[0].enabled,true,'可返回主屏');
crossMenu().submenu[0].click();
ipcMain.emit('pc:runtime',event,{state:'walk',phase:'loop'});
clock+=16;timer();
await saveLock(true);
assert.equal(lastWalk(),false,'启用锁定立即终止正在走的路线');
assert(centerX()<0);assert.equal(crossMenu().enabled,false);
home();assert(centerX()<0,'锁定时回到本屏右下角');
ipcMain.emit('pc:runtime',event,{state:'idle',phase:'single'});
result.setWork(true);clock+=90_001;timer();assert.equal(lastWalk(),false,'工作状态不触发漫游');
result.setWork(false);
const lockStart={...win.getBounds()};
const specials=()=>win.sent.filter(([channel,value])=>channel==='desktop:idle-special'&&value).length;
function finishSpecialAtRoamDeadline(){
 const before=specials();
 clock+=90_001;timer();
 assert.equal(specials(),before+1,'同时到期优先派发特殊待机');
 const moves=win.sent.filter(([key])=>key==='desktop:move').length;
 timer();
 assert.equal(win.sent.filter(([key])=>key==='desktop:move').length,moves,'等待渲染器确认期间不发起行走');
 ipcMain.emit('pc:runtime',event,{state:'special'});
 ipcMain.emit('pc:runtime',event,{state:'idle',specialPending:false});
 timer();
}
const priorSpecials=specials();
clock+=59_999;timer();assert.equal(specials(),priorSpecials);
clock++;timer();assert.equal(specials(),priorSpecials+1);
ipcMain.emit('pc:runtime',event,{state:'special'});
clock+=30_000;timer();assert.equal(lastWalk(),false,'90秒到期仍礼让特殊动作');
ipcMain.emit('pc:runtime',event,{state:'idle',specialPending:false});
systemIdle=0;timer();assert.equal(lastWalk(),false,'桌面正在输入时不出发');
systemIdle=90;timer();assert.equal(lastWalk(),'roam','锁定仍允许同屏漫游');
finishWalk();assertCorner(left);
assert.notDeepEqual(win.getBounds(),lockStart,'排除已停留的角落');

const occupied=win.getBounds();cursor={x:occupied.x+20,y:occupied.y+20};
ipcMain.emit('desktop:hit',event,true);ipcMain.emit('desktop:drag-start',event);
cursor={x:420,y:410};timer();ipcMain.emit('desktop:drag-end',event);
assert(centerX()>0,'锁定后手动拖拽仍可换屏');
assert.equal(win.getBounds().width,243,'回到 100% 屏恢复基准宽度');
assert.equal(win.sent.filter(m=>m[0]==='desktop:scale').at(-1)[1],1);
home();assert(centerX()>0,'手动换屏后锁定新屏');
await saveLock(false);assert.equal(crossMenu().enabled,true);
ipcMain.emit('desktop:hit',event,false);
ipcMain.emit('pc:runtime',event,{state:'idle',phase:'single'});
roamRandom=0;
finishSpecialAtRoamDeadline();assert.equal(lastWalk(),'roam');
finishWalk();assertCorner(left);
displayList=[primary,gap];screen.emit('display-removed',{},left);
assert.deepEqual(win.getBounds(),initialBounds(primary.workArea),'拔掉当前屏后回主屏');
assert.equal(crossMenu().enabled,false,'离散屏没有行走通路');
displayList=[primary];screen.emit('display-removed',{},gap);
finishSpecialAtRoamDeadline();assert.equal(lastWalk(),'roam','单屏也能自主漫游');
ipcMain.emit('pc:runtime',event,{state:'walk',phase:'loop'});
const beforeInput=win.getBounds();systemIdle=0;clock+=16;timer();
assert.equal(lastWalk(),'interrupt');assert.deepEqual(win.getBounds(),beforeInput,'发生系统输入的轮询不执行位移');
ipcMain.emit('pc:runtime',event,{state:'idle',specialPending:false});
systemIdle=89;clock+=89_999;timer();assert.equal(lastWalk(),'interrupt');
ipcMain.emit('pc:runtime',event,{state:'special'});ipcMain.emit('pc:runtime',event,{state:'idle',specialPending:false});
systemIdle=90;clock++;timer();assert.equal(lastWalk(),'roam');
finishWalk();assertCorner(primary);
commands[4].click();
ipcMain.emit('pc:runtime',event,{state:'walk',phase:'loop'});
const manualBounds=win.getBounds();clock+=16;
publishWindows({...snapshot,lastInputAt:clock});
timer();assert.equal(lastWalk(),'interrupt');assert.deepEqual(win.getBounds(),manualBounds,'明确移动指令也被后续输入打断');
console.log('PASS：单屏与混合 DPI 跨屏漫游均停在角落，覆盖实时锁定、手动换屏、空隙及拔屏回退。');

displayList=[primary,left];screen.emit('display-added',{},left);home();
const cover=(id,rect,extra={})=>({id,...rect,minimized:false,maximized:false,eligible:true,...extra});
const onPrimary=cover('movie',primary.bounds),onLeft=cover('game',left.physicalBounds);
const maximized=cover('ordinary',primary.workArea,{maximized:true});
const snapshotOf=(...windows)=>publishWindows({foreground:'other-screen',windows});
const beforeFull=win.getBounds();
snapshotOf(maximized,onPrimary);
snapshotOf({...onPrimary,minimized:true});
assert.deepEqual(win.getBounds(),beforeFull,'普通最大化、被遮住或最小化的全屏窗口不触发避让');
crossMenu().submenu[0].click();
snapshotOf(onLeft);
assert.equal(lastWalk(),false,'目的屏变成全屏，立即收住跨屏路线');
await saveLock(true);
snapshotOf(target);
result.startAttachment('sit','top');
assert.ok(result.attachment.active);
snapshotOf(target,onPrimary);
assert.equal(result.attachment.active,null);
assert(centerX()<0,'主屏被覆盖时直接离开，屏幕锁定不阻止避让');
snapshotOf(onLeft,onPrimary);
const pinnedHome=initialBounds(primary.bounds);
assert.deepEqual(win.getBounds(),pinnedHome,'两屏同时全屏时固定主屏右下角');
const pinnedWrites=win.boundsCalls;
snapshotOf(onPrimary,onLeft);
snapshotOf(cover('span',{x:-1440,y:0,width:2880,height:1140}));
result.moveTo('top-left');result.startAttachment('sit','top');
cursor={x:pinnedHome.x+30,y:pinnedHome.y+30};
ipcMain.emit('desktop:hit',event,true);ipcMain.emit('desktop:drag-start',event);
cursor={x:440,y:410};clock+=100_000;timer();ipcMain.emit('desktop:drag-end',event);
assert.equal(win.boundsCalls,pinnedWrites,'全屏期间拖拽、行走和重复快照均不移动窗口');
snapshotOf(onPrimary);
assert(centerX()<0,'一块副屏离开全屏立刻释放固定');
displayList=[primary];screen.emit('display-removed',{},left);
assert.deepEqual(win.getBounds(),pinnedHome,'拔掉唯一空闲屏后单屏固定');
displayList=[primary,gap];screen.emit('display-added',{},gap);
assert.ok(centerX()>1500,'新接入的离散空闲屏也能避让过去');
result.hide();snapshotOf(onPrimary,cover('slides',gap.bounds));
assert.equal(win.isVisible(),false,'避让不显示隐藏的桌宠');
result.show();assert.deepEqual(win.getBounds(),pinnedHome);
snapshotOf();assert.deepEqual(win.getBounds(),initialBounds(primary.workArea),'全部解除后重新避开任务栏');
await saveLock(false);result.moveTo('top-left');
assert.equal(lastWalk(),true,'退出全屏后重新允许移动');
console.log('PASS：逐屏全屏避让、全屏固定、锁定、拖拽、跨屏路线、窗口依附及热插拔。');

result.hide();assert.equal(timer,null);app.quit();assert.equal(tray.destroyed,true);assert.equal(modelStops,1);assert.equal(ipcMain.listenerCount('desktop:hit'),0);assert(clears>0);
assert.equal(screen.listenerCount('display-metrics-changed'),0);
console.log('PASS：透明窗口参数、默认穿透、可信IPC与类型校验、人物命中、托盘工作/显隐/退出、隐藏停轮询、禁止外联/导航/权限。');

assert.equal(ipcMain.listenerCount('desktop:sound-change'),0);rmSync(profile,{recursive:true});
