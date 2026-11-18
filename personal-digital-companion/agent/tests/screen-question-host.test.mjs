import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {attachScreenQuestion,questionBounds} from '../../desktop/screen-question-host.mjs';
function fixture(){
  const ipcMain=new EventEmitter(),handlers=new Map();ipcMain.handle=(k,fn)=>handlers.set(k,fn);ipcMain.removeHandler=k=>handlers.delete(k);
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.bounds={x:600,y:500,width:240,height:360};this.visible=false;this.destroyed=false;this.sent=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{},send:(...args)=>this.sent.push(args),setWindowOpenHandler:fn=>this.popup=fn});}
    isDestroyed(){return this.destroyed;}getBounds(){return this.bounds;}setBounds(b){this.bounds=b;}show(){this.visible=true;}showInactive(){this.visible=true;}focus(){}hide(){this.visible=false;}destroy(){this.destroyed=true;this.emit('closed');}async loadFile(){}
  }
  const win=new Window(),screen={getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1280,height:900}})};
  return {win,handlers,ipcMain,electron:{BrowserWindow:Window,screen,ipcMain},event:panel=>({sender:panel.webContents,senderFrame:panel.webContents.mainFrame})};
}
test('QH01：头顶跟随及负坐标/边缘时仍在屏内，不改角色尺寸',()=>{
  for(const [pet,area]of [[{x:600,y:500,width:240,height:360},{x:0,y:0,width:1280,height:900}],[{x:-1700,y:0,width:240,height:360},{x:-1920,y:0,width:1920,height:1080}],[{x:1100,y:10,width:180,height:360},{x:0,y:0,width:1280,height:900}]]){
    const {bounds:b}=questionBounds(pet,area);assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width);assert.ok(b.y+b.height<=area.y+area.height);
  }
});
test('QH02：可信主frame才可提问；采集前隐藏，回执只发文本，关闭清理',async()=>{
  const f=fixture();let calls=0,forgot=0,host;
  const client={async captureAndAsk(q,{onState}){calls++;assert.equal(host.panel.visible,false);assert.equal(q,'问题');onState({state:'waiting',text:'正在看'});return {state:'answer',text:'答案'};},forget(){forgot++;}};
  host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',bundle:'unused',root:'unused',client});
  await host.open();const panel=host.panel,e=f.event(panel);
  assert.equal(panel.options.webPreferences.sandbox,true);assert.equal(panel.popup().action,'deny');
  assert.throws(()=>f.handlers.get('screen-qa:ask')({sender:panel.webContents,senderFrame:{}},'问题'),/仅问答/);
  assert.deepEqual(await f.handlers.get('screen-qa:ask')(e,'问题'),{state:'answer',text:'答案'});assert.equal(calls,1);assert.equal(panel.visible,true);
  assert.deepEqual(f.win.getBounds(),{x:600,y:500,width:240,height:360});
  host.close();await Promise.resolve();assert.equal(forgot,1);assert.equal(f.handlers.size,0);assert.equal(panel.destroyed,true);assert.equal(f.win.listenerCount('move'),0);
});
test('QH03：关闭取消在途，无迟到结果；重复提交不启动第二次采集',async()=>{
  const f=fixture();let release,started;const entered=new Promise(resolve=>started=resolve);
  const client={captureAndAsk(_q,{signal,onState}){started();return new Promise(resolve=>{release=()=>{assert.ok(signal.aborted);onState({state:'answer',text:'迟到'});resolve({state:'answer',text:'迟到'});};});},forget(){}};
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',bundle:'unused',root:'unused',client});await host.open();
  const panel=host.panel,event=f.event(panel),run=f.handlers.get('screen-qa:ask')(event,'问题');await entered;
  assert.equal((await f.handlers.get('screen-qa:ask')(event,'另一个')).code,'BUSY');
  host.hide();release();assert.equal((await run).code,'REQUEST_CANCELLED');assert.ok(!panel.sent.some(([,v])=>v.text==='迟到'));
  host.close();
});
