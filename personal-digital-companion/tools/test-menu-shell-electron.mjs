// 正式入口同款 htmlMenu：角色右键与托盘右键都打开自绘菜单，点击后执行原菜单动作。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startDesktop} from '../desktop/shell.mjs';

const profile=mkdtempSync(join(tmpdir(),'feiyue-menu-shell-'));
electron.app.setPath('userData',profile);
const handlers={};
let nativeShown=0;
class TestTray{on(name,fn){handlers[name]=fn;} setToolTip(){} destroy(){} setContextMenu(){throw Error('自绘菜单模式不应设置原生托盘菜单');} popUpContextMenu(){nativeShown++;}}
const popup=()=>electron.BrowserWindow.getAllWindows().find(w=>w.getTitle()==='绯月菜单');
async function until(check,message){for(let i=0;i<200;i++){if(await check())return;await delay(25);}throw Error(message);}
async function test(){
  const shell=await startDesktop({...electron,Tray:TestTray},{profile,benchmark:true,htmlMenu:true,windowSource:()=>()=>{}});
  await until(()=>shell.win.isVisible(),'桌宠未完成启动显示'); // 启动显示完成后再测，避免与“显示/隐藏”抢状态
  shell.win.webContents.emit('context-menu');
  await until(()=>popup()?.isVisible(),'角色右键未打开自绘菜单');
  const labels=await popup().webContents.executeJavaScript("[...document.querySelectorAll('#items > .item .label')].map(n=>n.textContent)");
  assert.ok(labels.includes('今日任务')&&labels.includes('本地复盘')&&!labels.includes('退出')&&labels.includes('桌宠动作'),labels.join(','));
  await popup().webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  await until(()=>!popup().isVisible(),'Esc 未关闭');
  handlers['right-click']();
  await until(()=>popup()?.isVisible(),'托盘右键未打开自绘菜单');
  await popup().webContents.executeJavaScript(`document.querySelector('button[title="桌宠动作"]').click();
    const hide=document.querySelector('button[title="隐藏"]');if(!hide.offsetParent)throw Error('隐藏入口未展开');hide.click();`);
  await until(()=>!shell.win.isVisible(),'点击「隐藏」未执行');
  assert.equal(nativeShown,0,'不应退回原生菜单');
  console.log('PASS：角色与托盘右键打开自绘菜单，Esc 关闭，点击执行原动作。');
}
test().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
