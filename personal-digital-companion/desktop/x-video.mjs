// X 视频与长文下载核心（纯 Node）：队列、yt-dlp 进程、文章归档、超时、catalog.json 同步、更新门禁与 Cookie。
// 设计见 docs/X_VIDEO_DOWNLOAD_DESIGN.md；界面和将来的云端任务共用 enqueue()。
import {spawn as nodeSpawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,readdirSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {extname,join,parse,resolve} from 'node:path';
import {tokyoDay} from './conversation-history.mjs';
import {ARTICLE_LIMIT_MS,DEFAULT_REPLIES,formatJstIso,normalizeImageUrl,parseArticleFrontmatter,
  renderArticleMarkdown,resolveTcoLinks,validateReplies} from './x-article.mjs';

export const MAX_RUNNING=3;
export const MAX_ARTICLE_RUNNING=1;
export const RUN_LIMIT_MS=60*60_000;
export const PAGE_SIZE=8;
const RELEASE_URL='https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const PROGRESS='download:XVP|%(info.playlist_index|1)s|%(info.n_entries|1)s|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.fragment_index)s|%(progress.fragment_count)s';
const POSTPROCESS='postprocess:XVPP|%(progress.postprocessor)s|%(progress.status)s';
const DONE='after_move:XVF|%(playlist_index|1)s|%(duration)s|%(filepath)s';
const X_HOSTS=new Set(['x.com','www.x.com','mobile.x.com','twitter.com','www.twitter.com','mobile.twitter.com']);

export function parseXUrl(raw,{allowArticle=false}={}){
  let url;
  try{url=new URL(String(raw??'').trim());}catch{return null;}
  if(!/^https?:$/.test(url.protocol)||!X_HOSTS.has(url.hostname.toLowerCase()))return null;
  const status=/^\/(?:(i\/web)|([A-Za-z0-9_]{1,30}))\/status\/(\d{1,25})(?:\/|$)/.exec(url.pathname);
  if(status){
    const [,web,user,id]=status;
    return {id,user:web?'i':user,url:`https://x.com/${web??user}/status/${id}`};
  }
  if(allowArticle){
    const article=/^\/(?:(i)|([A-Za-z0-9_]{1,30}))\/article\/(\d{1,25})(?:\/|$)/.exec(url.pathname);
    if(article){
      const [,web,user,id]=article;
      return {id,user:web?'i':user,url:`https://x.com/${user??'i'}/article/${id}`,articlePath:true};
    }
  }
  return null;
}

const jstStamp=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(at);
export const defaultName=at=>jstStamp(at).replace(' ','_').replaceAll(':','');

export function sanitizeName(raw){
  let name=String(raw??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,' ').trim();
  name=name.replace(/\.mp4$/i,'');
  name=[...name].slice(0,100).join('').replace(/^[. ]+|[. ]+$/g,'');
  if(/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(name))name='_'+name;
  return name;
}

// 版本号按数字段比较；2026.11.23 < 2026.11.23.1。
export function newerVersion(latest,current){
  const a=String(latest).split('.').map(Number),b=String(current).split('.').map(Number);
  for(let i=0;i<Math.max(a.length,b.length);i++){
    const diff=(a[i]||0)-(b[i]||0);
    if(diff)return diff>0;
  }
  return false;
}

// 只保留 X 域名的行，避免整份 cookies.txt 里其它网站的登录信息被存下来。
export function parseCookies(text,at=Date.now()){
  const kept=[],found=new Set();
  for(const raw of String(text??'').split(/\r?\n/)){
    const line=raw.replace(/^\uFEFF/,'');
    if(!line.trim()||line.startsWith('#')&&!line.startsWith('#HttpOnly_'))continue;
    const fields=line.split('\t');
    if(fields.length!==7)continue;
    const domain=fields[0].replace(/^#HttpOnly_/,'').replace(/^\./,'').toLowerCase();
    if(!['x.com','twitter.com'].some(host=>domain===host||domain.endsWith('.'+host)))continue;
    const expires=Number(fields[4]);
    if(!Number.isFinite(expires)||expires>0&&expires*1000<at)continue;
    kept.push(line);
    // yt-dlp 走 x.com 接口，登录项必须属于 x.com。
    if(fields[6].trim()&&domain==='x.com')found.add(fields[5]);
  }
  const missing=['auth_token','ct0'].filter(name=>!found.has(name));
  if(missing.length)throw Error(kept.length
    ?'缺少或已过期的 x.com 登录项：'+missing.join('、')+'。请在 Chrome 登录 x.com 后重新复制。'
    :'没有识别到 x.com 的 Netscape 格式 Cookie（字段用制表符分隔）。请用插件重新复制。');
  return '# Netscape HTTP Cookie File\n'+kept.join('\n')+'\n';
}

export function readTools(root,env=process.env){
  let local={};
  try{local=JSON.parse(readFileSync(resolve(root,'.local-tools.json'),'utf8').replace(/^\uFEFF/,''));}catch{}
  const ytDlp=env.COMPANION_YTDLP||local.ytDlp||'';
  const ffmpeg=env.COMPANION_FFMPEG||local.ffmpeg||'';
  const downloadRoot=env.COMPANION_X_DOWNLOAD_ROOT||local.xDownloadRoot||'';
  return {ytDlp:ytDlp&&existsSync(ytDlp)?ytDlp:'',ffmpeg:ffmpeg&&existsSync(ffmpeg)?ffmpeg:'',downloadRoot};
}

export function killTree(pid,{sync=false,spawn=nodeSpawn}={}){
  if(!pid)return;
  if(process.platform!=='win32'){try{process.kill(pid,'SIGKILL');}catch{}return;}
  const args=['/PID',String(pid),'/T','/F'];
  if(sync){try{execFileSync('taskkill',args,{stdio:'ignore',windowsHide:true,timeout:10_000});}catch{}return;}
  spawn('taskkill',args,{stdio:'ignore',windowsHide:true}).on('error',()=>{});
}

const ENGINE_HELP='未找到 yt-dlp.exe。请从 yt-dlp 官方发布页下载，在 .local-tools.json 写入 "ytDlp": "完整路径"（或设置环境变量 COMPANION_YTDLP）。';
const IMAGE_EXTS=new Set(['.jpg','.jpeg','.png','.webp','.gif']);

export function createXVideo({profile,downloadRoot='F:\\Xdownload',tools,safeStorage,notify=()=>{},onChange=()=>{},openPath,showItem,
  fetchArticle,spawn=nodeSpawn,kill=killTree,fetcher=fetch,now=Date.now,runLimit=RUN_LIMIT_MS,articleLimit=ARTICLE_LIMIT_MS}){
  const dataDir=join(profile,'x-video'),stateFile=join(dataDir,'state.json'),thumbDir=join(dataDir,'thumbs'),cookieFile=join(dataDir,'cookies.bin');
  const partial=join(downloadRoot,'.downloading'),archiveDir=join(downloadRoot,'archive'),catalogFile=join(downloadRoot,'catalog.json');
  const running=new Map();// 任务编号 → 本次运行；进程或抓取完全退出后才移除。
  let state={tasks:[],library:[],check:null,cookieAt:null,lastRoot:''},loadError='',catalogError='',catalogReady=false,closed=false,libraryRevision=0,catalogRevision=-1;
  let checking=null,updating=null,updateRequested=false,updateError='',emitTimer=null;
  const safeSegment=s=>typeof s==='string'&&s.length>0&&s!=='.'&&s!=='..'&&!/[\\/]/.test(s);
  const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);

  mkdirSync(thumbDir,{recursive:true});
  try{
    if(existsSync(stateFile)){
      const saved=JSON.parse(readFileSync(stateFile,'utf8'));
      if(!Array.isArray(saved?.tasks)||!Array.isArray(saved.library))throw Error('记录格式无效');
      state={...state,...saved};
    }
  }catch(error){loadError='下载记录读取失败，原文件已保留：'+stateFile+'（'+error.message+'）';}
  // 同一资料目录更换下载根目录后，剔除只属于旧根的失效条目。
  if(!loadError&&state.lastRoot&&state.lastRoot!==downloadRoot&&existsSync(downloadRoot)){
    const beforeLen=state.library.length;
    state.library=state.library.filter(item=>item.kind==='article'
      ?(safeSegment(item.dir)&&existsSync(join(downloadRoot,item.dir)))||(safeSegment(item.archivedDir)&&existsSync(join(archiveDir,item.archivedDir)))
      :Boolean(item.files?.some(f=>safeSegment(f.name)&&(existsSync(join(downloadRoot,f.name))||existsSync(join(archiveDir,f.name))))));
    if(state.library.length!==beforeLen)libraryRevision++;
  }
  if(!loadError)state.lastRoot=downloadRoot;
  // 上次退出或异常中断的任务一律停在断点，由用户决定继续。
  for(const task of state.tasks)if(task.state==='running'||task.state==='queued')Object.assign(task,{state:'paused',reason:'exit'});
  for(const file of readdirSync(dataDir))if(file.startsWith('.tmp-cookie-'))rmSync(join(dataDir,file),{force:true});

  function writeCatalog(){
    if(loadError||catalogError||!existsSync(downloadRoot))return;
    if(!catalogReady){syncCatalog();if(!catalogReady||catalogError)return;}
    const portable={
      version:1,
      updatedAt:formatJstIso(now()),
      items:state.library.map(item=>({
        id:item.id,kind:item.kind??'video',...(item.statusId&&{statusId:item.statusId}),
        name:item.name,url:item.url,...(item.dir&&{dir:item.dir}),
        finishedAt:item.finishedAt,archivedAt:item.archivedAt??null,
        ...(item.archivedDir&&{archivedDir:item.archivedDir}),
        ...(item.repliesCollected!==undefined&&{repliesCollected:item.repliesCollected}),
        ...(item.mediaCount!==undefined&&{mediaCount:item.mediaCount}),
        ...(item.failedMediaCount!==undefined&&{failedMediaCount:item.failedMediaCount}),
        files:item.files??[]
      }))
    };
    try{
      const temp=catalogFile+'.tmp';
      writeFileSync(temp,JSON.stringify(portable,null,2));
      renameSync(temp,catalogFile);
      catalogRevision=libraryRevision;
    }catch{}
  }

  function save(){
    if(loadError)return;
    const temp=stateFile+'.tmp';
    writeFileSync(temp,JSON.stringify(state));
    renameSync(temp,stateFile);
    if(catalogRevision!==libraryRevision||!existsSync(catalogFile))writeCatalog();
  }
  function emit(){
    clearTimeout(emitTimer);emitTimer=null;
    if(!closed)onChange();
  }
  function emitSoon(){emitTimer??=setTimeout(emit,400);}
  function commit(){save();emit();}
  const find=id=>state.tasks.find(task=>task.id===id);
  const drive=()=>{
    const root=parse(downloadRoot).root;
    return !root||existsSync(root);
  };
  function ensureDisk(){
    if(!drive())throw Error(parse(downloadRoot).root+' 盘不可用，请确认磁盘已连接（不会改存到其它盘）。');
    mkdirSync(downloadRoot,{recursive:true});
  }
  function alert(task,title,body){
    notify({kind:'x-download-alert',targetId:task.id,title:title+' · '+task.name,body});
  }

  // 同步下载目录的 catalog.json 与文章文件夹：支持整体搬迁目录、手工改名文章目录、手工移入或移出 archive 及新拷入文章目录。
  function syncCatalog(){
    if(loadError||!drive()||!existsSync(downloadRoot))return false;
    try{
      let changed=false;
      if(existsSync(catalogFile)){
        let catalog;
        try{
          catalog=JSON.parse(readFileSync(catalogFile,'utf8'));
          if(!Array.isArray(catalog?.items))throw Error('items 格式无效');
        }catch{
          catalogError='目录索引 catalog.json 损坏，原文件已保留：'+catalogFile;
          catalogReady=false;
          return false;
        }
        for(const entry of catalog.items){
          if(!safeId(entry?.id)||!entry.url)continue;
          if(entry.dir&&!safeSegment(entry.dir))continue;
          if(entry.archivedDir&&!safeSegment(entry.archivedDir))continue;
          const files=Array.isArray(entry.files)?entry.files.filter(f=>safeSegment(f?.name)):[];
          if(Array.isArray(entry.files)&&files.length!==entry.files.length)continue;
          const exist=state.library.find(row=>row.id===entry.id||(entry.kind==='article'&&entry.statusId&&row.kind==='article'&&row.statusId===entry.statusId));
          if(!exist){
            const {thumb:_dropThumb,...cleanEntry}=entry;
            state.library.push({...cleanEntry,thumb:null,kind:cleanEntry.kind??'video',files,
              ...((cleanEntry.kind??'video')==='video'&&!cleanEntry.archivedAt&&{thumbPending:true})});
            changed=true;
          }
        }
      }
      const scanArticleDir=parentDir=>{
        if(!existsSync(parentDir))return new Map();
        if(!statSync(parentDir).isDirectory())throw Error('路径不是文件夹：'+parentDir);
        const found=new Map();
        for(const dirent of readdirSync(parentDir,{withFileTypes:true})){
          if(!dirent.isDirectory())continue;
          if(parentDir===downloadRoot&&(dirent.name==='.downloading'||dirent.name==='archive'))continue;
          const mdPath=join(parentDir,dirent.name,'article.md');
          if(!existsSync(mdPath))continue;
          try{
            const fm=parseArticleFrontmatter(readFileSync(mdPath,'utf8'));
            if(fm?.id)found.set(String(fm.id),{dirName:dirent.name,fm,fullDir:join(parentDir,dirent.name)});
          }catch{}
        }
        return found;
      };
      const activeArticles=scanArticleDir(downloadRoot);
      const archivedArticles=scanArticleDir(archiveDir);
      for(const [statusId,info] of activeArticles){
        const existing=state.library.find(row=>row.kind==='article'&&row.statusId===statusId&&!row.archivedAt);
        if(existing){
          if(existing.dir!==info.dirName){existing.dir=info.dirName;changed=true;}
        }else{
          const archivedRow=state.library.find(row=>row.kind==='article'&&row.statusId===statusId&&row.archivedAt);
          if(archivedRow&&!archivedArticles.has(statusId)){
            archivedRow.archivedAt=null;archivedRow.dir=info.dirName;delete archivedRow.archivedDir;
            changed=true;
          }else if(!archivedRow){
            const mediaFiles=readdirSync(info.fullDir).filter(f=>f!=='article.md'&&!f.startsWith('.'));
            const files=['article.md',...mediaFiles].map(name=>({name,duration:0}));
            const savedAtMs=Date.parse(info.fm.saved_at)||now();
            state.library.unshift({
              id:'art-'+statusId+'-'+randomBytes(2).toString('hex'),
              kind:'article',statusId,
              name:sanitizeName(info.fm.title)||info.dirName.replace(new RegExp('_'+statusId+'$'),''),
              url:info.fm.url||`https://x.com/i/status/${statusId}`,
              dir:info.dirName,finishedAt:savedAtMs,archivedAt:null,thumb:null,
              repliesCollected:Number(info.fm.replies_collected)||0,
              mediaCount:Array.isArray(info.fm.media)?info.fm.media.length:mediaFiles.length,
              failedMediaCount:Array.isArray(info.fm.failed_media)?info.fm.failed_media.length:0,
              files
            });
            changed=true;
          }
        }
      }
      for(const item of state.library){
        if(item.archivedAt)continue;
        if(item.kind==='article'&&!activeArticles.has(item.statusId)&&archivedArticles.has(item.statusId)){
          item.archivedAt=now();
          item.archivedDir=archivedArticles.get(item.statusId).dirName;
          if(item.thumb)rmSync(join(thumbDir,item.thumb),{force:true});
          item.thumb=null;
          changed=true;
        }
      }
      catalogError='';catalogReady=true;
      if(changed){
        libraryRevision++;
        state.library.sort((a,b)=>(b.finishedAt||0)-(a.finishedAt||0));
        save();
      }else if(!existsSync(catalogFile)){
        writeCatalog();
      }
      return changed;
    }catch(error){
      catalogError='下载目录扫描失败：'+error.message;
      catalogReady=false;
      return false;
    }
  }

  // ---- 引擎版本与更新 ----
  function capture(command,args,timeout,onStart){
    return new Promise((done,fail)=>{
      let out='',err='',settled=false;
      const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
      onStart?.(child);
      const timer=setTimeout(()=>{kill(child.pid);finish(Error('执行超时'));},timeout);
      function finish(error){
        if(settled)return;
        settled=true;clearTimeout(timer);
        if(error)fail(error);else done(out);
      }
      child.stdout?.on('data',chunk=>{out=(out+chunk).slice(-4000);});
      child.stderr?.on('data',chunk=>{err=(err+chunk).slice(-4000);});
      child.on('error',finish);
      child.on('close',code=>finish(code===0?null:Error((err.trim()||out.trim()||'退出码 '+code).split(/\r?\n/).at(-1))));
    });
  }
  async function currentVersion(){
    const {ytDlp}=tools();
    if(!ytDlp)throw Error(ENGINE_HELP);
    const version=(await capture(ytDlp,['--ignore-config','--version'],30_000)).trim();
    if(!/^\d{4}\.\d\d?\.\d\d?(\.\d+)?$/.test(version))throw Error('无法识别 yt-dlp 版本');
    return version;
  }
  function checkVersion(){
    if(updateRequested)return Promise.reject(Error('引擎更新进行中，请稍后再检查。'));
    checking??=(async()=>{
      const day=tokyoDay(now());
      try{
        const [current,latest]=await Promise.all([currentVersion(),(async()=>{
          const response=await fetcher(RELEASE_URL,{headers:{'User-Agent':'feiyue-x-video',Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(8000)});
          if(!response.ok)throw Error('版本查询失败（HTTP '+response.status+'）');
          const tag=(await response.json())?.tag_name;
          if(typeof tag!=='string'||!/^\d{4}\./.test(tag))throw Error('版本查询返回异常');
          return tag;
        })()]);
        updateError='';
        state.check={day,current,latest,at:now(),decided:false};
        if(!hasUpdate())releaseConfirm();
      }catch(error){
        updateError='版本检查未完成：'+error.message;
        if(state.check?.day!==day)state.check={day,current:null,latest:null,at:now(),decided:false};
        throw error;
      }finally{checking=null;commit();queueMicrotask(pump);}
      return state.check;
    })();
    return checking;
  }
  const hasUpdate=()=>Boolean(state.check?.latest&&state.check.current&&newerVersion(state.check.latest,state.check.current));
  const needsDecision=()=>hasUpdate()&&!state.check.decided&&state.check.day===tokyoDay(now());
  function releaseConfirm(){
    for(const task of state.tasks)if(task.state==='confirm')Object.assign(task,{state:'queued',error:'',enqueuedAt:now()});
  }
  async function runUpdate(){
    if(updating||!updateRequested||running.size||closed)return;
    updating={child:null};emit();
    try{
      const {ytDlp}=tools();
      if(!ytDlp)throw Error(ENGINE_HELP);
      const target=state.check?.latest;
      await capture(ytDlp,['--ignore-config','-U'],5*60_000,child=>{updating.child=child;});
      const version=await currentVersion();
      if(target&&newerVersion(target,version))throw Error('更新后版本仍为 '+version);
      state.check={...state.check,current:version,decided:true};updateError='';
    }catch(error){
      if(state.check)state.check.decided=true;
      updateError='yt-dlp 更新失败，继续使用原版本：'+error.message;
    }finally{
      updating=null;updateRequested=false;
      if(!closed){commit();pump();}
    }
  }
  function decideUpdate(action){
    if(action==='apply'){
      if(!hasUpdate())throw Error('当前没有可更新的版本');
      updateRequested=true;updateError='';state.check.decided=true;releaseConfirm();commit();void runUpdate();
    }else if(action==='skip'){
      if(state.check)state.check.decided=true;
      releaseConfirm();commit();pump();
    }else if(action==='cancel'){
      if(updating)throw Error('更新已经开始，请等待完成');
      updateRequested=false;commit();pump();
    }else throw Error('未知的更新操作');
  }
  async function ensureVersionChecked(){
    if(!updateRequested&&state.check?.day!==tokyoDay(now()))await checkVersion().catch(()=>{});
    else if(checking)await checking.catch(()=>{});
    if(closed)throw Error('绯月正在退出');
  }
  async function gate(decision){
    if(!tools().ytDlp)return null;
    await ensureVersionChecked();
    if(needsDecision()&&!updateRequested){
      if(decision==='apply'||decision==='skip'){decideUpdate(decision);return null;}
      return {status:'update',current:state.check.current,latest:state.check.latest,running:running.size};
    }
    return null;
  }

  // ---- 提交与队列 ----
  async function enqueue({url,name,source='ui',decision,kind='video',replies=DEFAULT_REPLIES,overwrite=false}={}){
    if(loadError)throw Error(loadError);
    if(kind!=='video'&&kind!=='article')throw Error('未知的下载类型');
    const isArticle=kind==='article';
    const repliesLimit=isArticle?validateReplies(replies):0;
    const parsed=parseXUrl(url,{allowArticle:isArticle});
    if(!parsed)return {status:'invalid',message:isArticle
      ?'请输入 x.com 或 twitter.com 的帖子/文章链接（…/status/数字 或 …/article/数字）。'
      :'请输入 x.com 或 twitter.com 的帖子链接（…/status/数字）。'};
    if(!isArticle&&!tools().ytDlp)throw Error(ENGINE_HELP);
    ensureDisk();
    if(!catalogReady)syncCatalog();
    const active=()=>state.tasks.find(task=>(task.kind??'video')===kind&&parseXUrl(task.url,{allowArticle:isArticle})?.id===parsed.id);
    const duplicate=task=>({status:'duplicate',message:'该链接已在队列中（'+task.name+'），不重复占用通道。'});
    let existing=active();
    if(existing&&existing.state!=='failed')return duplicate(existing);

    let replaceId='';
    if(isArticle){
      const archivedItem=state.library.find(item=>!item.archivedAt&&item.kind==='article'&&item.statusId===parsed.id);
      if(archivedItem){
        if(!overwrite)return {status:'exists',id:archivedItem.id,url:archivedItem.url,name:archivedItem.name,message:`该文章已在列表中（${archivedItem.name}），可打开查看或点「更新重抓」。`};
        replaceId=archivedItem.id;
      }
    }else{
      await ensureVersionChecked();
    }

    const ask=!isArticle&&needsDecision()&&!updateRequested;
    if(ask&&source==='ui'&&decision!=='apply'&&decision!=='skip')
      return {status:'update',current:state.check.current,latest:state.check.latest,running:running.size};
    existing=active();
    if(existing&&existing.state!=='failed')return duplicate(existing);

    const downloaded=!isArticle&&state.library.some(item=>(item.kind??'video')==='video'&&parseXUrl(item.url)?.id===parsed.id);
    const waiting=ask&&source!=='ui';
    let task=existing,status='queued';
    const cleanName=sanitizeName(name);
    if(task){
      status='retried';
      Object.assign(task,{state:waiting?'confirm':'queued',error:'',reason:'',enqueuedAt:now(),
        ...(isArticle&&{replies:repliesLimit,replaceId}),
        ...(cleanName&&{name:cleanName})});
    }else{
      task={id:now().toString(36)+'-'+randomBytes(4).toString('hex'),kind,
        ...(isArticle&&{statusId:parsed.id,replies:repliesLimit,replaceId}),
        url:parsed.url,name:cleanName||(isArticle?'帖子 '+parsed.id:defaultName(now())),
        state:waiting?'confirm':'queued',low:false,reason:'',error:'',progress:0,enqueuedAt:now(),attempts:0,source};
      state.tasks.push(task);
    }
    if(waiting)alert(task,'下载待确认更新','发现 yt-dlp 新版本 '+state.check.latest+'，请在队列中选择更新或直接下载。');
    if(!isArticle&&decision==='apply'&&needsDecision())decideUpdate('apply');
    else if(!isArticle&&decision==='skip'&&needsDecision())decideUpdate('skip');
    else{commit();pump();}
    const message=waiting?'已登记，等待确认是否更新引擎：'+task.name
      :status==='retried'?'已重试上次失败的任务：'+task.name
      :updateRequested?'已登记，引擎更新完成后开始：'+task.name
      :isArticle?(replaceId?'已开始更新重抓文章：':'已交给绯月抓取文章：')+task.name
      :(downloaded?'这条链接下载过，将另存一份：':'已交给绯月下载：')+task.name;
    return {status,id:task.id,url:task.url,name:task.name,message,warning:updateError};
  }

  const order=(a,b)=>Number(a.low)-Number(b.low)||a.enqueuedAt-b.enqueuedAt;
  const runningArticles=()=>[...running.values()].filter(row=>row.kind==='article').length;
  function pump(){
    if(closed||loadError||updating)return;
    if(updateRequested){void runUpdate();return;}
    if(!drive())return;
    const hasYtDlp=Boolean(tools().ytDlp);
    while(running.size<MAX_RUNNING){
      const allowArticle=runningArticles()<MAX_ARTICLE_RUNNING;
      const task=state.tasks.filter(item=>item.state==='queued'&&!running.has(item.id)
        &&((item.kind??'video')==='article'?allowArticle:hasYtDlp)).sort(order)[0];
      if(!task)break;
      start(task);
    }
  }
  const taskDir=id=>join(partial,id);

  function start(task){
    const kind=task.kind??'video';
    const used=new Set([...running.values()].map(row=>row.slot));
    const slot=[0,1,2].find(index=>!used.has(index));
    const run={slot,kind,child:null,thumb:null,abort:new AbortController(),stop:'',files:new Map(),errors:[],streams:new Map(),startedAt:now(),stage:kind==='article'?'读取帖子页面':'解析链接',timer:null,cookie:''};
    running.set(task.id,run);
    Object.assign(task,{state:'running',reason:'',error:'',attempts:task.attempts+1});
    commit();
    const runner=kind==='article'?executeArticle(task,run):execute(task,run);
    void runner.catch(error=>{
      if(!run.stop&&!closed)fail(task,error.message);
    }).finally(()=>{
      clearTimeout(run.timer);
      if(run.cookie)rmSync(run.cookie,{force:true});
      if(closed)return;
      running.delete(task.id);
      if(run.stop==='cancel')removeDir(task.id);
      else if(existsSync(join(taskDir(task.id),'.tmp')))removeDir(join(task.id,'.tmp'));
      commit();pump();
    });
  }
  function removeDir(id){
    try{rmSync(join(partial,id),{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}
  }
  function fail(task,message){
    if(!find(task.id))return;
    Object.assign(task,{state:'failed',error:message});
    alert(task,(task.kind==='article'?'X文章抓取失败':'X视频下载失败'),'第 '+task.attempts+' 次尝试：'+message);
  }
  function stopRun(id,reason){
    const run=running.get(id);
    if(!run||run.stop)return;
    run.stop=reason;
    clearTimeout(run.timer);
    run.abort?.abort();
    kill(run.child?.pid);kill(run.thumb?.pid);
  }
  function timeout(task,run){
    if(run.stop||running.get(task.id)!==run)return;
    stopRun(task.id,'timeout');
    Object.assign(task,{state:'paused',reason:'timeout',low:true,timeouts:(task.timeouts??0)+1});
    const span=run.kind==='article'?'3 分钟':'1 小时';
    alert(task,'下载超时已自动暂停',run.kind==='article'
      ?`第 ${task.timeouts} 次：单次运行超过 ${span}，已自动暂停并降到最低优先级（继续时重新抓取）。`
      :`第 ${task.timeouts} 次：单次运行超过 ${span}，已保留断点并降到最低优先级。`);
    commit();
  }

  function progressLine(run,line){
    if(line.startsWith('XVP|')){
      const [,index,count,status,done,total,estimate,fragment,fragments]=line.split('|');
      const item=Number(index)||1,items=Math.max(Number(count)||1,item);
      const stream=run.streams.get(item)??0;
      let part=0;
      if(status==='finished'){part=1;run.streams.set(item,stream+1);}
      else if(Number(total)>0)part=Number(done)/Number(total);
      else if(Number(fragments)>1)part=Number(fragment)/Number(fragments);
      else if(Number(estimate)>0)part=Number(done)/Number(estimate);
      part=Math.min(1,Math.max(0,part||0));
      const within=stream===0?part*.9:.9+part*.1;
      run.stage=items>1?`下载第 ${item}/${items} 段`:stream?'下载音频':'下载中';
      return (item-1+Math.min(1,within))/items*99;
    }
    if(line.startsWith('XVPP|')&&/Merger|Fixup|Remux/.test(line))run.stage='合并音视频';
    if(line.startsWith('XVF|')){
      const [,index,duration,...path]=line.split('|');
      run.files.set(Number(index)||1,{path:path.join('|'),duration:Number(duration)||0});
    }
    return null;
  }

  function readDecryptedCookie(){
    if(!state.cookieAt)return '';
    try{return safeStorage.decryptString(readFileSync(cookieFile));}
    catch{throw Error('登录 Cookie 无法解密，请在 X视频管理中重新导入或清空。');}
  }

  async function runYtDlpToDir(task,run,targetUrl,dir,{pattern='part-%(playlist_index|1)s.%(ext)s',trackProgress=true,limitMs=runLimit}={}){
    const {ytDlp,ffmpeg}=tools();
    if(!ytDlp)throw Error(ENGINE_HELP);
    const temp=join(dir,'.tmp');
    mkdirSync(temp,{recursive:true});
    const args=['--ignore-config','--no-update','--newline','--progress','--no-quiet','--no-simulate','--encoding','utf-8',
      '--no-mtime','--no-cache-dir','--socket-timeout','30','--progress-template',PROGRESS,'--progress-template',POSTPROCESS,'--print',DONE,
      '-P',dir,'-o',pattern,'--merge-output-format','mp4'];
    if(ffmpeg)args.push('--ffmpeg-location',ffmpeg);
    const cookieText=readDecryptedCookie();
    if(cookieText&&!run.cookie){
      run.cookie=join(dataDir,'.tmp-cookie-'+task.id+'.txt');
      writeFileSync(run.cookie,cookieText,{mode:0o600});
    }
    if(run.cookie)args.push('--cookies',run.cookie);
    args.push('--',targetUrl);
    if(run.stop)return [];
    run.files.clear();run.streams.clear();run.errors=[];
    await new Promise((done,reject)=>{
      const child=spawn(ytDlp,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,TEMP:temp,TMP:temp,PYTHONUTF8:'1'}});
      run.child=child;
      let stepTimer=null;
      if(limitMs>0){stepTimer=setTimeout(()=>timeout(task,run),limitMs);run.timer=stepTimer;}
      const lines=(stream,handle)=>{
        let rest='';
        stream?.setEncoding?.('utf8');
        stream?.on('data',chunk=>{
          const parts=(rest+chunk).split(/\r?\n|\r/);
          rest=parts.pop();
          parts.forEach(handle);
        });
        stream?.on('end',()=>{if(rest)handle(rest);rest='';});
      };
      lines(child.stdout,line=>{
        const value=progressLine(run,line);
        if(trackProgress&&value!==null&&!run.stop)task.progress=Math.max(task.progress,Math.round(value*10)/10);
        emitSoon();
      });
      lines(child.stderr,line=>{if(line.startsWith('ERROR:'))run.errors=[...run.errors.slice(-2),line];});
      child.on('error',reject);
      child.on('close',code=>{
        if(stepTimer){clearTimeout(stepTimer);if(run.timer===stepTimer)run.timer=null;}
        run.child=null;
        if(run.stop||code===0)done();
        else reject(Error(explain(run.errors.at(-1)??'yt-dlp 退出码 '+code)));
      });
    });
    return [...run.files].sort(([a],[b])=>a-b).map(([,file])=>file);
  }

  async function execute(task,run){
    ensureDisk();
    await runYtDlpToDir(task,run,task.url,taskDir(task.id));
    if(run.stop||closed)return;
    await finalize(task,run);
  }

  async function executeArticle(task,run){
    ensureDisk();
    if(typeof fetchArticle!=='function')throw Error('当前宿主未接入文章页面抓取能力。');
    const dir=taskDir(task.id);
    removeDir(task.id);
    mkdirSync(dir,{recursive:true});
    const cookieText=readDecryptedCookie();
    if(articleLimit>0)run.timer=setTimeout(()=>timeout(task,run),articleLimit);
    let scraped;
    try{
      scraped=await fetchArticle({url:task.url,repliesLimit:task.replies??DEFAULT_REPLIES,cookiesText:cookieText,signal:run.abort.signal});
    }catch(error){
      const hint=!cookieText&&/未加载到|未找到目标帖子|登录/.test(error?.message||'')?'（长文归档需先在「X视频管理 → 🍪」导入 X 登录 Cookie）':'';
      throw Error((error?.message||'抓取失败')+hint);
    }
    if(run.stop||closed)return;
    if(!scraped?.author||(!String(scraped.text||'').trim()&&!(scraped.media?.length)&&!scraped.quote)){
      throw Error('未提取到有效帖子内容（缺少作者或正文/媒体为空），未覆盖原归档。');
    }
    task.progress=35;run.stage='整理正文与下载媒体';emitSoon();

    const mainText=await resolveTcoLinks(scraped.text||'',scraped.links||{},fetcher,run.abort.signal);
    const quoteText=scraped.quote?await resolveTcoLinks(scraped.quote.text||'',scraped.links||{},fetcher,run.abort.signal):'';
    const replies=[];
    for(const reply of scraped.replies??[]){
      if(run.stop||closed)return;
      replies.push({...reply,text:await resolveTcoLinks(reply.text||'',reply.links||{},fetcher,run.abort.signal),
        quote:reply.quote?{...reply.quote,text:await resolveTcoLinks(reply.quote.text||'',reply.links||{},fetcher,run.abort.signal)}:null});
    }
    if(run.stop||closed)return;

    let mediaSeq=0;
    const savedMedia=[],failedMedia=[];
    let firstImageFile='',firstVideoFile='';
    async function downloadMediaList(list){
      const local=[];
      for(const item of list??[]){
        if(run.stop||closed)break;
        if(item.type==='image'){
          const norm=normalizeImageUrl(item.url);
          if(!norm){failedMedia.push({url:item.url,error:'图片链接无效'});continue;}
          try{
            const res=await fetcher(norm,{signal:AbortSignal.any([run.abort.signal,AbortSignal.timeout(30_000)])});
            if(!res.ok)throw Error('HTTP '+res.status);
            const buf=Buffer.from(await res.arrayBuffer());
            const u=new URL(norm);
            const rawExt=u.searchParams.get('format')||extname(u.pathname).slice(1)||'jpg';
            const ext='.'+(rawExt.toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg');
            const fileName=String(++mediaSeq).padStart(2,'0')+ext;
            writeFileSync(join(dir,fileName),buf);
            if(!firstImageFile)firstImageFile=join(dir,fileName);
            savedMedia.push(fileName);
            local.push({type:'image',file:fileName,rel:'./'+fileName});
          }catch(error){
            failedMedia.push({url:norm,error:error.message});
          }
        }else if(item.type==='video'){
          if(!tools().ytDlp){
            failedMedia.push({url:item.url,error:'未配置 yt-dlp.exe'});
            continue;
          }
          try{
            const prefix=`v-${mediaSeq+1}-`;
            const downloaded=await runYtDlpToDir(task,run,item.url,dir,{pattern:`${prefix}%(playlist_index|1)s.%(ext)s`,trackProgress:false,limitMs:0});
            if(!downloaded.length)throw Error('未下载到视频文件');
            for(const v of downloaded){
              const ext=extname(v.path)||'.mp4';
              const fileName=String(++mediaSeq).padStart(2,'0')+ext;
              renameSync(v.path,join(dir,fileName));
              if(!firstVideoFile)firstVideoFile=join(dir,fileName);
              savedMedia.push(fileName);
              local.push({type:'video',file:fileName,rel:'./'+fileName,duration:v.duration||0});
            }
          }catch(error){
            try{for(const f of readdirSync(dir))if(f.startsWith(`v-${mediaSeq+1}-`))rmSync(join(dir,f),{force:true});}catch{}
            failedMedia.push({url:item.url,error:error.message});
          }
        }
      }
      return local;
    }

    const mainLocal=await downloadMediaList(scraped.media);
    if(run.stop||closed)return;
    task.progress=70;emitSoon();
    const quoteLocal=scraped.quote?await downloadMediaList(scraped.quote.media):[];
    for(const reply of replies){
      reply.localMedia=await downloadMediaList(reply.media);
      reply.publishedAt=formatJstIso(reply.publishedAt)||reply.publishedAt||'';
      if(reply.quote){
        reply.quote.localMedia=await downloadMediaList(reply.quote.media);
      }
    }
    if(run.stop||closed)return;

    const stemRaw=task.name&&task.name!=='帖子 '+task.statusId?task.name:sanitizeName(scraped.title)||defaultName(now());
    const savedIso=formatJstIso(now());
    const pubIso=formatJstIso(scraped.publishedAt)||scraped.publishedAt||'';
    const md=renderArticleMarkdown({
      id:task.statusId,type:scraped.type||'tweet',title:scraped.title||stemRaw,
      author:scraped.author||'',url:scraped.url||task.url,publishedAt:pubIso,savedAt:savedIso,
      repliesLimit:task.replies??DEFAULT_REPLIES,repliesCollected:replies.length,
      media:savedMedia,failedMedia,text:mainText,localMedia:mainLocal,
      quote:scraped.quote?{...scraped.quote,text:quoteText,localMedia:quoteLocal}:null,
      replies
    });
    writeFileSync(join(dir,'article.md'),md,'utf8');

    task.progress=90;run.stage='生成封面与落盘';emitSoon();
    const thumb=task.id+'.jpg';
    let made=false;
    if(firstImageFile){
      made=await extractThumb(run,tools().ffmpeg,firstImageFile,join(thumbDir,thumb));
      if(!made&&existsSync(firstImageFile)){try{copyFileSync(firstImageFile,join(thumbDir,thumb));made=true;}catch{}}
    }else if(firstVideoFile){
      made=await extractThumb(run,tools().ffmpeg,firstVideoFile,join(thumbDir,thumb));
    }
    if(run.stop||closed){rmSync(join(thumbDir,thumb),{force:true});return;}

    ensureDisk();
    if(existsSync(join(dir,'.tmp')))rmSync(join(dir,'.tmp'),{recursive:true,force:true});
    let destDirName='';
    const existingItem=task.replaceId?state.library.find(r=>r.id===task.replaceId&&!r.archivedAt):null;
    if(existingItem&&existingItem.dir){
      const targetFull=join(downloadRoot,existingItem.dir);
      let archivedOld='';
      if(existsSync(targetFull)){
        mkdirSync(archiveDir,{recursive:true});
        archivedOld=freeArchiveDirName(archiveDir,existingItem.dir);
        renameSync(targetFull,join(archiveDir,archivedOld));
      }
      try{renameSync(dir,targetFull);}
      catch(error){if(archivedOld&&existsSync(join(archiveDir,archivedOld))&&!existsSync(targetFull))try{renameSync(join(archiveDir,archivedOld),targetFull);}catch{}throw error;}
      destDirName=existingItem.dir;
      if(existingItem.thumb)rmSync(join(thumbDir,existingItem.thumb),{force:true});
      Object.assign(existingItem,{
        name:stemRaw,url:scraped.url||task.url,finishedAt:now(),thumb:made?thumb:null,
        repliesCollected:replies.length,mediaCount:savedMedia.length,failedMediaCount:failedMedia.length,
        files:['article.md',...savedMedia].map(n=>({name:n,duration:0}))
      });
      state.library=[existingItem,...state.library.filter(r=>r!==existingItem)];
    }else{
      destDirName=freeDirName(downloadRoot,stemRaw,task.statusId);
      renameSync(dir,join(downloadRoot,destDirName));
      state.library.unshift({
        id:task.id,kind:'article',statusId:task.statusId,name:stemRaw,url:scraped.url||task.url,
        dir:destDirName,finishedAt:now(),archivedAt:null,thumb:made?thumb:null,
        repliesCollected:replies.length,mediaCount:savedMedia.length,failedMediaCount:failedMedia.length,
        files:['article.md',...savedMedia].map(n=>({name:n,duration:0}))
      });
    }
    const finalId=existingItem?existingItem.id:task.id;
    state.tasks=state.tasks.filter(item=>item!==task);
    libraryRevision++;
    save();
    const reqReplies=task.replies??DEFAULT_REPLIES;
    const replySummary=reqReplies>0&&replies.length<reqReplies?`要求 ${reqReplies} 条，实得 ${replies.length} 条回复`:`${replies.length} 条回复`;
    notify({kind:'x-download',targetId:finalId,
      title:(failedMedia.length?'X文章归档完成（部分媒体失败）· ':'X文章归档完成 · ')+stemRaw,
      body:`已保存 article.md（${replySummary}，${savedMedia.length} 个媒体`+(failedMedia.length?`，${failedMedia.length} 个媒体失败`:'')+`）到 ${join(downloadRoot,destDirName)}`});
  }

  function explain(line){
    const text=line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?(\d+:\s*)?/,'').replace(/;\s*please report this issue.*$/i,'').slice(0,300);
    if(/No video could be found/i.test(text))return '这条帖子里没有取到视频。敏感或受限内容请先导入登录 Cookie。';
    if(/authenticat|log ?in|NSFW|cookies|protected|not authorized/i.test(text))return '需要登录才能下载，请导入或更新登录 Cookie。原始信息：'+text;
    return text;
  }

  function freeNames(dir,base,extensions){
    for(let n=1;;n++){
      const stem=n===1?base:`${base} (${n})`;
      const names=extensions.map((ext,i)=>(extensions.length>1?`${stem}-${i+1}`:stem)+ext);
      if(names.every(name=>!existsSync(join(dir,name))))return {stem,names};
    }
  }
  function freeDirName(dir,base,suffix){
    const raw=sanitizeName(base)||'article';
    for(let n=1;;n++){
      const name=(n===1?raw:`${raw} (${n})`)+(suffix?`_${suffix}`:'');
      if(!existsSync(join(dir,name)))return name;
    }
  }
  function freeArchiveDirName(dir,base){
    const raw=String(base||'article').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[\\/:*?"<>|]/g,'_').trim()||'article';
    for(let n=1;;n++){
      const name=n===1?raw:`${raw} (${n})`;
      if(!existsSync(join(dir,name)))return name;
    }
  }
  function moveAll(pairs){
    const moved=[];
    try{
      for(const [from,to] of pairs){
        if(existsSync(to))throw Error('目标文件已存在：'+to);
        renameSync(from,to);moved.push([from,to]);
      }
    }catch(error){
      for(const [from,to] of moved.reverse())try{renameSync(to,from);}catch{}
      throw error;
    }
  }
  function extractThumb(run,ffmpeg,input,output){
    return new Promise(done=>{
      const child=spawn(ffmpeg||'ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-i',input,'-map','0:v:0','-frames:v','1',
        '-vf','scale=480:-2','-q:v','4',output],{windowsHide:true,stdio:'ignore'});
      run.thumb=child;
      const timer=setTimeout(()=>kill(child.pid),30_000);
      const finish=ok=>{clearTimeout(timer);run.thumb=null;done(ok&&existsSync(output));};
      child.on('error',()=>finish(false));
      child.on('close',code=>finish(code===0));
    });
  }
  async function finalize(task,run){
    const files=[...run.files].sort(([a],[b])=>a-b).map(([,file])=>file);
    if(!files.length||files.some(file=>!existsSync(file.path)))throw Error('没有取得完整的视频文件，请重试。');
    run.stage='提取首帧';emit();
    const thumb=task.id+'.jpg';
    const made=await extractThumb(run,tools().ffmpeg,files[0].path,join(thumbDir,thumb));
    const dropThumb=()=>rmSync(join(thumbDir,thumb),{force:true});
    if(run.stop||closed){dropThumb();return;}
    let stem,names;
    try{
      ensureDisk();
      ({stem,names}=freeNames(downloadRoot,task.name,files.map(file=>extname(file.path)||'.mp4')));
      moveAll(files.map((file,i)=>[file.path,join(downloadRoot,names[i])]));
    }catch(error){dropThumb();throw error;}
    state.library.unshift({id:task.id,kind:'video',name:stem,url:task.url,finishedAt:now(),archivedAt:null,thumb:made?thumb:null,
      files:files.map((file,i)=>({name:names[i],duration:file.duration}))});
    state.tasks=state.tasks.filter(item=>item!==task);
    libraryRevision++;
    save();
    removeDir(task.id);
    notify({kind:'x-download',targetId:task.id,title:'X视频下载完成 · '+stem,
      body:(names.length>1?`已保存 ${names.length} 段视频到 `:`已保存 ${names[0]} 到 `)+downloadRoot});
  }

  function taskAction(action,id){
    if(loadError)throw Error(loadError);
    if(action==='resume-all'){
      const at=now();
      state.tasks.filter(item=>item.state==='paused').sort(order).forEach((task,i)=>Object.assign(task,{state:'queued',reason:'',enqueuedAt:at+i}));
      commit();pump();return;
    }
    const task=find(id);
    if(!task)throw Error('任务已经结束');
    if(action==='pause'){
      if(task.state!=='running'&&task.state!=='queued')return;
      stopRun(id,'manual');Object.assign(task,{state:'paused',reason:'manual'});
    }else if(action==='resume'){
      if(task.state!=='paused'&&task.state!=='failed')return;
      Object.assign(task,{state:'queued',reason:'',error:'',enqueuedAt:now()});
    }else if(action==='cancel'){
      state.tasks=state.tasks.filter(item=>item!==task);
      const run=running.get(id);
      if(run){stopRun(id,'cancel');run.stop='cancel';}
      else removeDir(id);
    }else throw Error('未知的任务操作');
    commit();pump();
  }

  // ---- 成品管理 ----
  const itemPath=(item,fileName)=>item.kind==='article'
    ?(safeSegment(item.dir)&&safeSegment(fileName)?join(downloadRoot,item.dir,fileName):'')
    :(safeSegment(fileName)?join(downloadRoot,fileName):'');
  const missing=item=>item.kind==='article'
    ?(safeSegment(item.dir)&&existsSync(join(downloadRoot,item.dir,'article.md'))?0:1)
    :item.files.filter(file=>!safeSegment(file.name)||!existsSync(join(downloadRoot,file.name))).length;

  function articleCover(item){
    if(item.kind!=='article'||!safeSegment(item.dir))return '';
    const full=join(downloadRoot,item.dir);
    if(!existsSync(full))return '';
    return item.files.find(f=>safeSegment(f.name)&&IMAGE_EXTS.has(extname(f.name).toLowerCase())&&existsSync(join(full,f.name)))?.name??'';
  }
  const hasLocalCover=item=>Boolean(safeSegment(item.thumb)&&existsSync(join(thumbDir,item.thumb))||articleCover(item)
    ||(item.thumbPending&&item.kind!=='article'&&!item.archivedAt&&item.files?.some(f=>safeSegment(f.name)&&existsSync(join(downloadRoot,f.name)))));

  function library({page=0,query=''}={}){
    syncCatalog();
    const needle=String(query).trim().toLowerCase();
    const rows=state.library.filter(item=>!item.archivedAt&&(!needle||item.name.toLowerCase().includes(needle)));
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    page=Math.min(pages-1,Math.max(0,Number.isSafeInteger(page)?page:0));
    return {page,pages,total:rows.length,error:loadError||catalogError,items:rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(item=>({
      id:item.id,kind:item.kind??'video',name:item.name,url:item.url,dir:item.dir??'',
      finishedAt:item.finishedAt,hasThumb:hasLocalCover(item),missing:missing(item),
      ...(item.kind==='article'&&{repliesCollected:item.repliesCollected??0,mediaCount:item.mediaCount??0,failedMediaCount:item.failedMediaCount??0}),
      files:item.files.map(file=>{const p=itemPath(item,file.name);return {name:file.name,duration:file.duration,missing:!p||!existsSync(p)};})}))};
  }
  const entry=id=>{
    const item=state.library.find(row=>row.id===id);
    if(!item)throw Error('没有找到这条下载记录');
    return item;
  };
  async function thumbnail(id){
    const item=state.library.find(row=>row.id===id);
    if(!item)return null;
    if(safeSegment(item.thumb)&&existsSync(join(thumbDir,item.thumb))){
      try{return 'data:image/jpeg;base64,'+(await readFile(join(thumbDir,item.thumb))).toString('base64');}catch{}
    }
    const cover=articleCover(item);
    if(cover){
      const mime={'.png':'image/png','.webp':'image/webp','.gif':'image/gif'}[extname(cover).toLowerCase()]||'image/jpeg';
      try{return `data:${mime};base64,`+(await readFile(join(downloadRoot,item.dir,cover))).toString('base64');}catch{}
    }
    // 搬迁目录到新资料目录时，对已有本地视频按需懒生成首帧缩略图。
    if(item.thumbPending&&item.kind!=='article'&&!item.archivedAt&&!closed){
      delete item.thumbPending;
      const first=item.files?.find(f=>safeSegment(f.name)&&existsSync(join(downloadRoot,f.name)));
      if(first){
        const thumbName=item.id+'.jpg';
        const made=await extractThumb({},tools().ffmpeg,join(downloadRoot,first.name),join(thumbDir,thumbName));
        if(made&&!closed){
          item.thumb=thumbName;save();
          try{return 'data:image/jpeg;base64,'+(await readFile(join(thumbDir,thumbName))).toString('base64');}catch{}
        }
        save();
      }
    }
    return null;
  }
  async function play(id,index=0){
    const item=entry(id);
    if(item.archivedAt)return {ok:false,message:'已归档至 '+archiveDir};
    if(item.kind==='article'){
      const mdPath=itemPath(item,'article.md');
      if(!mdPath||!existsSync(mdPath))return {ok:false,message:'文章文件不存在（可能已被手工移走）：'+(mdPath||item.dir)};
      const error=await openPath(mdPath);
      return error?{ok:false,message:'文章没能打开：'+error}:{ok:true,message:'已打开文章：'+item.name};
    }
    const file=item.files[index];
    if(!file)throw Error('没有这一段视频');
    const path=itemPath(item,file.name);
    if(!path||!existsSync(path))return {ok:false,message:'文件不存在（可能已被手工移走）：'+(path||file.name)};
    const error=await openPath(path);
    return error?{ok:false,message:'播放器没能打开：'+error}:{ok:true,message:'已交给默认播放器：'+file.name};
  }
  function reveal(id){
    const item=entry(id);
    if(item.kind==='article'){
      const mdPath=itemPath(item,'article.md');
      const dirPath=safeSegment(item.dir)?join(downloadRoot,item.dir):'';
      const target=mdPath&&existsSync(mdPath)?mdPath:dirPath&&existsSync(dirPath)?dirPath:'';
      if(!target)return {ok:false,message:'文章目录不存在，无法定位。'};
      showItem(target);
      return {ok:true,message:'已在资源管理器中选中文章目录'};
    }
    const path=item.files.map(file=>itemPath(item,file.name)).find(file=>file&&existsSync(file));
    if(!path)return {ok:false,message:'文件不存在，无法定位。'};
    showItem(path);
    return {ok:true,message:'已在资源管理器中选中文件'};
  }
  function markArchived(item,message){
    item.archivedAt=now();
    if(safeSegment(item.thumb))rmSync(join(thumbDir,item.thumb),{force:true});
    item.thumb=null;
    libraryRevision++;
    commit();
    return {ok:true,message};
  }
  function archive(id){
    if(loadError)throw Error(loadError);
    const item=entry(id);
    if(item.archivedAt)return {ok:true,message:'这条记录已经归档'};
    ensureDisk();
    if(item.kind==='article'){
      const srcDir=safeSegment(item.dir)?join(downloadRoot,item.dir):'';
      let movedDir=false;
      if(srcDir&&existsSync(srcDir)){
        mkdirSync(archiveDir,{recursive:true});
        const destName=freeArchiveDirName(archiveDir,item.dir);
        try{renameSync(srcDir,join(archiveDir,destName));item.archivedDir=destName;movedDir=true;}
        catch(error){throw Error('归档失败，目录内文件可能正被占用，请关闭后重试。（'+(error.code??error.message)+'）');}
      }
      return markArchived(item,movedDir?`已整篇归档到 ${archiveDir}`:'原文章目录已缺失，记录已脱离管理列表');
    }
    const present=item.files.filter(file=>existsSync(join(downloadRoot,file.name)));
    if(present.length){
      mkdirSync(archiveDir,{recursive:true});
      const pairs=present.map(file=>{
        const ext=extname(file.name),{names:[name]}=freeNames(archiveDir,file.name.slice(0,file.name.length-ext.length),[ext]);
        return [join(downloadRoot,file.name),join(archiveDir,name)];
      });
      try{moveAll(pairs);}
      catch(error){throw Error('归档失败，文件可能正被播放器占用，请关闭后重试。（'+(error.code??error.message)+'）');}
    }
    return markArchived(item,present.length?`已归档 ${present.length} 个文件到 ${archiveDir}`:'原文件已缺失，记录已脱离管理列表');
  }
  async function card(targetId){
    let item=state.library.find(row=>row.id===targetId);
    if(!item){syncCatalog();item=state.library.find(row=>row.id===targetId);}
    if(!item)return {state:'unknown',message:loadError||'找不到这条下载记录'};
    if(!item.archivedAt&&missing(item)){syncCatalog();}
    if(item.archivedAt)return {state:'archived',kind:item.kind??'video',name:item.name,message:'已归档至 '+archiveDir};
    if(item.kind==='article'){
      const mdPath=join(downloadRoot,item.dir,'article.md');
      if(!existsSync(mdPath))return {state:'missing',kind:'article',name:item.name,message:'文章不存在（可能已被手工移走）'};
      return {state:'ready',kind:'article',id:item.id,name:item.name,thumb:await thumbnail(item.id),
        repliesCollected:item.repliesCollected??0,mediaCount:item.mediaCount??0,failedMediaCount:item.failedMediaCount??0,
        files:[{duration:0,missing:false}]};
    }
    const files=item.files.map(file=>({duration:file.duration,missing:!existsSync(join(downloadRoot,file.name))}));
    if(files.every(file=>file.missing))return {state:'missing',kind:'video',name:item.name,message:'文件不存在（可能已被手工移走）'};
    return {state:'ready',kind:'video',id:item.id,name:item.name,thumb:await thumbnail(item.id),files};
  }

  // ---- 登录 Cookie ----
  function importCookies(text){
    if(loadError)throw Error(loadError);
    if(String(text??'').length>2_000_000)throw Error('内容过大，请只导入 X 的 Cookie。');
    const clean=parseCookies(text,now());
    if(safeStorage?.isEncryptionAvailable?.()!==true)throw Error('系统加密当前不可用，Cookie 没有保存。');
    writeFileSync(cookieFile,safeStorage.encryptString(clean),{mode:0o600});
    state.cookieAt=now();commit();
    return {savedAt:state.cookieAt};
  }
  function clearCookies(){
    rmSync(cookieFile,{force:true});
    state.cookieAt=null;commit();
  }

  function snapshot(){
    const {ytDlp}=tools(),disk=drive();
    const view=task=>{
      const run=running.get(task.id);
      return {id:task.id,kind:task.kind??'video',...(task.replies!==undefined&&{replies:task.replies}),
        url:task.url,name:task.name,state:task.state,low:task.low,reason:task.reason,error:task.error,progress:task.progress,
        ...(run&&task.state==='running'&&{slot:run.slot,stage:run.stage,startedAt:run.startedAt}),stopping:Boolean(run&&task.state!=='running')};
    };
    const rank={running:0,queued:1,confirm:2,paused:3,failed:4};
    return {root:downloadRoot,now:now(),runLimit,articleLimit,max:MAX_RUNNING,occupied:running.size,error:loadError||catalogError,
      engine:{ready:Boolean(ytDlp),help:ytDlp?'':ENGINE_HELP},disk:{ready:disk,help:disk?'':parse(downloadRoot).root+' 盘不可用，请确认磁盘已连接。'},
      tasks:[...state.tasks].sort((a,b)=>rank[a.state]-rank[b.state]||order(a,b)).map(view),
      libraryRevision,
      libraryCount:state.library.filter(item=>!item.archivedAt).length,
      cookie:{savedAt:state.cookieAt},
      update:{current:state.check?.current??null,latest:state.check?.latest??null,available:hasUpdate(),waiting:updateRequested&&!updating,
        applying:Boolean(updating),checking:Boolean(checking),needsDecision:needsDecision(),error:updateError}};
  }
  function close(){
    if(closed)return;
    closed=true;clearTimeout(emitTimer);
    for(const [id,run] of running){
      run.stop||='exit';clearTimeout(run.timer);
      run.abort?.abort();
      kill(run.child?.pid,{sync:true});kill(run.thumb?.pid,{sync:true});
      if(run.cookie)rmSync(run.cookie,{force:true});
      if(run.stop==='cancel')removeDir(id);
    }
    kill(updating?.child?.pid,{sync:true});
    for(const task of state.tasks)if(task.state==='running'||task.state==='queued')Object.assign(task,{state:'paused',reason:'exit'});
    save();
  }
  syncCatalog();
  save();
  return {enqueue,kick:pump,gate,taskAction,decideUpdate,checkVersion,syncCatalog,library,thumbnail,play,reveal,archive,card,importCookies,clearCookies,snapshot,close,archiveDir};
}
