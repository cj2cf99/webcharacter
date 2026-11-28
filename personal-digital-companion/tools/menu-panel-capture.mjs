// 菜单弹窗截图巡检：隔离 profile + 模拟数据，逐个打开菜单面板，按深浅色截图到 output/menu-qa/。
// 运行：node tools/build-desktop.mjs 后，分别执行 electron tools/capture-menu-panels-electron.mjs 与 ... --dark
// --knowledge 只截知识库。--knowledge-preview 显示可交互的隔离知识库，关窗时退出。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {attachReminderReview} from '../desktop/reminder-review-host.mjs';
import {attachTaskInbox} from '../desktop/task-inbox-host.mjs';
import {createReminderReviewFlow} from '../desktop/reminder-review-flow.mjs';
import {attachRegistration} from '../desktop/registration-host.mjs';
import {attachWeather} from '../desktop/weather-host.mjs';
import {attachConversationDetails} from '../desktop/conversation-details.mjs';
import {createReminderChecks} from '../desktop/reminder-checks.mjs';
import {attachPollSettings} from '../desktop/poll-settings-host.mjs';
import {createMessageBoxes} from '../desktop/message-box.mjs';
import {attachKnowledge} from '../desktop/knowledge-host.mjs';
import {attachCardDraw} from '../desktop/card-draw-host.mjs';
import {createKnowledgeStore} from '../desktop/knowledge-store.mjs';
import {createKnowledgeBackups} from '../desktop/knowledge-backups.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-menu-qa-'));
const out=join(root,'output/menu-qa');
mkdirSync(join(profile,'desktop'));
for(const file of ['panel-titlebar.json','registration-preload.cjs','reminder-review-preload.cjs','task-inbox-preload.cjs','weather-preload.cjs','conversation-preload.cjs','preload.cjs','poll-settings-preload.cjs','message-box-preload.cjs','knowledge-preload.cjs','card-draw-preload.cjs'])
  copyFileSync(join(root,'desktop',file),join(profile,'desktop',file));
const common={root:profile,profile,bundle:join(root,'output/desktop-bundle'),visible:true};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
// 隐藏窗口不推进动画与重绘，截图失真；改为不抢焦点地显示在屏幕外。
class TestWindow extends electron.BrowserWindow{constructor(o){super({...o,show:false,x:-6000,y:40});}show(){this.showInactive();this.setPosition(-6000,40);}focus(){}}
const runtime={...electron,BrowserWindow:TestWindow};
const now=Date.now(),created=new Date(now-3600_000).toISOString(),today=new Date(now+9*3600_000).toISOString().slice(0,10);

// 主题在打开面板前设定；切换主题后已打开的离屏页面重绘不完整，所以每种主题单独运行一次。
const theme=process.argv.includes('--dark')?'dark':'light';
const knowledgePreview=process.argv.includes('--knowledge-preview');
const shot=async(name,panel)=>{
  await wait(900);
  writeFileSync(join(out,name+'-'+theme+'.png'),(await panel.webContents.capturePage()).toPNG());
};
function seedKnowledge(){
  let sampleAt=now-34*86400_000;
  const store=createKnowledgeStore(profile,()=>sampleAt);
  function positive(title,definition,cases,aliases=[]){
    return store.saveCard({kind:'positive',body:{title,definition,cases,aliases,source:'预览用模拟条目'}});
  }
  function negative(title,condition,mistake,reason,instead,exceptions=[],related='',state='active'){
    store.saveCard({kind:'negative',state,body:{title,condition,mistake,reason,instead,exceptions,related,source:'预览用模拟条目'}});
  }
  try{
    const report=positive('月报的整理与存放','月报按月记录进展、决定与后续行动。',[
      {when:'尚未定稿',do:'保留在当月草稿区，沿用原主题和月份。'},
      {when:'已确认定稿',do:'保存最终版本，并为下个月的行动留下索引。'},
    ],['月度报告','月报归档']);
    positive('周末行程的确认顺序','先确认日期与同行人，再整理地点和备选方案。',
      [{when:'行程仍有变动',do:'保留两个时间选项。'}],['周末计划']);
    negative('未定稿的月报不要归档','月报仍在修改','直接归档','内容还会变动','保留当月草稿',
      [{when:'已确认定稿',do:'按原规则归档。'}],report.id);
    const backups=createKnowledgeBackups(profile,store,()=>sampleAt);
    backups.rotate();

    sampleAt=now-6*86400_000;
    const reading=positive('阅读摘记与原文引用','摘记记录自己的理解，引用保留原句和出处。',[
      {when:'逐字引用',do:'用引号标记，并记录书名、章节或页码。'},
      {when:'写自己的理解',do:'用「我的理解」区分摘记和原话。'},
    ],['读书卡','引用']);
    positive('会议资料引用规则','摘要与原文以会议日期及主题关联。',
      [{when:'需要引用结论',do:'附上能返回原文的出处。'}],['会议纪要']);
    negative('引用时别把改写当作原句','整理阅读材料或会议记录','用引号包住已经改写的句子','读者会以为是原文',
      '改写放入摘记，逐字引文才加引号。',[],reading.id);
    negative('活动相册旧分类法','归档活动照片','只按月份建立相册','同月活动无法区分','以活动名和日期归类。',[],'','disabled');
    backups.rotate();

    sampleAt=now-2*86400_000;
    positive('日语同义表达复盘','用语境区分近义表达，而不是把近义词记成一组译文。',
      [{when:'两个表达经常混淆',do:'各写一句合适的例句，再换一个场景独立作答。'}],['近义辨析']);
    negative('计划中的事项不能记成已完成','对话里提到拟办事项','把「打算」「可能」写成已经发生','会混淆计划和事实',
      '保留计划的状态，等明确完成后再更新。',[{when:'对方明确说已完成',do:'用实际发生时间记录。'}]);
    for(const [index,evidence] of ['这次又把暂定路线写成确认了。','备选路线也被列成最终路线。','我还未决定，请保留备选。'].entries())
      store.record({kind:'negative',source:'route-'+index,point:'把备选写成已确认路线',title:'把备选写成已确认路线',evidence,
        draft:{condition:'同时在比较两条路线',mistake:'提前标成已确认',reason:'备选还未作决定',instead:'保留备选状态，待明确确认'}});
    sampleAt=now-19_800_000;
    positive('收据、账单与付款记录的区别','收据证明已收款，账单说明待付款项，付款记录留存实际支付。',
      [{when:'手头只有账单',do:'标为待核对付款，保留账单日期和金额。'}],['账单归档']);
    backups.rotate();

    for(const [topic,kind,evidence] of [
      ['会议纪要如何引用原话','positive','纪要里的引文应该写页码吗？'],
      ['课后摘记该归在哪个目录','positive','课程摘记和练习笔记放一起吗？'],
      ['附件未核对就标成齐全','negative','附件还在收集，清单却标成齐全。'],
      ['把早上的暂定时间当最终约定','negative','早上的时间只是在征求意见。'],
      ['日期不清时怎样跟进','positive','只说下次确认，先要问哪一项？'],
    ]){
      for(const index of [1,2,3])store.record({kind,source:topic+'/'+index,point:topic,title:topic,evidence});
    }
    sampleAt=now-8_400_000;
    for(const [index,evidence] of ['这份手稿修改了两轮，文件名怎么区分？','同一篇稿要交两版，怎样标版本？','修改中的手稿应带日期还是版本号？'].entries())
      store.record({kind:'positive',source:'draft-'+index,point:'手稿命名规则',title:'手稿命名规则',evidence,
        draft:{definition:'用统一命名区分修改稿与发布稿。',cases:[{when:'同一手稿仍在修订',do:'保留主题，递增版本号。'}]}});
    sampleAt=now-3_000_000;
    negative('待确认的日期不能自行补全','原话只说「下次」或「过几天」','把不明确的日期写成具体日程','容易造成误提醒',
      '先问要确认的日期，保留其他已知字段。');
    negative('切换草稿时保留旧版本','同一文档出现新的草案','直接覆盖上轮版本','难以回到上次修改','新版本另存并保留旧稿。');
    negative('临时金额别当最终金额','账单还在复核','把估算值记为实际支付','可能造成重复登记','标成待核对，等实际支付后再登记。');
    positive('雨天外出准备','根据实况、时段和行程确定随身装备。',
      [{when:'返回时段预计降雨',do:'带折叠伞，为换乘和步行路段预留时间。'}],['雨具']);
    sampleAt=now-1_200_000;
    positive('草稿、定稿与归档的区别','草稿允许继续修改，定稿已确认内容，归档用于长期检索。',[
      {when:'团队仍在补材料',do:'保留草稿，并标明尚未确定的部分。'},
      {when:'内容已定稿且明确同意归档',do:'保存最终版，记录出处与归档日期。'},
    ],['草稿状态','归档']);
    backups.rotate();
  }finally{store.close();}
}
async function captureKnowledge(){
  seedKnowledge();
  const host=attachKnowledge(knowledgePreview?electron:runtime,{...common,enabled:false});
  try{
    await host.open();
    const panel=host.panel;
    const js=code=>panel.webContents.executeJavaScript(code);
    const page=async(name,title)=>{
      await shot(name,panel);
      const size=await js(`(() => {
        const main=document.querySelector('main');return {title:main.querySelector('h2')?.textContent,busy:main.getAttribute('aria-busy'),
          mainOverflow:main.scrollWidth-main.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};
      })()`);
      assert.equal(size.title,title);
      assert.equal(size.busy,'false');
      assert(size.mainOverflow<=1&&size.pageOverflow<=1,JSON.stringify(size));
    };
    panel.setSize(590,640);
    if(knowledgePreview){
      panel.setTitle('绯月 · 知识库分页预览');
      panel.center();
      await page('knowledge-demo-window','正向知识');
      assert.equal(await js("document.querySelectorAll('.catalog-card').length"),6);
      assert(panel.isVisible());
      console.log('知识库模拟预览已打开。正向 8 条，负向 7 条，待确认 7 张。');
      await new Promise(resolve=>panel.once('closed',resolve));
      return;
    }
    const verifyPages=async(name,title,count)=>{
      await page(name,title);
      assert.equal(await js("document.querySelector('.catalog-pagination span').textContent"),'1 / 2');
      await js("document.querySelector('.catalog-pagination button:last-child').click()");
      await page(name+'-page2',title);
      assert.equal(await js("document.querySelector('.catalog-pagination span').textContent"),'2 / 2');
      assert.equal(await js("document.querySelectorAll('.catalog-card').length"),count);
      await js("document.querySelector('.catalog-pagination button:first-child').click()");
      await wait(100);
    };
    await verifyPages('knowledge-catalog','正向知识',2);
    await js("document.querySelector('.catalog-card').click()");
    panel.setSize(360,610);
    await page('knowledge-entry','编辑 正向条目');
    await js("document.querySelector('button[data-view=negative]').click()");
    await verifyPages('knowledge-rules','负向规则',1);
    await js("document.querySelector('button[data-view=pending]').click()");
    await verifyPages('knowledge-pending','待我确认',1);
    await js("document.querySelector('.catalog-card').click()");
    await page('knowledge-review','核对 正向草稿');
    assert(await js("document.querySelector('footer .primary').textContent==='确认生效'"));
    await js("document.querySelector('button[data-view=backup]').click()");
    await page('knowledge-backup','备份与恢复');
    await js("[...document.querySelectorAll('button')].find(button=>button.textContent==='预览恢复').click()");
    await page('knowledge-restore','恢复预览');
  }finally{host.close();}
}
async function main(){
  await electron.app.whenReady();
  electron.nativeTheme.themeSource=theme;
  mkdirSync(out,{recursive:true});
  if(knowledgePreview||process.argv.includes('--knowledge')){
    await captureKnowledge();
    console.log('知识库截图已写入 '+out);
    return;
  }
  const titles=['整理本周计划','核对行程','归档会议记录','给猫买粮','提交发票'];
  const review=attachReminderReview(runtime,{...common,flow:createReminderReviewFlow({request:async path=>{
    if(path.endsWith('/reminder-review'))return Response.json({today,tomorrow:today,items:[
      {id:'o1',title:'回复房东邮件',group:'overdue',deadline:today+'T09:00:00+09:00'},
      ...titles.map((title,i)=>({id:String(i),title,group:'today',deadline:today+'T18:00:00+09:00',recurrence:i===1})),
      {id:'m',title:'业务超市',group:'locked',reason:'超市会员日'}],recordedHours:[]});
    return Response.json({});
  }})});
  const inbox=attachTaskInbox(runtime,{...common,flow:{
    local:()=>[{name:'整理本周计划',attempt_count:1,started_at:created},
      {name:'绯月更新登记',started_at:created,batch:{state:'running',steps:[{label:'功能改善',state:'verified'},{label:'登记版本',state:'applying'}]}}],
    tasks:()=>({standalone:true,tasks:[{task_id:'a',name:'登记吃喝',status:'PENDING',can_claim:true,created_at:created},
      {task_id:'b',name:'整理相册',status:'RUNNING',created_at:created,progress_message:'第 2/5 步'}],next_offset:null}),
    chains:()=>({chains:[{chain_id:'g1',name:'晚间记录',created_at:created}],next_after:null}),
    detail:()=>({name:'晚间记录',status:'ACTIVE',nodes:[{node_id:'meal',name:'登记吃喝',status:'COMPLETED',params:{body:'晚餐吃了乌冬面'}}]}),
    receipts:()=>[],claim:async()=>{},inspect:async()=>{},
  }});
  const registration=attachRegistration(runtime,{...common,flow:{resume:async()=>({})}});
  const alert=(title,level)=>({key:title,title,level,issuer:'气象台',time:created,detail:'预计今天夜间到明天白天有大风，请注意防范。'});
  const weather=attachWeather(runtime,{...common,service:{snapshot:()=>({busy:false,rows:[
    {id:'xian',owner:'家',name:'未央区',current:{state:'ready',value:{temperature:8.4,text:'多云',wind:3.2,time:created,icon:'101'}},
      minimum:{state:'ready',value:{temperature:-2,day:today,threshold:0,below:true}},alerts:{state:'ready',value:{values:[alert('大风蓝色预警',2)]}}},
    {id:'tokyo',owner:'工作',name:'新宿区',current:{state:'ready',value:{temperature:14,text:'晴',wind:2.1,time:created,icon:'100'}},
      minimum:{state:'ready',value:{temperature:7,day:today,threshold:0,below:false}},alerts:{state:'ready',value:{values:[]}}},
    {id:'kokurakita',owner:'住处',name:'小仓北区',current:{state:'ready',value:{temperature:11,text:'小雨',wind:5.6,time:created,icon:'300'}},
      minimum:{state:'ready',value:{temperature:4,day:today,threshold:0,below:false}},alerts:{state:'ready',value:{values:[alert('大雨警报',4)]}},
      japan:{tracks:{state:'ready',values:[]},bulletins:{state:'ready',values:[]}}},
  ]}),refreshAll:async()=>({rows:[]}),close(){}}});
  const checkStore=createReminderChecks({profile,isBusy:()=>false,handlers:{tasks:()=>{},due:()=>{},weather:()=>{},aiHeartbeat:()=>{}},changed:()=>{}});
  const polls=attachPollSettings(runtime,{...common,checks:checkStore});
  for(let i=0;i<14;i++)checkStore.saveWeather({},{title:'天气提醒 '+(i+1),body:'未央区：大风预警 '+(i+1)},now-i*600_000);
  const turns=Array.from({length:14},(_,i)=>({id:'t'+i,at:now-i*1800_000,answeredAt:now-i*1800_000+9000,state:'answer',
    question:i%3?'明天福冈会下雨吗？顺便帮我看看要不要带伞，还有周末的安排。':'帮我总结一下今天做了什么',
    text:'明天福冈白天多云转小雨，降水概率 60%，建议带一把折叠伞。\n周末两天以晴为主，适合出门。'.repeat(i%2+1)}));
  const taskEvents=Array.from({length:12},(_,i)=>({at:now-i*900_000,task_id:'job'+(i%5),title:titles[i%5],action:['提交','执行中','完成'][i%3],detail:i%2?'绯月已在本机完成':''}));
  const history=attachConversationDetails(runtime,{...common,visible:true,history:{read:async()=>turns},readTasks:async()=>taskEvents,
    auditPending:()=>[{id:'1',kind:'手记质问',status:'等待回应',title:'那天临时调整了计划，后来顺利吗？'},
      {id:'2',kind:'悬念',status:'意外中断',title:'后来找到那本一直在找的书了吗？',
        citation:{reference:today+' · 第 1 篇 · 悬念 2',label:'对话原文摘录',excerpt:'你说：找了一早上，还是没找到那本上周借来的书。',canExpand:true}},
      {id:'3',kind:'消费记录',status:'等待回应',title:'这笔预算调整会影响之后的安排吗？'}],
    readQuestionCitation:id=>id==='2'?{body:'你说：找了一早上，还是没找到那本上周借来的书。\n绯月当时回复：上次读完可能放在客厅了。'}:undefined,
    checks:{notices:(...a)=>checkStore.notices(...a),markRead:id=>checkStore.markRead(id),
      diaryWork:()=>[{name:'手记质问',state:'等待续跑',at:now+35*60_000}],
      read:(_d,page)=>({nextAt:now+8*60_000,first:false,running:false,pending:true,page:page??0,pages:2,
        queue:[{name:'任务轮询',queuedAt:now-60_000,running:false}],
        events:Array.from({length:12},(_,i)=>({at:now-i*600_000,due:now-i*600_000,project:['到期事项','天气','任务轮询'][i%3],status:i%4?'已检查':'未执行',detail:i%4?'没有新事项':'绯月忙 · 连续第 2 次'}))})},
    edits:{view:async()=>({choices:[],entries:[{id:12,title:'交房租',diff:['截止 11/25 → 11/27']}],expires:now+3600_000,token:'tk'})},
    readTraffic:cursor=>({lines:[
      ...(!cursor?[JSON.stringify({category:'绯月自主行动',route:'手记质问',stage:'本批完成',goal:'核对近七天的手记，找出待确认的疑点',
        action_id:'sample-diary-audit',started_at:now-25_000,finished_at:now-5000,duration_ms:20_000,result:'已保存 72 步，下个轮询周期继续'})]:[]),
      ...Array.from({length:cursor?3:15},(_,i)=>JSON.stringify({time:new Date(now-i*60_000).toISOString(),direction:i%2?'receive':'send',method:'GET',route:'/api/tasks',status:200,duration_ms:120+i}))],
      next:cursor?null:[1]})});
  const boxes=createMessageBoxes(runtime,{...common});
  // 抽卡：假图片放在隔离目录，不启动调度器；默认宽度和 360 窄窗都截图。
  const cardPictures=join(profile,'card-draw-pictures');
  mkdirSync(join(cardPictures,'抽卡'),{recursive:true});
  for(let i=0;i<8;i++){
    const pixels=Buffer.alloc(64*64*4,255);
    for(let p=0;p<pixels.length;p+=4){pixels[p]=i*31;pixels[p+1]=255-i*29;pixels[p+2]=(p/256)%256;}
    writeFileSync(join(cardPictures,'抽卡','20261128-2100'+String(i).padStart(2,'0')+'-000.png'),
      electron.nativeImage.createFromBitmap(pixels,{width:64,height:64}).toPNG());
  }
  mkdirSync(join(cardPictures,'高清'),{recursive:true});
  for(const name of ['20261128-210100-000.png','20261128-210200-000.png'])
    copyFileSync(join(cardPictures,'抽卡','20261128-210000-000.png'),join(cardPictures,'高清',name));
  const cards=attachCardDraw(runtime,{...common,pictureRoot:cardPictures,enabled:false});
  try{
    await cards.open();
    const cardPage=code=>cards.panel.webContents.executeJavaScript(code);
    for(const [size,width,height] of [['',760,800],['-360',360,640]]){
      cards.panel.setContentSize(width,height);
      for(const view of ['setup','cards','hd']){
        await cardPage(`document.querySelector('[data-tab=${view}]').click()`);
        await wait(500);await shot('card-draw-'+view+size,cards.panel);
        assert(await cardPage('document.documentElement.scrollWidth<=innerWidth&&main.scrollWidth<=main.clientWidth'),view+size);
      }
    }
    assert.equal(await cardPage("document.querySelectorAll('#cards .card').length"),8);
    assert.equal(await cardPage("document.querySelectorAll('#hd .card img').length"),2);
    for(const [name,host] of [['today',review],['inbox',inbox],['registration',registration],['weather',weather],['polls',polls]]){
      await host.open();host.panel.setSize(430,560);await wait(500);await shot(name,host.panel);
    }
    for(const view of ['chat','tasks','checks','notices','pending','log']){
      await history.open(null,view);history.panel.setSize(430,560);await wait(500);await shot('review-'+view,history.panel);
      if(view==='pending'){
        const js=code=>history.panel.webContents.executeJavaScript(code);
        if(!await js("document.querySelector('.question-quote')?.textContent.includes('找了一早上') && !document.querySelector('.question-citation').open"))
          throw Error('悬念卡片缺少引文或默认展开');
        await js("document.querySelector('.question-citation summary').click()");
        for(let i=0;i<60&&!await js("document.querySelector('.question-citation').innerText.includes('客厅')");i++)await wait(50);
        if(!await js("document.querySelector('.question-citation').innerText.includes('客厅')"))throw Error('展开来源未加载正文');
        await shot('review-pending-source',history.panel);
      }
    }
    const box=boxes.showMessageBox({type:'question',title:'恢复本机任务终端 ID',message:'采用所选终端 ID 并重启绯月？',detail:'pc-2026-1121',buttons:['取消','恢复并重启'],defaultId:1});
    for(let i=0;i<60&&!boxes.panels[0]?.isVisible?.();i++)await wait(50);
    await wait(300);if(boxes.panels[0])await shot('message-box',boxes.panels[0]);
    boxes.close();await box.catch(()=>{});
    // 气泡、此刻所想、询问与确认需要较多运行时数据；这里不接预加载，只看静态外观（脚本读不到接口会停在初始画面）。
    for(const [name,page,options,fill] of [
      ['bubble','screen-question.html',{width:380,height:250,frame:false,transparent:true},
        "document.getElementById('answer').textContent='明天福冈多云转小雨，降水概率 60%，记得带伞。';document.getElementById('asked').hidden=false;document.getElementById('asked').textContent='明天要带伞吗？';document.getElementById('pending').hidden=false"],
      ['scene','scene.html',{width:430,height:420},
        "document.getElementById('thought').textContent='窗外的云走得很快，你今天是不是也有点赶？';document.querySelector('time').textContent='11/21 18:20 JST'"],
      ['inquiry','registration-review.html',{width:430,height:520},
        `document.getElementById('prompt').textContent='要登记这条吃喝吗？';
         document.getElementById('recordFields').textContent=${JSON.stringify('1. 吃喝\n内容：晚餐 乌冬面\n时间：18:30')};
         document.getElementById('recordStatus').textContent='请确认或补充';
         for(const b of document.querySelectorAll('footer button'))b.disabled=false`],
    ]){
      const view=new electron.BrowserWindow({...options,show:false,x:-6000,y:40,webPreferences:{sandbox:true}});
      await view.loadFile(join(common.bundle,page));view.showInactive();view.setPosition(-6000,40);
      await view.webContents.executeJavaScript(fill+';void 0');
      await shot(name,view);view.destroy();
    }
    console.log('截图已写入 '+out);
  }finally{for(const h of [review,inbox,registration,weather,polls,history,cards])h.close();checkStore.close();}
}
main().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
