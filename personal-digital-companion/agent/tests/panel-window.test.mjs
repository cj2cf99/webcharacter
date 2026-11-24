import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPanelWindow,showPanel} from '../../desktop/panel-window.mjs';

function fakeWindow(){
  const calls=[];
  const panel=Object.assign(new EventEmitter(),{
    visible:false,destroyed:false,
    show(){calls.push('show');this.visible=true;},showInactive(){calls.push('showInactive');this.visible=true;},
    hide(){calls.push('hide');this.visible=false;this.emit('hide');},
    isVisible(){return this.visible;},isDestroyed(){return this.destroyed;},
    moveTop(){calls.push('moveTop');},webContents:{invalidate(){calls.push('invalidate');}},
  });
  return {panel,calls};
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('首帧前显示的面板在 ready-to-show 后补一次显示、抬顶并强制重绘',async()=>{
  const {panel,calls}=fakeWindow();
  const created=createPanelWindow({BrowserWindow:function(){return panel;}},{frame:false},'unused');
  assert.equal(created,panel);
  showPanel(panel);
  assert.deepEqual(calls,['show','moveTop']);
  panel.emit('ready-to-show');
  await wait(20);
  assert.ok(calls.includes('invalidate'));
  assert.ok(calls.filter(c=>c==='moveTop').length>=2);
});

test('已绘制的面板只抬顶；显示后又被隐藏时不会被补显示',async()=>{
  const {panel,calls}=fakeWindow();
  createPanelWindow({BrowserWindow:function(){return panel;}},{frame:false},'unused');
  panel.emit('ready-to-show');
  showPanel(panel);
  panel.hide();
  calls.length=0;
  await wait(450);
  assert.ok(!calls.includes('show'));assert.equal(panel.visible,false);
});

test('面板在补显示窗口期内被销毁不会抛错',async()=>{
  const {panel}=fakeWindow();
  createPanelWindow({BrowserWindow:function(){return panel;}},{frame:false},'unused');
  showPanel(panel);
  panel.destroyed=true;
  await wait(450);
});
