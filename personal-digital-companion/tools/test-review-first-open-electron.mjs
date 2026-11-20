import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

// 在隐藏启动的独立 Electron 中运行。可用正式安装树及其单文件候选复测。
const root=resolve(process.argv[2]??join(import.meta.dirname,'..'));
const moduleURL=name=>pathToFileURL(join(root,'desktop',name)).href;
const candidate=process.argv[3];
if(candidate){
  registerHooks({load(url,context,next){
    if(url===moduleURL('conversation-details.mjs')){
      return {format:'module',source:readFileSync(candidate,'utf8'),shortCircuit:true};
    }
    return next(url,context);
  }});
}
const profile=mkdtempSync(join(tmpdir(),'feiyue-review-first-'));
electron.app.setPath('userData',profile);
let menu;
class TestTray{
  on(){} setToolTip(){} destroy(){}
  setContextMenu(value){menu=value;}
}
async function test(){
  const {startDesktop}=await import(moduleURL('shell.mjs'));
  const {createMemoryArchive}=await import(moduleURL('memory-archive.mjs'));
  const memory=createMemoryArchive(join(profile,'memory'));
  let finishRead,reads=0;
  const records=new Promise(resolve=>{finishRead=resolve;});
  memory.readTasks=()=>{reads++;return records;};
  const host=await startDesktop({...electron,Tray:TestTray},{profile,memory,benchmark:true,windowSource:()=>()=>{}});
  const tasks=menu.items.find(item=>item.label==='任务');
  tasks.submenu.items.find(item=>item.label==='本地复盘').click();
  for(let i=0;i<200&&!(reads&&host.screenQuestion.details?.isVisible());i++)await delay(25);
  const panel=host.screenQuestion.details;
  assert.equal(reads,1,'首次点击应恰好读取一次');
  assert.ok(panel?.isVisible(),'首次点击应在记录读完前显示窗口');
  finishRead([]);
  const taskSelected=()=>panel.webContents.executeJavaScript("document.querySelector('#tasks').getAttribute('aria-pressed')==='true'");
  for(let i=0;i<100&&!(await taskSelected());i++)await delay(20);
  assert.ok(await taskSelected(),'记录返回后应显示任务标签');
  assert.equal(reads,1);
  assert.equal(panel.isMinimized(),false);
  console.log('PASS：冷启动后点击任务菜单一次，原生复盘窗口即已可见，任务页读取一次。');
}
const timeout=setTimeout(()=>{console.error('冷启动复盘测试超时');electron.app.exit(2);},25000);
test().then(()=>{clearTimeout(timeout);electron.app.exit(0);},error=>{console.error(error);electron.app.exit(1);});
