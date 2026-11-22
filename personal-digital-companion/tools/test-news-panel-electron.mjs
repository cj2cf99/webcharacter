// 验证正式报面经 IPC 读取隔离 SQLite，不使用用户资料或外部新闻接口。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {attachNewsPanel,translateNews} from '../desktop/news-panel-host.mjs';
import {createNewsBriefing} from '../desktop/news-briefing.mjs';

const root=resolve(import.meta.dirname,'..'),bundle=join(root,'output/desktop-bundle');
const out=process.env.FEIYUE_NEWS_QA_OUTPUT||join(root,'output/news-panel-qa');
const profile=mkdtempSync(join(tmpdir(),'feiyue-weekly-panel-'));
const archive=join(profile,'news-archive');
const stamp=value=>Date.parse('2026-'+value+':00+09:00');
const row=(id,title,published,topic,excerpt,source='地区快报')=>({
  title,topic,excerpt,source,publishedAt:stamp(published),url:'https://example.org/news/'+id
});
const rail1=row('stop','沿海铁路因暴雨停运','11-17T08:00','日本社会','沿线低洼区域积水，运营方暂停载客并设置接驳巴士。检修人员开始检查受影响的轨道。');
const rail2=row('north','沿海铁路北段恢复运行','11-19T09:00','日本社会','北段完成巡检后恢复载客，南段继续检修。接驳巴士继续运行。');
const rail3=row('full','沿海铁路全线恢复通车','11-21T09:00','日本社会','南段完成巡检后全线恢复载客。运营方公布周末增开两班，接驳巴士逐步退出临时接驳安排。');
const railCopy={...rail3,url:'https://example.org/news/full-copy',source:'地方交通报',publishedAt:stamp('11-21T10:00')};
const english=row('model','Open model runs offline on rescue robots','11-19T12:00','大模型','The team tested an open model offline. The test covered 12 simulated scenes.','技术周刊');
const image=electron.nativeImage.createFromBuffer(readFileSync(join(root,'tools/news-fixtures/spot-nasa-jpl.jpg')));
const photoUrl='https://example.org/images/spot.jpg';
const robot={...row('robot','巡检机器人完成夜间试跑','11-20T17:00','机器人','机器人试跑覆盖四个巡检区。夜班人员继续复核潮湿坡道的识别结果。'),
  source:'机器人通讯',imageUrl:photoUrl};
const other=row('market','日经指数盘中急跌4%，出口板块承压','11-18T13:10','日本股市','指数回落，运输设备板块跌幅居前。');
const translations={
  [english.title]:'开源模型在救援机器人上离线运行',
  [english.excerpt]:'团队在断网时测试了开源模型，测试覆盖 12 个模拟场景。'
};
const signal=new AbortController().signal;

electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
await electron.app.whenReady();
mkdirSync(out,{recursive:true});
const db=new DatabaseSync(join(profile,'checks.sqlite'));
let at=stamp('11-17T10:00'), items=[rail1], host, realModel;
const news=createNewsBriefing(db,()=>at,()=>{},async()=>({items,failed:[]}),{archiveDir:archive});
const opened=[], pictures=[];
const checks={
  newsFeed:news.feed,newsEvent:news.event,saveNewsChinese:news.saveChinese,newsArchive:archive
};
class TestWindow extends electron.BrowserWindow{
  constructor(options){super({...options,x:-5000,y:10});}
  show(){this.showInactive();}
  focus(){}
}
try {
  await news.poll(signal);
  at=stamp('11-19T15:00');items=[rail2,other,english];await news.poll(signal);
  at=stamp('11-21T18:00');items=[rail3,railCopy,robot];await news.poll(signal);
  const id=title=>news.feed().items.find(event=>event.title===title).id;
  const rail=id(rail3.title), robotId=id(robot.title), englishId=id(english.title);
  const real=process.argv.includes('--real');
  if(real) {
    const desktop=process.env.FEIYUE_QA_DESKTOP_DIR||join(root,'desktop');
    const {createBalancedLocalModel}=await import(pathToFileURL(join(desktop,'balanced-local-model.mjs')).href);
    realModel=createBalancedLocalModel({utilityProcess:electron.utilityProcess,modelPath:join(desktop,'models/model.gguf')});
    const value=await translateNews(english.excerpt,realModel,AbortSignal.timeout(150000));
    assert.match(value,/12|十二/u);
  }
  const model=realModel||{memory:async raw=>({translation:translations[JSON.parse(raw).text]})};
  host=attachNewsPanel({...electron,BrowserWindow:TestWindow,
    shell:{openExternal:async url=>{opened.push(url);},openPath:async path=>{opened.push(path);return '';}}},{
    root,bundle,checks,model,compile:async event=>event.topic==='大模型'?'这篇报道记载了断网测试的条件和模拟场景。':'',
    readImage:async (url,_signal,full)=>{
      assert.equal(url,photoUrl);
      pictures.push(full);
      return 'data:image/jpeg;base64,'+(full?image:image.resize({width:240})).toJPEG(82).toString('base64');
    }
  });
  await host.open();
  const panel=host.panel,ui=code=>panel.webContents.executeJavaScript(code);
  const click=selector=>ui('document.querySelector('+JSON.stringify(selector)+').click()');
  async function wait(code) {
    const end=Date.now()+(real?180000:8000);
    while(!await ui(code)) {
      if(Date.now()>end)throw Error('等待界面超时 '+code);
      await new Promise(resolve=>setTimeout(resolve,40));
    }
  }
  const shot=async name=>{
    await new Promise(resolve=>setTimeout(resolve,200));
    writeFileSync(join(out,name+'.png'),(await panel.webContents.capturePage()).toPNG());
  };
  const card=eventId=>'[data-event="'+eventId+'"] .event-toggle';
  const columns="getComputedStyle(document.querySelector('#event-list')).gridTemplateColumns.split(' ').length";
  await wait("document.querySelectorAll('.event').length===4");
  assert.equal(await ui(columns),2);
  assert.deepEqual(pictures,[]);
  assert.match(await ui("document.querySelector('#edition').textContent"),/11\/15.*11\/21.*JST/u);
  electron.nativeTheme.themeSource='dark';
  await shot('七日总览-深色');
  electron.nativeTheme.themeSource='light';
  await shot('七日总览-浅色');
  await click(card(rail));
  await wait("document.querySelectorAll('.timeline > li').length===3");
  assert.equal(await ui(columns),1);
  assert.match(await ui("document.querySelector('.latest').textContent"),/全线恢复载客/);
  assert.match(await ui("document.querySelector('.status-copy').textContent"),/周末增开两班/);
  assert.equal(await ui("document.querySelector('.source-links').open"),false);
  assert.equal(await ui("document.querySelector('.source-links ul').childElementCount"),0);
  assert.match(await ui("document.querySelector('.source-links summary').textContent"),/4 篇/);
  await click('.source-links summary');
  await wait("document.querySelectorAll('.source-links a').length===4");
  await click('.source-links a');
  assert.deepEqual(opened,[railCopy.url]);
  assert.equal(await ui("document.querySelector('.news-photo')"),null);
  await shot('事件详情');

  await click(card(englishId));
  await wait("document.querySelector('.status-copy')?.textContent.includes('断网测试')");
  await click('.timeline details summary');
  await wait("document.querySelector('.timeline .source p:last-of-type')?.textContent.match(/12|十二/) && !document.querySelector('.timeline .source p:last-of-type')?.textContent.includes('simulated')");
  await click('.timeline .source .paper-button');
  assert.equal(await ui("document.querySelector('.timeline .source p:last-of-type').textContent"),english.excerpt);
  assert.ok(news.event(englishId).reports[0].chinese.excerpt);

  await click(card(robotId));
  await wait("!document.querySelector('.news-photo-button')?.disabled && document.querySelector('.news-photo img')?.naturalWidth>0");
  assert.deepEqual(pictures,[false]);
  assert.deepEqual(await ui("(() => {const r=document.querySelector('.news-photo-button').getBoundingClientRect();return [r.width,r.height]})()"),[192,128]);
  await click('.news-photo-button');
  await wait("document.querySelector('#photo-panel').open && document.querySelector('#photo-full').naturalWidth>240");
  assert.deepEqual(pictures,[false,true]);
  await shot('新闻配图放大');
  await click('#photo-panel button');
  assert.equal(await ui("document.querySelector('#event-detail').hidden"),false);

  panel.setContentSize(375,480);
  await wait("innerWidth<420 && innerHeight<520");
  assert.equal(await ui("getComputedStyle(document.querySelector('#event-detail')).position"),'fixed');
  assert.equal(await ui("document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth"),true);
  await click('.source-links summary');
  await ui("document.querySelector('#event-detail').scrollTop=2000");
  await wait("!document.querySelector('#detail-top').hidden");
  await click('#detail-top');
  await wait("document.querySelector('#event-detail').scrollTop===0");
  await shot('窄窗详情');
  await click('#close-detail');
  assert.equal(await ui("document.querySelector('#event-detail').hidden"),true);
  await click('#archive');
  const deadline=Date.now()+3000;
  while(opened.length<2 && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(opened,[railCopy.url,archive]);

  at=stamp('11-22T12:00');
  items=[row('new','端侧模型发布评测更新','11-22T10:00','大模型','维护团队更新了延迟和功耗的评测步骤。')];
  await news.poll(signal);
  host.update();
  await wait("document.querySelector('#refresh').textContent.includes('有更新')");
  await click('#refresh');
  await wait("document.querySelectorAll('.event').length===5");
  assert.match(await ui("document.querySelector('.event-title').textContent"),/端侧模型发布评测更新/);
  host.panel.close();
  await new Promise(resolve=>setTimeout(resolve,100));
  await host.open();
  while(!await host.panel.webContents.executeJavaScript("document.querySelectorAll('.event').length===5")) {
    if(Date.now()>deadline+5000)throw Error('重开后简报未及时读回');
    await new Promise(resolve=>setTimeout(resolve,35));
  }
  console.log('PASS：正常新闻 IPC、七天累积、三节点四来源、现状、原文译文、附图双尺寸、桌面分栏及窄窗、归档入口、刷新和重开。');
  process.exitCode=0;
} catch(error) {
  console.error(error);
  process.exitCode=1;
} finally {
  host?.close();
  db.close();
  await realModel?.close();
  electron.app.exit(process.exitCode);
}
