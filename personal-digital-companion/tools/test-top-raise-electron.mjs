// 真实 Electron：桌宠显示期间持续抬顶；透明面板首帧前被显示后仍能画出内容。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startDesktop} from '../desktop/shell.mjs';
import {createPanelWindow,showPanel} from '../desktop/panel-window.mjs';

const profile=mkdtempSync(join(tmpdir(),'feiyue-top-raise-'));
electron.app.setPath('userData',profile);
class TestTray{on(){}setToolTip(){}destroy(){}setContextMenu(){}popUpContextMenu(){}}
async function run(){
  // 1. 抬顶：显示后每秒一次，隐藏后停止。
  const shell=await startDesktop({...electron,Tray:TestTray},{profile,benchmark:true,htmlMenu:true,windowSource:()=>()=>{}});
  for(let i=0;i<200&&!shell.win.isVisible();i++)await delay(25);
  assert.ok(shell.win.isVisible(),'桌宠未显示');
  assert.equal(shell.win.isAlwaysOnTop(),true);
  let raised=0;const original=shell.win.moveTop.bind(shell.win);
  shell.win.moveTop=()=>{raised++;original();};
  await delay(2600);
  assert.ok(raised>=2,'显示期间应持续抬顶，实际 '+raised);
  shell.hide();raised=0;await delay(1600);
  assert.equal(raised,0,'隐藏后不应继续抬顶');
  // 2. 首帧前显示的透明无边框面板，补显示后必须画出非透明像素。
  const file=join(profile,'panel.html');
  writeFileSync(file,'<body style="margin:0;background:#c33"><h1 style="color:#fff">绯月</h1></body>');
  const panel=createPanelWindow(electron,{width:200,height:120,show:false,frame:false,transparent:true,alwaysOnTop:true,
    webPreferences:{sandbox:true,contextIsolation:true}},'unused');
  await panel.loadFile(file);
  showPanel(panel);
  await delay(900);
  assert.ok(panel.isVisible());
  const image=await panel.webContents.capturePage();
  const bitmap=image.toBitmap();
  let opaque=0;for(let i=3;i<bitmap.length;i+=4)if(bitmap[i]>0)opaque++;
  assert.ok(opaque>1000,'面板内容未画出，不透明像素 '+opaque);
  panel.destroy();
  console.log('PASS 抬顶按秒持续并随隐藏停止；首帧前显示的透明面板已画出',{opaque});
}
run().then(()=>electron.app.exit(0),e=>{console.error(e);electron.app.exit(1);});
