// 复审复现：只读导入被审代码，在临时目录里用替身进程与抓取器验证疑点。不联网、不碰 F 盘。
import {EventEmitter} from 'node:events';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {PassThrough} from 'node:stream';
const repo=new URL('../../../desktop/',import.meta.url).href;
const {createXVideo}=await import(repo+'x-video.mjs');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<400;i++){if(check())return true;await wait(5);}return false;}
function world({article,downloadRoot,profile,onSpawn,openPath}={}){
  const base=mkdtempSync(join(tmpdir(),'xv-review-'));
  const root=downloadRoot??join(base,'dl');profile??=join(base,'profile');
  const opened=[],notices=[],downloads=[];
  let pid=0,clock=Date.parse('2026-11-28T12:00:00Z');
  function spawn(command,args){
    const child=new EventEmitter();child.pid=++pid;child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.exit=(code=0)=>{child.stdout.end();child.stderr.end();setImmediate(()=>child.emit('close',code));};
    if(command==='ff')setImmediate(()=>{writeFileSync(args.at(-1),'jpg');child.exit(0);});
    else if(args.includes('--version'))setImmediate(()=>{child.stdout.write('2026.11.23\n');child.exit(0);});
    else if(onSpawn)setImmediate(()=>onSpawn(child,args));
    else downloads.push({child,dir:args[args.indexOf('-P')+1],finish(){const p=join(this.dir,'part-1.mp4');writeFileSync(p,'v');child.stdout.write(`XVF|1|3|${p}\n`);child.exit(0);}});
    return child;
  }
  let images=true;
  const make=()=>createXVideo({profile,downloadRoot:root,spawn,kill:()=>{},now:()=>clock++,
    tools:()=>({ytDlp:'yt',ffmpeg:'ff'}),safeStorage:null,notify:n=>notices.push(n),openPath:async p=>{opened.push(p);return openPath??'';},showItem(){},
    fetcher:async url=>String(url).includes('api.github')?Response.json({tag_name:'2026.11.23'})
      :images?new Response(Buffer.from('IMAGE')):new Response('',{status:503}),
    fetchArticle:article});
  return {base,root,profile,make,opened,notices,downloads,failImages(){images=false;}};
}
const report=(id,confirmed,detail)=>console.log(`${confirmed?'[复现]':'[未复现]'} ${id} ${detail}`);

// A 覆盖重抓时媒体失败：旧的已下载图片是否丢失
{
  let round=0;
  const w=world({article:async()=>({type:'tweet',title:'旧文',author:'@a',text:round++?'只剩残缺正文':'完整正文',
    media:[{type:'image',url:'https://pbs.twimg.com/media/a?format=jpg&name=small'}],replies:[]})});
  const core=w.make(),url='https://x.com/a/status/111';
  await core.enqueue({url,kind:'article',name:'旧文'});
  await until(()=>core.library({}).total===1);
  const dir=join(w.root,core.library({}).items[0].dir);
  writeFileSync(join(dir,'我的批注.txt'),'用户自己放的文件');
  const before=readdirSync(dir);
  w.failImages();
  await core.enqueue({url,kind:'article',overwrite:true});
  await until(()=>core.snapshot().tasks.length===0&&core.snapshot().occupied===0);
  const after=readdirSync(dir),item=core.library({}).items[0];
  // 旧图和用户文件只要还在下载目录某处（例如移进 archive）就算修好。
  const kept=readdirSync(w.root,{recursive:true}).map(String);
  report('A-overwrite-loss',!['01.jpg','我的批注.txt'].every(f=>kept.some(p=>p.endsWith(f))),`覆盖前 ${JSON.stringify(before)} 覆盖后 ${JSON.stringify(after)}；失败媒体 ${item.failedMediaCount}；提醒「${w.notices.at(-1).title}」`);
  core.close();
}
// B 损坏的 catalog.json 在启动时被覆盖
{
  const w=world();mkdirSync(w.root,{recursive:true});
  const original='{"version":1,"items":[{"id":"v1","url":"https://x.com/a/status/1","name":"旧视频","files":[{"name":"旧视频.mp4"}]}],,}';
  writeFileSync(join(w.root,'catalog.json'),original);
  const core=w.make();
  const after=readFileSync(join(w.root,'catalog.json'),'utf8');
  // 原内容只要还留在下载目录某个文件里（原样保留或备份）就算修好。
  const saved=readdirSync(w.root).some(f=>{try{return readFileSync(join(w.root,f),'utf8')===original;}catch{return false;}});
  const lost=!saved&&!after.includes('旧视频');
  report('B-catalog-corrupt',lost,lost?'损坏索引被启动写盘覆盖，无备份、无提示':'原索引内容仍保留');
  core.close();
}
// C 启动时下载目录不可见、之后出现：提交视频把便携索引覆盖掉
{
  const w=world();
  const core=w.make();// 此时目录尚不存在（相当于磁盘稍后才接入）
  mkdirSync(w.root,{recursive:true});
  writeFileSync(join(w.root,'catalog.json'),JSON.stringify({version:1,items:[{id:'v1',kind:'video',url:'https://x.com/a/status/1',name:'旧视频',finishedAt:1,files:[{name:'旧视频.mp4',duration:1}]}]}));
  writeFileSync(join(w.root,'旧视频.mp4'),'v');
  await core.enqueue({url:'https://x.com/a/status/2'});
  const items=JSON.parse(readFileSync(join(w.root,'catalog.json'),'utf8')).items;
  report('C-catalog-late-disk',!items.some(i=>i.id==='v1'),'提交后索引条目数 '+items.length+'；随后 library() total='+core.library({}).total);
  core.close();
}
// D 搬迁目录到新资料目录：视频缩略图是否还在
{
  const first=world();const core=first.make();
  await core.enqueue({url:'https://x.com/a/status/3',name:'搬家'});
  await until(()=>first.downloads.length===1);first.downloads[0].finish();
  await until(()=>core.library({}).total===1);
  const had=core.library({}).items[0].hasThumb;core.close();
  const moved=first.base+'-moved';renameSync(first.root,moved);
  const second=world({downloadRoot:moved});const again=second.make();
  const item=again.library({}).items[0];
  report('D-thumb-after-move',had&&item&&!item.hasThumb,`搬迁前 hasThumb=${had}，换资料目录后 hasThumb=${item?.hasThumb}，缩略图未重建`);
  again.close();
}
// E 按同名判断归档：手工删掉新文件时被旧的归档同名文件顶替
{
  const w=world();const core=w.make();
  for(const n of [4,5]){
    await core.enqueue({url:'https://x.com/a/status/'+n,name:'同名'});
    await until(()=>w.downloads.length===n-3);w.downloads.at(-1).finish();
    await until(()=>core.snapshot().tasks.length===0&&core.snapshot().occupied===0);
    if(n===4)core.archive(core.library({}).items[0].id);
  }
  rmSync(join(w.root,'同名.mp4'));
  const list=core.library({});
  report('E-name-archive',list.total===0,`新条目应显示“文件缺失”，实际列表 total=${list.total}（被静默标为已归档）`);
  core.close();
}
// F 长名称文章归档时目录名被截断，丢掉 status_id
{
  const w=world({article:async()=>({type:'tweet',title:'t',text:'x',media:[],replies:[]})});const core=w.make();
  await core.enqueue({url:'https://x.com/a/status/1234567890123456789',kind:'article',name:'长'.repeat(90)});
  await until(()=>core.library({}).total===1);
  const item=core.library({}).items[0];core.archive(item.id);
  const [archived]=readdirSync(core.archiveDir);
  report('F-archive-truncate',archived!==item.dir,`原目录长度 ${[...item.dir].length}，归档后 ${[...archived].length}，结尾“${archived.slice(-12)}”`);
  core.close();
}
// G 内嵌视频失败时的半成品留在成品目录
{
  const w=world({article:async()=>({type:'tweet',title:'含视频',text:'x',media:[{type:'video',url:'https://x.com/a/status/6'}],replies:[]}),
    onSpawn:(child,args)=>{const dir=args[args.indexOf('-P')+1];writeFileSync(join(dir,'v-1-1.mp4.part'),'half');writeFileSync(join(dir,'v-1-1.mp4.ytdl'),'{}');child.stderr.write('ERROR: network\n');child.exit(1);}});
  const core=w.make();
  await core.enqueue({url:'https://x.com/a/status/6',kind:'article'});
  await until(()=>core.library({}).total===1);
  const item=core.library({}).items[0],files=readdirSync(join(w.root,item.dir));
  report('G-part-left',files.some(f=>f.endsWith('.part')),'成品目录内容 '+JSON.stringify(files));
  core.close();
}
// H 下载目录里有个名为 archive 的文件：核心构造直接抛错
{
  const w=world();mkdirSync(w.root,{recursive:true});writeFileSync(join(w.root,'archive'),'x');
  let error='';try{w.make().close();}catch(e){error=e.code||e.message;}
  report('H-startup-throw',Boolean(error),'createXVideo 抛出 '+error+'（shell 启动时直接调用，无保护）');
}
// I 目录索引中的相对路径不做校验
{
  const w=world();mkdirSync(w.root,{recursive:true});writeFileSync(join(w.base,'outside.cmd'),'echo');
  writeFileSync(join(w.root,'catalog.json'),JSON.stringify({version:1,items:[{id:'evil',url:'https://x.com/a/status/7',name:'x',finishedAt:1,files:[{name:'../outside.cmd'}]}]}));
  // 修好后索引条目会被拒绝导入，play 抛“没有找到记录”也算通过。
  const core=w.make();core.library({});await core.play('evil',0).catch(()=>{});
  report('I-path-escape',w.opened.some(p=>p.endsWith('outside.cmd')),'play() 打开了下载目录外的文件：'+w.opened.at(-1));
  core.close();
}
// J 更换下载根目录：旧根条目写进新根索引
{
  const first=world();const core=first.make();
  await core.enqueue({url:'https://x.com/a/status/8',name:'旧根视频'});
  await until(()=>first.downloads.length===1);first.downloads[0].finish();await until(()=>core.library({}).total===1);core.close();
  const other=world({profile:first.profile});mkdirSync(other.root,{recursive:true});const next=other.make();
  const items=JSON.parse(readFileSync(join(other.root,'catalog.json'),'utf8')).items;
  report('J-root-switch',items.some(i=>i.name==='旧根视频'),'同一资料目录换根后，新根 catalog 含旧根条目，列表显示缺失='+next.library({}).items[0]?.missing);
  next.close();
}
// K 文章超时提示称“已保留断点”，续跑时暂存目录被清空
{
  let calls=0,seen=[];
  const w=world({article:async({signal})=>{calls++;await new Promise((r,j)=>signal.addEventListener('abort',()=>j(Error('abort'))));}});
  const core=createXVideo({profile:w.profile,downloadRoot:w.root,tools:()=>({ytDlp:'',ffmpeg:''}),safeStorage:null,articleLimit:30,notify:n=>seen.push(n),fetchArticle:async({signal})=>{await new Promise((r,j)=>signal.addEventListener('abort',()=>j(Error('abort'))));},kill:()=>{}});
  await core.enqueue({url:'https://x.com/a/status/9',kind:'article'});
  await until(()=>core.snapshot().tasks[0]?.state==='paused');
  report('K-article-breakpoint',/已保留断点/.test(seen.at(-1)?.body||''),'提醒正文：'+seen.at(-1)?.body);
  core.close();
}
process.exit(0);
