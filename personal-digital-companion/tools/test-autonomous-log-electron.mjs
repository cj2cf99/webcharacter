import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {createAutonomousAudit} from '../desktop/autonomous-audit.mjs';
import {createTaskTrafficLog} from '../desktop/task-traffic-log.mjs';
import {attachConversationDetails} from '../desktop/conversation-details.mjs';
import {createReminderChecks} from '../desktop/reminder-checks.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'fy-action-log-'));
electron.app.setPath('userData',profile);
async function run(){
  await electron.app.whenReady();
  const db=new DatabaseSync(':memory:');
  let at=Date.now();
  const traffic=createTaskTrafficLog(profile,{clock:()=>at}),audit=createAutonomousAudit(db,traffic.write,()=>at);
  const action=audit.begin('写日记','核对手记');
  await action.step('悬念跟进','核对篇号 1',async()=>{at+=1250;return '保留未解状态';});
  action.finish('已检查','核对完成');
  const checks=createReminderChecks({profile,now:()=>at,handlers:{diaryAudit:()=>null}});
  checks.enqueue('diaryAudit');
  checks.record('到期事项','待执行','本地任务占用',at);
  checks.record('手记质问','已暂停','已保存 72 步，下批从原进度继续',at);
  checks.record('修订手记与唠叨','已检查','本轮没有符合条件的修订',at);
  audit.begin('手记质问','核对近七天手记').finish('已暂停','已保存 72 步，下批从原进度继续');
  const viewer=attachConversationDetails(electron,{root,profile,bundle:join(root,'output/desktop-bundle'),visible:false,readTraffic:traffic.readPage,checks});
  async function waitFor(needle){
    for(let i=0;i<100;i++){
      const text=await viewer.panel.webContents.executeJavaScript("document.querySelector('#turns').innerText");
      if(text.includes(needle))return text;
      await delay(30);
    }
    throw Error('本地复盘未显示 '+needle);
  }
  try{
    await viewer.open(null,'checks');
    const reminders=await waitFor('当时已推迟');
    assert.match(reminders,/到期事项/);
    assert.doesNotMatch(reminders,/手记质问|修订手记与唠叨|已保存 72 步/);
    await viewer.open(null,'log');
    const text=await waitFor('保留未解状态');
    for(const part of ['当前自主行动','手记质问 · 等待空闲','绯月自主行动','悬念跟进','核对篇号 1','开始','结束','1.3 秒','核对完成','本批完成','已保存 72 步'])
      assert(text.includes(part),part);
    assert.doesNotMatch(text,/已暂停/);
    console.log('PASS 本地复盘将手记回执显示在自主行动，旧分批记录标为本批完成。');
  }finally{viewer.close();checks.close();audit.close();db.close();}
}
run().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
