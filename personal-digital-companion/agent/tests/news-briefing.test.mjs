import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {briefNews,createNewsBriefing} from '../../desktop/news-briefing.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {arrangeNews,needsChinese,newsHighlights} from '../../desktop/news-layout.mjs';
import {newsWindowStart} from '../../desktop/news-history.mjs';
import {createNewsEditor} from '../../desktop/news-editor.mjs';

test('新闻排版随内容影响调整，跨栏目同一事件排相邻栏',()=>{
  const base={publishedAt:1000,source:'报社'};
  const row=(topic,title,url)=>({...base,topic,title,url});
  const rows=[row('日本社会','本周公共交通服务安排','1'),row('美国股市','海岸大地震触发市场熔断','2'),
    row('美国社会','海岸大地震触发紧急疏散','3')];
  const groups=arrangeNews(rows,1000);
  const ordered=groups.flatMap(group=>group.rows);
  assert.equal(ordered.length,3);
  const sizes=Object.fromEntries(ordered.map(r=>[r.item.url,r.size]));
  assert.equal(sizes['1'],'normal');
  assert.equal(sizes['3'],'lead');
  assert.equal(Math.abs(ordered.findIndex(r=>r.item.url==='2')-ordered.findIndex(r=>r.item.url==='3')),1);
  assert.equal(needsChinese('OpenAI 发布新模型'),false);
  assert.equal(needsChinese('Local rail services resume'),true);
  assert.equal(needsChinese('運行開始','ja'),true);
});

test('周内热点和其他重点各最多五件，未选事件仍可翻阅且不重复',()=>{
  const items=Array.from({length:13},(_,i)=>({
    id:'story'+i, at:100-i, days:i<6?2:1, publishers:i<6?3:1, importance:i===12?5:1
  }));
  const {hot,key,rest}=newsHighlights(items);
  assert.deepEqual(hot.map(row=>row.id),items.slice(0,5).map(row=>row.id));
  assert.equal(key.length,5);
  assert.equal(key[0].id,'story12');
  assert.equal(rest.length,3);
  assert.equal(new Set([...hot,...key,...rest].map(row=>row.id)).size,13);
  for(const rows of [[],items.slice(0,2),items.slice(11)]) {
    const digest=newsHighlights(rows);
    assert.equal(digest.hot.length+digest.key.length,rows.length);
  }
});

test('已收录的转载、跨栏市场评论和隔天进展重新归并，保留原始链接',async()=>{
  const db=new DatabaseSync(':memory:');
  const stamp=time=>Date.parse('2026-'+time+':00+09:00');
  const make=(name,title,time,topic='美国股市',excerpt='')=>({
    url:'https://example.org/news/'+name,source:name,title,topic,excerpt,publishedAt:stamp(time)
  });
  const items=[
    make('early','美股科技股集体下挫，Nova IPO 首秀波动','11-20T09:00'),
    make('indices','美国科技股暴跌，英伟达重挫约14%，Nova跌幅8.5%！纳指今年涨幅全部回吐','11-21T12:00'),
    make('indices-copy','美国科技股暴跌，英伟达重挫约14%，Nova跌幅8.5%！纳指今年涨幅全部回吐','11-22T08:42'),
    make('market','Nova上市未能止住美股暴跌，11月21日纳指大跌5.28%','11-22T07:52'),
    make('quote','英伟达股价暴跌14%，市场恐慌情绪蔓延','11-22T08:16'),
    make('recap','纳指单周暴跌超10%，此前只发生过10次！','11-22T08:39'),
    make('recap-copy','美股纳指单周暴跌超10%，此前只发生过10次！','11-22T08:51'),
    make('review','美股大跌，国家才敢救市！','11-22T13:06'),
    make('world','全球股市暴跌！下周A股还会跌吗？','11-22T14:15','中国股市'),
    make('ipo','市场热评 | 巨型IPO之后美股大跌，历史现象又一次复现？','11-22T14:50'),
    make('tech','美股科技股集体跳水，Nova 受关注','11-22T15:52'),
    make('company','蔚来美股大跌7.9%，股价报2.45美元','11-22T08:04'),
    make('forecast','分析师：美股暴跌风险有多大？','11-22T11:00'),
    make('other-session','11月22日美股盘前暴跌，道指跌3%','11-22T13:20'),
    make('shoot','美国俄亥俄州发生枪击事件 3死1伤','11-22T14:08','美国社会','警方已封锁事发街区，调查仍在进行。'),
    make('shoot-copy','美国俄亥俄州发生枪击事件 致3人死亡、1人受伤','11-22T14:08','美国社会','当地医疗机构接收一名伤者，尚未公布后续情况。'),
    make('other-shoot','美国俄亥俄州发生枪击事件 致2死1伤','11-22T14:12','美国社会')
  ];
  let now=stamp('11-23T12:00'), incoming=[], notifications=[];
  const connect=()=>createNewsBriefing(db,()=>now,rows=>notifications.push(rows),async()=>({items:incoming,failed:[]}));
  try{
    connect();
    db.prepare('DELETE FROM news_history_migration WHERE id=2').run();
    const save=db.prepare('INSERT INTO news_events(id,at,version,content) VALUES(?,?,1,?)');
    const index=db.prepare('INSERT INTO news_event_urls VALUES(?,?)');
    for(const [id,report] of items.entries()){
      const at=report.publishedAt, key=String(id);
      save.run(key,at,JSON.stringify({id:key,topic:report.topic,at,nodes:[{at,timeKind:'报道时间',reports:[report]}]}));
      index.run(report.url,key);
    }
    let news=connect();
    const hot=news.feed().items.find(row=>row.title==='全球股市下挫，美股科技股走低');
    assert.ok(hot);
    assert.equal(hot.days,3);
    const detail=news.event(hot.id);
    assert.deepEqual(detail.reports.map(row=>row.url).sort(),items.slice(0,11).map(row=>row.url).sort());
    assert.deepEqual(detail.nodes.map(node=>node.at),[items[0].publishedAt,items[1].publishedAt]);
    assert.match(detail.paragraphs.join(' '),/英伟达跌约?14%/u);
    assert.match(detail.paragraphs.join(' '),/纳指跌5\.28%.*IPO.*A 股后续走势/u);
    assert.doesNotMatch(detail.paragraphs.join(' '),/国家救市|历史现象又一次复现/u);
    const shooting=news.feed().items.find(row=>row.title.includes('3死1伤'));
    assert.equal(news.event(shooting.id).reports.length,2);
    assert.match(news.event(shooting.id).paragraphs.join(' '),/警方.*医疗机构/u);
    assert.equal(news.feed().items.length,6);
    assert.equal(db.prepare('SELECT count(*) AS total FROM news_event_urls').get().total,items.length);
    news=connect();
    assert.equal(news.event(hot.id).reports.length,11);
    const late=make('late-copy',items[1].title,'11-23T09:00');
    now=stamp('11-23T10:00');incoming=[late];await news.poll(new AbortController().signal);
    assert.equal(news.event(hot.id).reports.length,12);
    assert.equal(news.event(hot.id).at,detail.at);
    assert.deepEqual(notifications.at(-1),[]);
    news.saveChinese(undefined,late.url,'title',late.title,'译文缓存仍找到合并后事件');
    assert.ok(news.event(hot.id).reports.find(row=>row.url===late.url).chinese);
  } finally {db.close();}
});

test('新闻简报跨栏去重、空轮静默，重启可读回',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-news-test-'));
  const path=join(dir,'news.sqlite');
  const at=Date.now(), signal=new AbortController().signal, notifications=[];
  const row=(id,topic,title)=>({url:'https://example.org/'+id,topic,title,source:'某报',publishedAt:at-60000});
  const items=[row(1,'人工智能','第一条'),row(2,'人工智能','第二条'),row(3,'人工智能','模型发布'),
    row(3,'大模型','模型发布'),row(4,'大模型','第一条'),{...row(5,'美国社会','旧闻'),publishedAt:at-3*86400000-1}];
  let db=new DatabaseSync(path);
  const make=()=>createNewsBriefing(db,()=>at,rows=>notifications.push(rows),async()=>({items,failed:[]}));
  try{
    let news=make();
    assert.equal(conversationRoute('看新闻简报').kind,'newsBriefing');
    await news.poll(signal,()=>false);
    assert.equal(news.last(),undefined);
    await news.poll(signal);
    assert.deepEqual(notifications[0].map(item=>item.title),['第一条','第二条','模型发布']);
    db.close();db=new DatabaseSync(path);news=make();
    assert.equal(news.last(),at);
    await news.poll(signal);
    assert.equal(notifications.length,1);
    assert.equal(news.latest().sources.length,4);
    assert.equal(news.feed().items.length,3);
    news.saveChinese(at,items[0].url,'title','旧标题','错配');
    assert.equal(news.edition().items[0].chinese,undefined);
    news.saveChinese(at,items[0].url,'title',items[0].title,'已缓存');
    assert.equal(news.edition().items[0].chinese.title,'已缓存');
    assert.equal(news.edition().items[0].title,items[0].title);
    assert.match(news.latest().text,/JST/);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('同一股价事件在旧刊和新刊中均汇总，分歧与原始出处仍可追溯',async()=>{
  const at=Date.UTC(2026,10,21,9),hour=3600000;
  const row=(title,i,publishedAt=at-hour-i*1000)=>({url:'https://example.org/'+i,title,
    topic:'美国股市',source:'财经观察',publishedAt});
  const items=[
    row('美股讯号 ｜ 英伟达股价暴跌超14%，市值蒸发约2.7万亿美元 ｜ #美股资讯# #英伟达# #股价波动#',0),
    row('美股讯号 ｜ 英伟达市值蒸发2.74万亿美元，股价暴跌14% ｜ #英伟达#',1),
    row('美股讯号 ｜ 英伟达股价暴跌14%，市值蒸发超27000亿美元 ｜ #美股资讯#',2),
    row('美股讯号 ｜ 英伟达股价暴跌14.01%，市值蒸发近5000亿美元 ｜ #英伟达#',3),
    row('英伟达股价暴跌14%，创18年来最大单周跌幅',4),
    row('英伟达股价大涨14%，市场成交量放大',5),
    row('特斯拉股价大跌14%，成交量放大',6),
    row('英伟达股价暴跌14%，成交活跃',7,at-26*hour),
    row('英伟达股价暴跌8%，市场成交量放大',8)
  ];
  const db=new DatabaseSync(':memory:'),notifications=[];
  try{
    const news=createNewsBriefing(db,()=>at,rows=>notifications.push(rows),async()=>({items,failed:[]}));
    await news.poll(new AbortController().signal);
    assert.equal(news.edition().items.length,9);
    const stories=notifications[0];
    assert.equal(stories.length,5);
    const nvidia=stories.find(story=>story.reports.length===5);
    assert.equal(nvidia.title,'英伟达股价下跌约14%');
    assert.match(nvidia.paragraphs.join(' '),/市值损失数字不一/);
    assert.deepEqual(nvidia.reports.map(report=>report.url),items.slice(0,5).map(report=>report.url));
    const {sources,text}=news.latest();
    assert.equal(sources.length,items.length);
    assert.equal(sources.find(report=>report.url===items[3].url).title,items[3].title);
    assert.match(text,/(?:\[\d+\]){5} 美国股市 · 英伟达股价下跌约14%/u);
    assert.doesNotMatch(text,/#美股资讯#|5000亿|2\.74万亿/);
    const sameCap=briefNews([items[0],items[2]]);
    assert.equal(sameCap.length,1);
    assert.equal(sameCap[0].summary,'');
    const sameTime=[row('英伟达股价盘中暴跌14%，成交量上升',10),row('英伟达股价收盘暴跌14%，市场回落',11)];
    assert.equal(briefNews(sameTime).length,2);
  }finally{db.close();}
});

test('近七天跨轮累积，迁入旧刊后重启一次，跨源复述不推进事件时间',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-weekly-'));
  const file=join(dir,'checks.sqlite');
  let db=new DatabaseSync(file);
  const atJst=value=>Date.parse(value+':00+09:00');
  const report=(id,title,time,source='地区报')=>({title,source,topic:'日本社会',url:'https://example.org/'+id,publishedAt:atJst(time)});
  const first=report('stop','沿海铁路因暴雨停运','2026-11-16T08:10');
  const other=report('separate','山谷大桥因落石封闭','2026-11-16T09:00');
  db.exec('CREATE TABLE news_briefing(id INTEGER PRIMARY KEY,lastCheck INTEGER,latest TEXT)');
  let now=atJst('2026-11-16T10:00'), items=[], notices=[];
  const signal=new AbortController().signal;
  db.prepare('INSERT INTO news_briefing VALUES(1,?,?)').run(now,JSON.stringify({at:now,items:[first,other]}));
  const connect=()=>createNewsBriefing(db,()=>now,rows=>notices.push(rows),async()=>({items,failed:[]}));
  try {
    let news=connect();
    const id=news.feed().items.find(row=>row.title===first.title).id;
    db.close(); db=new DatabaseSync(file); news=connect();
    assert.equal(news.feed().items.length,2);
    assert.equal(news.event(id).reports.length,1);
    now=atJst('2026-11-17T12:00');
    items=[report('republish','沿海铁路因暴雨停运','2026-11-17T08:00','另一家报社')];
    await news.poll(signal);
    assert.equal(news.event(id).reports.length,2);
    assert.equal(news.event(id).at,first.publishedAt);
    assert.deepEqual(notices.at(-1),[]);
    now=atJst('2026-11-20T12:00');
    items=[report('north','沿海铁路北段恢复运行','2026-11-20T08:00')];
    await news.poll(signal);
    now=atJst('2026-11-21T09:00');
    items=[report('full','沿海铁路全线恢复通车','2026-11-21T08:00')];
    await news.poll(signal);
    assert.equal(news.feed().items[0].id,id);
    assert.deepEqual(news.event(id).nodes.map(node=>node.reports[0].url),[first.url,items[0].url.replace('full','north'),items[0].url]);
    assert.equal(news.event(id).reports.length,4);
    assert.equal(news.event(id).nodes[0].timeKind,'报道时间');
    now=atJst('2026-11-22T23:59');
    assert.equal(news.feed().items.length,2);
    now=atJst('2026-11-23T00:00');
    assert.equal(news.feed().items.length,1);
    assert.equal(news.feed().pendingArchive,1);
    assert.equal(newsWindowStart(atJst('2026-12-01T00:00')),atJst('2026-11-25T00:00'));
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});

test('译文不改变转载归并，非公开与含凭据链接不进入任何新闻记录',async()=>{
  const db=new DatabaseSync(':memory:');
  let at=Date.parse('2026-11-19T12:00:00+09:00'), items=[];
  const signal=new AbortController().signal;
  const news=createNewsBriefing(db,()=>at,()=>{},async()=>({items,failed:[]}));
  const make=url=>({title:'Open model begins trials',url,publishedAt:at-3600000,topic:'大模型',lang:'en'});
  try {
    const first=make('https://example.org/a');
    items=[first];
    await news.poll(signal);
    const id=news.feed().items[0].id;
    news.saveChinese(at,first.url,'title',first.title,'开源模型开始试用');
    at+=24*3600000;
    const accepted=make('https://example.net/b#token-overview');
    const invalid=[
      'https://example.org/article?access_token=fixture',
      'https://example.org/article#access_token=fixture',
      'https://example.org/article#resume?session=fixture',
      'https://example.org/article#access_token%3Dfixture',
      'https://fixture:fixture@example.org/article',
      'https://news.example.local/report',
      'https://127.0.0.1/report',
      'https://example.org:8443/report'
    ];
    items=[accepted,...invalid.map(make)];
    assert.match(await news.poll(signal),/已收录 1 条/);
    assert.deepEqual(news.edition().items.map(report=>report.url),[accepted.url]);
    assert.equal(news.feed().items.length,1);
    assert.equal(news.event(id).at,first.publishedAt);
    assert.deepEqual(news.event(id).reports.map(report=>report.url),[accepted.url,first.url]);
    const marked=db.prepare('SELECT 1 FROM news_seen WHERE key=?');
    assert.ok(invalid.every(url=>!marked.get(url)));
  } finally {db.close();}
});

test('归档失败保留原资料，两条同日事件各写一份，重启重试不重复',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-archive-'));
  const file=join(dir,'checks.sqlite'), archive=join(dir,'news-archive');
  const signal=new AbortController().signal;
  let db=new DatabaseSync(file), now=Date.parse('2026-11-14T18:00:00+09:00');
  const items=[1,2,3].map(i=>({
    title:['港湾渡轮恢复临时班次','图书馆调整周末开放时间','新闻只有标题'][i-1],
    url:'https://example.org/'+i,source:'地区公报',topic:'日本社会',publishedAt:now-3600000,
    excerpt:i<3?'运营方公布了后续服务安排，现有预约和票务渠道继续使用。具体开放范围按公告逐项核对，未开放区域将保留原有引导及绕行措施。':''
  }));
  let fetched=items;
  const connect=()=>createNewsBriefing(db,()=>now,()=>{},async()=>({items:fetched,failed:[]}),{archiveDir:archive});
  try {
    let news=connect();
    await news.poll(signal);
    const ids=news.feed().items.map(row=>row.id);
    writeFileSync(archive,'模拟归档路径被占用');
    fetched=[];
    now=Date.parse('2026-11-21T00:00:00+09:00');
    assert.match(await news.poll(signal),/归档暂不可用，原资料已保留/);
    assert.equal(news.feed().pendingArchive,3);
    assert.ok(ids.every(id=>news.event(id)));
    rmSync(archive);
    db.close(); db=new DatabaseSync(file); news=connect();
    now+=10000;
    assert.match(await news.poll(signal),/已归档 2 件.*待归档 1 件/);
    const dateFolder=join(archive,'2026-11-14'), files=readdirSync(dateFolder);
    assert.equal(files.length,2);
    for(const name of files) {
      assert.match(name,/\.md$/);
      const md=readFileSync(join(dateFolder,name),'utf8');
      assert.match(md,/2026-11-14[\s\S]*消息来源[\s\S]*https:\/\/example\.org/);
      const size=[...md.split('\n\n')[2].replace(/\s/gu,'')].length;
      assert.ok(size>=50&&size<=200);
    }
    now+=10000;
    await news.poll(signal);
    assert.deepEqual(readdirSync(dateFolder),files);
    assert.equal(news.feed().pendingArchive,1);
    assert.equal(ids.filter(id=>news.event(id)).length,1);
    assert.ok(existsSync(file));
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});

test('只有能确定东京时间的标题日期才作为事件日期或时间',async()=>{
  const db=new DatabaseSync(':memory:');
  const at=Date.parse('2026-11-18T12:00:00+09:00');
  const publishedAt=at-3600000;
  const rows=[
    ['美国社会','11月17日（美东时间）地方公布应急安排'],
    ['日本社会','2026-11-18T00:30Z 公布避难情况 JST 简报'],
    ['日本社会','2026-11-18T08:30+09:00 公布救援进度'],
    ['日本社会','11月17日 临时巴士恢复运营']
  ].map(([topic,title],i)=>({title,topic,publishedAt,url:'https://example.org/'+i}));
  try {
    const news=createNewsBriefing(db,()=>at,()=>{},async()=>({items:rows,failed:[]}));
    await news.poll(new AbortController().signal);
    const byTitle=title=>news.feed().items.find(row=>row.title===title);
    assert.equal(byTitle(rows[0].title).timeKind,'报道时间');
    assert.equal(byTitle(rows[0].title).at,publishedAt);
    assert.equal(byTitle(rows[1].title).timeKind,'报道时间');
    assert.equal(byTitle(rows[2].title).timeKind,'事件时间');
    assert.equal(byTitle(rows[2].title).at,Date.parse('2026-11-18T08:30:00+09:00'));
    assert.equal(byTitle(rows[3].title).timeKind,'事件日期');
  } finally {db.close();}
});

test('归档长篇早期报道时为最后一次进展留出摘要篇幅',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-news-archive-latest-'));
  const db=new DatabaseSync(':memory:'), signal=new AbortController().signal;
  let at=Date.parse('2026-11-17T12:00:00+09:00'), items=[];
  const news=createNewsBriefing(db,()=>at,()=>{},async()=>({items,failed:[]}),{archiveDir:dir});
  const row=(id,title,excerpt='')=>({url:'https://example.org/'+id,title,excerpt,topic:'日本社会',publishedAt:at-3600000});
  try {
    const earlier='沿线情况已在通知中公布，运营方继续采用既定接驳安排，工作人员检查每段线路的通行条件，旅客按照站内更新的指引等候进一步公告。'.repeat(2)
      +'旅客可以沿用已有车票办理改签，受影响站点也将持续提供指引并增派人员协助。';
    items=[row('first','沿海铁路因暴雨停运',earlier)];
    await news.poll(signal);
    at+=86400000;
    items=[row('latest','沿海铁路全线恢复通车，周末增开临时班次并恢复所有沿海车站的运营')];
    await news.poll(signal);
    const id=news.feed().items[0].id;
    at=Date.parse('2026-11-25T00:00:00+09:00');items=[];
    await news.poll(signal);
    const md=readFileSync(join(dir,'2026-11-18',id+'.md'),'utf8');
    const summary=md.split('\n\n')[2];
    assert.match(summary,/11-17.*暴雨停运.*11-18.*周末增开临时班次/);
    const size=[...summary.replace(/\s/gu,'')].length;
    assert.ok(size>=50 && size<=200);
    assert.match(md,/https:\/\/example\.org\/latest/);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});

test('归档后重新启动，已归档的同一报道链接不会重新收录',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-news-archive-replay-'));
  const file=join(dir,'checks.sqlite'), archive=join(dir,'news-archive');
  const signal=new AbortController().signal;
  const notices=[];
  let db=new DatabaseSync(file), at=Date.parse('2026-11-14T18:00:00+09:00'), items=[];
  const report={url:'https://example.org/rail',title:'沿海铁路恢复运行',topic:'日本社会',source:'地区新闻',
    publishedAt:at-3600000,excerpt:'运营方公布了后续服务安排，现有预约和票务渠道继续使用。具体开放范围按公告逐项核对，未开放区域将保留原有引导及绕行措施。'};
  const open=()=>createNewsBriefing(db,()=>at,event=>notices.push(event),async()=>({items,failed:[]}),{archiveDir:archive});
  try {
    let news=open();
    items=[report];
    await news.poll(signal);
    const id=news.feed().items[0].id;
    at=Date.parse('2026-11-21T00:00:00+09:00');items=[];
    assert.match(await news.poll(signal),/已归档 1 件/);
    const dated=join(archive,'2026-11-14');
    assert.equal(news.event(id),undefined);
    assert.deepEqual(readdirSync(dated),[id+'.md']);
    assert.equal(db.prepare('SELECT 1 FROM news_event_urls WHERE url=?').get(report.url),undefined);
    db.close();db=new DatabaseSync(file);news=open();
    at+=86400000;
    items=[{...report,publishedAt:at-3600000}];
    assert.match(await news.poll(signal),/本次未收录新报道/);
    assert.equal(news.feed().items.length,0);
    assert.equal(notices.length,1);
    assert.deepEqual(readdirSync(dated),[id+'.md']);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});

test('归档写入失败只保留受影响事件，可用目录继续归档并转义来源文本',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-news-archive-isolation-'));
  const db=new DatabaseSync(':memory:'),signal=new AbortController().signal;
  let at=Date.parse('2026-11-14T18:00:00+09:00'),items=[];
  const news=createNewsBriefing(db,()=>at,()=>{},async()=>({items,failed:[]}),{archiveDir:dir});
  const report=(id,title,source)=>({url:'https://example.org/'+id,title,source,topic:'日本社会',
    publishedAt:at-3600000,excerpt:'运营方公布后续服务安排，现有预约及票务渠道继续使用。开放范围按公告逐项核对，未开放区域保留原有引导与绕行措施。'});
  try {
    items=[report('park','公园恢复开放','地区公报')];
    await news.poll(signal);
    const blocked=news.feed().items[0].id;
    at+=86400000;
    items=[report('port','港湾恢复运行 <strong>公报</strong>','原文 [链接标记](https://example.org/unrelated)')];
    await news.poll(signal);
    const available=news.feed().items[0].id;
    writeFileSync(join(dir,'2026-11-14'),'模拟该日期目录被占用');
    at=Date.parse('2026-11-22T00:00:00+09:00');items=[];
    assert.match(await news.poll(signal),/已归档 1 件.*待归档 1 件.*1 件归档暂不可用/);
    assert.ok(news.event(blocked));
    assert.equal(news.event(available),undefined);
    const md=readFileSync(join(dir,'2026-11-15',available+'.md'),'utf8');
    assert.doesNotMatch(md,/<strong>|\s\[链接标记\]\(/);
    assert.match(md,/&lt;strong&gt;公报&lt;\/strong&gt;/);
    assert.match(md,/<https:\/\/example\.org\/port>/);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});

test('本机模型摘要拒绝无据金额并保留来源摘录',async()=>{
  const body='报道明确沿海铁路恢复运营，运营方公布后续服务安排。沿线站点在完成巡视后恢复载客，临时绕行方案仍适用于正在检修的区域。';
  const editor=createNewsEditor({memory:async()=>({
    summary:'沿海铁路恢复运营，运营方预计投入999亿元实施额外扩建，同时开放额外站点，现行部分区域仍需遵守原有接驳安排。'
  })},async()=>body);
  const report={title:'沿海铁路恢复运营',url:'https://example.org/news'};
  const output=await editor({nodes:[{at:Date.UTC(2026,10,21),title:report.title,evidence:'',reports:[report]}]},
    new AbortController().signal);
  assert.equal(output,body);
});

test('摘要将日期与数量分开核对，并保留数值的单位',async()=>{
  const body='报道明确沿海铁路恢复运营，运营方确认本轮维护预算为21万美元，并增开2班列车。沿线站点在完成巡视后恢复载客，检修区域继续沿用临时绕行方案。';
  const report={title:'沿海铁路恢复运营',url:'https://example.org/news'};
  const detail={nodes:[{at:Date.parse('2026-11-21T12:00:00+09:00'),title:report.title,evidence:body,reports:[report]}]};
  const signal=new AbortController().signal;
  let candidate;
  const editor=createNewsEditor({memory:async()=>({summary:candidate})});
  const supported='11月21日，沿海铁路在完成线路巡视后恢复运营。运营方确认本轮维护预算为21万美元，并增开2班列车分担客流。检修区域继续沿用临时绕行安排。';
  for(const rewritten of [supported.replace('21万美元','21亿元'),supported.replace('2班','21班'),supported.replace('11月21日','11月2日')]) {
    candidate=rewritten;
    assert.equal(await editor(detail,signal),body);
  }
  candidate=supported;
  assert.equal(await editor(detail,signal),supported);
});

test('摘要校验绑定市场涨跌方向，避免用相同幅度反写事实',async()=>{
  const body='当天主要指数下跌4%，上市企业公布统计范围和成分股名单。后续报告将继续更新指数走势及板块差异。';
  const detail={nodes:[{at:Date.parse('2026-11-21T12:00:00+09:00'),title:'主要指数下跌4%',evidence:body,
    reports:[{url:'https://example.org/market'}]}]};
  const signal=new AbortController().signal;
  let candidate;
  const editor=createNewsEditor({memory:async()=>({summary:candidate})});
  const supported='当天主要指数跌幅为4%，上市企业公布统计范围和成分股名单。后续报告将继续更新指数走势及板块差异，当前数据按当日公布范围计算。';
  for (const wrong of ['上涨4%','涨幅为4%','出现4%的涨幅']) {
    candidate=supported.replace('跌幅为4%',wrong);
    assert.equal(await editor(detail,signal),body);
  }
  candidate=supported;
  assert.equal(await editor(detail,signal),supported);
});

test('含两日行情的摘要校验按来源日期核对涨跌，拒绝错接日期',async()=>{
  const body='11月20日主要指数上涨4%；11月21日主要指数下跌4%。企业公布统计范围和成分股名单，后续报告将更新走势及板块差异。';
  const detail={nodes:[{at:Date.parse('2026-11-21T12:00:00+09:00'),title:'主要指数两日走势分化',evidence:body,reports:[]}]};
  const signal=new AbortController().signal;
  let candidate;
  const editor=createNewsEditor({memory:async()=>({summary:candidate})});
  const supported='11月21日主要指数下跌4%。企业公布统计范围与成分股名单，后续报告将继续更新走势和板块差异；11月20日的涨幅为4%。';
  for(const wrong of [supported.replace('11月21日主要指数下跌','11月21日主要指数上涨'),supported.replace('11月21日主要指数下跌','主要指数下跌')]) {
    candidate=wrong;
    assert.equal(await editor(detail,signal),body);
  }
  candidate=supported;
  assert.equal(await editor(detail,signal),supported);
});

test('普通简讯去掉包装标签后的重复标题可合并，摘要只取额外信息',()=>{
  const row=(title,excerpt,url)=>({title,excerpt,url,topic:'日本社会',publishedAt:1000});
  const stories=briefNews([
    row('快讯 ｜ 两市公交恢复运行 ｜ #交通#','两市公交恢复运行 某日报','1'),
    row('两市公交恢复运行','机场线恢复后每半小时发车。其他线路尚在调整。','2'),
    row('山区公交恢复运行','山区公交恢复运行。','3')
  ]);
  assert.equal(stories.length,2);
  assert.equal(stories[0].reports.length,2);
  assert.equal(stories[0].summary,'机场线恢复后每半小时发车。');
  assert.equal(stories[1].summary,'');
});

test('按已生成期次覆盖最多72小时，空轮、栏目失败、延迟恢复和精确边界',async()=>{
  const db=new DatabaseSync(':memory:'),hour=3600000,first=Date.UTC(2026,10,20);
  let at=first,items=[],failed=[];
  const days=[],signal=new AbortController().signal;
  const news=createNewsBriefing(db,()=>at,()=>{},async(_signal,n)=>{
    days.push(n);return {items,failed};
  });
  const row=(key,time,topic='机器人')=>({url:'https://example.org/'+key,title:key,topic,publishedAt:time});
  try{
    items=[row('三天边界',at-72*hour),row('超期',at-72*hour-1),row('未来',at+1)];
    await news.poll(signal);
    assert.deepEqual(news.edition().items.map(r=>r.title),['三天边界']);
    at+=12*hour;items=[];await news.poll(signal);
    assert.equal(news.edition().at,first);
    at+=24*hour;failed=['日本社会'];
    items=[row('上一期同一毫秒',first),row('期后首毫秒',first+1),
      row('已报重发',at),row('第三条同栏',at),row('第四条同栏',at)];
    await news.poll(signal);
    assert.equal(news.edition().items.length,4);
    assert.equal(news.edition().from,first);
    const second=at;
    at+=12*hour;failed=[];
    items=[row('延迟恢复的栏目',first+hour,'日本社会'),row('已报重发',at),
      row('正常栏目早于上期',second-1),row('本轮截止',at)];
    await news.poll(signal);
    assert.deepEqual(news.edition().items.map(r=>r.title),['延迟恢复的栏目','本轮截止']);
    assert.deepEqual(news.edition().retryAfter,{});
    at+=96*hour;
    items=[row('四天前',at-96*hour),row('三天内',at-60*hour)];
    await news.poll(signal);
    assert.equal(news.edition().from,at-72*hour);
    assert.deepEqual(news.edition().items.map(r=>r.title),['三天内']);
    assert.deepEqual(days,[3,1,2,2,3]);
  }finally{db.close();}
});
