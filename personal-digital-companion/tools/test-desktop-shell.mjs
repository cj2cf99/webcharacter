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
let win,tray,network,permission,timer=null,clears=0,intervalMs=0;
let clock=0,publishWindows;
let cursor={x:1200,y:600};
const screen=new EventEmitter();screen.getPrimaryDisplay=()=>({workArea:{x:0,y:0,width:1440,height:900}});screen.getCursorScreenPoint=()=>cursor;screen.getDisplayNearestPoint=screen.getPrimaryDisplay;screen.screenToDipRect=(_window,rect)=>rect;
const ipcMain=new EventEmitter();ipcMain.handle=()=>{};ipcMain.removeHandler=()=>{};
class Window extends EventEmitter{
  constructor(options){super();win=this;this.options=options;this.visible=false;this.bounds=options;this.ignore=[];this.sent=[];this.webContents=new EventEmitter();
    this.webContents.mainFrame={id:1};this.webContents.setWindowOpenHandler=fn=>this.open=fn;this.webContents.send=(...args)=>this.sent.push(args);}
  setIgnoreMouseEvents(...args){this.ignore.push(args)}isDestroyed(){return false}isVisible(){return this.visible}
  getBounds(){return this.bounds}setBounds(b){this.bounds={...b};this.boundsCalls=(this.boundsCalls||0)+1}setPosition(x,y){this.bounds={...this.bounds,x,y,width:this.bounds.width+1,height:this.bounds.height+1}}showInactive(){this.visible=true}hide(){this.visible=false}async loadFile(file){this.file=file}
}
class Tray {constructor(){tray=this;this.events={}}setToolTip(){}setContextMenu(menu){this.menu=menu}on(name,fn){this.events[name]=fn}destroy(){this.destroyed=true}}
const session={defaultSession:{webRequest:{onBeforeRequest(_filter,fn){network=fn}},setPermissionRequestHandler(fn){permission=fn}}};
const profile=mkdtempSync(join(tmpdir(),'companion-sound-'));
const result=await startDesktop({app,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:x=>x},nativeImage:{createFromPath:x=>x},screen,ipcMain,session},
  {profile,windowSource:({onSnapshot})=>{publishWindows=onSnapshot;return ()=>{};},now:()=>clock,setInterval:(fn,ms)=>{timer=fn;intervalMs=ms;return 1},clearInterval:()=>{timer=null;clears++}});
assert.equal(win.options.transparent,true);assert.equal(win.options.frame,false);assert.equal(win.options.webPreferences.nodeIntegration,false);
assert.equal(win.options.webPreferences.contextIsolation,true);assert.equal(win.options.webPreferences.sandbox,true);
assert.equal(win.visible,false,'首张角色图就绪前不显示空窗');assert.equal(win.ignore[0][0],true);
network({},r=>assert.equal(r.cancel,true));permission(null,'camera',value=>assert.equal(value,false));assert.equal(win.open().action,'deny');
const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
ipcMain.emit('desktop:ready',{sender:{},senderFrame:{}});assert.equal(win.visible,false,'拒绝无关窗口消息');
ipcMain.emit('desktop:ready',event);assert.equal(win.visible,true);assert(timer);
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
tray.menu.find(item=>item.label==='开始工作').click();assert.deepEqual(win.sent.at(-1),['desktop:work',true]);
tray.menu.find(item=>item.label==='隐藏').click();assert.equal(win.visible,false);assert.equal(timer,null);
tray.menu.find(item=>item.label==='显示').click();assert.equal(win.visible,true);assert(timer);
let prevented=false;win.webContents.emit('will-navigate',{preventDefault(){prevented=true}},'https://example.com');assert(prevented);
ipcMain.emit('desktop:sound-ready',event);assert.deepEqual(win.sent.at(-1),['desktop:sound',normalizeSound()]);
ipcMain.emit('desktop:sound-change',{sender:{},senderFrame:{}},{enabled:false,volume:90});
ipcMain.emit('desktop:sound-ready',event);assert.equal(win.sent.at(-1)[1].enabled,true);
ipcMain.emit('desktop:sound-change',event,{enabled:false,volume:23});assert.deepEqual(JSON.parse(readFileSync(join(profile,'sound-settings.json'),'utf8')),normalizeSound({enabled:false,volume:23}));
ipcMain.emit('desktop:sound-change',event,{enabled:true,volume:999});ipcMain.emit('desktop:sound-ready',event);assert.equal(win.sent.at(-1)[1].volume,23);
assert(tray.menu.some(item=>item.label==='声音设置'));
ipcMain.emit('desktop:sound-preview',event,'click');assert.equal(win.sent.at(-1)[0],'desktop:sound-preview');
const savedBounds={...win.getBounds()};
const postureMessages=()=>win.sent.filter(m=>m[0]==='desktop:posture');
for(const [x,side]of [[0,'left'],[600,'left'],[1100,'right'],[600,'right']]){win.setBounds({...savedBounds,x});timer();assert.equal(postureMessages().at(-1)[1],side);}
const beforePosture=postureMessages().length;timer();timer();assert.equal(postureMessages().length,beforePosture,'姿态不变不重复发IPC');win.setBounds(savedBounds);
const attachmentMenu=tray.menu.find(m=>m.label==='指令').submenu.find(m=>m.label.startsWith('窗口依附'));assert.equal(attachmentMenu.enabled,false);assert.deepEqual(attachmentMenu.submenu.slice(0,2).map(m=>m.label),['左侧电梯上行','右侧电梯上行']);
const commands=tray.menu.find(m=>m.label==='指令').submenu.find(m=>m.label==='移动指令').submenu[0].submenu;
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
tray.menu.find(m=>m.label==='指令').submenu.find(m=>m.label==='窗口依附').submenu.find(m=>m.label==='上沿坐姿').click();
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
ipcMain.emit('desktop:attachment-done',event,'special:attachment-sit-idle');
assert(!result.attachment.active.special,'拖动时延后待机特殊动作');
ipcMain.emit('desktop:drag-end',event,false);
assert(result.attachment.active.special,'释放后恢复待机特殊动作');
grabTop();
cursor={x:cursor.x,y:cursor.y+170};
ipcMain.emit('desktop:drag-end',event,false);
assert.equal(result.attachment.active,null);
assert.equal(attachments().at(-1)[1],null,'远处松手解除依附');
assert.equal(win.getBounds().width,243);
assert.notEqual(win.getBounds().x,1181,'保留松手附近位置');
console.log('PASS：上沿拖拽保持播放和尺寸、快照不抢位置、松手更新锚点、拖远退出。');
result.hide();assert.equal(timer,null);app.quit();assert.equal(tray.destroyed,true);assert.equal(ipcMain.listenerCount('desktop:hit'),0);assert(clears>0);
console.log('PASS：透明窗口参数、默认穿透、可信IPC与类型校验、人物命中、托盘工作/显隐/退出、隐藏停轮询、禁止外联/导航/权限。');

assert.equal(ipcMain.listenerCount('desktop:sound-change'),0);rmSync(profile,{recursive:true});
