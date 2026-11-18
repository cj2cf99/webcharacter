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
let win,tray,network,permission,timer=null,clears=0;
let cursor={x:1200,y:600};
const screen=new EventEmitter();screen.getPrimaryDisplay=()=>({workArea:{x:0,y:0,width:1440,height:900}});screen.getCursorScreenPoint=()=>cursor;screen.getDisplayNearestPoint=screen.getPrimaryDisplay;
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
  {profile,setInterval:fn=>{timer=fn;return 1},clearInterval:()=>{timer=null;clears++}});
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
result.hide();assert.equal(timer,null);app.quit();assert.equal(tray.destroyed,true);assert.equal(ipcMain.listenerCount('desktop:hit'),0);assert(clears>0);
console.log('PASS：透明窗口参数、默认穿透、可信IPC与类型校验、人物命中、托盘工作/显隐/退出、隐藏停轮询、禁止外联/导航/权限。');

assert.equal(ipcMain.listenerCount('desktop:sound-change'),0);rmSync(profile,{recursive:true});
