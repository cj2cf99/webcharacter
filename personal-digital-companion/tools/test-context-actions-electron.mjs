import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startDesktop} from '../desktop/shell.mjs';
import {createReminderChecks} from '../desktop/reminder-checks.mjs';

// 真实本地播放器和退出门禁，使用隔离的未读提醒和任务计数。
const profile=mkdtempSync(join(tmpdir(),'feiyue-actions-'));
electron.app.setPath('userData',profile);
const checks=createReminderChecks({profile});
checks.saveWeather({}, {title:'测试提醒',body:'测试'},Date.now());
checks.close();
class HiddenWindow extends electron.BrowserWindow{
  constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});}
  showInactive(){this.testVisible=true;}
  hide(){this.testVisible=false;}
  isVisible(){return Boolean(this.testVisible);}
}
class Tray{on(){} setContextMenu(){} setToolTip(){} destroy(){}}
let poll,quitAt,done=false;
const events=[];
electron.ipcMain.on('pc:runtime',(_e,row)=>events.push({resource:row.resource,at:Date.now()}));
const watchdog=setTimeout(()=>{console.error('动作验收超时',events.slice(-8));electron.app.exit(1);},50000);
electron.app.once('will-quit',event=>{
  if(!done||Date.now()-quitAt<5900){event.preventDefault();electron.app.exit(1);return;}
  clearTimeout(watchdog);console.log('PASS 真实退场结束后退出，耗时 '+(Date.now()-quitAt)+' ms');
});
async function test(){
  const shell=await startDesktop({...electron,BrowserWindow:HiddenWindow,Tray},{
    profile,benchmark:true,windowSource:()=>()=>{},setInterval:fn=>{poll=fn;return 1;},clearInterval:()=>{},
  });
  const waitFor=async(resource,after=0)=>{
    for(let i=0;i<180;i++){
      if(events.slice(after).some(r=>r.resource===resource))return;
      await delay(50);
    }
    throw Error('未见 '+resource+'，最近状态 '+JSON.stringify(events.slice(-5)));
  };
  await waitFor('startup');
  assert.equal(events[0].resource,'startup');
  await waitFor('reminder-idle');
  const startupMs=events.find(r=>r.resource==='reminder-idle').at-events[0].at;
  assert.ok(startupMs>=5900);
  console.log('PASS 启动首段挥手，随后响应已有未读提醒');
  const send=(channel,value)=>shell.win.webContents.send(channel,value);
  const canvasSize=()=>shell.win.webContents.executeJavaScript(`(()=>{
    const canvas=document.querySelector('#character'),rect=canvas.getBoundingClientRect();
    return [rect.x,rect.y,rect.width,rect.height,canvas.width,canvas.height];
  })()`);
  const fixed=await canvasSize(),home=shell.win.getBounds();
  const overlay=shell.thoughtOverlay;
  assert.equal(overlay.panel,null);
  const waitVisible=async()=>{
    for(let i=0;i<100&&!overlay.panel?.isVisible();i++)await delay(20);
    assert.ok(overlay.panel?.isVisible(),'进度窗已就绪');
  };
  async function cloudState(){
    assert.deepEqual(await canvasSize(),fixed,'角色画布及绘图像素尺寸固定');
    const pet=shell.win.getBounds(),bubble=overlay.panel.getBounds();
    assert.equal(pet.width,home.width);assert.equal(pet.height,home.height);
    assert.ok(bubble.y+bubble.height<=pet.y||bubble.x+bubble.width<=pet.x||
      bubble.x>=pet.x+pet.width||bubble.y>=pet.y+pet.height,'气泡与角色窗口分离');
    assert.equal(overlay.panel.isFocusable(),false);
    return overlay.panel.webContents.executeJavaScript(`(()=>{
      const cloud=document.querySelector('#thought'),bar=cloud.querySelector('progress'),summary=cloud.querySelector('small');
      return {text:cloud.innerText,counted:bar.hasAttribute('value'),barHidden:bar.hidden,
        timeHidden:cloud.querySelector('time').hidden,summaryFits:summary.scrollHeight===summary.clientHeight,
        clickThrough:getComputedStyle(cloud).pointerEvents==='none'};
    })()`);
  }
  async function display(value){
    overlay.set(value);await waitVisible();await delay(40);return cloudState();
  }
  const counted=await display({title:'补写执行评价',stage:'整理归档',done:2,total:5});
  assert.match(counted.text,/2\/5/);assert.ok(counted.counted&&counted.clickThrough);
  assert.ok(overlay.panel.getBounds().y+overlay.panel.getBounds().height<=home.y,'头顶有空间时优先在上方显示');
  const waiting=await display({title:'检查天气',stage:'正在查询'});
  assert.match(waiting.text,/正在查询/);assert.equal(waiting.counted,false);
  const goal=await display({title:'闲时 · 核对手记',goal:'我想核对近七天的手记，找出待确认的疑点'});
  assert.match(goal.text,/我想核对近七天的手记，找出待确认的疑点/);
  assert.ok(goal.summaryFits&&goal.timeHidden&&!goal.barHidden);
  const outcome=await display({title:'闲时 · 核对手记',stage:'近七天手记没有新的关键疑点',durationMs:12500});
  assert.match(outcome.text,/近七天手记没有新的关键疑点\s+用时 12\.5 秒/);
  assert.ok(outcome.summaryFits&&outcome.clickThrough&&outcome.barHidden&&!outcome.timeHidden);
  const formal=await display({title:'正式 · 处理任务',stage:'步骤',done:1,total:2});
  assert.ok(formal.counted&&formal.timeHidden&&!formal.barHidden);
  assert.deepEqual(shell.win.getBounds(),home,'内容切换期间角色保持原位');
  const area=electron.screen.getDisplayMatching(home).workArea;
  shell.win.setBounds({...home,x:area.x,y:area.y});await delay(100);await cloudState();
  assert.ok(overlay.panel.getBounds().x>=shell.win.getBounds().x+home.width,'左上角移到角色右侧');
  shell.win.setBounds(home);await delay(100);
  shell.hide();assert.equal(overlay.panel,null);
  shell.show();await waitVisible();assert.match((await cloudState()).text,/1\/2/);
  overlay.set(null);assert.equal(overlay.panel,null);assert.deepEqual(await canvasSize(),fixed);
  overlay.set({title:'正在打开',stage:'等待'});overlay.set(null);await delay(80);
  assert.equal(overlay.panel,null,'打开过程中取消也能收起');
  console.log('PASS 进度、等待、目的、耗时、边缘避让、快速收起、重新显示；角色画布与窗口全程固定',fixed);
  send('desktop:idle-context','diary-review-idle');
  await waitFor('diary-review-idle');
  let start=events.length;
  send('desktop:idle-context','');
  await waitFor('idle',start);
  for(const [draw,expected] of [[0.1,'idle-special-2'],[0.9,'special']]){
    await shell.win.webContents.executeJavaScript('Math.random=()=>'+draw+';true');
    start=events.length;
    send('desktop:idle-special',true);await waitFor(expected,start);
    send('desktop:idle-context','diary-review-idle');await waitFor('diary-review-idle',start);
    send('desktop:idle-context','');await waitFor('idle',start);
  }
  send('desktop:action',{kind:'praise-idle'});await waitFor('praise-idle');
  shell.tasks.activeCount=()=>1;poll();
  await waitFor('workIn');
  start=events.length;
  send('desktop:action',{kind:'praise-idle'});
  send('desktop:action',{kind:'chat-registration'});await waitFor('chat-registration',start);
  assert.ok(!events.slice(start).some(row=>row.resource==='praise-idle'),'工作时跳过夸奖');
  shell.tasks.activeCount=()=>0;poll();
  await waitFor('idle',start);
  console.log('PASS 两个普通随机候选、写作、任务工作、仅闲置夸奖、聊天登记与恢复待机');
  shell.hide();quitAt=Date.now();
  electron.app.quit();electron.app.quit();
  await waitFor('farewell');
  assert.equal(shell.win.isVisible(),true);
  done=true;
}
test().catch(error=>{console.error(error);electron.app.exit(1);});
