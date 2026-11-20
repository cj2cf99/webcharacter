import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {attachScreenQuestion,questionBounds} from '../../desktop/screen-question-host.mjs';
function fixture(){
  const ipcMain=new EventEmitter(),handlers=new Map();ipcMain.handle=(k,fn)=>handlers.set(k,fn);ipcMain.removeHandler=k=>handlers.delete(k);
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.bounds={x:600,y:500,width:240,height:360};this.visible=false;this.destroyed=false;this.sent=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{},send:(...args)=>this.sent.push(args),setWindowOpenHandler:fn=>this.popup=fn});}
    isDestroyed(){return this.destroyed;}getBounds(){return this.bounds;}setBounds(b){this.bounds=b;}show(){this.visible=true;}showInactive(){this.visible=true;}focus(){}hide(){this.visible=false;}destroy(){this.destroyed=true;this.emit('closed');}async loadFile(){}
  }
  const win=new Window(),screen={getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1280,height:900}})};
  return {win,handlers,ipcMain,history:{save(){},read(){return [];}},electron:{BrowserWindow:Window,screen,ipcMain},event:panel=>({sender:panel.webContents,senderFrame:panel.webContents.mainFrame})};
}
test('QH01：头顶跟随及负坐标/边缘时仍在屏内，不改角色尺寸',()=>{
  for(const [pet,area]of [[{x:600,y:500,width:240,height:360},{x:0,y:0,width:1280,height:900}],[{x:-1700,y:0,width:240,height:360},{x:-1920,y:0,width:1920,height:1080}],[{x:1100,y:10,width:180,height:360},{x:0,y:0,width:1280,height:900}]]){
    const {bounds:b}=questionBounds(pet,area);assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width);assert.ok(b.y+b.height<=area.y+area.height);
  }
});
test('气泡超时请求在查询中被拒绝，空闲关闭保留草稿且手动关闭清除',async t=>{
  const f=fixture();
  let release,entered;
  const started=new Promise(resolve=>entered=resolve);
  const client={forget(){},askText(){entered();return new Promise(resolve=>release=resolve);}};
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',client});
  t.after(()=>host.close());
  await host.open();
  const before=host.panel,event=f.event(before);
  const draft={text:'  尚未发送  ',mode:'registration',withScreen:false};
  const idle={reason:'idle',draft};
  const run=f.handlers.get('screen-qa:ask')(event,{text:'查询期间'});
  await started;
  f.ipcMain.emit('screen-qa:close',event,idle);
  assert.equal(host.panel,before);
  release({state:'answer',text:'查询结束'});
  await run;
  f.ipcMain.emit('screen-qa:close',{sender:before.webContents,senderFrame:{}},idle);
  assert.equal(host.panel,before);
  f.ipcMain.emit('screen-qa:close',event,idle);
  assert.equal(host.panel,null);
  await host.open();
  const state=()=>f.handlers.get('screen-qa:state')(f.event(host.panel));
  assert.deepEqual(state().idleDraft,draft);
  assert.equal(state().mode,'registration');
  f.ipcMain.emit('screen-qa:close',f.event(host.panel));
  await host.open();
  assert.equal(state().idleDraft,null);
});
test('QH02：可信主frame才可提问；采集时保留原窗，回执只发文本，关闭清理',async()=>{
  const f=fixture();let calls=0,forgot=0,host;
  const client={async captureAndAsk(q,{onState}){calls++;assert.equal(host.panel.visible,true);assert.equal(q,'问题');onState({state:'waiting',text:'正在看'});return {state:'answer',text:'答案'};},forget(){forgot++;}};
  host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',client});
  await host.open();const panel=host.panel,e=f.event(panel);
  assert.equal(panel.options.webPreferences.sandbox,true);assert.equal(panel.popup().action,'deny');
  assert.throws(()=>f.handlers.get('screen-qa:ask')({sender:panel.webContents,senderFrame:{}},'问题'),/仅问答/);
  assert.deepEqual(await f.handlers.get('screen-qa:ask')(e,{text:'问题',withScreen:true}),{state:'answer',text:'答案',question:'问题'});assert.equal(calls,1);assert.equal(panel.visible,true);
  assert.deepEqual(f.win.getBounds(),{x:600,y:500,width:240,height:360});
  host.close();await Promise.resolve();assert.equal(forgot,1);assert.equal(f.handlers.size,0);assert.equal(panel.destroyed,true);assert.equal(f.win.listenerCount('move'),0);
});
test('QH03：关闭取消在途，无迟到结果；重复提交不启动第二次采集',async()=>{
  const f=fixture();let release,started;const entered=new Promise(resolve=>started=resolve);
  const client={captureAndAsk(_q,{signal,onState}){started();return new Promise(resolve=>{release=()=>{assert.ok(signal.aborted);onState({state:'answer',text:'迟到'});resolve({state:'answer',text:'迟到'});};});},forget(){}};
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',client});await host.open();
  const panel=host.panel,event=f.event(panel),run=f.handlers.get('screen-qa:ask')(event,{text:'问题',withScreen:true});await entered;
  assert.equal((await f.handlers.get('screen-qa:ask')(event,'另一个')).code,'BUSY');
  host.hide();release();assert.equal((await run).code,'REQUEST_CANCELLED');assert.ok(!panel.sent.some(([,v])=>v.text==='迟到'));
  host.close();
});

test('查询网络先搜公开资料，再用 AI 按来源整理；记忆入口不发请求',async t=>{
  const f=fixture(), queries=[], summaries=[], history=[];
  let searchAvailable=false, aiAvailable=true;
  f.history.save=value=>history.push(value);
  const sources=[{title:'发布公告',snippet:'11 月 20 日发布。',url:'https://example.test/official'}];
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',
    client:{forget(){},captureAndAsk(){assert.fail('联网模式不能采图');},async askText(text,options){
      assert.equal(options.grounded,true);
      summaries.push(text);
      return aiAvailable?{state:'answer',text:'公告显示 11 月 20 日发布。[1]'}:{state:'error'};
    }},
    registration:{submit:()=>assert.fail('显式联网不能登记')},
    search:async query=>{
      queries.push(query);
      if(!searchAvailable)throw Error('暂不可用');
      return {state:'answer',text:'原始摘要',sources};
    }});
  t.after(()=>host.close());
  await host.open();
  const e=f.event(host.panel),ask=(text,mode)=>f.handlers.get('screen-qa:ask')(e,{text,mode,withScreen:true});
  assert.equal(f.handlers.get('screen-qa:state')(e).webSearch,true);
  assert.equal((await ask('私有记录','memory')).code,'MEMORY_NOT_AVAILABLE');
  assert.deepEqual([queries.length,summaries.length,history.length],[0,0,0]);
  assert.equal((await ask('令牌：abcd','web')).state,'error');
  assert.equal(queries.length,0);
  assert.equal((await ask('发行版最新动向','web')).retryable,true);
  searchAvailable=true;
  const answer=await f.handlers.get('screen-qa:retry')(e);
  assert.deepEqual(queries,['发行版最新动向','发行版最新动向']);
  assert.match(summaries[0],/无法确认是最新情况/);
  assert.match(summaries[0],/11 月 20 日发布/);
  assert.doesNotMatch(summaries[0],/https:\/\//);
  assert.equal(answer.text,'公告显示 11 月 20 日发布。[1]');
  assert.deepEqual(answer.sources,sources);
  aiAvailable=false;
  assert.match((await ask('发行版最新动向','web')).text,/AI 暂未整理.*原始摘要/s);
});

test('本地思索先于问答和任务，云端接收原文并分别记录耗时',async t=>{
  const f=fixture(),events=[],logs=[];
  const pause=()=>new Promise(resolve=>setTimeout(resolve,12));
  let mode='chat';
  const model={async analyze(text,{hint,onProgress}){
    events.push(['local',text,hint]);onProgress('本地思索 · 理解输入…');
    await pause();
    if(hint==='registration')onProgress('本地思索 · 复核 1/2…');
    if(mode==='fail')return {error:'LOCAL_AI_TIMEOUT'};
    if(mode==='task')return {kind:'task',reply:''};
    return {kind:'chat',reply:'本地你好'};
  }};
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',
    localModel:model,log:event=>logs.push(event),
    client:{forget(){},async askText(text){events.push(['cloud',text]);await pause();return {state:'answer',text:'云端答复'};}},
    registration:{async submit(text){events.push(['register',text]);await pause();return {status:'completed',chain:{nodes:[]}};}}
  });
  t.after(()=>host.close());
  await host.open();
  const panel=host.panel, e=f.event(panel);
  const ask=(text,mode)=>f.handlers.get('screen-qa:ask')(e,{text,mode});
  assert.equal((await ask('你好')).text,'本地你好');
  assert.deepEqual(events,[['local','你好','auto']]);
  assert.ok(logs[0].local_ms>0);
  assert.equal(logs[0].cloud_ms,0);

  const input='今天的记录';
  await ask(input,'registration');
  assert.deepEqual(events.slice(-2),[['local',input,'registration'],['register',input]]);
  assert.ok(panel.sent.some(([,state])=>state?.text?.includes('复核 1/2')));
  assert.ok(logs[1].local_ms>0&&logs[1].cloud_ms>0);
  assert.ok(logs[1].duration_ms>=logs[1].local_ms+logs[1].cloud_ms-1);
  assert.equal(logs[1].operation,'随口登记');

  mode='fail';
  const q='  罗马的历史是什么？  ';
  assert.equal((await ask(q)).text,'云端答复');
  assert.deepEqual(events.slice(-2),[['local',q,'auto'],['cloud',q]]);
  assert.ok(logs[2].local_ms>0&&logs[2].cloud_ms>0);
  assert.ok(panel.sent.some(([,state])=>state?.text?.includes('转交云端')));
  assert.ok(!JSON.stringify(logs).includes(q),'分段日志不含用户原文');

  mode='task';
  const instruction='把桌面的临时窗口都收起来';
  assert.equal((await ask(instruction)).text,'云端答复');
  assert.deepEqual(events.slice(-2),[['local',instruction,'auto'],['cloud',instruction]]);
  assert.equal(logs[3].operation,'用户指令');
  assert.ok(logs[3].local_ms>0&&logs[3].cloud_ms>0);
});
