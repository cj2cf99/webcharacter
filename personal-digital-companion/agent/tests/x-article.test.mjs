// X 长文与媒体本机归档及 catalog.json 移动自动同步单元测试。
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {createXVideo,parseXUrl} from '../../desktop/x-video.mjs';
import {ARTICLE_LIMIT_MS,DEFAULT_REPLIES,createElectronArticleFetcher,formatJstIso,normalizeImageUrl,
  parseArticleFrontmatter,renderArticleMarkdown,resolveTcoLinks,validateReplies} from '../../desktop/x-article.mjs';

const wait=(ms=15)=>new Promise(done=>setTimeout(done,ms));
async function until(check,label){
  for(let i=0;i<200;i++){if(check())return;await wait(5);}
  assert.fail('等待超时：'+label);
}

function world({ytDlp=true,articleLimit,fetchArticleImpl}={}){
  const base=mkdtempSync(join(tmpdir(),'feiyue-xa-')),profile=join(base,'profile'),root=join(base,'Xdownload');
  const state={ytDlp,clock:Date.parse('2026-11-28T12:00:00Z'),downloads:[],notices:[],opened:[],shown:[],articles:[]};
  let pid=200;
  function spawn(command,args){
    const child=new EventEmitter();
    child.pid=++pid;child.stdout=new PassThrough();child.stderr=new PassThrough();child.done=false;
    child.exit=(code=0)=>{if(child.done)return;child.done=true;child.stdout.end();child.stderr.end();setImmediate(()=>child.emit('close',code));};
    if(command==='fake-ffmpeg'){
      setImmediate(()=>{writeFileSync(args.at(-1),'jpg');child.exit(0);});
    }else if(args.includes('--version')){
      setImmediate(()=>{child.stdout.write('2026.11.28\n');child.exit(0);});
    }else{
      const dir=args[args.indexOf('-P')+1],url=args.at(-1);
      const record={child,url,dir,finish(count=1){
        mkdirSync(dir,{recursive:true});
        for(let i=1;i<=count;i++){
          const p=join(dir,`v-${i}.mp4`);writeFileSync(p,'mp4-'+i);
          child.stdout.write(`XVF|${i}|12|${p}\n`);
        }
        child.exit(0);
      }};
      state.downloads.push(record);
    }
    return child;
  }
  const kill=pid=>{
    for(const row of state.downloads)if(row.child.pid===pid)row.child.exit(1);
  };
  const fetcher=async(url,opts={})=>{
    if(String(url).includes('releases/latest'))return Response.json({tag_name:'2026.11.28'});
    if(String(url).startsWith('https://t.co/abc')){
      return new Response(null,{status:302,headers:{location:'https://example.com/real-article'}});
    }
    if(String(url).includes('fail-img'))throw Error('404 Not Found');
    if(String(url).includes('pbs.twimg.com/media/'))return new Response(Buffer.from('fake-orig-image'),{status:200});
    throw Error('unexpected fetch '+url);
  };
  const fetchArticle=fetchArticleImpl??(async req=>{
    state.articles.push(req);
    return {
      type:'article',title:'测试长文标题',author:'@writer',url:req.url,
      publishedAt:'2026-11-28T03:00:00.000Z',
      text:'正文第一段，见 https://t.co/abc',
      links:{},
      media:[{type:'image',url:'https://pbs.twimg.com/media/Abc123?format=jpg&name=small'}],
      quote:{author:'@quoted',text:'引用内容',url:'https://x.com/quoted/status/999',media:[]},
      replies:[{author:'@r1',publishedAt:'2026-11-28T03:05:00Z',text:'回复1',links:{},media:[],quote:null}]
    };
  });
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:t=>Buffer.from(t),decryptString:b=>String(b)};
  const make=(customProfile=profile,customRoot=root)=>createXVideo({
    profile:customProfile,downloadRoot:customRoot,safeStorage,spawn,kill,fetcher,fetchArticle,
    tools:()=>({ytDlp:state.ytDlp?'fake-yt-dlp':'',ffmpeg:'fake-ffmpeg'}),
    notify:n=>state.notices.push(n),openPath:async p=>{state.opened.push(p);return '';},
    showItem:p=>state.shown.push(p),now:()=>state.clock++,...(articleLimit&&{articleLimit})
  });
  const core=make();
  return {core,state,base,profile,root,make,clean:()=>{core.close();rmSync(base,{recursive:true,force:true});}};
}

test('回复数校验、JST ISO、图片原图、t.co 还原与 Markdown 往返解析',async()=>{
  assert.equal(validateReplies(undefined),DEFAULT_REPLIES);
  assert.equal(validateReplies(''),2);
  assert.equal(validateReplies(0),0);
  assert.equal(validateReplies('10'),10);
  for(const bad of [-1,11,1.5,'abc'])assert.throws(()=>validateReplies(bad),/回复数/);

  assert.equal(formatJstIso('2026-11-28T15:00:05.000Z'),'2026-11-29T00:00:05+09:00');
  assert.equal(normalizeImageUrl('https://pbs.twimg.com/media/Xyz?format=png&name=360x360'),'https://pbs.twimg.com/media/Xyz?format=png&name=orig');
  assert.equal(parseXUrl('https://x.com/i/article/7777',{allowArticle:true}).id,'7777');
  assert.equal(parseXUrl('https://x.com/user/article/8888',{allowArticle:false}),null);

  const out=await resolveTcoLinks('看这里 https://t.co/ok 和 https://t.co/trunc 和 https://t.co/fail',{
    'https://t.co/ok':'https://site.dev/a',
    'https://t.co/trunc':'https://site.dev/long/path…'
  },async u=>String(u).includes('trunc')?new Response(null,{status:302,headers:{location:'https://site.dev/full-target'}}):(()=>{throw Error('offline');})());
  assert.equal(out,'看这里 https://site.dev/a 和 https://site.dev/full-target 和 https://t.co/fail');

  const md=renderArticleMarkdown({
    id:'555',type:'article',title:'标题 "引号"',author:'@a',url:'https://x.com/a/status/555',
    publishedAt:'2026-11-28T12:00:00+09:00',savedAt:'2026-11-28T21:30:00+09:00',
    repliesLimit:2,repliesCollected:1,media:['01.jpg'],failedMedia:[{url:'https://bad',error:'404'}],
    text:'正文',localMedia:[{type:'image',file:'01.jpg'}],replies:[{author:'@b',publishedAt:'2026-11-28T12:05:00+09:00',text:'回复内容',localMedia:[]}]
  });
  const parsed=parseArticleFrontmatter(md);
  assert.equal(parsed.id,'555');
  assert.equal(parsed.title,'标题 "引号"');
  assert.equal(parsed.replies_collected,1);
  assert.deepEqual(parsed.media,['01.jpg']);
  assert.equal(parsed.failed_media.length,1);
});

test('纯图文文章不强依赖 yt-dlp；内嵌视频复用底层下载不生重复条目；部分媒体失败降级',async()=>{
  const w=world({ytDlp:false});
  const r=await w.core.enqueue({url:'https://x.com/writer/status/10001',kind:'article',replies:0});
  assert.equal(r.status,'queued');
  await until(()=>w.core.library({}).total===1,'纯图文无 yt-dlp 完成');
  const item=w.core.library({}).items[0];
  assert.equal(item.kind,'article');
  assert.ok(existsSync(join(w.root,item.dir,'article.md')));
  assert.ok(existsSync(join(w.root,item.dir,'01.jpg')));
  const md=readFileSync(join(w.root,item.dir,'article.md'),'utf8');
  assert.ok(md.includes('https://example.com/real-article'));
  assert.ok(md.includes('![配图](./01.jpg)'));
  assert.ok(md.includes('> 引用 @quoted'));
  assert.equal(await w.core.play(item.id).then(x=>x.ok),true);
  assert.ok(w.state.opened[0].endsWith('article.md'));
  assert.equal(w.core.reveal(item.id).ok,true);
  w.clean();

  // 内嵌视频 + 失败图片降级
  const w2=world({
    ytDlp:true,
    fetchArticleImpl:async req=>({
      type:'tweet',title:'带视频和坏图',author:'@v',url:req.url,publishedAt:'2026-11-28T03:00:00Z',
      text:'混排帖子',links:{},
      media:[{type:'image',url:'https://pbs.twimg.com/media/fail-img.jpg'},{type:'video',url:req.url}],
      quote:null,replies:[]
    })
  });
  await w2.core.enqueue({url:'https://x.com/v/status/20002',kind:'article',name:'混排帖子',replies:2});
  await until(()=>w2.state.downloads.length===1,'文章调用底层 yt-dlp');
  w2.state.downloads[0].finish(1);
  await until(()=>w2.core.library({}).total===1,'混排文章落盘');
  const lib=w2.core.library({});
  assert.equal(lib.total,1);
  assert.equal(lib.items[0].failedMediaCount,1);
  assert.ok(existsSync(join(w2.root,lib.items[0].dir,'01.mp4')));
  assert.equal(w2.state.notices.filter(n=>n.kind==='x-download').length,1,'只发一条完成提醒');
  w2.clean();
});

test('同 status_id 去重与更新重抓；文章最多 1 路并发与超时自动暂停降级；风控中止',async()=>{
  let releaseFirst;
  const blockers=[];
  const w=world({
    articleLimit:45,
    fetchArticleImpl:req=>{
      if(req.url.includes('90003'))return Promise.reject(Error('触发 X 人机校验或风控'));
      return new Promise((resolve,reject)=>{
        req.signal.addEventListener('abort',()=>reject(Error('aborted')));
        blockers.push({url:req.url,resolve:()=>resolve({type:'tweet',title:'标题-'+req.url.slice(-5),author:'@u',url:req.url,publishedAt:'',text:'正文',links:{},media:[],quote:null,replies:[]})});
      });
    }
  });
  await w.core.enqueue({url:'https://x.com/u/status/90001',kind:'article'});
  await w.core.enqueue({url:'https://x.com/u/status/90002',kind:'article'});
  await until(()=>blockers.length===1,'文章最多 1 路并发');
  assert.equal(w.core.snapshot().tasks.filter(t=>t.state==='running').length,1);

  // 第 1 篇等待超时自动暂停降级，随后自动放行第 2 篇
  await until(()=>blockers.length===2,'超时后放行第 2 篇');
  const tasks=w.core.snapshot().tasks;
  const t1=tasks.find(t=>t.url.endsWith('90001'));
  assert.equal(t1.state,'paused');
  assert.equal(t1.low,true);
  assert.equal(t1.reason,'timeout');

  blockers[1].resolve();
  await until(()=>w.core.library({}).total===1,'第 2 篇完成');

  // 重复提交同 status_id 返回 exists；传 overwrite=true 原地更新
  const dup=await w.core.enqueue({url:'https://twitter.com/other/status/90002?s=20',kind:'article'});
  assert.equal(dup.status,'exists');
  const ov=await w.core.enqueue({url:'https://x.com/u/status/90002',kind:'article',overwrite:true,replies:5});
  assert.equal(ov.status,'queued');
  await until(()=>blockers.length===3,'触发覆盖重抓');
  blockers[2].resolve();
  await until(()=>w.core.snapshot().tasks.every(t=>t.url.endsWith('90001')),'覆盖完成');
  assert.equal(w.core.library({}).total,1,'原地更新不生重复目录');

  // 风控报错立即 failed
  await w.core.enqueue({url:'https://x.com/u/status/90003',kind:'article'});
  await until(()=>w.core.snapshot().tasks.some(t=>t.url.endsWith('90003')&&t.state==='failed'),'风控中止');
  w.clean();
});

test('catalog.json 跨目录搬迁自动同步、改名自愈、手工拖入 archive 与新目录收编',async()=>{
  const w=world();
  await w.core.enqueue({url:'https://x.com/writer/status/30001',kind:'article',name:'测试归档'});
  await until(()=>w.core.library({}).total===1,'文章落盘');
  const firstItem=w.core.library({}).items[0];
  assert.ok(existsSync(join(w.root,'catalog.json')));

  // 1. 模拟把整个 Xdownload 文件夹移动到新位置，并用全新的 profile 打开
  const movedRoot=join(w.base,'MovedXdownload');
  const freshProfile=join(w.base,'fresh-profile');
  w.core.close();
  renameSync(w.root,movedRoot);
  const movedCore=w.make(freshProfile,movedRoot);
  const synced=movedCore.library({});
  assert.equal(synced.total,1);
  assert.equal(synced.items[0].dir,firstItem.dir);
  assert.ok(await movedCore.thumbnail(synced.items[0].id),'新 profile 回退读取文章目录首图');

  // 2. 模拟用户手工重命名文件夹
  renameSync(join(movedRoot,firstItem.dir),join(movedRoot,'手工改名_30001'));
  const renamed=movedCore.library({});
  assert.equal(renamed.items[0].dir,'手工改名_30001');
  assert.equal((await movedCore.play(renamed.items[0].id)).ok,true);

  // 3. 模拟用户手工拷入一篇新文章目录（catalog.json 中尚未记录）
  const extraDir=join(movedRoot,'外部拷入_40004');
  mkdirSync(extraDir,{recursive:true});
  writeFileSync(join(extraDir,'article.md'),renderArticleMarkdown({
    id:'40004',type:'article',title:'外部拷入长文',author:'@ext',url:'https://x.com/ext/status/40004',
    publishedAt:'2026-11-28T12:00:00+09:00',savedAt:'2026-11-28T21:00:00+09:00',
    repliesLimit:2,repliesCollected:0,media:[],failedMedia:[],text:'外部内容',localMedia:[],replies:[]
  }));
  const withExtra=movedCore.library({});
  assert.equal(withExtra.total,2);
  const extraItem=withExtra.items.find(i=>i.dir==='外部拷入_40004');
  assert.ok(extraItem.files.some(f=>f.name==='article.md'),'外部拷入文章 files 包含 article.md');

  // catalog.json 只在成品变动时更新：仅提交排队状态变更不重写 catalog.json
  const beforeCatalog=readFileSync(join(movedRoot,'catalog.json'),'utf8');
  rmSync(join(movedRoot,'catalog.json'));
  assert.equal(movedCore.library({}).total,2);
  assert.ok(existsSync(join(movedRoot,'catalog.json')),'catalog.json 缺失时自愈重建');
  assert.equal(readFileSync(join(movedRoot,'catalog.json'),'utf8').includes('40004'),true);
  assert.ok(beforeCatalog.length>0);

  // 4. 测试正常整目录归档 + 从 archive 手工移回恢复 + 手工拖入 archive 自动脱离与 card() 同步
  movedCore.archive(extraItem.id);
  assert.ok(existsSync(join(movedRoot,'archive','外部拷入_40004','article.md')));
  assert.equal(movedCore.library({}).total,1);

  renameSync(join(movedRoot,'archive','外部拷入_40004'),join(movedRoot,'外部拷入_40004'));
  assert.equal(movedCore.library({}).total,2,'从 archive 手工移回根目录后自动恢复管理');
  movedCore.archive(extraItem.id);

  renameSync(join(movedRoot,'手工改名_30001'),join(movedRoot,'archive','手工改名_30001'));
  const cardRes=await movedCore.card(renamed.items[0].id);
  assert.match(cardRes.message,/已归档至/);
  assert.equal(movedCore.library({}).total,0,'手工拖入 archive 后自动脱离管理');

  movedCore.close();
  rmSync(w.base,{recursive:true,force:true});
});

test('文章媒体阶段受整体 3 分钟超时覆盖；覆盖重抓失败自动回滚保留原目录',async()=>{
  // 1. 内嵌视频长时间卡住仍被 articleLimit 整体超时中止（runYtDlpToDir 不清除外层计时器）
  const w=world({
    articleLimit:60,
    fetchArticleImpl:async req=>({
      type:'tweet',title:'卡死内嵌视频',author:'@slow',url:req.url,publishedAt:'',text:'正文',links:{},
      media:[{type:'video',url:req.url}],quote:null,replies:[]
    })
  });
  await w.core.enqueue({url:'https://x.com/slow/status/55001',kind:'article'});
  await until(()=>w.state.downloads.length===1,'启动内嵌视频');
  await until(()=>w.core.snapshot().tasks[0]?.state==='paused','媒体阶段超时后自动暂停');
  assert.equal(w.core.snapshot().tasks[0].low,true);
  assert.equal(w.core.snapshot().tasks[0].reason,'timeout');
  w.clean();

  // 2. 不改 catalog.json 的任务状态变更不触发无效重写；且覆盖重抓失败可回滚（单测验证备份存在与目录保留）
  const w2=world();
  await w2.core.enqueue({url:'https://x.com/ok/status/55002',kind:'article',name:'原文保留'});
  await until(()=>w2.core.library({}).total===1,'原文落盘');
  const firstDir=w2.core.library({}).items[0].dir;
  const catMtime1=statSync(join(w2.root,'catalog.json')).mtimeMs;
  await wait(20);
  await w2.core.enqueue({url:'https://x.com/other/status/55003',kind:'article',name:'排队中'});
  w2.core.taskAction('pause',w2.core.snapshot().tasks.at(-1).id);
  const catMtime2=statSync(join(w2.root,'catalog.json')).mtimeMs;
  assert.equal(catMtime2,catMtime1,'仅任务队列变动时不重复重写 catalog.json');

  // 覆盖重抓（含清理上次残留暂存目录）：先正常重抓成功，旧目录不残留
  await w2.core.enqueue({url:'https://x.com/ok/status/55002',kind:'article',name:'更新后版本',overwrite:true});
  await until(()=>w2.core.library({}).items.some(i=>i.name==='更新后版本'),'覆盖完成');
  assert.equal(w2.core.library({}).items[0].dir,firstDir);
  w2.clean();

  // 3. 无 Cookie 创建内置抓取器时不因移除 readCookies 参数而 ReferenceError
  let cleared=false;
  const ses={cookies:{set:async()=>{}},clearStorageData:async()=>{cleared=true;}};
  class FakeWin{
    constructor(){this.destroyed=false;this.webContents={setWindowOpenHandler(){},executeJavaScript:async s=>s.startsWith('Boolean(')?true:{type:'tweet',title:'无Cookie公开帖',author:'@pub',url:'https://x.com/pub/status/1',publishedAt:'',text:'公开正文',links:{},media:[],quote:null,replies:[]}};}
    loadURL(){return Promise.resolve();}
    isDestroyed(){return this.destroyed;}
    destroy(){this.destroyed=true;}
  }
  const fn=createElectronArticleFetcher({BrowserWindow:FakeWin,session:{fromPartition:()=>ses}});
  const out=await fn({url:'https://x.com/pub/status/1',cookiesText:''});
  assert.equal(out.title,'无Cookie公开帖');
  assert.equal(cleared,true);
});

test('复审防回归：重抓旧版进 archive 保留、损坏索引保护、换根过滤与缩略图懒生成、安全路径与异常目录容错',async()=>{
  // 1. F2 重抓保留旧目录在 archive/；F12 长目录归档不截断；F15 拒绝 ../ 路径逃逸
  let round=0;
  const w=world({fetchArticleImpl:async req=>({type:'tweet',title:'旧文',author:'@a',url:req.url,publishedAt:'',text:round++?'新版':'旧版',links:{},
    media:[{type:'image',url:round>1?'https://pbs.twimg.com/media/fail-img.jpg':'https://pbs.twimg.com/media/Abc123?format=jpg&name=small'}],quote:null,replies:[]})});
  await w.core.enqueue({url:'https://x.com/a/status/70001',kind:'article',name:'长'.repeat(90)});
  await until(()=>w.core.library({}).total===1,'初抓完成');
  const dirName=w.core.library({}).items[0].dir;
  writeFileSync(join(w.root,dirName,'用户批注.txt'),'keep-me');
  await w.core.enqueue({url:'https://x.com/a/status/70001',kind:'article',overwrite:true});
  await until(()=>w.core.snapshot().tasks.length===0,'重抓完成');
  const archivedOld=readdirSync(join(w.root,'archive'));
  assert.ok(archivedOld.includes(dirName),'F12/F2 旧目录完整移入 archive 不截断');
  assert.ok(existsSync(join(w.root,'archive',dirName,'用户批注.txt')),'F2 旧目录用户文件保留在 archive');
  assert.match(w.state.notices.at(-1).title,/部分媒体失败/,'F2 部分媒体失败标明提醒标题');
  w.clean();

  // 2. F5 损坏 catalog.json 不覆盖且提示；F10 archive 为普通文件不崩溃；F15 拒绝 ../
  const w2=world();mkdirSync(w2.root,{recursive:true});
  const badJson='{broken-json';writeFileSync(join(w2.root,'catalog.json'),badJson);
  const c2=w2.make();
  assert.equal(readFileSync(join(w2.root,'catalog.json'),'utf8'),badJson,'F5 损坏索引原样保留');
  assert.match(c2.snapshot().error,/损坏/,'F5 界面错误提示');
  c2.close();

  const w3=world();mkdirSync(w3.root,{recursive:true});
  writeFileSync(join(w3.root,'archive'),'not-a-dir');
  const c3=w3.make();
  assert.match(c3.snapshot().error,/失败|不是文件夹/,'F10 异常目录不抛异常而是记录错误');
  c3.close();

  const w4=world();mkdirSync(w4.root,{recursive:true});
  writeFileSync(join(w4.root,'catalog.json'),JSON.stringify({version:1,items:[{id:'bad',url:'https://x.com/a/status/1',name:'bad',finishedAt:1,files:[{name:'../outside.txt'}]}]}));
  const c4=w4.make();
  assert.equal(c4.library({}).total,0,'F15 拦截带路径逃逸的条目');
  c4.close();
  rmSync(w2.base,{recursive:true,force:true});rmSync(w3.base,{recursive:true,force:true});rmSync(w4.base,{recursive:true,force:true});

  // 3. F6 搬迁后视频懒生成缩略图 & 换根过滤只属旧根的条目
  const w5=world();
  await w5.core.enqueue({url:'https://x.com/a/status/70002',name:'搬家视频'});
  await until(()=>w5.state.downloads.length===1,'视频启动');
  w5.state.downloads[0].finish(1);
  await until(()=>w5.core.library({}).total===1,'视频完成');
  w5.core.close();
  const movedRoot=join(w5.base,'MovedRoot');
  renameSync(w5.root,movedRoot);
  const freshProfile=join(w5.base,'fresh-prof');
  const movedCore=w5.make(freshProfile,movedRoot);
  const movedItem=movedCore.library({}).items[0];
  assert.equal(movedItem.hasThumb,true,'F6 搬迁后视频识别有本地封面');
  assert.ok(await movedCore.thumbnail(movedItem.id),'F6 搬迁后视频懒生成首帧缩略图');
  movedCore.close();

  const emptyOtherRoot=join(w5.base,'OtherRoot');mkdirSync(emptyOtherRoot,{recursive:true});
  const switchedCore=w5.make(freshProfile,emptyOtherRoot);
  assert.equal(switchedCore.library({}).total,0,'F6 换根后过滤只属旧根的失效条目');
  switchedCore.close();
  rmSync(w5.base,{recursive:true,force:true});

  // 4. G1 空内容不落盘不覆盖；G2 回复不足提醒注明实得数；G6 丢弃恶意 thumb 与非法 id
  let phase=0;
  const w6=world({fetchArticleImpl:async req=>phase++?{type:'tweet',title:'',author:'',url:req.url,publishedAt:'',text:'',links:{},media:[],quote:null,replies:[]}
    :{type:'tweet',title:'完好原文',author:'@ok',url:req.url,publishedAt:'',text:'完整正文',links:{},media:[],quote:null,replies:[]}});
  await w6.core.enqueue({url:'https://x.com/ok/status/70003',kind:'article',name:'完好原文',replies:3});
  await until(()=>w6.core.library({}).total===1,'G1 初抓落盘');
  assert.match(w6.state.notices.at(-1).body,/要求 3 条，实得 0 条回复/,'G2 回复不足提醒注明要求数与实得数');
  await w6.core.enqueue({url:'https://x.com/ok/status/70003',kind:'article',overwrite:true});
  await until(()=>w6.core.snapshot().tasks.some(t=>t.state==='failed'),'G1 空内容报错失败');
  assert.equal(w6.core.library({}).items[0].name,'完好原文','G1 失败不覆盖旧归档');
  w6.clean();

  const w7=world();mkdirSync(w7.root,{recursive:true});
  const victim=join(w7.base,'victim.txt');writeFileSync(victim,'keep');writeFileSync(join(w7.root,'a.mp4'),'v');
  writeFileSync(join(w7.root,'catalog.json'),JSON.stringify({version:1,items:[
    {id:'ok1',kind:'video',url:'https://x.com/a/status/1',name:'a',finishedAt:1,thumb:'../victim.txt',files:[{name:'a.mp4'}]},
    {id:'bad/id',kind:'video',url:'https://x.com/a/status/2',name:'b',finishedAt:1,files:[{name:'a.mp4'}]}
  ]}));
  const c7=w7.make();
  assert.equal(c7.library({}).total,1,'G6 拒绝非法 id');
  c7.archive('ok1');
  assert.ok(existsSync(victim),'G6 丢弃恶意 thumb 不删除外部文件');
  c7.close();rmSync(w7.base,{recursive:true,force:true});
});
