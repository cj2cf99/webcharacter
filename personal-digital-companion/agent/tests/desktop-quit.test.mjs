import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startDesktop} from '../../desktop/shell.mjs';
const tick=()=>new Promise(setImmediate);
test('L02：真实shell确认前不清理，取消保留，重复合并，关闭与隐藏路径',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'quit-shell-'));
  let win,tray,answer,dialogOptions,dialogs=0,active=1,stops=0,gates=0,cancels=0,quits=0,relaunches=0;
  const app=new EventEmitter();Object.assign(app,{requestSingleInstanceLock:()=>true,setName(){},setPath(){},whenReady:async()=>{},
    quit(){quits++;const e={preventDefault(){this.prevented=true;}};this.emit('before-quit',e);if(!e.prevented)this.emit('will-quit');return e;},
    relaunch(){relaunches++;}});
  class Window extends EventEmitter{
    constructor(options){super();win=this;this.options=options;this.visible=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{},setWindowOpenHandler(){},send(){}});}
    setIgnoreMouseEvents(){}isDestroyed(){return false;}isVisible(){return this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}
    async loadFile(){}getBounds(){return this.options;}setBounds(){}
  }
  class Tray {constructor(){tray=this;}setToolTip(){}setContextMenu(menu){this.menu=menu;}on(){}destroy(){this.destroyed=true;}}
  const screen=new EventEmitter();screen.getPrimaryDisplay=()=>({workArea:{x:0,y:0,width:1000,height:800}});
  const ipcMain=new EventEmitter();ipcMain.handle=()=>{};ipcMain.removeHandler=()=>{};
  const tasks={activeCount:()=>active,beginQuitCheck(){gates++;},cancelQuitCheck(){cancels++;},async stop(){stops++;},async startup(){},async retryPending(){}};
  const electron={app,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:x=>x},nativeImage:{createFromPath(){}},screen,ipcMain,
    session:{defaultSession:{webRequest:{onBeforeRequest(){}},setPermissionRequestHandler(){}}},
    dialog:{showMessageBox(options){dialogs++;dialogOptions=options;return new Promise(resolve=>{answer=resolve;});}}};
  try{
    const shell=await startDesktop(electron,{profile,tasks});shell.show();shell.hide();assert.equal(dialogs,0);assert.equal(stops,0);
    assert.equal(app.quit().prevented,true);assert.equal(dialogs,1);assert.ok(!tray.destroyed);assert.ok(ipcMain.listenerCount('desktop:hit'));
    app.quit();assert.equal(dialogs,1);answer({response:0});await tick();assert.equal(cancels,1);assert.ok(!tray.destroyed);
    const restart=tray.menu.find(item=>item.label==='重启绯月').click;
    restart();restart();
    assert.deepEqual(dialogOptions.buttons,['取消重启','确认重启']);
    assert.equal(dialogs,2);assert.equal(relaunches,0);assert.equal(stops,0);
    answer({response:0});await tick();
    assert.equal(cancels,2);assert.ok(!tray.destroyed);
    let closePrevented=false;win.emit('close',{preventDefault(){closePrevented=true;}});assert.ok(closePrevented);assert.equal(dialogs,3);
    assert.deepEqual(dialogOptions.buttons,['取消退出','确认退出']);
    active=0;answer({response:1});await tick();assert.equal(stops,1);assert.ok(tray.destroyed);assert.equal(ipcMain.listenerCount('desktop:hit'),0);
    assert.equal(gates,3);assert.equal(relaunches,0);assert.ok(quits>=5);
  }finally{rmSync(profile,{recursive:true});}
});
