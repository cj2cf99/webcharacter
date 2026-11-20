import * as electron from 'electron';
import assert from 'node:assert/strict';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync,writeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startDesktop} from '../desktop/shell.mjs';
import {prepareDesktopPages} from '../desktop/source-updates.mjs';
import {createTaskTrafficLog} from '../desktop/task-traffic-log.mjs';
import {warnLiveUpdate} from '../desktop/live-files.mjs';

const root=resolve(import.meta.dirname,'..'),source=mkdtempSync(join(tmpdir(),'feiyue-live-'));
const profile=join(source,'profile'),desktop=join(source,'desktop'),bundle=join(source,'bundle');
const voice=join(source,'assets/voice');
for(const dir of [profile,desktop,bundle,voice])mkdirSync(dir,{recursive:true});
electron.app.setPath('userData',profile);
const menuFile=join(desktop,'menu-layout.json');
copyFileSync(join(root,'desktop/menu-layout.json'),menuFile);
prepareDesktopPages(root,bundle);
for(const name of ['clip-catalog.json','baseline.png','local-clips.js','tray.png']){
  copyFileSync(join(root,'output/desktop-bundle',name),join(bundle,name));
}
for(const scale of ['clips','clips-compact']){
  for(const dir of [join(bundle,scale),join(source,'assets/desktop-media',scale)])mkdirSync(dir,{recursive:true});
  copyFileSync(join(root,'assets/desktop-media',scale,'hover-parts.webm'),join(bundle,scale,'idle-basic.webm'));
}
const replace=(file,text)=>{writeFileSync(file+'.tmp',text);renameSync(file+'.tmp',file);};
async function until(check,message){
  for(let i=0;i<100;i++){if(await check())return;await delay(50);}
  throw Error(message);
}
let nativeMenu,popup,startCount=0,stopCount=0,tip='';
const traffic=createTaskTrafficLog(profile);
const tasks={traffic,startup:async()=>{startCount++;},activeCount:()=>1,beginQuitCheck(){},stop:async()=>{stopCount++;}};
// 不加入用户的托盘或显示窗口；菜单、窗口、IPC、页面脚本均用真实 Electron。
class HiddenWindow extends electron.BrowserWindow{
  constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});}
  show(){} showInactive(){} focus(){}
}
class TestTray{
  on(){} destroy(){} setToolTip(text){tip=text;}
  setContextMenu(menu){nativeMenu=menu;} popUpContextMenu(){popup=nativeMenu;}
}
async function run(){
  if(process.argv.includes('--closed-stderr')){
    assert.throws(()=>writeSync(2,'pipe probe\n'));
    warnLiveUpdate('工具输出测试',Error('启动终端已关闭'));
  }
  const shell=await startDesktop({...electron,BrowserWindow:HiddenWindow,Tray:TestTray},{
    profile,bundle,sourceRoot:source,menuFile,tasks,windowSource:()=>()=>{},
    weather:{snapshot:()=>({rows:[],busy:false}),refreshAll:async()=>{},close(){}},
  });
  const wc=shell.win.webContents,winId=shell.win.id,initialBounds=shell.win.getBounds();
  await until(()=>shell.getStats().ready,'角色未就绪');
  await wc.executeJavaScript(`window.decodedUpdate=false;const loadMedia=HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load=function(){
      if(this.src.includes('idle-basic.webm?v='))this.addEventListener('loadeddata',()=>{window.decodedUpdate=this.videoWidth>0;},{once:true});
      return loadMedia.call(this);
    };void 0;`);
  for(const scale of ['clips','clips-compact']){
    copyFileSync(join(root,'assets/desktop-media',scale,'click.webm'),join(source,'assets/desktop-media',scale,'idle-basic.webm'));
  }
  await until(()=>wc.executeJavaScript('window.decodedUpdate'),'循环边界未解码替换动画');
  const layout=[{label:'生活',items:[{action:'weather',label:'实时天气'}]},{action:'quit',label:'退出'}];
  replace(menuFile,JSON.stringify(layout));
  await until(()=>nativeMenu.items[0].label==='生活','菜单未监听到原子替换');
  wc.emit('context-menu');
  assert.equal(popup,nativeMenu);
  popup.items[0].submenu.items[0].click();
  await until(()=>shell.weather.panel?.webContents.getURL().endsWith('/weather.html'),'改名后的天气入口失效');
  const good=nativeMenu;replace(menuFile,'[{"action":"unknown","label":"坏项"}]');
  await until(async()=>(await traffic.readPage()).lines.map(line=>JSON.parse(line)).some(row=>
    row.route==='绯月热加载'&&row.error==='菜单动作不存在：unknown'&&row.files.includes('menu-layout.json')),'任务日志缺少原始菜单错误或文件名');
  assert.equal(nativeMenu,good);
  replace(menuFile,JSON.stringify([...layout].reverse()));
  await until(()=>nativeMenu.items[0].label==='退出','菜单修正后未恢复');
  assert.deepEqual(shell.win.getBounds(),initialBounds);
  const configFile=shell.pcSettings.store.file,value=JSON.parse(readFileSync(configFile));
  value.config.master.volume=31;replace(configFile,JSON.stringify(value));
  await until(()=>shell.pcSettings.store.snapshot().config.master.volume===31,'外部设置未应用');
  replace(configFile,'{');await delay(350);assert.equal(shell.pcSettings.store.snapshot().config.master.volume,31);
  value.config.confineToScreen=true;replace(configFile,JSON.stringify(value));
  await until(()=>shell.pcSettings.store.snapshot().config.confineToScreen,'配置修正后未恢复');
  shell.pcSettings.open();const panel=shell.pcSettings.panel.webContents;
  await until(()=>panel.executeJavaScript("!!document.querySelector('#states button')"),'设置页未就绪');
  await panel.executeJavaScript("document.querySelector('#force').click()");
  replace(join(desktop,'settings.css'),readFileSync(join(root,'desktop/settings.css'),'utf8')+'\n:root{--live-check:applied}');
  await until(()=>panel.executeJavaScript("getComputedStyle(document.documentElement).getPropertyValue('--live-check')==='applied'"),'未原位更新样式');
  const settings=readFileSync(join(root,'desktop/settings.html'),'utf8');
  replace(join(desktop,'settings.html'),settings.replace('<title>','<title>热加载标记 '));
  await until(()=>panel.executeJavaScript("document.querySelector('#toast').textContent.includes('界面有更新')"),'未保留待保存草稿');
  assert(!(await panel.getTitle()).includes('热加载标记'));
  await panel.executeJavaScript("document.querySelector('#save').click()");
  await until(()=>panel.getTitle().includes('热加载标记'),'保存后未加载新页面');
  const index=readFileSync(join(root,'desktop/index.html'),'utf8');
  replace(join(desktop,'index.html'),index.replace('<title>','<title>角色热更新 '));
  await until(()=>wc.getTitle().includes('角色热更新'),'角色页面未刷新');
  assert.equal(shell.win.id,winId);assert.deepEqual(shell.win.getBounds(),initialBounds);
  const soundFile='nodes-20261118/greeting-dear.wav';
  mkdirSync(join(voice,'nodes-20261118'));copyFileSync(join(root,'assets/voice',soundFile),join(voice,soundFile));
  await until(()=>wc.executeJavaScript("window.desktopHost.getSettings().then(s=>s.assets.some(a=>a.id==='voice:greeting-dear'&&a.url.includes('?v=')))"),'新素材未送到角色');
  assert.deepEqual(readFileSync(join(voice,soundFile)),readFileSync(join(bundle,'voice',soundFile)));
  replace(join(desktop,'main.mjs'),'// 后台代码变更');await until(()=>tip.includes('后台代码'),'后台更新未提示');
  assert.equal(startCount,1);assert.equal(stopCount,0);
  console.log('PASS 隔离 Electron：原生菜单改组和动作、双入口、坏文件恢复、外部 PC 设置、草稿保存后更新、角色同窗刷新、媒体版本、后台重启提示。');
}
run().then(()=>electron.app.exit(0),error=>{console.log(error.stack??error);electron.app.exit(1);});
