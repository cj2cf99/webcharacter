import * as electron from 'electron';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {getDeviceIdentity,parseDeviceBinding} from '../agent/devices/identity.mjs';
import {startDesktop} from '../desktop/shell.mjs';
import {createDesktopTasks} from '../desktop/task-lifecycle.mjs';

const argument=process.argv.find(value=>value.startsWith('--terminal-test-profile='));
if(!argument)throw Error('需要隔离测试目录');
const prefix='--terminal-test-profile=';
const profile=resolve(argument.slice(prefix.length));
assert.match(relative(tmpdir(),profile),/^feiyue-terminal-e2e-[A-Za-z0-9-]+$/);
electron.app.setPath('userData',profile);
const result=join(profile,'result.json'),phase=join(profile,'phase.json'),binding=join(profile,'binding.json');
const selected='pc-10000000-0000-4000-8000-000000000001';
setTimeout(()=>{
  writeFileSync(result,JSON.stringify({passed:false,error:'恢复及重启超时'}));
  electron.app.exit(1);
},15000).unref();

class HiddenWindow extends electron.BrowserWindow{
  constructor(options){
    super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});
  }
  show(){} showInactive(){} focus(){}
}

let menu;
class Tray{
  on(){}setToolTip(){}destroy(){}
  setContextMenu(value){menu=value;}
}

async function verify(){
  await electron.app.whenReady();
  if(existsSync(phase)){
    const {previous,processId}=JSON.parse(readFileSync(phase,'utf8'));
    assert.notEqual(process.pid,processId);
    assert.equal((await getDeviceIdentity(profile)).device_id,selected);
    assert.equal(parseDeviceBinding(readFileSync(join(profile,'device-identity.previous.json'),'utf8')),previous);
    writeFileSync(result,JSON.stringify({passed:true,restoredAfterRestart:true,backupVerified:true}));
    electron.app.exit(0);
    return;
  }
  const previous=(await getDeviceIdentity(profile)).device_id;
  writeFileSync(phase,JSON.stringify({previous,processId:process.pid}));
  writeFileSync(binding,JSON.stringify({device_id:selected}));
  const messages={close(){},async showMessageBox(options){
    assert.equal(options.title,'恢复本机任务终端 ID');
    assert.equal(options.detail,selected);
    assert.equal((await getDeviceIdentity(profile)).device_id,previous);
    return {response:1};
  }};
  const tasks=await createDesktopTasks({profile,request:null,dialog:messages});
  await startDesktop({...electron,BrowserWindow:HiddenWindow,Tray,dialog:{
    showOpenDialog:async()=>({canceled:false,filePaths:[binding]}),
  }},{profile,tasks,messageBoxes:messages,windowSource:()=>()=>{},
    localModel:{start(){},close(){}},
    weather:{snapshot:()=>({rows:[]}),close(){},refreshAll:async()=>{}},
  });
  let restore;
  for(let i=0;i<120&&!restore;i++){
    restore=menu?.items.find(item=>item.label==='任务')?.submenu?.items.find(item=>item.label==='恢复本机任务终端 ID');
    if(!restore)await delay(25);
  }
  assert.ok(restore);
  restore.click();
}

verify().catch(error=>{
  writeFileSync(result,JSON.stringify({passed:false,error:error.message}));
  electron.app.exit(1);
});
