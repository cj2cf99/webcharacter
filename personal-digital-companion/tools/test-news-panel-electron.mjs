// 隔离新闻样刊：通过真实面板 IPC 验证，生成可离线翻阅的合成示例。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {attachNewsPanel,translateNews} from '../desktop/news-panel-host.mjs';

const root=resolve(import.meta.dirname,'..'),bundle=join(root,'output/desktop-bundle'),out=process.env.FEIYUE_NEWS_QA_OUTPUT||join(root,'output/news-panel-qa');
const at=Date.parse('2026-11-21T18:00:00+09:00');
const photoUrl='https://d2pn8kiwq2w21t.cloudfront.net/images/imagesdarpa20200227darpa_amanda-16.width-1024.jpg';
const photoData='data:image/jpeg;base64,'+readFileSync(join(root,'tools/news-fixtures/spot-nasa-jpl.jpg')).toString('base64');
const cases=[
  ['人工智能','没有 GPS，救援机器人如何在地下部署？','NASA/JPL-Caltech（2020 年资料）','地下挑战赛把机器人送进一座未完工的电厂。队伍需要让机器自主探路、识别目标，并把位置传回地面。图为队员 Amanda Bouman 操作 Spot 机器人。'],
  ['大模型','Open model runs offline on rescue robots','技术周刊','The team tested a smaller open model without a network connection. The test covered 12 simulated scenes.','开源模型在救援机器人上实现离线运行','团队在断网条件下测试了一个较小的开源模型，测试覆盖 12 个模拟场景。'],
  ['机器人','机器人实验室公开复杂地形步态数据','机器人通讯','这批记录包含砂石、台阶和缓坡三类地形，并标明了测试载荷。'],
  ['日本社会','避難所を結ぶ臨時バス、運行を開始','地域通信','避難所と駅を結ぶ臨時バスは、朝と夕方に運行します。','连接避难所的临时巴士开始运行','连接避难所和车站的临时巴士在早晚时段运行。'],
  ['中国社会','沿江地区更新防汛应急预案','城市日报','新预案公布了集合点、通知方式和分区疏散路线。'],
  ['美国社会','多城公布公共交通冬季运行安排','社会观察','当地交通部门发布冬季时刻表，并说明恶劣天气期间的调整方式。'],
  ['日本股市','日经指数盘中急跌 4%，出口板块承压','市场通讯','指数回落，运输设备与电子板块跌幅居前。报道记录的是盘中变化。'],
  ['美国股市','科技股回落，美股主要指数收跌','财经周刊','主要指数收盘下行，各板块表现分化。'],
];
const items=cases.map(([topic,title,source,excerpt],i)=>({topic,title,source,excerpt,publishedAt:at-(i+1)*1200000,url:'https://example.org/news/'+i}));
items[0].imageUrl=photoUrl;
items[0].url='https://www.jpl.nasa.gov/news/robots-autonomously-navigate-underground-in-darpa-challenge/';
const translations=Object.fromEntries(cases.filter(c=>c[4]).flatMap(c=>[[c[1],c[4]],[c[3],c[5]]]));
const previewApi={
  list:async()=>({at,items:items.map(({excerpt,...row})=>({...row,hasImage:Boolean(row.imageUrl),chinese:{}}))}),
  image:async(_at,url)=>items.find(row=>row.url===url)?.imageUrl?photoData:null,
  detail:async(_at,url)=>({excerpt:items.find(row=>row.url===url).excerpt}),
  translate:async(_at,url,field)=>translations[items.find(row=>row.url===url)[field]],
  source:async()=>{document.querySelector('#state').hidden=false;document.querySelector('#state').textContent='样刊采用演示数据。';},
  onNew:()=>{}
};
mkdirSync(out,{recursive:true});
const read=name=>readFileSync(join(bundle,name),'utf8');
function exportPreview(){
  const code=read('news-layout.mjs').replaceAll('export function','function')+'\n'+read('news-panel-ui.mjs').replace(/^import .*$/m,'');
  const api='const at='+at+',items='+JSON.stringify(items)+',photoData='+JSON.stringify(photoData)+',translations='+JSON.stringify(translations)+';window.newsPanel={'+
    Object.entries(previewApi).map(([k,v])=>k+':'+v.toString()).join(',')+'};';
  const html=read('news-panel.html').replace("style-src 'self'; script-src 'self'","style-src 'unsafe-inline'; script-src 'unsafe-inline'")
    .replace(/<link rel="stylesheet"[^>]+>/g,'').replace('</head>',()=>'<style>'+read('feiyue-surface.css')+
      read('news-panel.css').replace('news-engraving.png','data:image/png;base64,'+readFileSync(join(bundle,'news-engraving.png')).toString('base64'))+'</style></head>')
    .replace('<h1>新闻简报</h1>','<h1>新闻简报 · 交互样刊</h1>')
    .replace(/<script type="module"[^<]+<\/script>/,()=>'<script type="module">'+api+'\n'+code+'</script>');
  writeFileSync(join(out,'新闻简报样刊.html'),html);
}
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-news-panel-')));
electron.app.on('window-all-closed',()=>{});
async function run(){
await electron.app.whenReady();
let model,host;
try{
  exportPreview();
  const real=process.argv.includes('--real');
  if(real){
    const desktop=process.env.FEIYUE_QA_DESKTOP_DIR||join(root,'desktop');
    const {createBalancedLocalModel}=await import(pathToFileURL(join(desktop,'balanced-local-model.mjs')).href);
    model=createBalancedLocalModel({utilityProcess:electron.utilityProcess,modelPath:join(desktop,'models/model.gguf')});
    const output=await translateNews(cases[1][3],model,AbortSignal.timeout(150000));
    assert.match(output,/12|十二/u);
    console.log('本地正文翻译：'+output);
  }
  let detailSaved=0,opens=0;
  const saved=new Map();
  const checks={newsEdition:()=>({at,items:items.map(row=>({...row,chinese:saved.get(row.url)}))}),
    saveNewsChinese:(_at,url,field,_original,value)=>{
      saved.set(url,{...saved.get(url),[field]:value});if(field==='excerpt')detailSaved++;
    }};
  class TestWindow extends electron.BrowserWindow{
    constructor(options){super({...options,x:-5000,y:10});}
    show(){this.showInactive();}focus(){}
  }
  host=attachNewsPanel({...electron,BrowserWindow:TestWindow,shell:{openExternal:async()=>{opens++;}}},{root,bundle,checks,
    readImage:async url=>{assert.equal(url,photoUrl);return photoData;},
    model:model||{memory:async raw=>({translation:translations[JSON.parse(raw).text]})}});
  await host.open();
  const panel=host.panel,ui=code=>host.panel.webContents.executeJavaScript(code);
  async function waitFor(condition){
    const end=Date.now()+(real?180000:7000);
    while(!await ui(condition)){if(Date.now()>end)throw Error('等待界面超时 '+condition);await new Promise(r=>setTimeout(r,70));}
  }
  await waitFor("document.querySelectorAll('.story').length===8 && ![...document.querySelectorAll('.headline')].some(n=>/正在本机翻译|翻译暂不可用/.test(n.textContent))");
  assert.equal(detailSaved,0);
  await waitFor("Boolean(document.querySelector('.picture.ready img')?.naturalWidth)");
  const target="[...document.querySelectorAll('.tile')].find(e=>e.querySelector('.meta').textContent.includes('技术周刊'))";
  for(const theme of ['light','dark']){
    electron.nativeTheme.themeSource=theme;panel.setContentSize(980,740);
    await new Promise(r=>setTimeout(r,350));
    writeFileSync(join(out,'报面-'+theme+'.png'),(await panel.webContents.capturePage()).toPNG());
  }
  electron.nativeTheme.themeSource='light';
  await ui("[...document.querySelectorAll('#filters button')].find(b=>b.textContent==='社会').click()");
  assert.equal(await ui("document.querySelectorAll('.picture').length"),0);
  await new Promise(r=>setTimeout(r,250));
  writeFileSync(join(out,'纯文字报面.png'),(await panel.webContents.capturePage()).toPNG());
  await ui("[...document.querySelectorAll('#filters button')].find(b=>b.textContent==='全部').click()");
  await ui(target+".querySelector('.story').click()");
  await waitFor(target+".querySelector('.details p').textContent.match(/12|十二/) !== null");
  assert.equal(detailSaved,1);
  await ui(target+".querySelector('.language').click()");
  assert.equal(await ui(target+".querySelector('.headline').textContent"),cases[1][1]);
  assert.equal(await ui(target+".querySelector('.details p').textContent"),cases[1][3]);
  await ui(target+".querySelector('.language').click()");
  await ui(target+".querySelector('.actions button').click()");
  assert.equal(opens,1);
  electron.nativeTheme.themeSource='light';panel.setContentSize(375,700);
  await ui("[...document.querySelectorAll('#filters button')].find(b=>b.textContent==='科技').click()");
  assert.equal(await ui("document.querySelectorAll('.tile').length"),3);
  assert.equal(await ui("document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth"),true);
  await ui(target+".scrollIntoView({block:'center'})");
  await new Promise(r=>setTimeout(r,300));
  writeFileSync(join(out,'窄屏内页.png'),(await panel.webContents.capturePage()).toPNG());
  const closed=new Promise(resolve=>panel.once('closed',resolve));panel.close();await closed;await host.open();
  await waitFor("document.querySelectorAll('.story').length===8");
  const preview=new electron.BrowserWindow({show:false,webPreferences:{sandbox:true}});
  try{
    await preview.loadFile(join(out,'新闻简报样刊.html'));
    assert.equal(await preview.webContents.executeJavaScript("document.querySelectorAll('.story').length"),8);
    await preview.webContents.executeJavaScript(target+".querySelector('.story').click()");
    await preview.webContents.executeJavaScript(target+".querySelector('.language').click()");
    assert.equal(await preview.webContents.executeJavaScript(target+".querySelector('.details p').textContent"),cases[1][3]);
  }finally{preview.destroy();}
  console.log('PASS：报面、按需详情、同卡中外文切换、来源、窄屏、两种主题与重开。');
  process.exitCode=0;
}catch(error){console.error(error);process.exitCode=1;}
finally{host?.close();await model?.close();electron.app.exit(process.exitCode);}
}
void run();
