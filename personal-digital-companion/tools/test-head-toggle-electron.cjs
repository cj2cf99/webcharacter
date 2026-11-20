const electron=require('electron');
const fs=require('node:fs'),{join,resolve}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(join(tmpdir(),'feiyue-head-toggle-')),root=resolve(__dirname,'..'),bundle=join(root,'output/desktop-bundle');
electron.app.setPath('userData',profile);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<140;i++){if(await fn())return;await delay(35);}throw Error(label);}
class Window extends electron.BrowserWindow{
 constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});}
 show(){this.testVisible=true;} showInactive(){this.testVisible=true;} focus(){} isVisible(){return !!this.testVisible;}
}
let menu,started=false,aborted=false;
class Tray{on(){} destroy(){} setToolTip(){} setContextMenu(v){menu=v;}}
const tasks={startup:async()=>{},activeCount:()=>0,beginQuitCheck(){},stop:async()=>{}};
const client={forget(){},async askText(text,{signal}){started=true;return await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve({state:'error',text:'对话已取消'});},{once:true}));}};
async function run(){
 const {startDesktop}=await import(require('node:url').pathToFileURL(join(root,'desktop/shell.mjs')).href);
 const shell=await startDesktop({...electron,BrowserWindow:Window,Tray},{profile,bundle,tasks,benchmark:true,windowSource:()=>()=>{},screenQuestionClient:client,weather:{snapshot:()=>({rows:[]}),refreshAll:async()=>{},close(){}}});
 const wc=shell.win.webContents;
 await until(()=>shell.getStats().ready,'桌宠未就绪');
 const {width:w,height:h}=await wc.executeJavaScript("({width:innerWidth,height:innerHeight})");
 wc.debugger.attach('1.3');const mouse=(type,u,v,more={})=>wc.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:Math.round(w*u),y:Math.round(h*v),...more});
 const tap=async(u,v,dx=0)=>{await mouse('mousePressed',u,v,{button:'left',buttons:1,clickCount:1});if(dx)await mouse('mouseMoved',u+dx,v,{button:'left',buttons:1});await mouse('mouseReleased',u+dx,v,{button:'left',buttons:0,clickCount:1});await delay(110);};
 const ready=()=>until(()=>shell.screenQuestion.panel?.webContents.executeJavaScript("!!document.querySelector('#question')").catch(()=>false),'未打开气泡');
 await tap(.50,.23);await ready();
 const first=shell.screenQuestion.panel;
 await first.webContents.executeJavaScript("document.querySelector('#question').value='应放弃的草稿';");
 await tap(.50,.23);assert.equal(shell.screenQuestion.panel,null);
 await tap(.02,.02);assert.equal(shell.screenQuestion.panel,null);
 await tap(.50,.23,.10);assert.equal(shell.screenQuestion.panel,null);
 await tap(.50,.53);assert.equal(shell.screenQuestion.panel,null);
 menu.items.find(i=>i.label==='问绯月').click();await ready();
 const panel=shell.screenQuestion.panel;
 assert.equal(await panel.webContents.executeJavaScript("document.querySelector('#question').value"),'');
 await panel.webContents.executeJavaScript("document.querySelector('#question').value='测试普通问答';document.querySelector('#questionForm').requestSubmit();");
 await until(()=>started,'问答未发起');await tap(.50,.23);
 assert.equal(shell.screenQuestion.panel,null);await until(()=>aborted,'未取消请求');
 await tap(.50,.23);await ready();assert.notEqual(panel,shell.screenQuestion.panel);
 console.log('PASS: head open, discard draft, transparent and body hits, drag suppression, menu-open toggle, abort in-flight, reopen');
}
run().then(()=>electron.app.exit(0),e=>{console.error(e.stack);electron.app.exit(1);});
