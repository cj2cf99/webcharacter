import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';

const page=new URL(process.argv[2]);
assert.equal(page.hostname,'127.0.0.1');
const temp=resolve(tmpdir());
const profile=await mkdtemp(join(temp,'feiyue-chains-chrome-'));
assert.match(relative(temp,profile),/^feiyue-chains-chrome-[A-Za-z0-9]+$/);
const exe='C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(exe,['--headless','--disable-gpu','--no-proxy-server','--no-first-run',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
  {windowsHide:true,stdio:'ignore'});
let ws;
try {
  let port;
  for(let i=0;i<100&&!port;i++){
    try {port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];}
    catch {await sleep(40);}
  }
  assert.match(port,/^\d+$/);
  const base='http://127.0.0.1:'+port;
  const tabs=await (await fetch(base+'/json/list')).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await once(ws,'open');
  let id=0;
  const pending=new Map();
  ws.addEventListener('message',({data})=>{
    const message=JSON.parse(data);
    const callback=pending.get(message.id);
    if(callback){pending.delete(message.id);callback(message);}
  });
  const command=(method,params={})=>new Promise((done,reject)=>{
    const next=++id;
    const timer=setTimeout(()=>{pending.delete(next);reject(Error(method+' timed out'));},4000);
    pending.set(next,response=>{
      clearTimeout(timer);
      if(response.error)reject(Error(response.error.message));
      else done(response.result);
    });
    ws.send(JSON.stringify({id:next,method,params}));
  });
  const js=async expression=>(await command('Runtime.evaluate',{expression,returnByValue:true})).result?.value;
  for(const width of [1250,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:780,deviceScaleFactor:1,mobile:width<500});
    await command('Page.navigate',{url:page.href});
    const wait=async expression=>{
      for(let i=0;i<70;i++){if(await js(expression))return;await sleep(40);}
      throw Error('Timed out '+expression+' '+await js('location.href'));
    };
    await wait("document.querySelector('#companion-chains details') != null");
    assert.equal(await js("document.querySelectorAll('#companion-chains li').length"),0);
    await js("document.querySelector('#companion-chains details').open=true");
    await wait("document.querySelectorAll('#companion-chains li').length===6");
    const previous=await js('document.documentElement.dataset.theme');
    await js("document.querySelector('.theme-toggle').click()");
    await wait('document.documentElement.dataset.theme!=='+JSON.stringify(previous));
    assert.equal(await js('document.documentElement.scrollWidth <= document.documentElement.clientWidth+1'),true);
  }
  console.log('PASS: Chrome desktop/mobile, shared themes, details fetched on expansion.');
} finally {
  ws?.close();
  if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
  await rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
