import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

// 每个进程只测一个入口，避免第二次打开复用已可见的窗口。
const [target,source,mode,base]=process.argv.slice(2);
const root=resolve(base??join(import.meta.dirname,'..'));
const cases={
  poll:['设置与维护','轮询设定','poll-settings.html'],
  inbox:['任务','绯月任务管理','task-inbox.html'],
  settings:['设置与维护','动画与声音','settings.html'],
  question:['','问绯月','screen-question.html'],
  message:['设置与维护','云端连接','message-box.html'],
  menu:['','','menu.html'],
};
const [group,label,page]=cases[target];
const profile=mkdtempSync(join(tmpdir(),'feiyue-first-popup-'));
electron.app.setPath('userData',profile);
const tray={};
class TestTray{
  on(name,callback){tray[name]=callback;}
  setToolTip(){} destroy(){}
}
const preload={
  poll:'poll-settings-preload.cjs',inbox:'task-inbox-preload.cjs',settings:'preload.cjs',
  question:'screen-question-preload.cjs',message:'message-box-preload.cjs',menu:'menu-preload.cjs',
};
let created=0,loads=0,shows=0,window;
function TestWindow(options){
  const match=target==='settings'?options.title==='绯月设置 · 本地 PC':options.webPreferences?.preload?.endsWith(preload[target]);
  const createdWindow=new electron.BrowserWindow(match&&mode==='drop-first'?{...options,show:false}:options);
  if(match){
    window=createdWindow;created++;
    window.webContents.on('did-finish-load',()=>loads++);
    const show=window.show.bind(window);
    if(mode==='drop-all')window.showInactive=()=>{};
    window.show=()=>{
      shows++;
      if(mode==='drop-all'||(mode==='drop-first'&&shows===1))return;
      show();
    };
  }
  return createdWindow;
}
TestWindow.getFocusedWindow=()=>electron.BrowserWindow.getFocusedWindow();
async function until(check,message){
  const end=Date.now()+5000;
  while(!await check()){if(Date.now()>=end)throw Error(message+" visible="+window?.isVisible()+" focused="+window?.isFocused()+" minimized="+window?.isMinimized());await delay(20);}
}
async function run(){
  const {startDesktop}=await import(pathToFileURL(join(root,'desktop/shell.mjs')).href);
  let fallbackCount=0;
  const dialog=mode==='drop-all'?{...electron.dialog,showMessageBox:async options=>{
    assert.equal(options.title,'绯月连接测试');
    fallbackCount++;
    return {response:options.cancelId};
  }}:electron.dialog;
  const shell=await startDesktop({...electron,dialog,BrowserWindow:TestWindow,Tray:TestTray},{profile,benchmark:true,htmlMenu:true,windowSource:()=>()=>{}});
  await until(()=>shell.win.isVisible(),'角色启动超时');
  if(source==='tray')tray['right-click']();else shell.win.webContents.emit('context-menu');
  const menu=()=>electron.BrowserWindow.getAllWindows().find(w=>w.getTitle()==='绯月菜单');
  await until(()=>menu()?.isVisible(),'第一次右键后菜单仍隐藏');
  if(target!=='menu'){
    const click=async name=>menu().webContents.executeJavaScript(
      '(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.title==='+JSON.stringify(name)+'&&b.offsetParent);if(!b)return false;b.click();return true;})()');
    if(group)assert.ok(await click(group),group);
    assert.ok(await click(label),label);
  }
  if(mode==='drop-all'){
    assert.equal(target,'message');
    await delay(8100);
    await until(()=>fallbackCount===1,'自绘确认框隐藏后未回退到系统对话框');
    assert.ok(window.isDestroyed());assert.equal(shows,2);
    console.log('PASS 确认框两次显示均失败后已移除，原系统对话框回退一次');
    return;
  }
  await until(()=>loads&&window.isVisible()&&!window.isMinimized()&&window.isFocused(),'首击后窗口未显示或未获得焦点');
  assert.ok(window.webContents.getURL().endsWith('/'+page));
  assert.equal(created,1);assert.equal(loads,1);
  if(mode==='drop-first')assert.equal(shows,2,'首次显示被吞后，同一次点击应完成补显');
  console.log('PASS',target,source,mode,{created,loads,shows});
}
run().then(()=>electron.app.exit(0),e=>{console.error(target,source,mode,{created,loads,shows},e);electron.app.exit(1);});
