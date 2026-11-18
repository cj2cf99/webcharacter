import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startDesktop} from '../desktop/shell.mjs';

class HiddenWindow extends electron.BrowserWindow {
  constructor(options) {
    super({...options, show:false, webPreferences:{...options.webPreferences, backgroundThrottling:false}});
  }
  showInactive() {}
}

let desktopMenu;
class HiddenTray {
  setContextMenu(menu){desktopMenu=menu;}
  setToolTip(){}
  on(){}
  destroy(){}
}
const item=(menu,label)=>menu.items.find(item=>item.label===label);
async function run() {
  const profile=mkdtempSync(join(tmpdir(),'pet-elevator-test-'));
  electron.app.setPath('userData',profile);
  await electron.app.whenReady();
  const area=electron.screen.getPrimaryDisplay().workArea;
  const target={id:'fixture',eligible:true,minimized:false,maximized:true,
    ...electron.screen.dipToScreenRect(null,{x:area.x,y:area.y,width:area.width,height:area.height})};
  const other={...target,id:'other',maximized:false,
    ...electron.screen.dipToScreenRect(null,{x:area.x+50,y:area.y+100,width:500,height:500})};
  const tasks={startup:async()=>{},retryPending:async()=>{},beginQuitCheck(){},activeCount:()=>0,stop:async()=>{}};
  const rig=await startDesktop({...electron,BrowserWindow:HiddenWindow,Tray:HiddenTray},{
    tasks,profile,bundle:resolve('output/desktop-bundle'),
    windowSource({onSnapshot}) {
      const timer=setInterval(()=>onSnapshot({foreground:target.id,windows:[target,other]}),50);
      return ()=>clearInterval(timer);
    }
  });
  const wait=async (condition, message)=>{
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){
      if(await condition())return;
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    throw Error(message);
  };
  const runtime=()=>rig.win.webContents.executeJavaScript('window.desktopHost.getRuntime()');
  const loaded=asset=>wait(async()=> (await runtime())?.resource===asset,'未播放 '+asset);
  await wait(()=>rig.getStats().ready&&rig.attachment.history.length,'桌宠未就绪');
  const attachmentMenu=()=>item(item(desktopMenu,'指令').submenu,'窗口依附').submenu;
  rig.pcSettings.open();
  const panel=rig.pcSettings.panel;
  const evaluate=code=>panel.webContents.executeJavaScript(code);
  await wait(()=>evaluate("document.querySelector('#states')?.textContent.includes('窗口互动')"),'窗口节点列表未显示');
  assert.equal(await evaluate("document.querySelectorAll('#states .state').length"),14);
  const chooseNode=label=>evaluate(`[...document.querySelectorAll('#states button')].find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`);
  await chooseNode('电梯上行');
  assert.equal(await evaluate("document.querySelectorAll('#phases .phase').length"),3);
  await chooseNode('上沿坐姿');
  await evaluate(`(()=>{
    const animation=document.querySelector('#phases select');
    animation.value='attachment-sit';
    animation.dispatchEvent(new Event('change'));
    const volume=document.querySelector('#phases input[type=range]');
    volume.value='62';
    volume.dispatchEvent(new Event('input'));
    document.querySelector('#save').click();
  })()`);
  await wait(()=>{
    const node=rig.pcSettings.store.snapshot().config.states.windowSit;
    return node.slots.single==='attachment-sit'&&node.sound.single.volume===62;
  },'窗口节点的动画或声音未保存');
  await evaluate("document.querySelector('#effectPlay').click()");
  await wait(()=>evaluate("document.querySelector('#effectStatus').textContent==='单段'"),'窗口节点预览未加载');
  await evaluate("document.querySelector('#effectStop').click()");
  assert.equal(panel.isVisible(),false);
  item(attachmentMenu(),'右侧电梯上行').click();
  assert.equal(rig.attachment.active?.id,target.id,JSON.stringify({area,windows:rig.attachment.snapshot.windows,history:rig.attachment.history}));
  assert.equal(rig.attachment.active.side,'inside');
  assert.equal(rig.win.isVisible(),false);
  await loaded('elevator-enter');
  const start=rig.win.getBounds();
  await loaded('elevator-run');
  await wait(()=>rig.win.getBounds().y<start.y-15,'运行中未上移');
  await loaded('elevator-exit');
  assert(rig.win.getBounds().y<start.y-70,'退出时应已抵达上方');
  await loaded('attachment-lie-idle');
  assert.equal(rig.attachment.active?.id,target.id,JSON.stringify({area,windows:rig.attachment.snapshot.windows,history:rig.attachment.history}));
  const lie=rig.win.getBounds();
  item(attachmentMenu(),'上沿坐姿').click();
  await loaded('attachment-lie-to-sit');
  await loaded('attachment-sit');
  assert.equal((await runtime()).state,'windowSit');
  assert.equal(rig.win.getBounds().y,lie.y);
  assert.equal(rig.attachment.active?.id,target.id,JSON.stringify({area,windows:rig.attachment.snapshot.windows,history:rig.attachment.history}));
  assert.equal(rig.win.isVisible(),false);
  console.log('PASS: 隐藏 Electron 真实播放进入、运行、离开；最大化前台窗口运行上移，落在同窗顶部横卧，再切换到节点设置中实际选择的坐姿；隐藏设置窗口验证动画、音量保存与预览。');
  electron.app.quit();
}

run().catch(error=>{console.error(error);electron.app.exit(1);});
