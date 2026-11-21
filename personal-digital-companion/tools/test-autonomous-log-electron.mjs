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
  const viewer=attachConversationDetails(electron,{root,profile,bundle:join(root,'output/desktop-bundle'),visible:false,readTraffic:traffic.readPage});
  try{
    await viewer.open(null,'log');
    for(let i=0;i<100;i++){
      const text=await viewer.panel.webContents.executeJavaScript("document.querySelector('#turns').innerText");
      if(text.includes('保留未解状态')){
        for(const part of ['绯月自主行动','悬念跟进','核对篇号 1','开始','结束','1.3 秒','核对完成'])assert(text.includes(part),part);
        console.log('PASS 正式任务日志入口回读自主行动的分类、目标、开始、结束、耗时和父子结果。');
        return;
      }
      await delay(30);
    }
    throw Error('任务日志未显示自主行动结果');
  }finally{viewer.close();audit.close();db.close();}
}
run().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
