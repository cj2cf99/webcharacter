import * as electron from 'electron';
import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,mkdirSync,readdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {attachReminderReview} from '../desktop/reminder-review-host.mjs';
import {attachTaskInbox} from '../desktop/task-inbox-host.mjs';
import {createReminderReviewFlow} from '../desktop/reminder-review-flow.mjs';
import {attachRegistration} from '../desktop/registration-host.mjs';
import {attachWeather} from '../desktop/weather-host.mjs';
import {attachConversationDetails} from '../desktop/conversation-details.mjs';
import {createReminderChecks} from '../desktop/reminder-checks.mjs';
import {attachSettings} from '../desktop/settings-host.mjs';
import {attachPollSettings} from '../desktop/poll-settings-host.mjs';
import {pages} from '../desktop/source-updates.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-titlebar-'));
const out=join(root,'output/titlebar-qa');
const fixture=join(profile,'desktop');
mkdirSync(fixture);
for(const file of ['panel-titlebar.json','registration-preload.cjs','reminder-review-preload.cjs','task-inbox-preload.cjs','weather-preload.cjs','conversation-preload.cjs','preload.cjs','poll-settings-preload.cjs']){
  copyFileSync(join(root,'desktop',file),join(fixture,file));
}
const common={root:profile,profile,bundle:join(root,'output/desktop-bundle'),visible:false};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
async function test(){
  await electron.app.whenReady();
  assert.deepEqual(Object.keys(pages).sort(),readdirSync(join(root,'desktop')).filter(name=>name.endsWith('.html')).sort());
  for(const [page,dependencies] of Object.entries(pages)){
    if(page==='index.html'||page==='menu.html')continue; // 角色页和右键菜单不是面板
    const html=readFileSync(join(common.bundle,page),'utf8');
    assert(dependencies.includes('feiyue-surface.css')&&html.includes('href="feiyue-surface.css"'),page);
    assert.equal((html.match(/<header\b[^>]*\bfy-titlebar\b/g)||[]).length,1,page);
    assert(html.includes('class="fy-caption"'),page);
  }
  mkdirSync(out,{recursive:true});
  const names=['整理本周计划','核对行程','归档会议记录'];
  const items=Array.from({length:18},(_,i)=>({id:String(i),title:names[i%3],group:'today'}));
  let loads=0, recorded=null;
  const submissions=[];
  class TestWindow extends electron.BrowserWindow{
    constructor(options){super({...options,show:false});}
    show(){} focus(){}
    setTitleBarOverlay(value){super.setTitleBarOverlay(value);this.lastOverlay=value;}
  }
  const runtime={...electron,BrowserWindow:TestWindow};
  const today='2026-11-20', plan={id:71,title:'其他service',group:'locked',deadline:today,reason:'由长期计划管理',identity:'i71',version:'v71'};
  const flow=createReminderReviewFlow({request:async(path,options)=>{
    if(path.endsWith('/reminder-review')){
      loads++;return Response.json({today,tomorrow:'2026-11-21',items:items.filter(row=>row.id!==71||!recorded),
        recordedHours:recorded?[{...plan,plannerRecord:recorded}]:[]});
    }
    if(path==='/api/task-submissions')return Response.json({submission_id:crypto.randomUUID()});
    if(path==='/api/tasks'){
      const task=JSON.parse(options.body);assert.equal(task.type,'planner.hours.record');submissions.push(task.params);
      return Response.json({task_id:crypto.randomUUID()});
    }
    if(path.endsWith('/execute')){
      const body=submissions.at(-1);
      recorded={dispatchId:'d71',actualHours:body.actualHours,recordedAt:today+'T11:00:00+09:00'};
      return Response.json({status:'COMPLETED',result:{...recorded,record_id:'d71'}});
    }
    assert.ok(path.endsWith('/71'));
    return Response.json({id:71,today,identity:'i71',finished:Boolean(recorded),reminderVersion:'v71',version:'plan-version',
      ...(recorded?{plannerRecord:recorded}:{plannerWork:{dispatchId:'d71',plannedHours:3}})});
  }});
  const review=attachReminderReview(runtime,{...common,flow});
  const created='2026-11-20T08:37:00Z';
  let cloudReads=0,claimed=false,inspected=null,failTasks=false,legacyTasks=false;
  const detailReads=[];
  const inbox=attachTaskInbox(runtime,{...common,flow:{
    local:()=>[{name:'整理本周计划',attempt_count:1,started_at:created},
      {name:'绯月更新登记',started_at:created,batch:{state:'running',steps:[{label:'功能改善',state:'verified'},{label:'登记版本',state:'applying'}]}},
      {name:'核对恢复现场',started_at:created,batch:{state:'running',steps:[{label:'核实目标',state:'checking'}]}}],
    tasks:offset=>{
      cloudReads++;
      if(failTasks)throw Error('云端任务读取失败');
      if(offset)return {standalone:!legacyTasks,tasks:[{task_id:'next',name:'补充资源笔记',status:'PENDING',created_at:created}],next_offset:null};
      return {standalone:!legacyTasks,tasks:claimed?[]:[{task_id:'shared',name:'登记吃喝',status:'PENDING',can_claim:true,created_at:created}],
        next_offset:claimed?null:50};
    },
    chains:()=>({chains:[{chain_id:'group-1',name:'晚间记录',created_at:created},
      {chain_id:'group-2',name:'工作检查',created_at:created}],next_after:null}),
    detail:id=>{
      detailReads.push(id);
      return id==='group-1'?{name:'晚间记录',status:'ACTIVE',nodes:[
        {node_id:'meal',name:'登记吃喝',status:'COMPLETED',params:{body:'晚餐吃了乌冬面'}},
        {node_id:'diary',name:'登记日记',status:'PENDING',depends_on:'meal',params:{content:'晚上整理了开发计划'}},
      ]}:{name:'工作检查',status:'ACTIVE',nodes:[
        {node_id:'work',name:'回显文字',status:'RUNNING',params:{text:'核对交付清单'}},
      ]};
    },
    receipts:()=>[],
    claim:async id=>{assert.equal(id,'shared');claimed=true;},
    inspect:async id=>{inspected=id;},
  }});
  const registration=attachRegistration(runtime,{...common,flow:{resume:async()=>({})}});
  const weather=attachWeather(runtime,{...common,service:{snapshot:()=>({rows:[]}),close(){}}});
  let history,polls;
  const checkStore=createReminderChecks({profile,isBusy:()=>false,handlers:{tasks:()=>{},due:()=>{},weather:()=>{}},
    changed:()=>{history?.panel?.webContents.send('conversation:checks-changed');polls?.update();}});
  polls=attachPollSettings(runtime,{...common,checks:checkStore});
  checkStore.saveWeather({},{title:'天气提醒',body:'未央区：大风预警'},Date.now());
  checkStore.saveWeather({},{title:'天气提醒',body:'小仓北区：大雨警报'},Date.now());
  history=attachConversationDetails(runtime,{...common,visible:true,history:{read:async()=>[]},readTasks:()=>[],
    checks:{notices:(...args)=>checkStore.notices(...args),markRead:id=>checkStore.markRead(id),
      read:(_day,page)=>({nextAt:Date.now()+8*60_000,first:false,running:false,pending:true,page:page??0,pages:2,
      events:[{at:Date.now(),due:Date.now(),project:'到期事项',status:'未执行',detail:page?'旧一页':'绯月忙 · 连续第 2 次'}]})},
    readTraffic:cursor=>({lines:[JSON.stringify({direction:'receive',method:'GET',route:cursor?'/api/older':'/api/tasks',status:200})],next:cursor?null:[1]})});
  const owner=new TestWindow({width:250,height:360});
  const settings=attachSettings(runtime,{...common,win:owner});
  const hosts=[review,registration,weather,history,settings,polls,inbox];
  try{
    for(const host of hosts){
      await host.open();
      const panel=host.panel;
      const js=code=>panel.webContents.executeJavaScript(code);
      for(const [width,theme] of [[565,'dark'],[360,'light']]){
        electron.nativeTheme.themeSource=theme;
        panel.setSize(width,385);
        await wait(180);
        const layout=await js(`(()=>{
          const area=navigator.windowControlsOverlay.getTitlebarAreaRect(),header=document.querySelector('.fy-titlebar');
          const right=Math.max(...[...header.querySelectorAll('h1,button,label')].map(el=>el.getBoundingClientRect().right));
          const scroll=document.querySelector('.fy-scroll');if(scroll)scroll.scrollTop=80;
          return {area:area.width,right,titleTop:header.getBoundingClientRect().top,
            drag:getComputedStyle(header).webkitAppRegion,scroll:scroll?.scrollTop,
            overflow:document.documentElement.scrollWidth>innerWidth};
        })()`);
        assert(layout.area>0&&layout.right<=layout.area,JSON.stringify(layout));
        assert.equal(layout.overflow,false);assert.equal(layout.titleTop,0);assert.equal(layout.drag,'drag');
        if(host===history){
          assert.equal(await js("document.querySelector('header h1').textContent"),'本地复盘');
          assert(panel.getContentBounds().y-panel.getBounds().y<10,'系统标题栏仍占据一行');
          const image=await panel.webContents.capturePage();
          writeFileSync(join(out,'conversation-'+theme+'.png'),image.toPNG());
        }
        if(host!==review)continue;
        assert(layout.scroll>0);
        const before=loads;
        await js("document.querySelector('.fy-scroll').scrollTop=0;document.getElementById('refresh').click()");
        for(let i=0;loads===before&&i<40;i++)await wait(25);
        assert.equal(loads,before+1);
        await wait(80);
        const preview=await panel.webContents.capturePage({x:0,y:0,width:width-16,height:115});
        writeFileSync(join(out,theme+'.png'),preview.toPNG());
      }
    }
    const panels=hosts.map(host=>host.panel);
    const ids=panels.map(panel=>panel.id);
    const readHeight=panel=>panel.webContents.executeJavaScript('navigator.windowControlsOverlay.getTitlebarAreaRect().height');
    const file=join(fixture,'panel-titlebar.json');
    const config=JSON.parse(readFileSync(file,'utf8'));
    const save=value=>{writeFileSync(file+'.tmp',value);renameSync(file+'.tmp',file);};
    async function waitHeight(height){
      for(let i=0;i<80;i++){
        if((await Promise.all(panels.map(readHeight))).every(h=>Math.abs(h-height)<=1))return;
        await wait(30);
      }
      throw Error('面板未同步到标题栏高度 '+height);
    }
    await registration.panel.webContents.executeJavaScript("document.querySelector('#text').value='保留输入'");
    await review.panel.webContents.executeJavaScript("document.querySelector('[data-action=complete]').click()");
    const before=loads;
    save(JSON.stringify({...config,height:62,color:'#332233',lightSymbolColor:'#884466',darkSymbolColor:'#eeccee'}));
    await waitHeight(62);
    assert(panels.every(p=>p.lastOverlay.color==='#332233'&&p.lastOverlay.symbolColor==='#884466'));
    electron.nativeTheme.themeSource='dark';
    for(let i=0;i<80&&!panels.every(p=>p.lastOverlay.symbolColor==='#eeccee');i++)await wait(30);
    assert(panels.every(p=>p.lastOverlay.symbolColor==='#eeccee'));
    save('{"height":77}');
    await wait(350);
    await waitHeight(62);
    save(JSON.stringify({...config,height:48}));
    await waitHeight(48);
    assert.deepEqual(hosts.map(host=>host.panel.id),ids);
    assert.equal(loads,before);
    assert.equal(await registration.panel.webContents.executeJavaScript("document.querySelector('#text').value"),'保留输入');
    assert.equal(await review.panel.webContents.executeJavaScript("document.querySelector('[data-action=complete]').getAttribute('aria-pressed')"),'true');
    items.splice(2);
    items.push(plan,
      {id:'member',title:'业务超市',group:'locked',reason:'超市会员日'});
    review.panel.setSize(565,490);
    const testUi=(host,code)=>host.panel.webContents.executeJavaScript(code);
    async function until(host,code){
      for(let attempt=0;attempt<100;attempt++){if(await testUi(host,code))return;await wait(25);}
      throw Error('没有出现预期画面 '+code);
    }
    inbox.panel.setSize(550,440);
    await until(inbox,"document.querySelector('#local-items').textContent.includes('整理本周计划')");
    assert.match(await testUi(inbox,"document.querySelector('#local-items').textContent"),/绯月更新登记.*1\/2.*功能改善 · 已核对.*登记版本 · 核对写入结果/);
    assert.match(await testUi(inbox,"document.querySelector('#local-items').textContent"),/核对恢复现场.*0\/1.*核实目标 · 核对基线/);
    assert.equal(cloudReads,0,'首屏只读取本机任务');
    assert.equal(await testUi(inbox,"document.querySelectorAll('[role=tab]').length"),2);
    writeFileSync(join(out,'task-inbox-local.png'),(await inbox.panel.webContents.capturePage()).toPNG());
    await testUi(inbox,"document.querySelector('#local-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))");
    await until(inbox,"document.querySelector('#local').hidden && document.querySelector('#tasks-items').textContent.includes('登记吃喝') && document.querySelector('#chains-items').textContent.includes('晚间记录')");
    assert.equal(cloudReads,1);
    assert.equal(await testUi(inbox,"document.querySelector('#tasks-title').textContent"),'单条任务');
    assert.equal(await testUi(inbox,"document.querySelector('#receipts').hidden"),true);
    assert.match(await testUi(inbox,"document.querySelector('#tasks-items').textContent"),/17:37:00 JST/);
    await wait(180);
    writeFileSync(join(out,'task-inbox-cloud.png'),(await inbox.panel.webContents.capturePage()).toPNG());
    await testUi(inbox,"document.querySelector('#tasks-more').click()");
    await until(inbox,"document.querySelector('#tasks-more').hidden && document.querySelectorAll('#tasks-items li').length===2");
    assert.deepEqual(detailReads,[]);
    await testUi(inbox,`document.querySelector('[data-chain-id="group-1"] summary').click()`);
    await until(inbox,`document.querySelector('[data-chain-id="group-1"] .chain-steps')?.textContent.includes('晚上整理了开发计划')`);
    assert.deepEqual(detailReads,['group-1']);
    await testUi(inbox,`document.querySelector('[data-chain-id="group-2"] summary').click()`);
    await until(inbox,`document.querySelector('[data-chain-id="group-2"] .chain-steps')?.textContent.includes('核对交付清单')`);
    assert.deepEqual(detailReads,['group-1','group-2']);
    assert.equal(await testUi(inbox,`document.querySelector('[data-chain-id="group-2"]').textContent.includes('晚餐吃了乌冬面')`),false);
    assert.equal(await testUi(inbox,`document.querySelector('[data-chain-id="group-1"]').textContent.includes('前置 登记吃喝')`),true);
    await testUi(inbox,`document.querySelector('[data-chain-id="group-1"]').scrollIntoView({block:'start'})`);
    await wait(120);
    writeFileSync(join(out,'task-inbox-expanded.png'),(await inbox.panel.webContents.capturePage()).toPNG());
    await testUi(inbox,`document.querySelector('[data-chain-id="group-1"] button').click()`);
    await until(inbox,"!document.querySelector('#chains-items button')?.disabled");
    assert.equal(inspected,'group-1');
    await until(inbox,"Boolean(document.querySelector('[data-operation=\"claim:shared\"]'))");
    await testUi(inbox,"document.querySelector('[data-operation=\"claim:shared\"]').click()");
    await until(inbox,"document.querySelector('#notice').textContent.includes('收到云端回执') && !document.querySelector('#tasks-items li')");
    failTasks=true;
    await testUi(inbox,"document.querySelector('#refresh').click()");
    await until(inbox,"document.querySelector('#tasks-message').textContent.includes('云端任务读取失败') && document.querySelector('#chains-items').textContent.includes('晚间记录')");
    failTasks=false;legacyTasks=true;
    await testUi(inbox,"document.querySelector('#refresh').click()");
    await until(inbox,"document.querySelector('#tasks-title').textContent==='单条任务' && document.querySelector('#tasks-scope').textContent.includes('旧版')");
    console.log('PASS：本机执行中与云端未结束双页签、延迟查询、分页、查看任务链及领取回执。');
    await until(polls,"document.querySelectorAll('form[data-poll]').length===3");
    await testUi(polls,"{const f=document.querySelector('[data-poll=tasks]');f.elements.enabled.checked=false;f.elements.minutes.value=10;f.elements.maximum.value=0;f.requestSubmit()}");
    await until(polls,"document.querySelector('#feedback').textContent.includes('已保存')");
    const taskPoll=()=>checkStore.polls().find(row=>row.id==='tasks');
    assert.deepEqual([taskPoll().enabled,taskPoll().minutes,taskPoll().maximum],[false,10,0]);
    polls.panel.destroy();await polls.open(true);
    await until(polls,"document.activeElement.id==='waiting' && document.querySelector('[data-poll=tasks] input[name=minutes]')?.value==='10'");
    await testUi(polls,"{const f=document.querySelector('[data-poll=tasks]');f.elements.minutes.value=9;f.requestSubmit()}");
    assert.equal(await testUi(polls,"document.querySelector('[data-poll=tasks] input[name=minutes]').validity.rangeUnderflow"),true);
    assert.equal(taskPoll().minutes,10);
    await testUi(polls,"{const f=document.querySelector('[data-poll=tasks]');f.elements.enabled.checked=true;f.elements.minutes.value=300;f.elements.maximum.value=100;f.requestSubmit()}");
    await until(polls,"document.querySelector('#feedback').textContent.includes('已保存')");
    assert.deepEqual([taskPoll().enabled,taskPoll().minutes,taskPoll().maximum],[true,300,100]);
    await testUi(review,"document.querySelector('#refresh').click()");
    await until(review,"Boolean(document.querySelector('[data-group=planner] input'))");
    assert.equal(await testUi(review,"document.querySelectorAll('[data-group=locked] input,[data-group=planner] button').length"),0);
    const fill=async value=>testUi(review,"{const i=document.querySelector('.hours-field input');i.value="+JSON.stringify(value)+";i.dispatchEvent(new Event('input'));}");
    for(const [value,disabled] of [['25',true],['0',false],['',true],['1.5',false]]){
      await fill(value);assert.equal(await testUi(review,"document.querySelector('#apply').disabled"),disabled);
    }
    writeFileSync(join(out,'planner-hours.png'),(await review.panel.webContents.capturePage()).toPNG());
    await testUi(review,"document.querySelector('#apply').click()");
    await until(review,"document.querySelector('#report').textContent.includes('1.5 小时')");
    assert.deepEqual(submissions,[{reminderId:71,dispatchId:'d71',today,version:'plan-version',actualHours:1.5}]);
    await until(review,"document.querySelector('[data-group=planner]')?.textContent.includes('主站已登记 1.5 小时')");
    await testUi(review,"document.querySelector('#refresh').click()");
    await until(review,"!document.querySelector('#refresh').disabled && document.querySelector('[data-group=planner]')?.textContent.includes('主站已登记 1.5 小时')");
    writeFileSync(join(out,'planner-hours-saved.png'),(await review.panel.webContents.capturePage()).toPNG());
    await history.open(null,'checks');
    await until(history,"document.querySelector('#nextCheck').textContent.includes('下一轮事项轮询') && document.querySelector('#turns').textContent.includes('第 2 次')");
    assert.match(await testUi(history,"document.querySelector('#remaining').textContent"),/8 分钟/);
    assert.match(await testUi(history,"document.querySelector('#checkState').textContent"),/等待空闲/);
    await testUi(history,"document.querySelector('#nextCheckPage').click()");
    await until(history,"document.querySelector('#turns').textContent.includes('旧一页')");
    assert.equal(await testUi(history,"document.documentElement.scrollWidth>innerWidth"),false);
    await history.open(null,'notices');
    await until(history,"document.querySelectorAll('#turns button').length===2");
    assert.equal(await testUi(history,"document.querySelector('#noticeDetail').textContent"),'');
    await testUi(history,"document.querySelector('#turns button').click()");
    await until(history,"document.querySelectorAll('#turns button').length===1 && document.querySelector('#noticeDetail').textContent.includes('大雨警报')");
    await testUi(history,"document.querySelector('#readAll').click()");
    await until(history,"document.querySelector('#status').textContent.includes('没有未读')");
    await testUi(history,"document.querySelector('[data-filter=read]').click()");
    await until(history,"document.querySelectorAll('#turns button').length===2");
    await history.open(null,'log');
    await until(history,"document.querySelector('#turns').textContent.includes('/api/tasks')");
    assert.equal(await testUi(history,"document.querySelectorAll('#turns textarea,#turns input,#turns [contenteditable]').length"),0);
    await testUi(history,"document.querySelector('#nextCheckPage').click()");
    await until(history,"document.querySelector('#turns').textContent.includes('/api/older')");
    assert.equal(await testUi(history,"document.querySelector('#nextCheckPage').disabled && document.querySelectorAll('#turns section').length===1 && document.querySelector('#checkPage').textContent==='第 2 页'"),true);
    await testUi(history,"document.querySelector('#previousCheck').click()");
    await until(history,"document.querySelector('#turns').textContent.includes('/api/tasks') && !document.querySelector('#nextCheckPage').disabled");
    console.log('PASS：今日工时行、零与小数、执行回执、只读任务日志及前后翻页。');
    console.log('PASS：七个面板通过深浅色、原生标题栏和热加载检查；轮询设定通过保存、重开、队列定位和数值边界检查。');
  }finally{for(const host of hosts)host.close();checkStore.close();owner.destroy();}
}
test().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
