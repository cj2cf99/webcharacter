// 正式入口同款 htmlMenu：角色右键与托盘右键都打开自绘菜单，点击后执行原菜单动作。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
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
  const theme=process.argv.includes('--dark')?'dark':'light';
  electron.nativeTheme.themeSource=theme;
  const shell=await startDesktop({...electron,Tray:TestTray},{profile,benchmark:true,htmlMenu:true,windowSource:()=>()=>{}});
  await until(()=>shell.win.isVisible(),'桌宠未完成启动显示'); // 启动显示完成后再测，避免与“显示/隐藏”抢状态
  shell.win.webContents.emit('context-menu');
  await until(()=>popup()?.isVisible(),'角色右键未打开自绘菜单');
  const readLabels=()=>popup().webContents.executeJavaScript("[...document.querySelectorAll('#items > .item .label')].map(n=>n.textContent)");
  await until(async()=>(await readLabels()).includes('桌宠动作'),'角色右键菜单未渲染');
  const labels=await readLabels();
  assert.ok(labels.includes('今日任务')&&labels.includes('本地复盘')&&!labels.includes('退出')&&labels.includes('桌宠动作'),labels.join(','));
  await popup().webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  await until(()=>!popup().isVisible(),'Esc 未关闭');
  handlers['right-click']();
  await until(()=>popup()?.isVisible(),'托盘右键未打开自绘菜单');
  const expandActions=`document.querySelector('button[title="桌宠动作"]').click();`;
  await popup().webContents.executeJavaScript(expandActions);
  const roamButton='button[title="随机移动"][role="menuitemcheckbox"]';
  const roamChecked=()=>popup().webContents.executeJavaScript(`document.querySelector('${roamButton}')?.getAttribute('aria-checked')`);
  assert.equal(await roamChecked(),'true');
  await popup().webContents.executeJavaScript(`document.querySelector('${roamButton}').click()`);
  await until(()=>!popup().isVisible(),'随机移动选择后收起菜单');
  await until(()=>JSON.parse(readFileSync(join(profile,'pc-behavior-settings.json'),'utf8')).config.randomMovement===false,'随机移动未保存为关闭');
  shell.win.webContents.emit('context-menu');
  await until(()=>popup()?.isVisible(),'角色右键未重新打开自绘菜单');
  await popup().webContents.executeJavaScript(expandActions);
  assert.equal(await roamChecked(),'false','从另一入口重新打开菜单仍显示关闭');
  if(process.argv.includes('--capture')){
    await until(()=>popup().webContents.executeJavaScript(`(() => {
      const item=document.querySelector('${roamButton}');
      const rect=item.getBoundingClientRect();
      return rect.height>0&&rect.bottom<=innerHeight;
    })()`),'展开后的随机移动开关未完整显示');
    await delay(200); // 等待菜单展开动效结束，再截图。
    const image=await popup().webContents.capturePage();
    const out=join(import.meta.dirname,'../output/menu-qa');
    mkdirSync(out,{recursive:true});
    const file=join(out,'random-movement-'+theme+'.png');
    writeFileSync(file,image.toPNG());
    console.log(file);
  }
  await popup().webContents.executeJavaScript(`const hide=document.querySelector('button[title="隐藏"]');
    if(!hide.offsetParent)throw Error('隐藏入口未展开');hide.click();`);
  await until(()=>!shell.win.isVisible(),'点击「隐藏」未执行');
  assert.equal(nativeShown,0,'不应退回原生菜单');
  console.log('PASS：角色与托盘右键打开自绘菜单，随机移动勾选状态一致，Esc 关闭，点击执行原动作。');
}
test().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
