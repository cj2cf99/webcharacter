// 自绘右键菜单：真实 Electron 窗口渲染当前 menu-layout.json，核对展开、点击、勾选、Esc，并截浅深色图到 output/menu-qa/。
// 运行：node tools/build-desktop.mjs 后 electron tools/test-menu-popup-electron.mjs
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {menuTemplate} from '../desktop/menu-layout.mjs';
import {createMenuPopup} from '../desktop/menu-popup.mjs';

const root=resolve(import.meta.dirname,'..'),bundle=join(root,'output/desktop-bundle'),out=join(root,'output/menu-qa');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
electron.app.on('window-all-closed',()=>{});
async function until(check,message){for(let i=0;i<120;i++){if(await check())return;await wait(25);}throw Error(message);}

async function main(){
  await electron.app.whenReady();
  mkdirSync(out,{recursive:true});
  const layout=JSON.parse(readFileSync(join(root,'desktop/menu-layout.json'),'utf8'));
  const clicks=[];
  // 所有动作都给一个可点击桩；未读提醒、登录启动用真实形态（动态标签、勾选框）。
  const names=new Set();(function walk(list){for(const i of list)if(typeof i==='object'){if(i.action)names.add(i.action);if(i.items)walk(i.items);}})(layout);
  const actions=Object.fromEntries([...names].map(name=>[name,{click:()=>clicks.push(name)}]));
  actions.notices={label:'提醒（3 条未读）',click:()=>clicks.push('notices')};
  actions.visibility={label:'隐藏',click:()=>clicks.push('visibility')};
  actions.work={label:'开始工作',click:()=>clicks.push('work')};
  actions.attachment={label:'窗口依附'};
  actions.move={submenu:[{label:'右下角',click:()=>clicks.push('move')}]};
  actions.loginStart={id:'loginStart',type:'checkbox',checked:false,click:item=>clicks.push('login:'+item.checked)};
  actions.privateChat=false;actions.continueNag=false;
  const menu=electron.Menu.buildFromTemplate(menuTemplate(layout,actions));
  let opened=0,closed=0;
  menu.on('menu-will-show',()=>opened++);
  const popup=createMenuPopup(electron,{bundle,root,onClose:()=>closed++});
  const area=electron.screen.getPrimaryDisplay().workArea,anchor={x:area.x+area.width-40,y:area.y+area.height-10};
  const page=()=>electron.BrowserWindow.getAllWindows().find(w=>w.getTitle()==='绯月菜单');
  const js=code=>page().webContents.executeJavaScript(code);
  const open=async()=>{menu.emit('menu-will-show');await popup.show(menu,anchor);await until(()=>popup.open,'菜单未显示');await wait(500);};
  try{
    for(const theme of ['light','dark']){
      electron.nativeTheme.themeSource=theme;
      await open();
      const labels=await js("[...document.querySelectorAll('#items > .item .label')].map(n=>n.textContent)");
      assert.deepEqual(labels,['问绯月','提醒（3 条未读）','提醒检查 · 待执行','今日任务','三地天气','本地复盘','阅读与学习','任务','动画生成器','桌宠动作','设置与维护']);
      assert.equal(await js("document.querySelectorAll('.group[aria-expanded=true]').length"),0,'重开菜单时所有分组均应折叠');
      const before=page().getBounds();
      assert(before.y+before.height<=area.y+area.height&&before.x+before.width<=area.x+area.width,'菜单超出工作区');
      writeFileSync(join(out,'menu-'+theme+'.png'),(await page().webContents.capturePage()).toPNG());
      await js(`document.querySelector('.group[title="任务"]').click()`);
      const taskLabels=await js(`[...document.querySelector('.group[title="任务"]').nextElementSibling.children]
        .filter(item=>item.offsetParent&&item.matches('.item')).map(item=>item.title)`);
      assert.deepEqual(taskLabels.slice(0,2),['看绯月写日记','补写本机任务执行评价']);
      await until(async()=>page().getBounds().height>before.height,'展开分组后窗口未变高');
      const after=page().getBounds();
      assert(Math.abs(after.y+after.height-(before.y+before.height))<=2,'向上展开时底边应保持在原位');
      await wait(250);
      writeFileSync(join(out,'menu-expanded-'+theme+'.png'),(await page().webContents.capturePage()).toPNG());
      await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
      await until(()=>!popup.open,'Esc 未关闭菜单');
    }
    await open();
    await js(`document.querySelector('#items > button[title="提醒检查 · 待执行"]').click()`);
    await until(()=>clicks.includes('pendingCheck'),'一级提醒入口未执行待检查动作');
    await open();
    await js("[...document.querySelectorAll('.item')].find(b=>b.textContent.includes('今日任务')).click()");
    await until(()=>clicks.includes('today'),'点击未执行原菜单动作');
    assert.equal(popup.open,false);
    await open();
    await js("[...document.querySelectorAll('.group')].find(b=>b.textContent.includes('设置与维护')).click()");
    await js("[...document.querySelectorAll('.item')].find(b=>b.textContent.includes('登录 Windows')).click()");
    await until(()=>clicks.includes('login:true'),'勾选项未按原生方式切换');
    assert.equal(menu.getMenuItemById('loginStart').checked,true);
    await open();
    assert.equal(await js("[...document.querySelectorAll('.item')].find(b=>b.textContent.includes('登录 Windows')).getAttribute('aria-checked')"),'true');
    popup.hide();
    assert.equal(opened,closed,'每次打开都对应一次关闭');
    console.log('PASS：自绘菜单浅深色渲染、向上展开、分组展开保持底边、点击原动作、勾选切换、Esc 关闭。');
  }finally{popup.close();}
}
main().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
