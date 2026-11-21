import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.argv[2],profile=mkdtempSync(join(tmpdir(),'feiyue-heartbeat-panel-'));
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
class HiddenWindow extends electron.BrowserWindow { show(){} focus(){} }

async function run(){
  const load=file=>import(pathToFileURL(join(root,'desktop',file)));
  const [{createDesktopTasks},{createReminderChecks},{attachPollSettings}]=await Promise.all([
    load('task-lifecycle.mjs'),load('reminder-checks.mjs'),load('poll-settings-host.mjs')]);
  await electron.app.whenReady();
  const tasks=await createDesktopTasks({profile,request:async(path,options)=>{
    assert.equal(path,'/api/assistant/heartbeat');assert.equal(options.method,'POST');
    return Response.json({status:'healthy',provider:'cloudflare'});
  }});
  const clock=Date.parse('2026-11-21T06:00:00Z');
  const checks=createReminderChecks({profile,now:()=>clock,isBusy:()=>false,
    changed:()=>host.update(),handlers:{aiHeartbeat:tasks.checkAiHeartbeat,diaryAudit:()=>{}}});
  const host=attachPollSettings({...electron,BrowserWindow:HiddenWindow},{root,bundle:join(root,'output','desktop-bundle'),checks});
  const js=source=>host.panel.webContents.executeJavaScript(source);
  async function until(condition){
    for(let attempt=0;attempt<60;attempt++){
      if(await js(condition))return;
      await new Promise(resolve=>setTimeout(resolve,35));
    }
    throw Error('轮询设定未满足条件：'+condition);
  }
  const row=()=>checks.polls().find(p=>p.id==='aiHeartbeat');
  try{
    checks.start();await host.open();
    await until(`document.querySelector('[data-poll=aiHeartbeat] .state')?.textContent.includes('11/21 18:00 JST')`);
    assert.equal(row().nextAt,clock+180*60_000);
    assert.deepEqual(await js(`(()=>{const f=document.querySelector('[data-poll=aiHeartbeat]');return [f.elements.minutes.valueAsNumber,f.elements.enabled.checked,Boolean(f.elements.maximum)];})()`),[180,true,false]);
    await js(`{const f=document.querySelector('[data-poll=aiHeartbeat]');f.elements.minutes.value=90;f.requestSubmit();}`);
    await until(`document.querySelector('[data-poll=aiHeartbeat] .state')?.textContent.includes('11/21 16:30 JST')`);
    await js(`{const f=document.querySelector('[data-poll=aiHeartbeat]');f.elements.enabled.checked=false;f.requestSubmit();}`);
    await until(`document.querySelector('[data-poll=aiHeartbeat] .state').textContent===''`);
    assert.equal(row().nextAt,null);
    host.panel.destroy();await host.open();
    await until(`document.querySelector('[data-poll=aiHeartbeat] input[name=minutes]')?.value==='90'`);
    assert.equal(await js(`document.querySelector('[data-poll=aiHeartbeat] input[name=enabled]').checked`),false);
    assert.equal(await js(`document.querySelector('[data-poll=diaryAudit] input[name=minutes]').value`),'60');
    assert.equal(await tasks.checkAiHeartbeat(),'接口正常 · cloudflare');
    console.log('PASS：正式基线资源载入、180 分钟、JST、即时改期、停用后重开、手记轮询保留及模拟心跳回执。');
  }finally{host.close();checks.close();await tasks.stop();}
}
run().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
