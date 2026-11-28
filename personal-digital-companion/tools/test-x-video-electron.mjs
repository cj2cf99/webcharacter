// X 视频下载的隔离 Electron 检查：两个窗口与提醒卡片的交互、浅深色与窄窗，截图到 output/x-video-qa/。
// 下载进程与版本查询用替身，不联网、不碰 F 盘和系统剪贴板；Cookie 走真实 safeStorage。
// 运行：node tools/build-desktop.mjs 后 desktop/node_modules/.bin/electron tools/run-electron-check.mjs tools/test-x-video-electron.mjs
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {PassThrough} from 'node:stream';
import {attachXVideo} from '../desktop/x-video-host.mjs';
import {buildExtractionScript} from '../desktop/x-article.mjs';
import {attachConversationDetails} from '../desktop/conversation-details.mjs';
import {createReminderChecks} from '../desktop/reminder-checks.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-x-video-'));
const out=join(root,'output/x-video-qa'),dl=join(profile,'Xdownload');
mkdirSync(join(profile,'desktop'));
for(const file of ['panel-titlebar.json','x-video-preload.cjs','conversation-preload.cjs'])copyFileSync(join(root,'desktop',file),join(profile,'desktop',file));
const bundle=join(root,'output/desktop-bundle');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
// 隐藏窗口不推进动画与重绘：不抢焦点地显示在屏幕外。
const errors=[];
class TestWindow extends electron.BrowserWindow{
  constructor(options){
    super({...options,show:false,x:-6000,y:40});
    this.webContents.on('console-message',event=>{if(event.level==='error'||event.level==='warning')errors.push(event.message);});
  }
  show(){this.showInactive();this.setPosition(-6000,40);} focus(){}
}

const downloads=[],updates=[],opened=[];
let latest='2026.11.23',version='2026.11.23',pid=0,clipboardText='',cookiePick='';
function picture(index){
  const width=320,height=180,pixels=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,sun=(x-90-index*17%150)**2+(y-60)**2<900;
    pixels.set(sun?[190,230,255,255]:y>130?[40,25,45,255]:[(90+index*47)%255,(60+y)%255,(110+x/3+index*23)%255,255],at);
  }
  return electron.nativeImage.createFromBitmap(pixels,{width,height}).toJPEG(82);
}
let made=0;
function spawn(command,args){
  const child=new EventEmitter();
  child.pid=++pid;child.stdout=new PassThrough();child.stderr=new PassThrough();child.done=false;
  child.exit=(code=0)=>{if(child.done)return;child.done=true;child.stdout.end();child.stderr.end();setImmediate(()=>child.emit('close',code));};
  if(command==='fake-ffmpeg')setImmediate(()=>{writeFileSync(args.at(-1),picture(made++));child.exit(0);});
  else if(args.includes('--version'))setImmediate(()=>{child.stdout.write(version+'\n');child.exit(0);});
  else if(args.includes('-U'))updates.push(child);
  else{
    const dir=args[args.indexOf('-P')+1],url=args.at(-1);
    downloads.push({child,url,
      progress:(percent,item=1,count=1)=>child.stdout.write(`XVP|${item}|${count}|downloading|${percent}|100|NA|NA|NA\n`),
      finish(count=1){
        for(let i=1;i<=count;i++){const path=join(dir,`part-${i}.mp4`);writeFileSync(path,'v');child.stdout.write(`XVF|${i}|${20+i*7}|${path}\n`);}
        child.exit(0);
      },
      fail:line=>{child.stderr.write(line+'\n');child.exit(1);}});
  }
  return child;
}
const kill=id=>{for(const row of downloads)if(row.child.pid===id)row.child.exit(1);};
async function until(check,label){
  for(let i=0;i<200;i++){if(await check())return;await wait(25);}
  throw Error('等待超时：'+label);
}
async function main(){
  await electron.app.whenReady();
  mkdirSync(out,{recursive:true});
  electron.nativeTheme.themeSource='light';
  const runtime={...electron,BrowserWindow:TestWindow,
    clipboard:{readText:()=>clipboardText},
    shell:{openPath:async path=>{opened.push(path);return '';},showItemInFolder:path=>opened.push('reveal:'+path)},
    dialog:{showOpenDialog:async()=>({canceled:!cookiePick,filePaths:cookiePick?[cookiePick]:[]})},
    safeStorage:electron.safeStorage};
  let history;
  const checks=createReminderChecks({profile,isBusy:()=>false,changed:()=>history?.panel?.webContents.send('conversation:checks-changed')});
  const host=attachXVideo(runtime,{root,bundle,profile,downloadRoot:dl,notify:notice=>checks.upsertNotice(notice),
    overrides:{spawn,kill,tools:()=>({ytDlp:'fake-yt-dlp',ffmpeg:'fake-ffmpeg'}),fetcher:async()=>Response.json({tag_name:latest}),
      fetchArticle:async req=>({type:'article',title:'测试文章标题',author:'@art',url:req.url,publishedAt:'2026-11-28T03:00:00Z',
        text:'文章正文',links:{},media:[],quote:null,replies:[]})}});
  history=attachConversationDetails(runtime,{root,profile,bundle,visible:true,history:{read:async()=>[]},readTasks:()=>[],checks,xVideo:host});
  const core=host.core;
  const link=n=>`https://x.com/demo_${n}/status/${1890000000000+n}`;
  try{
    // 先备好 10 条成品，含一条 3 段。
    for(let n=1;n<=10;n++){
      await core.enqueue({url:link(n),name:n===9?'东京夜雨航拍 超长名称用于检查单行省略显示效果'.repeat(1):n===10?'猫咪踩奶日常':'样例视频 '+n});
      await until(()=>downloads.length===n,'启动 '+n);
      downloads[n-1].finish(n===10?3:1);
      await until(()=>core.library({}).total===n,'完成 '+n);
    }
    // ---- 登记下载小窗 ----
    clipboardText='https://twitter.com/clip_user/status/555?s=20';
    await host.openQuick();
    const quick=host.quickPanel;
    const q=code=>quick.webContents.executeJavaScript(code);
    await until(async()=>await q("document.getElementById('url').value")==='https://x.com/clip_user/status/555','剪贴板自动填入');
    assert.equal(downloads.length,10,'打开小窗不自动下载');
    assert.equal(await q("document.querySelectorAll('img').length"),0,'小窗不加载缩略图');
    const submit=async(url,name='')=>{
      await q(`document.getElementById('url').value=${JSON.stringify(url)};document.getElementById('name').value=${JSON.stringify(name)};document.getElementById('download').click()`);
      await until(()=>q("!document.getElementById('download').disabled||document.getElementById('updateDialog').open"),'提交返回');
    };
    await submit('https://example.com/a');
    await until(async()=>(await q("document.getElementById('toast').textContent")).includes('帖子链接'),'无效链接提示');
    await submit(await q("'https://x.com/clip_user/status/555'"),'长讲座切片归档');
    await until(async()=>(await q("document.getElementById('toast').textContent")).includes('已交给绯月下载'),'提交成功');
    assert.equal(await q("document.getElementById('url').value"),'');
    await q("window.dispatchEvent(new Event('focus'))");await wait(200);
    assert.equal(await q("document.getElementById('url').value"),'','刚提交的链接不回填');
    clipboardText='https://x.com/next_user/status/777';
    await q("window.dispatchEvent(new Event('focus'))");
    await until(async()=>await q("document.getElementById('url').value")===clipboardText,'新链接照常填入');
    await submit('https://x.com/clip_user/status/555');
    await until(async()=>(await q("document.getElementById('toast').textContent")).includes('不重复占用'),'重复提示');
    await submit(link(12),'独立游戏实机演示');
    await submit(link(13),'手冲咖啡慢动作');
    await submit(link(14),'木工榫卯合集');
    await submit(link(15),'秋叶原街头霓虹');
    await until(async()=>await q("document.getElementById('slotNum').textContent")==='3/3','3 路占满');
    assert.equal(await q("document.querySelectorAll('.slot-dots i.on').length"),3);
    // 发现新版本：取消不建任务，跳过后继续。
    latest='2026.11.30';await core.checkVersion();
    const count=core.snapshot().tasks.length;
    await submit(link(16),'待选择更新');
    assert.equal(await q("document.getElementById('updateDialog').open"),true);
    await wait(350);
    writeFileSync(join(out,'quick-update-light.png'),(await quick.webContents.capturePage()).toPNG());
    await q("document.querySelector('#updateDialog [data-choice=\"\"]').click()");
    await until(async()=>(await q("document.getElementById('toast').textContent")).includes('已取消'),'取消');
    assert.equal(core.snapshot().tasks.length,count);
    await q("document.getElementById('download').click()");
    await until(()=>q("document.getElementById('updateDialog').open"),'再次询问');
    await q("document.querySelector('#updateDialog [data-choice=skip]').click()");
    await until(()=>core.snapshot().tasks.length===count+1,'跳过后入队');
    assert.equal(updates.length,0);

    // 造出超时、失败和暂停状态。
    const running=()=>core.snapshot().tasks.filter(task=>task.state==='running');
    downloads.find(row=>row.url.endsWith('/555')).progress(64);
    downloads.find(row=>row.url===link(12)).fail('ERROR: [twitter] 1: NSFW tweet requires authentication. Use --cookies');
    await until(()=>core.snapshot().tasks.some(task=>task.state==='failed')&&running().length===3,'失败后补位');
    core.taskAction('pause',running()[2].id);
    await until(()=>running().length===3,'暂停后补位');
    for(const [i,task] of running().entries())downloads.filter(row=>row.url===task.url).at(-1).progress([64,86,31][i]);

    // ---- 管理窗口 ----
    await host.openManage('library');
    const manage=host.managePanel;
    const m=code=>manage.webContents.executeJavaScript(code);
    await until(async()=>await m("document.querySelectorAll('#library .vcard').length")===8,'每页 8 条');
    assert.equal(await m("document.getElementById('page').textContent"),'1 / 2');
    await until(()=>m("[...document.querySelectorAll('#library .vcard img')].slice(0,2).every(i=>i.src.startsWith('data:image/jpeg')&&i.naturalWidth>0)"),'首屏缩略图');
    assert.equal(await m("[...document.querySelectorAll('button')].some(b=>/删除/.test(b.textContent))"),false,'没有删除按钮');
    const layout=async(panel,label)=>{
      const value=await panel.webContents.executeJavaScript(`(()=>{
        const main=document.querySelector('main'),header=document.querySelector('.fy-titlebar'),area=navigator.windowControlsOverlay.getTitlebarAreaRect();
        return {page:document.documentElement.scrollWidth-innerWidth,main:main.scrollWidth-main.clientWidth,bars:document.querySelectorAll('.fy-titlebar').length,
          right:Math.max(...[...header.querySelectorAll('h1,button,.quick-slots')].map(n=>n.getBoundingClientRect().right)),area:area.width,height:header.getBoundingClientRect().height};
      })()`);
      assert(value.page<=0&&value.main<=1&&value.bars===1&&value.right<=value.area+1&&value.height<70,label+' '+JSON.stringify(value));
    };
    const shot=async(name,panel)=>{await wait(500);writeFileSync(join(out,name+'.png'),(await panel.webContents.capturePage()).toPNG());};
    for(const theme of ['light','dark']){
      electron.nativeTheme.themeSource=theme;
      for(const [label,width] of [['wide',780],['narrow',360]]){
        manage.setSize(width,700);quick.setSize(width===360?360:450,400);
        for(const tab of ['library','queue']){
          await m(`document.querySelector('[data-tab=${tab}]').click()`);
          if(tab==='library')await until(()=>m("document.querySelector('#library .vcard img')?.naturalWidth>0"),'缩略图');
          await wait(250);
          await layout(manage,`${tab} ${label} ${theme}`);
          await shot(`${tab}-${label}-${theme}`,manage);
        }
        await layout(quick,`quick ${label} ${theme}`);
        await shot(`quick-${label}-${theme}`,quick);
      }
    }
    manage.setSize(780,700);electron.nativeTheme.themeSource='light';
    // 队列：3 路通道、顺位、两步取消、暂停、继续。
    await m("document.querySelector('[data-tab=queue]').click()");
    await until(async()=>await m("document.querySelectorAll('.lane.busy').length")===3,'3 路通道');
    assert.match(await m("document.querySelector('.lane.busy .lane-pct').textContent"),/^\d+%$/);
    assert.match(await m("document.querySelector('.lane.busy .lane-time').textContent"),/^\d+m \/ 60m$/);
    assert.equal(await m("[...document.querySelectorAll('#pending .fy-chip')].some(n=>n.textContent.includes('失败'))"),true);
    assert.match(await m("document.querySelector('.pending-error').textContent"),/需要登录/);
    const target=running()[0];
    downloads.filter(row=>row.url===target.url).at(-1).progress(91);
    await until(async()=>parseInt(await m(`document.querySelector('.lane[data-id="${target.id}"] .lane-pct').textContent`))>=80,'进度刷新');
    const total=core.snapshot().tasks.length;
    await m(`document.querySelector('.lane[data-id="${target.id}"] .lane-foot button:last-child').click()`);
    await until(async()=>await m("document.querySelector('.confirm-cancel')?.textContent")==='确认取消','第一次点击只进入确认');
    assert.equal(core.snapshot().tasks.length,total);
    await m("document.querySelector('.confirm-cancel').click()");
    await until(()=>core.snapshot().tasks.length===total-1,'确认取消');
    await until(()=>running().length===3,'补位');
    const paused=running()[0];
    await until(()=>m(`Boolean(document.querySelector('.lane[data-id="${paused.id}"]'))`),'新通道');
    await m(`document.querySelector('.lane[data-id="${paused.id}"] .lane-foot button').click()`);
    await until(()=>core.snapshot().tasks.find(task=>task.id===paused.id).state==='paused','暂停');
    await until(()=>m("!document.getElementById('resumeAll').hidden"),'全部继续');
    await m("document.getElementById('resumeAll').click()");
    await until(()=>core.snapshot().tasks.every(task=>task.state!=='paused'),'全部继续生效');
    // 内容没变时回到窗口不重建卡片。
    await m("document.querySelector('[data-tab=library]').click()");
    await until(()=>m("document.querySelectorAll('#library .vcard').length===8"),'返回列表');
    await wait(200);
    await m("window.kept=document.querySelector('#library .vcard');window.dispatchEvent(new Event('focus'))");
    await wait(300);
    assert.equal(await m('window.kept.isConnected'),true,'回到窗口不重建卡片');
    // 当天还没决定更新时，点继续会先询问。
    await m("document.querySelector('[data-tab=queue]').click()");
    const held=running()[0];
    core.taskAction('pause',held.id);
    await until(()=>running().length===3,'暂停后补位');
    latest='2026.11.30';await core.checkVersion();
    const resumeButton=`[...document.querySelectorAll('#pending .pending-row')].find(n=>n.querySelector('strong').textContent===${JSON.stringify(held.name)})?.querySelector('.pending-actions button')`;
    await until(()=>m(`${resumeButton}?.textContent.includes('继续')`),'继续按钮');
    await m(`${resumeButton}.click()`);
    await until(()=>m("document.getElementById('updateDialog').open"),'继续前询问更新');
    assert.equal(core.snapshot().tasks.find(task=>task.id===held.id).state,'paused');
    await m("document.querySelector('#updateDialog [data-choice=skip]').click()");
    await until(()=>core.snapshot().tasks.find(task=>task.id===held.id).state!=='paused','跳过后继续');

    // 已下载：翻页、搜索、播放、打开位置、归档。
    await m("document.querySelector('[data-tab=library]').click()");
    await until(async()=>await m("document.querySelectorAll('#library .vcard').length")===8,'第一页');
    await m("document.getElementById('older').click()");
    await until(async()=>await m("document.querySelectorAll('#library .vcard').length")===2,'第二页');
    await m("document.getElementById('search').value='踩奶';document.getElementById('search').dispatchEvent(new Event('input'))");
    await until(async()=>await m("document.querySelectorAll('#library .vcard').length")===1,'搜索回到第一页');
    await m("document.querySelectorAll('#library .seg-pills button')[1].click()");
    await until(()=>opened.some(path=>path.endsWith('猫咪踩奶日常-2.mp4')),'分段播放');
    await m("document.querySelector('#library .vcard-actions button:nth-child(2)').click()");
    await until(()=>opened.some(path=>path.startsWith('reveal:')),'打开位置');

    // ---- 提醒记录卡片 ----
    await history.open(null,'notices');
    const review=history.panel;
    const r=code=>review.webContents.executeJavaScript(code);
    await until(()=>r("[...document.querySelectorAll('.notice .fy-title')].some(n=>n.textContent.includes('猫咪踩奶日常'))"),'提醒列表');
    const pick=text=>r(`[...document.querySelectorAll('.notice')].find(n=>n.querySelector('.fy-title').textContent.includes(${JSON.stringify(text)})).click()`);
    await pick('猫咪踩奶日常');
    await until(()=>r("document.querySelector('.xv-player img')?.naturalWidth>0"),'提醒缩略图');
    assert.equal(await r("document.querySelector('.xv-play').textContent"),'▶');
    assert.equal(await r("document.querySelectorAll('.xv-segments button').length"),3);
    assert.equal(await r("document.querySelectorAll('.notice button').length"),0,'列表行内不嵌套按钮');
    await shot('notice-light',review);
    const before=opened.length;
    await r("document.querySelector('.xv-player').click()");
    await until(()=>opened.length===before+1&&opened.at(-1).endsWith('猫咪踩奶日常-1.mp4'),'提醒播放');
    review.setSize(360,540);electron.nativeTheme.themeSource='dark';await wait(300);
    const overflow=await r(`(()=>{const main=document.querySelector('main'),limit=main.getBoundingClientRect().left+main.clientWidth;
      return {page:document.documentElement.scrollWidth-innerWidth,main:main.scrollWidth-main.clientWidth,
        wide:[...main.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>limit+1).slice(0,6).map(n=>n.tagName+'.'+n.className+' '+Math.round(n.getBoundingClientRect().right-limit))};})()`);
    await shot('notice-narrow-dark',review);
    assert(overflow.page<=0&&overflow.main<=1,JSON.stringify(overflow));
    electron.nativeTheme.themeSource='light';
    // 归档后旧提醒说明去向。
    await m("document.querySelector('#library .btn-archive').click()");
    await until(()=>existsSync(join(dl,'archive','猫咪踩奶日常-3.mp4')),'归档移动');
    await until(async()=>await m("document.querySelectorAll('#library .vcard').length")===0,'归档后脱离列表');
    await r("document.querySelector('[data-filter=all]').click()");
    await until(()=>r("[...document.querySelectorAll('.notice .fy-title')].some(n=>n.textContent.includes('猫咪踩奶日常'))"),'全部提醒');
    await pick('猫咪踩奶日常');
    await until(async()=>(await r("document.querySelector('.xv-notice')?.textContent")??'').includes('已归档至'),'归档提示');
    assert.equal(await r("document.querySelectorAll('.xv-player').length"),0);
    // 失败提醒跳到队列。
    await m("document.querySelector('[data-tab=library]').click()");
    await pick('下载失败');
    await r("document.querySelector('#noticeDetail .notice-action').click()");
    await until(async()=>await m("document.querySelector('[data-tab=queue]').getAttribute('aria-selected')")==='true','查看队列');

    // ---- Cookie ----
    await m("document.getElementById('cookieButton').click()");
    assert.equal(await m("getComputedStyle(document.getElementById('cookieText')).webkitTextSecurity"),'disc');
    const paste=text=>m(`document.getElementById('cookieText').value=${JSON.stringify(text)};document.getElementById('cookieSave').click()`);
    await paste('auth_token=abc');
    await until(async()=>await m("document.getElementById('cookieMessage').dataset.tone")==='danger','无效内容');
    assert.match(await m("document.getElementById('cookieMessage').textContent"),/^没有识别到/);
    const secret='.x.com\tTRUE\t/\tTRUE\t0\tauth_token\tSECRET-AUTH\n.x.com\tTRUE\t/\tTRUE\t0\tct0\tSECRET-CT0';
    await paste(secret);
    await until(async()=>await m("document.getElementById('cookieMessage').dataset.tone")==='ok','导入成功');
    assert.equal(await m("document.getElementById('cookieText').value"),'');
    assert.equal(await m("document.body.innerHTML.includes('SECRET-')"),false);
    const stored=readFileSync(join(profile,'x-video','cookies.bin'));
    assert(!stored.includes('SECRET-')&&electron.safeStorage.decryptString(stored).includes('SECRET-AUTH'),'系统加密保存');
    await shot('cookie-light',manage);
    await m("document.getElementById('cookieClear').click()");
    await until(()=>!existsSync(join(profile,'x-video','cookies.bin')),'清空');
    cookiePick=join(profile,'cookies.txt');writeFileSync(cookiePick,secret);
    await m("document.getElementById('cookieFile').click()");
    await until(()=>existsSync(join(profile,'x-video','cookies.bin')),'选文件导入');
    await m("document.getElementById('cookieClose').click()");

    // ---- 手动检查与同意更新 ----
    await m("document.getElementById('updateButton').click()");
    await until(()=>m("document.getElementById('updateDialog').open"),'更新对话框');
    assert.equal(await m("document.getElementById('updateSkip').hidden"),true);
    await shot('update-light',manage);
    await m("document.querySelector('#updateDialog [data-choice=apply]').click()");
    await until(()=>m("!document.getElementById('updateBar').hidden&&!document.getElementById('updateStop').hidden"),'等待在途结束');
    assert.equal(updates.length,0);
    await shot('update-waiting-light',manage);
    for(const task of running())downloads.filter(row=>row.url===task.url).at(-1).finish();
    await until(()=>updates.length===1,'更新开始');
    await until(async()=>(await m("document.getElementById('updateState').textContent")).includes('正在更新'),'更新中提示');
    version='2026.11.30';updates[0].exit(0);
    await until(()=>m("document.getElementById('updateBar').hidden"),'更新完成');
    // 关窗后后台继续。
    await until(()=>running().length>0,'更新后继续');
    const last=running()[0];
    manage.close();quick.close();
    await wait(200);
    downloads.filter(row=>row.url===last.url).at(-1).finish();
    await until(()=>!core.snapshot().tasks.some(task=>task.id===last.id),'关窗后完成');

    // ---- 文章模式快速端到端 ----
    clipboardText='https://x.com/art/article/887766';
    await host.openQuick();
    const q2=code=>host.quickPanel.webContents.executeJavaScript(code);
    await until(async()=>await q2("document.getElementById('url').value")===clipboardText,'剪贴板填入 article 链接');
    assert.equal(await q2("document.querySelector('[data-kind=article]').getAttribute('aria-pressed')"),'true','/article/ 链接自动切为文章模式');
    assert.equal(await q2("document.getElementById('repliesWrap').hidden"),false,'切到文章模式显示回复数');
    const submit2=async(url,name='')=>{
      await until(()=>q2("!document.getElementById('download').disabled"),'等待按钮可用');
      await q2(`document.getElementById('url').value=${JSON.stringify(url)};document.getElementById('name').value=${JSON.stringify(name)};document.getElementById('download').click()`);
      await until(()=>q2("!document.getElementById('download').disabled"),'提交返回');
    };
    await submit2('https://x.com/art/status/998877','电子文章');
    await until(()=>core.library({}).items.some(it=>it.kind==='article'&&it.name==='电子文章'),'文章落盘');
    await submit2('https://x.com/art/status/998877','');
    await until(()=>q2("!document.getElementById('overwriteBtn').hidden"),'重复文章显示更新重抓按钮');
    assert.equal(await q2("document.getElementById('jumpQueue').textContent"),'查看已下载 →','重复文章引导查看已下载');
    await host.openManage('library');
    const m2=code=>host.managePanel.webContents.executeJavaScript(code);
    await until(()=>m2("[...document.querySelectorAll('#library .vcard')].some(c=>c.textContent.includes('📄 文章'))"),'管理页显示文章卡片');
    await m2("document.querySelector('#library .vcard .btn-play').click()");
    await until(()=>opened.some(p=>p.endsWith('article.md')),'点击打开文章');
    await history.open(null,'notices');
    await r("document.querySelector('[data-filter=all]').click()");
    await until(()=>r("[...document.querySelectorAll('.notice .fy-title')].some(n=>n.textContent.includes('X文章归档完成'))"),'提醒列表含文章');
    await pick('X文章归档完成');
    await until(async()=>await r("document.querySelector('.xv-play')?.textContent")==='📖','提醒显示打开文章图标');
    await m2("document.querySelector('#library .vcard .btn-archive').click()");
    await until(()=>existsSync(join(dl,'archive','电子文章_998877','article.md')),'文章整目录归档');
    host.quickPanel?.close();host.managePanel?.close();

    // ---- 隔离页面夹具检查 buildExtractionScript DOM 提取 ----
    const fxWin=new TestWindow({width:800,height:600,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    const fixtureHtml=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body>
      <header><button>Log in</button><button>Sign in to X</button></header>
      <div data-testid="twitterArticleReadView"><h1 data-testid="twitter-article-title">公开长文标题</h1><div>这是长文完整正文内容比主贴更长。</div></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet">
        <div data-testid="User-Name"><a href="/author1">@author1</a></div>
        <a href="https://x.com/author1/status/777"><time datetime="2026-11-28T03:00:00Z"></time></a>
        <div data-testid="quoteTweet"><div data-testid="User-Name"><a href="/qauthor">@qauthor</a></div>
          <a href="https://x.com/qauthor/status/666"><time datetime="2026-11-27T01:00:00Z"></time></a>
          <div data-testid="tweetText">引用贴内部正文</div></div>
        <a href="https://t.co/cut" title="https://example.com/truncated…">https://example.com/truncated…</a>
      </article></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><div data-testid="placementTracking">Ad</div><div data-testid="tweetText">广告跳过</div></article></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><div data-testid="User-Name"><a href="/r1">@r1</a></div><div data-testid="tweetText">第一条有效回复</div></article></div>
      <div data-testid="cellInnerDiv">Show probable spam</div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><div data-testid="User-Name"><a href="/spam">@spam</a></div><div data-testid="tweetText">垃圾区不抓取</div></article></div>
    </body></html>`;
    await fxWin.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(fixtureHtml));
    const extracted=await fxWin.webContents.executeJavaScript(buildExtractionScript(2));
    fxWin.destroy();
    assert.equal(extracted.type,'article','公开 Article 页眉含 Log in 不误判未登录');
    assert.equal(extracted.title,'公开长文标题');
    assert.equal(extracted.quote?.text,'引用贴内部正文');
    assert.equal(extracted.links['https://t.co/cut'],undefined,'截断链接不写入直映字典');
    assert.deepEqual(extracted.replies.map(x=>x.text),['第一条有效回复'],'跳过广告并在垃圾折叠区停止');

    assert.deepEqual(errors,[],'页面控制台无错误和警告');
    console.log('PASS：登记小窗、3 路队列、分页缩略图、归档、提醒播放卡片、Cookie、更新门禁、浅深色与 360 宽。截图 '+out);
  }finally{host.close();history.close();checks.close();}
}
main().then(()=>electron.app.exit(0),error=>{console.error(error);console.error(errors);electron.app.exit(1);});
