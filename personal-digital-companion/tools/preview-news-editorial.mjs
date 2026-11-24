import * as electron from 'electron';
import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createNewsBriefing} from '../desktop/news-briefing.mjs';
import {createNewsEditorial} from '../desktop/news-editorial.mjs';
import {createNewsEditor} from '../desktop/news-editor.mjs';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {attachNewsPanel} from '../desktop/news-panel-host.mjs';

const [sourcePath,marketPath,tiktokPath]=process.argv.slice(2);
if(!sourcePath||!marketPath||!tiktokPath)throw Error('需要只读新闻库和两组查询回执路径');
const root=resolve(import.meta.dirname,'..'),bundle=join(root,'output/desktop-bundle');
const out=join(root,'output/news-editorial-preview');
mkdirSync(join(out,'events'),{recursive:true});
const db=new DatabaseSync(':memory:'),source=new DatabaseSync(resolve(sourcePath),{readOnly:true});
source.exec('BEGIN');
for(const table of ['news_events','news_event_urls','news_history_migration','news_editorial','news_boards','news_briefing']){
  db.exec(source.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(table).sql);
  const rows=source.prepare('SELECT * FROM '+table).all();
  if(!rows.length)continue;
  const keys=Object.keys(rows[0]);
  const insert=db.prepare('INSERT INTO '+table+' VALUES('+keys.map(()=>'?').join(',')+')');
  for(const row of rows)insert.run(...keys.map(key=>row[key]));
}
source.close();
const read=path=>JSON.parse(readFileSync(resolve(path),'utf8'));
const market=read(marketPath),tiktok=read(tiktokPath);
tiktok.samples.Reddit={...tiktok.redditFocused.result,
  credits:tiktok.samples.Reddit.credits+tiktok.redditFocused.result.credits,returned:tiktok.samples.Reddit.returned};
const now=Date.now;
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-editorial-preview-')));
electron.app.on('window-all-closed',()=>{});
await electron.app.whenReady();
const model=createBalancedLocalModel({utilityProcess:electron.utilityProcess,
  modelPath:join(root,'desktop/models/Qwen3.5-4B-Q4_K_M.gguf')});
const phases=[];
const editorModel={memory:async(text,prompt,schema,signal,job)=>{
  const answer=await model.memory(text,prompt,schema,signal,job);
  phases.push({stage:job.stage,answer});
  return answer;
}};
let sample,host;
const editorial=createNewsEditorial(db,{now,model:editorModel,compile:createNewsEditor(editorModel,async()=>''),lookup:async platform=>{
  if(!sample?.samples[platform])throw Error('验收只读已保存的查询回执');
  return sample.samples[platform];
}});
const news=createNewsBriefing(db,now,()=>{},undefined,{editorial});
const names=['美股科技板块承压，Anthropic','德令哈5.6级地震','工信部发布5项人形机器人','有报道指黄仁勋','TikTok'];
const picks=names.map(fragment=>news.feed().items.find(row=>row.title.includes(fragment)));
const readRow=db.prepare('SELECT phase,data FROM news_editorial WHERE topic=? AND revision=?');
const topicRows=db.prepare('SELECT phase,data FROM news_editorial WHERE topic=? ORDER BY revision');
const saveRow=db.prepare('UPDATE news_editorial SET phase=?,data=? WHERE topic=? AND revision=?');
const report=[];
let status=0;
try{
  for(const [index,row] of picks.entries()){
    if(!row)throw Error('未找到验收话题 '+names[index]);
    sample=index===0?market:index===4?tiktok:undefined;
    const batch={items:[row],boards:{全部:{hot:sample?[row.id]:[],key:sample?[]:[row.id],quiet:[]}}};
    const start=phases.length;
    for(let step=0;step<11;step++){
      const saved=readRow.get(row.id,row.at);
      if(saved?.phase==='keywords'&&sample){
        const data=JSON.parse(saved.data);
        Object.assign(data,{groups:sample.groups,to:sample.cutoff,samples:{}});
        saveRow.run('X',JSON.stringify(data),row.id,row.at);
      }
      if(['done','failed'].includes(saved?.phase)&&JSON.parse(saved.data).titlePolicy===2)break;
      const retries=JSON.stringify(topicRows.all(row.id));
      try {await editorial.step(batch,news.event,AbortSignal.timeout(100000));}
      catch(error) {
        if(retries===JSON.stringify(topicRows.all(row.id)))throw error;
        phases.push({stage:saved?.phase??'title',error:error.code??error.message});
      }
    }
    const detail=news.event(row.id);
    report.push({id:row.id,title:detail.title,latest:detail.latest,
      nodes:detail.nodes.map(node=>({title:node.title,reports:node.reports.length})),
      wind:editorial.history(row.id),phases:phases.slice(start),state:readRow.get(row.id,row.at)?.phase});
    console.log('已重跑 '+detail.title+' · '+detail.nodes.length+' 个节点 · '+editorial.history(row.id).length+' 期风向');
    writeFileSync(join(out,'review.json'),JSON.stringify(report,null,2));
  }
  const view=news.feed();
  writeFileSync(join(out,'feed.json'),JSON.stringify(view));
  for(const row of view.items){
    const detail=news.event(row.id);
    const publicReport=({title,source,url,publishedAt,lang,chinese,excerpt})=>({title,source,url,publishedAt,lang,chinese,excerpt});
    writeFileSync(join(out,'events',row.id+'.json'),JSON.stringify({detail:{...detail,
      coverageFrom:detail.reports.at(-1).publishedAt,coverageTo:detail.reports[0].publishedAt,hasImage:false,canEnrich:false,
      nodes:detail.nodes.map(node=>({...node,reports:node.reports.map(publicReport)})),reports:detail.reports.map(publicReport)},
      wind:editorial.history(row.id)}));
  }
  for(const file of ['feiyue-surface.css','news-panel.css','news-weekly.css','news-editorial.css','news-engraving.png',
    'news-panel-ui.mjs','news-layout.mjs','news-heatmap.mjs'])copyFileSync(join(bundle,file),join(out,file));
  const html=readFileSync(join(bundle,'news-panel.html'),'utf8')
    .replace("default-src 'none';","default-src 'none'; connect-src 'self';")
    .replace('<script type="module" src="news-panel-ui.mjs">','<script src="preview.js"></script>\n  <script type="module" src="news-panel-ui.mjs">')
    .replace('<button id="archive"','<button hidden id="archive"');
  writeFileSync(join(out,'index.html'),html);
  writeFileSync(join(out,'preview.js'),`
const read=path=>fetch(path).then(response=>{
  if(!response.ok)throw Error('无法读取验收快照');
  return response.json();
});
const pending=new Map();
const event=id=>{
  if(!pending.has(id))pending.set(id,read('events/'+encodeURIComponent(id)+'.json').catch(error=>{
    pending.delete(id);throw error;
  }));
  return pending.get(id);
};
window.newsPanel={
  list:()=>read('feed.json'),detail:id=>event(id).then(row=>row.detail),wind:id=>event(id).then(row=>row.wind),
  image:async()=>null,context:async()=>'',cancelContext:async()=>{},archive:async()=>{},onNew:()=>{},
  translate:async()=>{throw Error('验收快照沿用已保存的译文');},
  source:async(_id,url)=>{if(new URL(url).protocol==='https:')window.open(url,'_blank','noopener,noreferrer');}
};
`);
  class CaptureWindow extends electron.BrowserWindow{
    constructor(options){super({...options,x:-5000,y:0});}
    show(){this.showInactive();}
    focus(){}
  }
  electron.nativeTheme.themeSource='dark';
  host=attachNewsPanel({...electron,BrowserWindow:CaptureWindow},{root,bundle,
    checks:{newsFeed:news.feed,newsEvent:news.event,newsEditorialHistory:news.editorialHistory}});
  await host.open();
  host.panel.setSize(1200,900);
  const run=code=>host.panel.webContents.executeJavaScript(code);
  const wait=async check=>{
    for(let i=0;i<90;i++){
      if(await run(check))return;
      await new Promise(r=>setTimeout(r,50));
    }
    throw Error('验收页面加载超时 '+check);
  };
  const capture=async name=>{
    await new Promise(r=>setTimeout(r,180));
    writeFileSync(join(out,name+'.png'),(await host.panel.webContents.capturePage()).toPNG());
  };
  await wait("document.querySelector('#digest-columns .event')?.offsetWidth>0");
  for(let tab=1;tab<=4;tab++){
    await run("document.querySelector('#filters button:nth-child("+tab+")').click()");
    await capture(['全部','社会','科技','市场'][tab-1]);
  }
  const marketCard='[data-event="'+picks[0].id+'"] button';
  await run("document.querySelector("+JSON.stringify(marketCard)+").click()");
  await wait("document.querySelectorAll('.timeline li').length>=4");
  await capture('市场发展时间线');
  await run("document.querySelector('.news-wind').open=true");
  await wait("Boolean(document.querySelector('.wind-history>li'))");
  await run("document.querySelector('.news-wind').scrollIntoView({block:'start'})");
  await capture('X和Reddit风向');
  console.log('验收快照 '+out);
}catch(error){
  status=1;
  console.error(error);
}finally{
  host?.close();
  await model.close();
  db.close();
  electron.app.exit(status);
}
