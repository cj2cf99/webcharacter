// 菜单弹窗截图巡检：隔离 profile + 模拟数据，逐个打开菜单面板，按深浅色截图到 output/menu-qa/。
// 运行：node tools/build-desktop.mjs 后，分别执行 electron tools/capture-menu-panels-electron.mjs 与 ... --dark
import * as electron from 'electron';
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

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-menu-qa-'));
const out=join(root,'output/menu-qa');
mkdirSync(join(profile,'desktop'));
for(const file of ['panel-titlebar.json','registration-preload.cjs','reminder-review-preload.cjs','task-inbox-preload.cjs','weather-preload.cjs','conversation-preload.cjs','preload.cjs','poll-settings-preload.cjs','message-box-preload.cjs'])
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
async function main(){
  await electron.app.whenReady();
  electron.nativeTheme.themeSource=theme;
  mkdirSync(out,{recursive:true});
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
      read:(_d,page)=>({nextAt:now+8*60_000,first:false,running:false,pending:true,page:page??0,pages:2,
        events:Array.from({length:12},(_,i)=>({at:now-i*600_000,due:now-i*600_000,project:['到期事项','天气','任务轮询'][i%3],status:i%4?'已检查':'未执行',detail:i%4?'没有新事项':'绯月忙 · 连续第 2 次'}))})},
    edits:{view:async()=>({choices:[],entries:[{id:12,title:'交房租',diff:['截止 11/25 → 11/27']}],expires:now+3600_000,token:'tk'})},
    readTraffic:cursor=>({lines:Array.from({length:cursor?3:15},(_,i)=>JSON.stringify({time:new Date(now-i*60_000).toISOString(),direction:i%2?'receive':'send',method:'GET',route:'/api/tasks',status:200,duration_ms:120+i})),next:cursor?null:[1]})});
  const boxes=createMessageBoxes(runtime,{...common});
  const shot=async(name,panel)=>{
    await wait(900);
    writeFileSync(join(out,name+'-'+theme+'.png'),(await panel.webContents.capturePage()).toPNG());
  };
  try{
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
  }finally{for(const h of [review,inbox,registration,weather,polls,history])h.close();checkStore.close();}
}
main().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
