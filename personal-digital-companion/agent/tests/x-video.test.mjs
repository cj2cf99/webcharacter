// X 视频下载核心：用模拟进程核对链接、命名、调度、超时、续传、更新门禁、归档、Cookie 与重启恢复。
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {createXVideo,parseXUrl,sanitizeName,defaultName,newerVersion,parseCookies} from '../../desktop/x-video.mjs';
import {attachXVideo} from '../../desktop/x-video-host.mjs';
import {createReminderChecks} from '../../desktop/reminder-checks.mjs';

const wait=(ms=15)=>new Promise(done=>setTimeout(done,ms));
async function until(check,label){
  for(let i=0;i<200;i++){if(check())return;await wait(5);}
  assert.fail('等待超时：'+label);
}
const link=n=>`https://x.com/someone/status/${1000+n}`;
const COOKIES=['# Netscape HTTP Cookie File',
  '#HttpOnly_.x.com\tTRUE\t/\tTRUE\t0\tauth_token\tfake-auth',
  '.x.com\tTRUE\t/\tTRUE\t4102444800\tct0\tfake-ct0',
  '.example.com\tTRUE\t/\tTRUE\t0\tsession\tother-site'].join('\n');

// 模拟 yt-dlp / ffmpeg：进程由测试控制何时结束。
function world({version='2026.11.23',latest='2026.11.23',fetchFails=false,ytDlp=true,limit,encryption=true,thumbFails=false,holdThumb=false,openError=''}={}){
  const base=mkdtempSync(join(tmpdir(),'feiyue-xv-')),profile=join(base,'profile'),root=join(base,'Xdownload');
  const state={version,latest,fetchFails,ytDlp,fetches:0,clock:Date.parse('2026-11-28T12:00:00Z'),downloads:[],updates:[],thumbs:[],killed:[],notices:[],opened:[],shown:[],changes:0};
  let pid=100;
  function spawn(command,args,options){
    const child=new EventEmitter();
    child.pid=++pid;child.stdout=new PassThrough();child.stderr=new PassThrough();child.done=false;
    child.exit=(code=0)=>{
      if(child.done)return;child.done=true;
      child.stdout.end();child.stderr.end();
      setImmediate(()=>child.emit('close',code));
    };
    const record={child,args,options};
    if(command==='fake-ffmpeg'){
      if(holdThumb)state.thumbs.push(record);
      else setImmediate(()=>{if(!thumbFails)writeFileSync(args.at(-1),'jpg');child.exit(thumbFails?1:0);});
    }else if(args.includes('--version')){
      setImmediate(()=>{child.stdout.write(state.version+'\n');child.exit(0);});
    }else if(args.includes('-U')){
      state.updates.push(record);
    }else{
      record.url=args.at(-1);record.dir=args[args.indexOf('-P')+1];
      const at=args.indexOf('--cookies');
      record.cookie=at<0?null:{file:args[at+1],text:readFileSync(args[at+1],'utf8')};
      record.progress=(...fields)=>child.stdout.write(['XVP',...fields].join('|')+'\n');
      record.finish=(count=1,code=0)=>{
        mkdirSync(record.dir,{recursive:true});
        for(let i=1;i<=count;i++){
          const path=join(record.dir,`part-${i}.mp4`);
          writeFileSync(path,'video '+i);
          child.stdout.write(`XVF|${i}|${i*3}|${path}\n`);
        }
        child.exit(code);
      };
      record.fail=line=>{child.stderr.write(line+'\n');child.exit(1);};
      state.downloads.push(record);
    }
    return child;
  }
  const kill=pid=>{
    if(!pid)return;
    state.killed.push(pid);
    for(const row of [...state.downloads,...state.updates,...state.thumbs])if(row.child.pid===pid)row.child.exit(1);
  };
  const safeStorage={isEncryptionAvailable:()=>encryption,encryptString:text=>Buffer.from('enc:'+Buffer.from(text).toString('base64')),
    decryptString:buffer=>Buffer.from(String(buffer).slice(4),'base64').toString()};
  const make=()=>createXVideo({profile,downloadRoot:root,safeStorage,spawn,kill,
    tools:()=>({ytDlp:state.ytDlp?'fake-yt-dlp':'',ffmpeg:'fake-ffmpeg'}),
    fetcher:async()=>{state.fetches++;if(state.fetchFails)throw Error('offline');return Response.json({tag_name:state.latest});},
    notify:notice=>state.notices.push(notice),onChange:()=>state.changes++,openPath:async path=>{state.opened.push(path);return openError;},
    showItem:path=>state.shown.push(path),now:()=>state.clock++,...(limit&&{runLimit:limit})});
  const core=make();
  return {core,state,base,profile,root,make,clean:()=>{core.close();rmSync(base,{recursive:true,force:true});}};
}
const tasks=w=>w.core.snapshot().tasks;
const byUrl=(w,n)=>w.state.downloads.filter(row=>row.url.endsWith(String(1000+n)));

test('链接校验、命名清理、版本比较',()=>{
  assert.deepEqual(parseXUrl(' https://twitter.com/Some_User/status/123456/video/1?s=20 '),{id:'123456',user:'Some_User',url:'https://x.com/Some_User/status/123456'});
  assert.equal(parseXUrl('https://x.com/i/web/status/99').url,'https://x.com/i/web/status/99');
  assert.equal(parseXUrl('https://mobile.x.com/a/status/5').id,'5');
  for(const bad of ['','x.com/a/status/1','https://x.com/a','https://x.com.evil.com/a/status/1','ftp://x.com/a/status/1','https://x.com/a/status/abc','https://x.com/a/status/12abc','--exec calc'])
    assert.equal(parseXUrl(bad),null,bad);
  assert.equal(sanitizeName(' 猫:踩/奶?*"<>|.mp4 '),'猫_踩_奶______');
  assert.equal(sanitizeName('..  .'),'');
  assert.equal(sanitizeName('CON'),'_CON');
  assert.equal(sanitizeName('..\\..\\evil'),'_.._evil');
  assert.equal([...sanitizeName('长'.repeat(300))].length,100);
  assert.equal(defaultName(Date.parse('2026-11-28T15:00:05Z')),'2026-11-29_000005');
  assert.equal(newerVersion('2026.11.23','2026.11.20'),true);
  assert.equal(newerVersion('2026.11.23','2026.11.23'),false);
  assert.equal(newerVersion('2026.11.23','2026.11.23.2320'),false);
  assert.equal(newerVersion('2027.1.2','2026.12.30'),true);
});

test('提交前提：无效链接、缺引擎、盘不可用；在途同链接不重复占槽',async()=>{
  const w=world();
  assert.equal((await w.core.enqueue({url:'https://youtube.com/x'})).status,'invalid');
  w.state.ytDlp=false;
  await assert.rejects(w.core.enqueue({url:link(1)}),/yt-dlp/);
  assert.equal(w.core.snapshot().engine.ready,false);
  w.state.ytDlp=true;
  const missingDisk=createXVideo({profile:join(w.base,'p2'),downloadRoot:'Q:\\Xdownload',tools:()=>({ytDlp:'fake',ffmpeg:''}),safeStorage:null});
  if(!existsSync('Q:\\')){
    await assert.rejects(missingDisk.enqueue({url:link(1)}),/盘不可用/);
    assert.equal(missingDisk.snapshot().disk.ready,false);
  }
  missingDisk.close();
  assert.equal((await w.core.enqueue({url:link(1),name:'甲'})).status,'queued');
  const again=await w.core.enqueue({url:'https://twitter.com/other/status/1001'});
  assert.equal(again.status,'duplicate');
  assert.equal(tasks(w).length,1);
  const [a,b]=await Promise.all([w.core.enqueue({url:link(2)}),w.core.enqueue({url:link(2)})]);
  assert.deepEqual([a.status,b.status].sort(),['duplicate','queued']);
  w.clean();
});

test('最多 3 路并行，完成后按顺序补位；收尾移动、重名加序号、多段编号、缩略图与提醒',async()=>{
  const w=world();
  mkdirSync(w.root,{recursive:true});
  writeFileSync(join(w.root,'同名.mp4'),'old');
  for(let n=1;n<=5;n++)await w.core.enqueue({url:link(n),name:n<3?'同名':'片'+n});
  await until(()=>w.state.downloads.length===3,'三路启动');
  assert.equal(w.core.snapshot().occupied,3);
  assert.deepEqual(tasks(w).map(t=>t.state),['running','running','running','queued','queued']);
  const first=w.state.downloads[0];
  assert.equal(first.args.at(-2),'--');
  assert.ok(first.args.includes('--ignore-config')&&first.args.includes('--no-update')&&!first.args.includes('-U'));
  assert.ok(first.options.env.TEMP.startsWith(first.dir));
  first.finish(1);
  await until(()=>w.state.downloads.length===4,'补位');
  assert.equal(w.state.downloads[3].url,link(4));
  assert.equal(readFileSync(join(w.root,'同名.mp4'),'utf8'),'old');
  assert.ok(existsSync(join(w.root,'同名 (2).mp4')));
  assert.equal(existsSync(first.dir),false);
  w.state.downloads[1].finish(3);
  await until(()=>w.state.notices.length===2,'第二条完成');
  for(const n of [1,2,3])assert.ok(existsSync(join(w.root,`同名-${n}.mp4`)),'多段 '+n);
  const list=w.core.library({});
  assert.equal(list.total,2);
  assert.equal(list.items[0].files.length,3);
  assert.equal(list.items[0].hasThumb,true);
  assert.match(await w.core.thumbnail(list.items[0].id),/^data:image\/jpeg;base64,/);
  assert.deepEqual(w.state.notices.map(n=>n.kind),['x-download','x-download']);
  assert.equal(w.state.notices[1].targetId,list.items[0].id);
  assert.match(w.state.notices[1].body,/3 段/);
  assert.equal(w.core.library({query:'(2)'}).total,1);
  assert.equal((await w.core.enqueue({url:link(1)})).message.includes('下载过'),true);
  w.clean();
});

test('进度单调递增并按段折算',async()=>{
  const w=world();
  await w.core.enqueue({url:link(1)});
  await until(()=>w.state.downloads.length===1,'启动');
  const run=w.state.downloads[0];
  const progress=()=>tasks(w)[0].progress;
  run.progress(1,2,'downloading',50,100,'NA','NA','NA');
  await until(()=>progress()>0,'首段进度');
  const half=progress();
  assert.ok(half>20&&half<25,String(half));
  run.progress(1,2,'finished',100,100,'NA','NA','NA');
  run.progress(1,2,'downloading',1,100,'NA','NA','NA');
  await wait();
  assert.ok(progress()>=half);
  run.progress(2,2,'downloading','10','NA','20',1,4);
  await until(()=>progress()>49.5,'第二段');
  assert.ok(progress()<=99);
  w.clean();
});

test('超时自动暂停降为最低优先级、让出槽位且不自动重跑；继续后重新计时并排在普通任务后',async()=>{
  const w=world({limit:60});
  await w.core.enqueue({url:link(1),name:'慢'});
  await until(()=>w.state.downloads.length===1,'启动');
  await until(()=>tasks(w)[0].state==='paused','超时暂停');
  const slow=tasks(w)[0];
  assert.equal(slow.reason,'timeout');
  assert.equal(slow.low,true);
  assert.equal(w.state.killed.length,1);
  assert.equal(w.state.notices[0].kind,'x-download-alert');
  assert.match(w.state.notices[0].title,/超时/);
  await wait(30);
  assert.equal(w.state.downloads.length,1,'不自动重跑');
  w.core.taskAction('resume',slow.id);
  await until(()=>w.state.downloads.length===2,'手动继续');
  assert.equal(w.state.downloads[1].dir,w.state.downloads[0].dir,'沿用断点目录');
  await until(()=>tasks(w)[0].state==='paused','再次超时');
  assert.match(w.state.notices.at(-1).body,/第 2 次/);
  w.clean();
});

test('最低优先级不抢占普通任务',async()=>{
  const w=world({limit:40});
  await w.core.enqueue({url:link(1)});
  await until(()=>tasks(w)[0]?.state==='paused','超时');
  const low=tasks(w)[0].id;
  w.core.close();
  const core=createXVideo({profile:w.profile,downloadRoot:w.root,safeStorage:null,now:()=>w.state.clock++,tools:()=>({ytDlp:'fake',ffmpeg:''}),
    fetcher:async()=>Response.json({tag_name:'2026.11.23'}),spawn:()=>{const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.pid=1;return c;},kill:()=>{}});
  for(let n=2;n<=5;n++)await core.enqueue({url:link(n)});
  core.taskAction('resume',low);
  const queued=core.snapshot().tasks.filter(t=>t.state==='queued');
  assert.deepEqual(queued.map(t=>t.url),[link(5),link(1)]);
  assert.equal(queued.at(-1).low,true);
  core.close();rmSync(w.base,{recursive:true,force:true});
});

test('手动暂停保留断点、进程退出前不重启；取消删除断点；失败可重试并写提醒',async()=>{
  const w=world();
  await w.core.enqueue({url:link(1),name:'甲'});
  await until(()=>w.state.downloads.length===1,'启动');
  const id=tasks(w)[0].id,dir=w.state.downloads[0].dir;
  writeFileSync(join(dir,'part-1.mp4.part'),'half');
  w.core.taskAction('pause',id);
  w.core.taskAction('resume',id);
  assert.equal(w.state.downloads.length,1,'旧进程退出前不启动');
  await until(()=>w.state.downloads.length===2,'旧进程退出后续传');
  assert.ok(existsSync(join(dir,'part-1.mp4.part')));
  w.state.downloads[1].fail('ERROR: [twitter] 1001: NSFW tweet requires authentication. Use --cookies');
  await until(()=>tasks(w)[0].state==='failed','失败');
  assert.match(tasks(w)[0].error,/需要登录/);
  assert.match(w.state.notices.at(-1).body,/第 2 次尝试/);
  const retried=await w.core.enqueue({url:link(1),name:'乙'});
  assert.equal(retried.status,'retried');
  assert.equal(tasks(w).length,1);
  assert.equal(tasks(w)[0].name,'乙');
  await until(()=>w.state.downloads.length===3,'重试');
  w.core.taskAction('cancel',id);
  await until(()=>!existsSync(dir),'取消后清理断点');
  assert.equal(tasks(w).length,0);
  w.clean();
});

test('退出码为 0 但没有成品、缩略图失败的处理',async()=>{
  const w=world({thumbFails:true});
  await w.core.enqueue({url:link(1)});
  await until(()=>w.state.downloads.length===1,'启动');
  w.state.downloads[0].child.exit(0);
  await until(()=>tasks(w)[0].state==='failed','无成品记失败');
  w.core.taskAction('resume',tasks(w)[0].id);
  await until(()=>w.state.downloads.length===2,'重试');
  w.state.downloads[1].finish();
  await until(()=>w.core.library({}).total===1,'缩略图失败仍完成');
  assert.equal(w.core.library({}).items[0].hasThumb,false);
  w.clean();
});

test('更新门禁：每天只自动查一次，未经同意不更新，跳过后当天不再问',async()=>{
  const w=world({latest:'2026.11.30'});
  const ask=await w.core.enqueue({url:link(1)});
  assert.deepEqual([ask.status,ask.current,ask.latest],['update','2026.11.23','2026.11.30']);
  assert.equal(tasks(w).length,0,'取消不建任务');
  assert.equal((await w.core.enqueue({url:link(1)})).status,'update');
  assert.equal(w.state.fetches,1);
  assert.equal((await w.core.enqueue({url:link(1),decision:'skip'})).status,'queued');
  assert.equal((await w.core.enqueue({url:link(2)})).status,'queued');
  assert.equal(w.state.fetches,1);
  assert.equal(w.state.updates.length,0);
  w.state.clock+=86400_000;
  assert.equal((await w.core.enqueue({url:link(3)})).status,'update');
  assert.equal(w.state.fetches,2);
  w.clean();
});

test('更新门禁：同意后等在途下载结束才更新，期间不启动新任务，完成后继续',async()=>{
  const w=world();
  await w.core.enqueue({url:link(1)});
  await until(()=>w.state.downloads.length===1,'在途');
  w.state.latest='2026.11.30';
  await w.core.checkVersion();
  const added=await w.core.enqueue({url:link(2),decision:'apply'});
  assert.equal(added.status,'queued');
  assert.match(added.message,/更新完成后开始/);
  await wait(30);
  assert.equal(w.state.updates.length,0);
  assert.equal(w.state.downloads.length,1);
  assert.equal(w.core.snapshot().update.waiting,true);
  await assert.rejects(w.core.checkVersion(),/更新进行中/);
  w.state.downloads[0].finish();
  await until(()=>w.state.updates.length===1,'开始更新');
  assert.equal(w.state.downloads.length,1,'更新中不启动');
  assert.throws(()=>w.core.decideUpdate('cancel'),/已经开始/);
  w.state.version='2026.11.30';w.state.updates[0].child.exit(0);
  await until(()=>w.state.downloads.length===2,'更新后继续');
  assert.equal(w.core.snapshot().update.available,false);
  w.clean();
});

test('更新门禁：取消等待、更新失败继续原版本、检查失败不阻断',async()=>{
  const w=world();
  await w.core.enqueue({url:link(1)});
  await until(()=>w.state.downloads.length===1,'在途');
  w.state.latest='2026.11.30';await w.core.checkVersion();
  w.core.decideUpdate('apply');
  await w.core.enqueue({url:link(2)});
  w.core.decideUpdate('cancel');
  await until(()=>w.state.downloads.length===2,'取消后继续排队任务');
  for(const row of w.state.downloads)row.finish();
  await until(()=>w.core.library({}).total===2,'完成');
  w.core.decideUpdate('apply');
  await until(()=>w.state.updates.length===1,'更新');
  w.state.updates[0].child.exit(1);
  await until(()=>!w.core.snapshot().update.applying,'更新结束');
  assert.match(w.core.snapshot().update.error,/更新失败/);
  await w.core.enqueue({url:link(3)});
  await until(()=>w.state.downloads.length===3,'原版本继续');
  w.clean();
  const offline=world({fetchFails:true});
  const result=await offline.core.enqueue({url:link(1)});
  assert.equal(result.status,'queued');
  assert.match(result.warning,/版本检查未完成/);
  await offline.core.enqueue({url:link(2)});
  assert.equal(offline.state.fetches,1,'失败当天不重复自动检查');
  offline.clean();
});

test('非界面来源遇到新版本停为待确认并提醒，决定后继续',async()=>{
  const w=world({latest:'2026.11.30'});
  const result=await w.core.enqueue({url:link(1),source:'cloud'});
  assert.equal(result.status,'queued');
  assert.equal(tasks(w)[0].state,'confirm');
  assert.equal(w.state.notices[0].title.startsWith('下载待确认更新'),true);
  assert.equal(w.state.downloads.length,0);
  w.core.decideUpdate('skip');
  await until(()=>w.state.downloads.length===1,'跳过更新后下载');
  w.clean();
});

test('归档：全部分段移入 archive、同名加序号、缺失也可归档、提醒卡片与播放反馈',async()=>{
  const w=world();
  await w.core.enqueue({url:link(1),name:'旅行'});
  await until(()=>w.state.downloads.length===1,'启动');
  w.state.downloads[0].finish(2);
  await until(()=>w.core.library({}).total===1,'完成');
  const id=w.core.library({}).items[0].id;
  const ready=await w.core.card(id);
  assert.equal(ready.state,'ready');assert.equal(ready.files.length,2);
  assert.equal((await w.core.play(id,1)).ok,true);
  assert.equal(w.state.opened[0],join(w.root,'旅行-2.mp4'));
  assert.equal(w.core.reveal(id).ok,true);
  rmSync(join(w.root,'旅行-1.mp4'));
  assert.equal(w.core.library({}).items[0].missing,1);
  assert.match((await w.core.play(id,0)).message,/不存在/);
  mkdirSync(w.core.archiveDir,{recursive:true});
  writeFileSync(join(w.core.archiveDir,'旅行-2.mp4'),'older');
  w.core.archive(id);
  assert.ok(existsSync(join(w.core.archiveDir,'旅行-2 (2).mp4')));
  assert.equal(readFileSync(join(w.core.archiveDir,'旅行-2.mp4'),'utf8'),'older');
  assert.equal(w.core.library({}).total,0);
  assert.equal(readdirSync(join(w.profile,'x-video','thumbs')).length,0);
  assert.match((await w.core.card(id)).message,/已归档至/);
  assert.match((await w.core.play(id,0)).message,/已归档至/);
  await w.core.enqueue({url:link(2),name:'丢失'});
  await until(()=>w.state.downloads.length===2,'第二条');
  w.state.downloads[1].finish();
  await until(()=>w.core.library({}).total===1,'第二条完成');
  const gone=w.core.library({}).items[0];
  rmSync(join(w.root,gone.files[0].name));
  assert.equal((await w.core.card(gone.id)).state,'missing');
  assert.match(w.core.archive(gone.id).message,/缺失/);
  assert.equal(w.core.library({}).total,0);
  w.clean();
});

test('通道固定：一路结束后其余任务留在原通道，新任务补进空位',async()=>{
  const w=world();
  for(let n=1;n<=4;n++)await w.core.enqueue({url:link(n)});
  await until(()=>w.state.downloads.length===3,'启动');
  const slots=()=>Object.fromEntries(tasks(w).filter(t=>t.state==='running').map(t=>[t.url.slice(-4),t.slot]));
  assert.deepEqual(slots(),{1001:0,1002:1,1003:2});
  w.state.downloads[1].finish();
  await until(()=>w.state.downloads.length===4,'补位');
  assert.deepEqual(slots(),{1001:0,1003:2,1004:1});
  w.clean();
});

test('复查没有新版本时放行待确认任务；磁盘恢复后调度即继续',async()=>{
  const w=world({latest:'2026.11.30'});
  await w.core.enqueue({url:link(1),source:'cloud'});
  assert.equal(tasks(w)[0].state,'confirm');
  w.state.version='2026.11.30';
  await w.core.checkVersion();
  await until(()=>w.state.downloads.length===1,'放行');
  w.core.taskAction('pause',tasks(w)[0].id);
  await until(()=>w.core.snapshot().occupied===0,'退出');
  w.state.ytDlp=false;
  w.core.taskAction('resume',tasks(w)[0].id);
  assert.equal(tasks(w)[0].state,'queued');
  w.state.ytDlp=true;
  w.core.kick();
  await until(()=>w.state.downloads.length===2,'引擎恢复后继续');
  w.clean();
});

test('移动成品失败时记失败、保留断点且不留缩略图',async()=>{
  const w=world();
  await w.core.enqueue({url:link(1),name:'占位'});
  await until(()=>w.state.downloads.length===1,'启动');
  // 让成品目录变成同名文件，移动必然失败。
  rmSync(w.root,{recursive:true,force:true});
  mkdirSync(w.root,{recursive:true});
  const run=w.state.downloads[0];
  mkdirSync(run.dir,{recursive:true});
  const path=join(run.dir,'part-1.mp4');
  writeFileSync(path,'v');
  run.child.stdout.write(`XVF|1|3|${path}\nXVF|2|3|${path}\n`);
  run.child.exit(0);
  await until(()=>tasks(w)[0].state==='failed','移动失败');
  assert.ok(existsSync(path),'已移出的文件移回断点目录');
  assert.deepEqual(readdirSync(join(w.profile,'x-video','thumbs')),[]);
  assert.equal(w.core.library({}).total,0);
  w.clean();
});

test('进程退出后停止任务不再按旧 PID 结束进程',async()=>{
  const w=world({holdThumb:true});
  await w.core.enqueue({url:link(1)});
  await until(()=>w.state.downloads.length===1,'启动');
  const run=w.state.downloads[0];
  // 缩略图阶段暂停：下载进程已经退出。
  run.finish();
  await until(()=>w.state.thumbs.length===1,'进入收尾');
  w.core.taskAction('pause',w.core.snapshot().tasks[0].id);
  await wait(30);
  assert.deepEqual(w.state.killed,[w.state.thumbs[0].child.pid],'只结束仍在运行的缩略图进程');
  assert.equal(w.core.library({}).total,0);
  assert.equal(tasks(w)[0].state,'paused');
  w.clean();
});

test('手动继续当天首次也先检查更新，未决定时不启动',async()=>{
  const w=world();
  await w.core.enqueue({url:link(1)});
  await until(()=>w.state.downloads.length===1,'启动');
  const id=tasks(w)[0].id;
  w.core.taskAction('pause',id);
  await until(()=>w.core.snapshot().occupied===0,'退出');
  assert.equal(await w.core.gate(),null,'当天已检查过');
  assert.equal(w.state.fetches,1);
  w.state.clock+=86400_000;w.state.latest='2026.11.30';
  const ask=await w.core.gate();
  assert.deepEqual([ask.status,ask.latest],['update','2026.11.30']);
  assert.equal(w.state.fetches,2);
  assert.equal(tasks(w)[0].state,'paused');
  assert.equal(await w.core.gate('skip'),null);
  w.core.taskAction('resume',id);
  await until(()=>w.state.downloads.length===2,'跳过后继续');
  assert.equal(w.state.updates.length,0);
  w.clean();
});

test('成品记录版本号在完成和归档时变化',async()=>{
  const w=world();
  const first=w.core.snapshot().libraryRevision;
  const added=await w.core.enqueue({url:link(1)});
  assert.equal(added.url,link(1));
  await until(()=>w.state.downloads.length===1,'启动');
  w.state.downloads[0].finish();
  await until(()=>w.core.library({}).total===1,'完成');
  const done=w.core.snapshot().libraryRevision;
  assert.ok(done>first);
  w.core.archive(added.id);
  assert.ok(w.core.snapshot().libraryRevision>done);
  w.clean();
});

test('列表每页 8 条由新到旧',async()=>{
  const w=world();
  for(let n=1;n<=9;n++){
    await w.core.enqueue({url:link(n),name:'片'+n});
    await until(()=>w.state.downloads.length===n,'启动 '+n);
    w.state.downloads[n-1].finish();
    await until(()=>w.core.library({}).total===n,'完成 '+n);
  }
  const first=w.core.library({page:0}),second=w.core.library({page:1});
  assert.deepEqual([first.items.length,second.items.length,first.pages],[8,1,2]);
  assert.equal(first.items[0].name,'片9');assert.equal(second.items[0].name,'片1');
  assert.equal(w.core.library({page:99}).page,1);
  w.clean();
});

test('Cookie：只留 X 域名、缺登录项拒绝、加密保存、下载时临时落盘并删除、不进快照',async()=>{
  assert.throws(()=>parseCookies('auth_token=1; ct0=2'),/Netscape/);
  assert.throws(()=>parseCookies('.x.com\tTRUE\t/\tTRUE\t0\tct0\tv'),/auth_token/);
  assert.throws(()=>parseCookies('.x.com\tTRUE\t/\tTRUE\t1\tauth_token\ta\n.x.com\tTRUE\t/\tTRUE\t0\tct0\tv'),/auth_token/);
  assert.throws(()=>parseCookies(COOKIES.replaceAll('.x.com','.twitter.com')),/x\.com/);
  assert.throws(()=>parseCookies(COOKIES.replaceAll('.x.com','.evilx.com')),/Netscape/);
  const clean=parseCookies(COOKIES.replaceAll('\n','\r\n'));
  assert.ok(clean.includes('#HttpOnly_.x.com')&&!clean.includes('other-site'));
  const w=world();
  w.core.importCookies(COOKIES);
  const stored=readFileSync(join(w.profile,'x-video','cookies.bin'),'utf8');
  assert.ok(stored.startsWith('enc:')&&!stored.includes('fake-auth'));
  assert.ok(!JSON.stringify(w.core.snapshot()).includes('fake-auth'));
  assert.ok(!readFileSync(join(w.profile,'x-video','state.json'),'utf8').includes('fake-auth'));
  await w.core.enqueue({url:link(1)});
  await until(()=>w.state.downloads.length===1,'启动');
  const {cookie}=w.state.downloads[0];
  assert.ok(cookie.text.includes('fake-auth'));
  w.state.downloads[0].finish();
  await until(()=>!existsSync(cookie.file),'临时文件删除');
  w.core.clearCookies();
  assert.equal(w.core.snapshot().cookie.savedAt,null);
  await w.core.enqueue({url:link(2)});
  await until(()=>w.state.downloads.length===2,'无 Cookie');
  assert.equal(w.state.downloads[1].cookie,null);
  w.clean();
  const locked=world({encryption:false});
  assert.throws(()=>locked.core.importCookies(COOKIES),/加密/);
  assert.equal(existsSync(join(locked.profile,'x-video','cookies.bin')),false);
  locked.clean();
});

test('退出结束进程并存为暂停；重启后保留队列、清理临时 Cookie、不自动开始；记录损坏时保留原文件',async()=>{
  const w=world();
  w.core.importCookies(COOKIES);
  for(let n=1;n<=4;n++)await w.core.enqueue({url:link(n)});
  await until(()=>w.state.downloads.length===3,'启动');
  const cookie=w.state.downloads[0].cookie.file;
  w.core.close();
  assert.equal(w.state.killed.length,3);
  assert.equal(existsSync(cookie),false);
  await wait(30);
  writeFileSync(join(w.profile,'x-video','.tmp-cookie-old.txt'),'left');
  const again=w.make();
  assert.deepEqual(again.snapshot().tasks.map(t=>[t.state,t.reason]),Array(4).fill(['paused','exit']));
  assert.equal(existsSync(join(w.profile,'x-video','.tmp-cookie-old.txt')),false);
  assert.equal(w.state.downloads.length,3);
  again.taskAction('resume-all');
  await until(()=>w.state.downloads.length===6,'全部继续');
  assert.deepEqual(w.state.downloads.slice(3).map(r=>r.url),[link(1),link(2),link(3)]);
  again.close();
  const file=join(w.profile,'x-video','state.json');
  writeFileSync(file,'{broken');
  const broken=w.make();
  assert.match(broken.snapshot().error,/读取失败/);
  await assert.rejects(broken.enqueue({url:link(9)}),/读取失败/);
  broken.close();
  assert.equal(readFileSync(file,'utf8'),'{broken');
  rmSync(w.base,{recursive:true,force:true});
});

test('提醒写入既有 notices：完成可再次出现，超时重复发生不被吞掉',()=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-xv-notice-'));
  const checks=createReminderChecks({profile,isBusy:()=>false});
  const note=body=>({kind:'x-download-alert',targetId:'t1',title:'下载超时已自动暂停 · 甲',body});
  assert.equal(checks.upsertNotice(note('第 1 次')),true);
  checks.markRead('all');
  assert.equal(checks.upsertNotice(note('第 2 次')),true);
  assert.equal(checks.unread,1);
  checks.close();rmSync(profile,{recursive:true,force:true});
});

test('宿主：只认两个 X 视频窗口的主框架，剪贴板只返回 X 帖子链接，关闭时清理通道',async()=>{
  const base=mkdtempSync(join(tmpdir(),'feiyue-xv-host-'));
  const handlers=new Map(),windows=[];
  let clip='hello';
  class BrowserWindow{
    constructor(){this.destroyed=false;this.webContents={mainFrame:{},send:()=>{},setWindowOpenHandler(){},on(){}};windows.push(this);}
    once(){} isDestroyed(){return this.destroyed;} loadFile(){return Promise.resolve();}
    show(){} showInactive(){} focus(){} moveTop(){} isVisible(){return true;} setTitleBarOverlay(){} destroy(){this.destroyed=true;}
  }
  const electron={BrowserWindow,ipcMain:{handle:(n,f)=>handlers.set(n,f),removeHandler:n=>handlers.delete(n)},
    shell:{openPath:async()=>'',showItemInFolder(){}},clipboard:{readText:()=>clip},dialog:{},safeStorage:null};
  const root=join(import.meta.dirname,'../..');
  const host=attachXVideo(electron,{root,bundle:base,profile:base,downloadRoot:join(base,'dl'),notify(){},visible:false});
  await host.openQuick();
  const owner=host.quickPanel.webContents,trusted={sender:owner,senderFrame:owner.mainFrame};
  for(const event of [{sender:{},senderFrame:{}},{sender:owner,senderFrame:{}}])
    assert.throws(()=>handlers.get('x-video:snapshot')(event),/X 视频窗口/);
  assert.equal(handlers.get('x-video:clipboard')(trusted),'');
  clip='https://twitter.com/a/status/12?s=1';
  assert.equal(handlers.get('x-video:clipboard')(trusted),'https://x.com/a/status/12');
  await host.openManage('queue');
  assert.equal(handlers.get('x-video:take-tab')(trusted),'queue');
  assert.equal(handlers.get('x-video:take-tab')(trusted),null);
  host.close();
  assert.equal(handlers.size,0);
  rmSync(base,{recursive:true,force:true});
});
