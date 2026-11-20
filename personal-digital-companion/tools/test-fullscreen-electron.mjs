import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {initialBounds,startDesktop} from '../desktop/shell.mjs';
import {displayPosition,displaySize} from '../desktop/movement.mjs';

// 真实显示器、DPI 和原生窗口。只模拟其他应用的窗口快照，避免占用用户的屏幕。
async function verify(){
  const profile=mkdtempSync(join(tmpdir(),'feiyue-fullscreen-'));
  electron.app.setPath('userData',profile);
  let snapshot;
  class HiddenPet extends electron.BrowserWindow {
    showInactive(){}
  }
  class Tray {on(){} setToolTip(){} setContextMenu(){} destroy(){}}
  const {win}=await startDesktop({...electron,BrowserWindow:HiddenPet,Tray},{profile,benchmark:true,
    windowSource:({onSnapshot})=>{snapshot=onSnapshot;return ()=>{};},
    tasks:{startup:async()=>{}},weather:{snapshot:()=>({rows:[]}),close(){},refreshAll:async()=>{}}});
  const displays=electron.screen.getAllDisplays(),primary=electron.screen.getPrimaryDisplay();
  const windows=displays.map(d=>({id:String(d.id),...electron.screen.dipToScreenRect(null,d.bounds),minimized:false,eligible:true}));
  async function check(display,area){
    const home=initialBounds(area,initialBounds(primary.workArea).height);
    const space={...display,workArea:area},size=displaySize(space,home);
    const expected={...displayPosition(home,space,size),...size};
    for(let i=0;i<50;i++){
      const actual=win.getBounds();
      if(Object.keys(expected).every(key=>Math.abs(expected[key]-actual[key])<=1))return;
      await sleep(20);
    }
    assert.deepEqual(win.getBounds(),expected,'原生窗口停靠坐标');
  }
  snapshot({foreground:null,windows});
  await check(primary,primary.bounds);
  for(const display of displays){
    snapshot({foreground:null,windows:windows.filter(w=>w.id!==String(display.id))});
    await check(display,display.workArea);
    snapshot({foreground:null,windows});
    await check(primary,primary.bounds);
  }
  assert.equal(win.isVisible(),false);
  console.log('PASS：'+displays.length+' 块真实显示器的原生窗口定位，逐屏释放与全屏主屏停靠均通过。');
}
verify().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
