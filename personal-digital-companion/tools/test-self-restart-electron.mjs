import * as electron from 'electron';
import assert from 'node:assert/strict';
import {appendFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startDesktop} from '../desktop/shell.mjs';
import {createDesktopTasks} from '../desktop/task-lifecycle.mjs';
import {createConversationHistory,tokyoDay} from '../desktop/conversation-history.mjs';

// 两个真实 Electron 进程使用同一临时 profile。所有任务及天气均用隔离数据。
const marker=process.argv.find(arg=>arg.startsWith('--restart-test-profile='));
if(!marker)throw Error('请传入 --restart-test-profile=<临时目录/feiyue-restart-唯一编号>');
const profile=resolve(marker.slice('--restart-test-profile='.length));
if(!profile.startsWith(join(tmpdir(),'feiyue-restart-')))throw Error('测试仅使用临时 profile');
const trace=join(profile,'test-events.jsonl'),second=existsSync(trace);
const note=event=>appendFileSync(trace,JSON.stringify({pid:process.pid,event})+'\n');
const events=()=>readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse);
electron.app.setPath('userData',profile);
async function until(fn,label){for(let i=0;i<200;i++){if(await fn())return;await delay(25);}throw Error(label);}
let acknowledge, thirdConfirmed=false;
const firstResponse=new Promise(resolve=>acknowledge=resolve);
let answerQuery;
const queryResponse=new Promise(resolve=>answerQuery=resolve);
const rows=[1,2,3].map(id=>({id,title:'测试 '+id,identity:'r'+id,version:'v1',deadline:'2026-11-20'}));
async function request(path,options){
  if(path==='/api/reminder-review')return Response.json({items:rows,today:'2026-11-20',tomorrow:'2026-11-21'});
  const id=Number(path.split('/').at(-1));
  if([1,2,3].includes(id)){
    if(options.method==='POST'){note('send-'+id);if(id===1)await firstResponse;return Response.json({ok:true});}
    if(id===3&&!thirdConfirmed){note('unknown-3');return Response.json({}, {status:503});}
    note('confirmed-'+id);return Response.json({identity:'r'+id,finished:true});
  }
  return Response.json({});
}
const windows=[];
class HiddenWindow extends electron.BrowserWindow{
  constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});
    windows.push(this);}
  show(){} showInactive(){} focus(){}
}
let menu;
class Tray{on(){}setContextMenu(value){menu=value;}setToolTip(){}destroy(){}}
async function test(){
  note('start');
  const tasks=await createDesktopTasks({profile,request,dialog:{showMessageBox:async o=>{throw Error(o.message);}}});
  const shell=await startDesktop({...electron,BrowserWindow:HiddenWindow,Tray},{profile,tasks,windowSource:()=>()=>{},
    localModel:{start(){},close(){},analyze:async()=>({kind:'external',reply:''})},
    weather:{snapshot:()=>({rows:[]}),close(){},refreshAll:async()=>{}},screenQuestionClient:{
      async askText(question,{signal}){
        assert.equal(question,'测试查询');
        note('query-sent');
        await queryResponse;
        signal.throwIfAborted();
        note('query-replied');
        return {state:'answer',text:'隔离查询已完成'};
      },forget(){}}});
  if(second){
    await until(()=>events().some(e=>e.event==='confirmed-2'),'重启后未恢复第二条任务');
    const history=events(),firstPid=history[0].pid;
    assert.notEqual(firstPid,process.pid);
    assert.deepEqual(history.filter(e=>e.event.startsWith('send-')).map(e=>[e.event,e.pid]),[['send-3',firstPid],['send-1',firstPid],['send-2',process.pid]]);
    assert.ok(history.findIndex(e=>e.event==='confirmed-1')<history.findIndex(e=>e.pid===process.pid));
    assert.ok(history.findIndex(e=>e.event==='confirmed-3')<history.findIndex(e=>e.pid===process.pid));
    assert.deepEqual(history.filter(e=>e.event.startsWith('query-')).map(e=>[e.event,e.pid]),[['query-sent',firstPid],['query-replied',firstPid]]);
    const records=createConversationHistory(profile,electron.safeStorage);
    try{
      const turns=await records.read(tokyoDay(Date.now()));
      assert.ok(turns.some(turn=>turn.question==='测试查询'&&turn.state==='answer'&&turn.text==='隔离查询已完成'));
    }finally{records.close();}
    await until(()=>JSON.parse(readFileSync(join(profile,'restart-work.json'),'utf8')).length===0,'续办记录未结清');
    writeFileSync(join(profile,'test-pass'),'PASS：对话重启先确认，菜单重启直接等待回执及查询，续办任务在新进程执行一次。');
    electron.app.exit(0);return;
  }
  await shell.screenQuestion.open();
  const wc=shell.screenQuestion.panel.webContents;
  await until(()=>wc.executeJavaScript("typeof document.querySelector('#questionForm').onsubmit==='function'"),'输入区未就绪');
  async function ask(){await wc.executeJavaScript("document.querySelector('#question').value='去重启下';document.querySelector('#questionForm').requestSubmit();");}
  async function choose(label){
    let box;
    await until(async()=>{
      box=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/message-box.html'));
      return box&&await box.webContents.executeJavaScript("document.querySelector('#actions')?.children.length===2");
    },'未弹出确认窗口').catch(async error=>{
      console.error('测试气泡状态',await wc.executeJavaScript("document.querySelector('#answer').textContent"),
        windows.filter(w=>!w.isDestroyed()).map(w=>w.getTitle()));throw error;
    });
    assert.equal(await box.webContents.executeJavaScript('document.activeElement.textContent'),'取消');
    await box.webContents.executeJavaScript(`[...document.querySelectorAll('#actions button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  }
  await ask();await choose('取消');
  await until(()=>wc.executeJavaScript("document.querySelector('#answer').textContent.includes('已取消')"),'取消未生效');
  await tasks.reminderReview.load();
  const unknown=await tasks.reminderReview.apply([{id:3,action:'complete'}]);
  assert.equal(unknown.results[0].result,'unknown');
  await ask();await choose('确认重启');
  await until(()=>wc.executeJavaScript("document.querySelector('#reply').dataset.state==='error' && document.querySelector('#answer').textContent.includes('未确认')"),'回执未确认时没有保留当前进程');
  assert.equal(events().filter(e=>e.event==='unknown-3').length,2);
  thirdConfirmed=true;
  await tasks.reminderReview.load();
  const batch=tasks.reminderReview.apply([1,2].map(id=>({id,action:'complete'})));
  await until(()=>events().some(e=>e.event==='send-1'),'未发送第一条任务');
  await wc.executeJavaScript("document.querySelector('#question').value='测试查询';document.querySelector('#questionForm').requestSubmit();");
  await until(()=>events().some(e=>e.event==='query-sent'),'未发送查询');
  const beforeMenu=windows.length;
  menu.items.find(i=>i.label==='设置与维护').submenu.items.find(i=>i.label==='重启绯月').click();
  assert.equal(events().some(e=>e.event==='send-2'),false);
  acknowledge();
  const result=await batch;
  assert.deepEqual(result.results.map(r=>r.result),['completed','not_run']);
  assert.equal(windows.length,beforeMenu,'从菜单确认后直接收尾，不再建确认窗');
  shell.screenQuestion.hide();
  await delay(150);
  assert.equal(events().filter(e=>e.event==='start').length,1);
  answerQuery();
}
const timeout=setTimeout(()=>{writeFileSync(join(profile,'test-fail'),'隔离重启测试超时');electron.app.exit(1);},20000);
timeout.unref();
test().catch(error=>{writeFileSync(join(profile,'test-fail'),String(error.stack));console.error(error);electron.app.exit(1);});
