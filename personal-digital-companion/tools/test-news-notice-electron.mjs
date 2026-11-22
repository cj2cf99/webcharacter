import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {createNewsBriefing} from '../desktop/news-briefing.mjs';
import {attachNewsPanel} from '../desktop/news-panel-host.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-news-notice-'));
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
await electron.app.whenReady();
const db=new DatabaseSync(':memory:');
const windows=()=>electron.BrowserWindow.getAllWindows();
const notice=()=>windows().find(w=>new URL(w.webContents.getURL()).pathname.endsWith('/news-notice.html'));
async function until(check,label,timeout=6000){
  const end=Date.now()+timeout;
  while(!await check()){if(Date.now()>=end)throw Error(label);await delay(45);}
}
let host,delivery,status=0,at=Date.now(),rows=[];
const news=createNewsBriefing(db,()=>at,items=>{assert(items.length,'新报道未产生事件');delivery=host.update(items);},
  async()=>({items:rows,failed:[]}),{archiveDir:join(profile,'archive')});
async function publish(title){
  at+=60000;
  rows=[{title,topic:'人工智能',publishedAt:at-1000,url:'https://example.org/'+at,source:'测试来源'}];
  assert.match(await news.poll(new AbortController().signal),/已收录 1 条/);
  await delivery;
}
try{
  function TestWindow(options){
    return new electron.BrowserWindow({...options,x:-5000,y:0});
  }
  host=attachNewsPanel({...electron,BrowserWindow:TestWindow},{root,bundle:join(root,'output/desktop-bundle'),
    checks:{newsFeed:news.feed,newsEvent:news.event,newsEditorialHistory:()=>[]}});
  await host.update([]);
  assert.equal(windows().length,0);
  await publish('第一条新闻');
  const replaced=notice();
  assert(replaced?.isVisible(),JSON.stringify(windows().map(w=>[w.getTitle(),w.webContents.getURL(),w.isVisible()])));assert(!replaced.isFocused());assert(!host.panel);
  await publish('第二条新闻');
  assert(replaced.isDestroyed());assert.equal(windows().length,1);
  const click=selector=>notice().webContents.executeJavaScript('setTimeout(()=>document.querySelector('+JSON.stringify(selector)+').click(),0);true');
  await click('#close');
  await until(()=>!notice(),'关闭无效');
  assert(!host.panel);
  await publish('沿海铁路通车');
  await click('#headline');
  await until(()=>host.panel?.isVisible(),'首次点击未打开新闻简报');
  const panel=host.panel;
  const contains=title=>panel.webContents.executeJavaScript('document.body.innerText.includes('+JSON.stringify(title)+')');
  await until(()=>contains('沿海铁路通车'),'没有显示新报道');
  panel.minimize();
  await until(()=>panel.isMinimized(),'测试窗口未最小化');
  await publish('港区公布航班安排');
  await click('#open');
  await until(()=>panel.isVisible()&&!panel.isMinimized()&&contains('港区公布航班安排'),'没有恢复并读取新增报道');
  assert.equal(host.panel,panel);assert.equal(windows().length,1);
  panel.destroy();
  await publish('自动收起测试');
  await until(()=>!notice(),'提醒超时未收起',18000);
  assert.equal(windows().length,0);
  console.log('PASS：新闻采集后非激活提醒、重复替换、关闭、点击首次打开、恢复原窗口并读取新增新闻、超时收起。');
}catch(error){console.error(error);status=1;}
finally{host?.close();db.close();electron.app.exit(status);}
