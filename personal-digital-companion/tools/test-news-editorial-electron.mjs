import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {attachNewsPanel} from '../desktop/news-panel-host.mjs';

const root=resolve(import.meta.dirname,'..'),bundle=join(root,'output/desktop-bundle');
const profile=mkdtempSync(join(tmpdir(),'feiyue-editorial-ui-'));
const at=Date.parse('2026-11-23T15:00:00+09:00'), day=86400000;
const first={id:'active',topic:'中国社会',at,timeKind:'报道时间',title:'沿海铁路北段恢复运行，南段继续整修',
  latest:'北段恢复运行，南段继续检修。',reportCount:20};
const second={...first,id:'quiet',at:at-3*day,title:'南部机场恢复国际航班'};
const reports=Array.from({length:20},(_,index)=>({title:'铁路复运报道 '+index,source:'来源 '+index,
  publishedAt:at,url:'https://example.org/rail/'+index}));
const ref={platform:'Reddit',at:null,title:'复运讨论',url:'https://www.reddit.com/r/trains/comments/abc/'};
let reads=0,opened,host;
class TestWindow extends electron.BrowserWindow {
  constructor(options){super({...options,x:-5000,y:0});}
  show(){this.showInactive();}
  focus(){}
}
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
await electron.app.whenReady();
let status=0;
try {
  host=attachNewsPanel({...electron,BrowserWindow:TestWindow,shell:{openExternal:async url=>{opened=url;}}},
    {root,bundle,checks:{
      newsFeed:()=>({at,from:at-6*day,pendingArchive:0,items:[first,second],
        boards:{'全部':{hot:[first.id,second.id],key:[],quiet:[second.id]}}}),
      newsEvent:id=>({...([first,second].find(row=>row.id===id)),reports,paragraphs:['北段已通过巡检。'],
        nodes:[{at,title:first.title,evidence:'北段已通过巡检。',timeKind:'报道时间',reports,excerpts:[]}]}),
      newsEditorialHistory:()=>{reads++;return [0,1].map(index=>({from:at-(3+index)*day,to:at-index*day,
        title:'铁路复运营运范围',summary:'讨论集中在仍未开放的区段。',refs:[ref],groups:['沿海铁路'],
        platforms:[{platform:'X',state:'ok',count:5,credits:1},{platform:'Reddit',state:'ok',count:0,unverified:1,credits:1}]}));}
    }});
  await host.open();
  const panel=host.panel,ui=script=>panel.webContents.executeJavaScript(script);
  async function wait(expression){
    for(let i=0;i<80;i++){
      if(await ui(expression))return;
      await new Promise(resolve=>setTimeout(resolve,60));
    }
    throw Error('等待界面超时 '+expression);
  }
  await wait("document.querySelector('[data-heatmap] [data-event=active]')?.offsetWidth>0");
  assert.equal(await ui("document.querySelector('#quiet-board').open"),false);
  assert.equal(await ui("document.querySelector('#quiet-list [data-event=quiet]').getBoundingClientRect().height"),0);
  await ui("document.querySelector('#quiet-board>summary').click()");
  assert.ok(await ui("document.querySelector('#quiet-list [data-event=quiet]').getBoundingClientRect().height>0"));
  await ui("document.querySelector('[data-event=active] button').click()");
  await wait("Boolean(document.querySelector('.news-wind'))");
  assert.equal(reads,0);
  await ui("document.querySelector('.news-wind>summary').click()");
  await wait("document.querySelectorAll('.wind-history>li').length===2");
  assert.deepEqual(await ui("[...document.querySelectorAll('.wind-history>li>details')].map(row=>row.open)"),[true,false]);
  await ui("document.querySelector('.wind-history a').click()");
  await wait("document.querySelector('.wind-history').innerText.includes('时间待核实')");
  assert.equal(opened,ref.url);
  await ui("document.querySelector('.source-links>summary').click()");
  await wait("document.querySelector('.source-links>ul').scrollHeight>document.querySelector('.source-links>ul').clientHeight");
  assert.deepEqual(await ui("[...document.querySelectorAll('.timeline')].map(row=>getComputedStyle(row).overflowY)"),['visible','visible']);
  console.log('PASS：开发版 Electron IPC 的主题折叠、热力图、风向历史与延迟读取、原帖、来源滚动');
} catch(error){console.error(error);status=1;}
finally {
  host?.close();
  try{rmSync(profile,{recursive:true,force:true,maxRetries:2});}
  catch(error){if(!['EPERM','EBUSY'].includes(error.code))throw error;}
  electron.app.exit(status);
}
