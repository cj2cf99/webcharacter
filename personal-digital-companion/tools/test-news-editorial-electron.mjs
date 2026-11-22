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
  latest:'北段恢复运行，南段继续检修。',reportCount:90};
const second={...first,id:'quiet',at:at-3*day,title:'南部机场恢复国际航班'};
const tech={...first,id:'tech',topic:'机器人',title:'新款机器人开始产线验证',reportCount:5};
const market={...first,id:'market',topic:'美国股市',title:'芯片股继续承压',reportCount:3};
const extra={...market,id:'extra',title:'交易所公布本周成交数据',reportCount:1};
const items=[first,second,tech,market,extra];
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
      newsFeed:()=>({at,from:at-6*day,pendingArchive:0,items,
        boards:{'全部':{hot:[first.id,second.id],key:[tech.id,market.id],quiet:[second.id]},
          '社会':{hot:[first.id,second.id],key:[],quiet:[second.id]}}}),
      newsEvent:id=>({...items.find(row=>row.id===id),reports,paragraphs:['北段已通过巡检。'],
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
  const measure=()=>ui(`(()=>{
    const board=document.querySelector('#digest-columns'),box=board.getBoundingClientRect();
    const rects=[...board.querySelectorAll('.event')].map(tile=>{
      const r=tile.getBoundingClientRect();
      const title=tile.querySelector('.event-title');
      return {share:r.width*r.height/(box.width*box.height),
        inside:r.left>=box.left-.1&&r.top>=box.top-.1&&r.right<=box.right+.1&&r.bottom<=box.bottom+.1,
        readable:title.getBoundingClientRect().height>0};
    });
    return {width:box.width,rects};
  })()`);
  async function checkShares(expected){
    for(let attempt=0;attempt<50;attempt++){
      const value=await measure();
      if(value.rects.length===expected.length&&value.rects.every((tile,index)=>
        tile.inside&&tile.readable&&Math.abs(tile.share-expected[index])<.001))return value.width;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.fail(JSON.stringify(await measure()));
  }
  const large=await checkShares([.5,.3125,.1875]);
  await wait("!document.querySelector('#more-events').hidden");
  assert.equal(await ui("document.querySelector('#event-list').getBoundingClientRect().height"),0);
  await ui("document.querySelector('#filters button:nth-child(2)').click()");
  await checkShares([.5]);
  await ui("document.querySelector('#filters button:first-child').click()");
  await checkShares([.5,.3125,.1875]);
  await wait("document.querySelector('[data-heatmap] [data-event=active]')?.offsetWidth>0");
  assert.equal(await ui("document.querySelector('#quiet-board').open"),false);
  assert.equal(await ui("document.querySelector('#quiet-list [data-event=quiet]').getBoundingClientRect().height"),0);
  assert.ok(await ui("document.querySelector('#quiet-board').getBoundingClientRect().height<60"));
  await ui("document.querySelector('#quiet-board>summary').click()");
  assert.ok(await ui("document.querySelector('#quiet-list [data-event=quiet]').getBoundingClientRect().height>0"));
  await ui("document.querySelector('#quiet-board>summary').click()");
  await ui("document.querySelector('#more-events').click()");
  await wait("document.querySelector('#event-list [data-event=extra]')?.getBoundingClientRect().height>0");
  await ui("document.querySelector('[data-event=active] button').click()");
  assert.ok(await checkShares([.5,.3125,.1875])<large);
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
  panel.setSize(390,660);
  await wait("innerWidth<700 && document.querySelector('.overview').inert");
  await checkShares([.5,.3125,.1875]);
  await host.update();
  await wait("document.querySelector('#refresh').hasAttribute('data-pending')");
  assert.ok(await ui(`(()=>{
    const button=document.querySelector('#refresh');
    return button.getBoundingClientRect().height<=30 && button.scrollHeight<=button.clientHeight &&
      button.textContent==='↻' && button.title==='读取新增新闻';
  })()`));
  await ui("document.querySelector('#refresh').click()");
  await wait("!document.querySelector('#refresh').disabled && !document.querySelector('#refresh').hasAttribute('data-pending')");
  await ui("document.querySelector('#close-detail').click()");
  await checkShares([.5,.3125,.1875]);
  panel.setSize(980,720);
  await wait('innerWidth>=900');
  assert.ok(Math.abs(await checkShares([.5,.3125,.1875])-large)<2);
  console.log('PASS：热力图重排与 50% 上限、断更和更多折叠状态、窄窗刷新提示、风向 IPC 与来源滚动');
} catch(error){console.error(error);status=1;}
finally {
  host?.close();
  try{rmSync(profile,{recursive:true,force:true,maxRetries:2});}
  catch(error){if(!['EPERM','EBUSY'].includes(error.code))throw error;}
  electron.app.exit(status);
}
