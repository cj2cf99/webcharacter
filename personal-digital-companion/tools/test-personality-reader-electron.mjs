import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const url=new URL(process.argv.at(-1));
if(url.hostname!=='127.0.0.1')throw Error('仅支持本机隔离验收');
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-reader-')));
async function test(){
  await electron.app.whenReady();
  const w=new electron.BrowserWindow({width:1280,height:850,show:false,webPreferences:{sandbox:true,contextIsolation:true}});
  const js=code=>w.webContents.executeJavaScript(code);
  const requests=[];
  w.webContents.session.webRequest.onBeforeRequest((d,cb)=>{requests.push(new URL(d.url).pathname);cb({});});
  async function wait(code){for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,35));}throw Error(code);}
  for(const width of [1280,390]){
    w.setContentSize(width,850);
    await w.loadURL(url.href);
    await wait("document.querySelectorAll('.entry').length===2");
    assert(!requests.some(p=>/memory\/diaries\/2026/.test(p)),'首屏只加载索引');
    await js("document.querySelector('#nagTab').click()");
    await wait("document.querySelector('.entry')?.innerText.includes('消费')");
    for(const i of [0,1]){
      await js("document.querySelectorAll('.entry')["+i+"].click()");
      await wait("document.querySelector('#article button')?.innerText.includes('原记录')");
      await js("document.querySelector('#article button').click()");
      await wait(i===0?"document.querySelector('#originBody').innerText.includes('P-BOOK')":"document.querySelector('.thread-focus')?.innerText.includes('已解')");
      await js("document.querySelector('#returnOrigin').click()");
      assert(await js("document.querySelector('#reader').open && !document.querySelector('#origin').open"));
      await js("document.querySelector('#reader button').click()");
    }
    await js("document.querySelector('.theme-toggle').click()");
    assert(await js("document.documentElement.scrollWidth<=innerWidth"));
    requests.length=0;
  }
  w.destroy();console.log('PASS 桌面及手机，两种主题，索引懒读、两类原记录及返回念叨。');
}
test().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
