// 隐藏的自有窗口 + 合成图片 + mock Worker；不抓取用户屏幕，不调用真实AI。
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {createTopicMemory} from '../desktop/topic-memory.mjs';
import {createScreenQuestionClient} from '../desktop/screen-question-client.mjs';
import {createWorker} from '../agent/worker.mjs';
import {CLOUDFLARE_MODEL} from '../agent/assistant/cloudflare.mjs';
const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'qa-bubble-')),output=resolve(root,'output/screen-question-qa');
mkdirSync(output,{recursive:true});electron.app.setPath('userData',profile);
electron.app.commandLine.appendSwitch('disable-gpu');
let host,pet;
const wait=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('UI等待超时');};
async function run(){try{
  await electron.app.whenReady();
  pet=new electron.BrowserWindow({x:600,y:600,width:240,height:360,show:false,webPreferences:{offscreen:true}});
  if(process.argv.includes('--topic-recovery')){
    const init=()=>createTopicMemory({profile,memory:{root:profile,archiveDays:async()=>[]}});
    let topics=init();
    const topic=await topics.remember('画稿笔记');await topics.close();
    const file=join(profile,'专题记忆',topic.id+'.md');
    for(const suffix of ['','.bak1','.bak2','.bak3'])writeFileSync(file+suffix,'损坏的模拟资料');
    topics=init();await topics.ready;
    host=attachScreenQuestion(electron,{win:pet,profile,bundle:resolve(root,'output/desktop-bundle'),root,visible:false});
    const prompt=topics.offerRecoveryHelp(host.askUser);
    const popup=code=>host.inquiryPanel?.webContents.executeJavaScript(code).catch(()=>false);
    await wait(()=>popup("document.querySelector('#prompt')?.textContent.includes('画稿笔记')"));
    await popup("const a=document.querySelector('#answer');a.value='周五的水彩画稿';a.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendInput').click()");
    await wait(()=>topics.pending().some(t=>t.recoveryHelp==='answered'));
    await prompt;await topics.close();topics=init();await topics.ready;
    const result=topics.pending().find(t=>t.id===topic.id);
    assert.equal(result.recoveryHelp,'answered');assert.equal(result.evidence.at(-1).text,'周五的水彩画稿');
    await topics.offerRecoveryHelp(()=>assert.fail('不应重复询问'));await topics.close();
    console.log('PASS：专题全损，真实询问窗口接收线索，重启读回同一专题。');return;
  }
  if(process.argv.includes('--diary-audit')){
    let pending=true;
    const actions=[],question='正式发布是哪一天？';
    const item={id:'audit-ui',title:question,status:'等待回应'};
    const bubble=code=>host.panel.webContents.executeJavaScript(code);
    const details=code=>host.details.webContents.executeJavaScript(code);
    async function display(){
      const showing=host.showNag({id:item.id,audit:true,signal:new AbortController().signal,prompt:question,
        visible(){actions.push('shown');},
        leave(reason){actions.push(reason);if(reason==='refuse')pending=false;host.notifyPending();},
        async reply(text){actions.push(text);return {text:'哪天收到确认？'};}
      });
      // 真实气泡在离屏渲染器中运行，只模拟它已可见的回执。
      host.panel.isVisible=()=>true;
      assert(await showing);
      return '已打开质问';
    }
    host=attachScreenQuestion(electron,{win:pet,profile,bundle:resolve(root,'output/desktop-bundle'),root,visible:false,
      auditPending:()=>pending?[item]:[],resumeAudit:display});
    await display();
    await wait(()=>bubble("!document.querySelector('#auditActions').hidden && document.querySelector('#answer').textContent.includes('正式发布')"));
    assert(await bubble("document.querySelector('#mode').disabled && document.querySelector('#withScreen').disabled"));
    assert.equal(await bubble(`(()=>{
      const original=window.setTimeout;
      let idleTimers=0;
      window.setTimeout=(fn,ms,...args)=>{
        if(ms===90_000)idleTimers++;
        return original(fn,ms,...args);
      };
      try{
        const input=document.querySelector('#question');
        for(const text of ['', '还在写一半', '']){
          input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));
        }
        return idleTimers;
      }finally{window.setTimeout=original;}
    })()`),0,'正在阅读或输入的质询窗口不启动闲置关闭计时');
    await bubble("document.querySelector('#later').click()");
    await wait(()=>!host.panel);await host.openReview('pending');
    await wait(()=>details("document.querySelector('#turns')?.innerText.includes('回答')"));
    await details("document.querySelector('#turns button').click()");
    await wait(()=>host.panel?.webContents.executeJavaScript("document.querySelector('#later')?.offsetWidth>0"));
    await bubble("document.querySelector('#question').value='周五下午。';document.querySelector('#questionForm').requestSubmit()");
    await wait(()=>bubble("document.querySelector('#answer').textContent==='哪天收到确认？'"));
    await bubble("document.querySelector('#refuse').click()");
    await wait(()=>!host.panel);
    await wait(()=>details("!document.querySelector('#turns button')"));
    assert.deepEqual(actions,['shown','later','shown','周五下午。','refuse']);
    console.log('PASS 真实气泡与待确认页的稍后、继续、文字回答、追问、拒绝和清除。');return;
  }
  let captures=0,calls=0,romeAttempts=0,mode='answer',release;
  const image=electron.nativeImage.createFromBitmap(Buffer.alloc(64*64*4,255),{width:64,height:64});
  const worker=createWorker({weatherOptions:{fetcher:async url=>{
    assert.match(url,/www\.jma\.go\.jp\/bosai\/warning\//);
    return Response.json([{warning:{class20Items:[{areaCode:'4010000',kinds:[]}]}}]);
  }},createAiClient:()=>({async generate(input){
    assert.equal(input.route,'text');
    if(input.messages.at(-1).content.startsWith('请根据附件回答')){
      assert.match(input.messages.at(-3).content,/notes\.txt[\s\S]*测试代号：海棠/);
      assert.match(input.messages.at(-2).content,/请概括这个文件的内容/);
      return {provider:'cloudflare',model:CLOUDFLARE_MODEL,text:JSON.stringify({reply:'代号是海棠。',proposal:null})};
    }
    if(input.messages.at(-1).content==='介绍下罗马'){
      if(++romeAttempts===1)throw Object.assign(Error('模拟模型超时'),{code:'TIMEOUT'});
      return {provider:'cloudflare',model:CLOUDFLARE_MODEL,text:JSON.stringify({reply:'罗马坐落在台伯河畔。',proposal:null})};
    }
    if(input.messages.at(-1).content==='FluxJet 是什么？')return {provider:'cloudflare',model:CLOUDFLARE_MODEL,text:JSON.stringify({reply:'缺少可靠资料。',proposal:null,search_query:'FluxJet'})};
    if(input.messages.at(-1).content.startsWith('请依据以下公开网页摘要')){
      assert.match(input.messages.at(-1).content,/发布公告.*最新版本已公布/);
      return {provider:'cloudflare',model:CLOUDFLARE_MODEL,text:JSON.stringify({reply:'据发布公告，最新版本已公布。[1]',proposal:null})};
    }
    assert.equal(input.messages.at(-1).content,'你好');
    return {provider:'cloudflare',model:CLOUDFLARE_MODEL,text:JSON.stringify({reply:'你好呀',proposal:null})};
  }}),createVisionClient:()=>{throw Error('图片查询禁止上云');}});
  const vision=async()=>{calls++;if(mode==='waiting')await new Promise(resolve=>release=resolve);if(mode==='error')throw Object.assign(new Error('mock'),{code:'TIMEOUT'});return {text:mode==='long'?'<img src=x onerror=alert(1)>\n'+('从这张截图只能确定路径没有找到，先核对文件位置，不要急着删除配置。\n'.repeat(30)):'这个报错是说文件找不到。先检查路径是否拼错、文件有没有被移动；仅凭截图还不能确定具体原因。'};};
  const client=await createScreenQuestionClient({profile,vision,screen:{getCursorScreenPoint:()=>({x:-100,y:50}),getDisplayNearestPoint:()=>({id:77,size:{width:64,height:64},scaleFactor:1})},
    desktopCapturer:{async getSources(){
      captures++;
      if(mode==='waitingCapture')await new Promise(resolve=>release=resolve);
      return [{display_id:'77',thumbnail:image}];
    }},
    request:(path,options)=>path==='/api/weather/kokurakita/current'
      ? Response.json({validTime:new Date().toISOString(),condition:{text:'晴'},temperature:{value:16},wind:{speed:{value:2}}})
      : worker.fetch(new Request('https://test'+path,{...options,headers:{...options.headers,Authorization:'Bearer test'}}),{API_TOKEN:'test',DB:{prepare:()=>({all:async()=>({results:[]})})}})});
  const searched=[],registered=[];
  const search=async query=>{searched.push(query);return {state:'answer',text:'搜索结果 '+query,
    sources:[{title:'发布公告',snippet:'最新版本已公布。',url:'https://example.org/docs'}]};};
  const registration={submit:async text=>{registered.push(text);return {status:'completed',chain:{status:'COMPLETED',nodes:[{current_task:{type:'records.create',status:'COMPLETED',params:{body:text}}}]}};}};
  const reminderWrites=[],photoWrites=[];
  const reminderRequest=async(path,options)=>{
    if(path==='/api/records/photos'){
      photoWrites.push(options);
      if(photoWrites.length===2)return new Response(null,{status:503});
      const name=decodeURIComponent(options.headers['X-Photo-Name']);
      return Response.json({name,url:'https://fixture.test/photos/'+name},{status:201});
    }
    if(path==='/api/reminder-edits')return Response.json({items:(JSON.parse(options.body).id?[1]:[1,2]).map(id=>({id,title:'周报'+id,content:'初稿',deadline:'2026-11-20',recurrence:null,version:'fixture'}))});
    reminderWrites.push([path,JSON.parse(options.body)]);return Response.json({accepted:true});
  };
  const localModel={async analyze(text,{hint,replyMode,skillInstruction}){
    if(hint!=='direct')return null;
    assert.equal(replyMode,'tool');
    assert.equal(skillInstruction.name,'tool-response');
    assert.match(text,/发布公告.*最新版本已公布/);
    return {kind:'chat',reply:'据发布公告，最新版本已公布。[1]'};
  }};
  let registrationActions=0;
  host=attachScreenQuestion(electron,{win:pet,profile,bundle:resolve(root,'output/desktop-bundle'),root,client,registration,search,reminderRequest,localModel,visible:false,onRegistration:()=>registrationActions++,
    readTasks:()=>[{at:Date.now(),title:'检查资料',action:'完成提醒 · 已核实完成',task_id:'42',detail:'下次到期：明天'}]});
  await host.open();const panel=host.panel;
  const js=code=>panel.webContents.executeJavaScript(code);
  const snapshot=async name=>{await new Promise(resolve=>setTimeout(resolve,250));writeFileSync(join(output,name),(await panel.webContents.capturePage()).toPNG());};
  await wait(()=>js('Boolean(window.screenQuestion)'));
  assert.equal(await js("document.querySelector('#withScreen').checked"),false);
  const tourLive=process.argv.includes('--tour-live');
  if(tourLive||process.argv.includes('--image-live')){
    if(tourLive){
      await js("const mode=document.querySelector('#mode');mode.value='tour';mode.dispatchEvent(new Event('change'));");
      assert.equal(await js("document.querySelector('#send').textContent"),'出发 ↗');
      await js("document.querySelector('#question').value='';document.querySelector('#questionForm').requestSubmit()");
    }else await js("document.querySelector('#question').value='画一张水彩猫咪';document.querySelector('#questionForm').requestSubmit()");
    await wait(()=>js("document.querySelector('#answer').textContent.includes('已排队')"));
    assert.equal(await js("document.querySelector('#question').disabled"),false);
    host.hide();await host.open();
    const until=Date.now()+605000;
    while(Date.now()<until){
      const rows=await host.panel.webContents.executeJavaScript('window.screenQuestion.imageList()');
      if(rows[0]?.state==='failed')throw Error(rows[0].text);
      if(rows[0]?.state==='done'){
        if(tourLive)assert.match(rows[0].text,/绯月环球之旅 · .+，已完成/);
        assert.match(rows[0].preview,/^data:image\//);assert.ok(rows[0].canOpen);
        await wait(()=>host.panel.webContents.executeJavaScript("document.querySelector('#imageResults img')?.naturalWidth>0"));
        assert.equal(calls,0);assert.equal(captures,0);
        console.log('PASS：中文指令异步提交、气泡关闭重开后收到真实 PNG 缩略图，任务号 '+rows[0].job);
        return;
      }
      // 隐藏窗口会按普通空闲规则关闭。实际显示结果时重新打开。
      await new Promise(resolve=>setTimeout(resolve,500));
      if(!host.panel)await host.open();
    }
    throw Error('未收到图像任务结果');
  }
  if(process.argv.includes('--attachments')||process.argv.includes('--skill-review')){
    const source=bytes=>JSON.stringify([...bytes]);
    const put=async(event,name,type,bytes)=>js(`(() => {
      const target=document.querySelector('#question'), transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array(${source(bytes)})],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));
      const e=${event==='paste'?"new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true})":"new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true})"};
      target.dispatchEvent(e);return e.defaultPrevented;
    })()`);
    const fileName=()=>js("document.querySelector('#attachmentName').textContent");
    await wait(()=>js("document.readyState==='complete'"));
    if(process.argv.includes('--skill-review')){
      const plan={pending:[],chain:{nodes:[{key:'entry-1',type:'records.create',target_device_id:null,params:{body:'合成测试图片',category_id:1}}]}};
      const popup=code=>host.inquiryPanel?.webContents.executeJavaScript(code).catch(()=>false);
      const ready=()=>popup("!!document.querySelector('#approveRecord') && !document.querySelector('#approveRecord').disabled && !document.querySelector('#approveRecord').hidden");
      registration.preview=async()=>plan;
      registration.submitReviewed=async(_text,approved)=>{assert.equal(approved,plan);registered.push(approved);return {status:'completed',chain:{nodes:[]}};};
      await put('drop','base.png','image/png',image.toPNG());
      await wait(async()=>await fileName()==='base.png');
      await put('paste','reference.png','image/png',image.toPNG());
      await wait(async()=>(await fileName()).includes('图2 reference.png'));
      await js("document.querySelector('#removeAttachment').click()");
      await put('paste','source.png','image/png',image.toPNG());
      await wait(async()=>await fileName()==='source.png');
      await js("document.querySelector('#question').value='把图里内容记成随手记';document.querySelector('#questionForm').requestSubmit()");
      await wait(ready);
      assert.match(await popup("document.querySelector('#recordFields').textContent"),/合成测试图片/);
      assert.equal(registered.length,0);
      await popup("document.querySelector('#approveRecord').click()");
      await wait(()=>registered.length===1);
      assert.equal(captures,0);assert.equal(photoWrites.length,0);
      await wait(()=>js("!document.querySelector('#question').value && !document.querySelector('#attachmentName').textContent.includes('source.png')"));
      const reminderPlan={pending:[],chain:{nodes:[{type:'reminders.create',target_device_id:null,params:{title:'关注 Qwen4 2B、4B 量化模型'}}]}};
      registration.preview=async()=>reminderPlan;
      registration.submitReviewed=async(_text,approved)=>{
        assert.equal(approved,reminderPlan);registered.push(approved);
        return {chain:{nodes:[{current_task:{...approved.chain.nodes[0],status:'COMPLETED',result:{record_id:7}}}]}};
      };
      const askReminder=()=>js("document.querySelector('#question').value='加个没时间的提醒，关注Qwen4的2B、4B量化模型';document.querySelector('#questionForm').requestSubmit()");
      await askReminder();await wait(ready);
      assert.match(await popup("document.querySelector('#recordFields').textContent"),/不设日期/);
      await popup("document.querySelector('#discardRecord').click()");
      await wait(()=>js("document.querySelector('#answer').textContent.includes('已放弃')"));assert.equal(registered.length,1);
      await askReminder();await wait(ready);
      await popup("document.querySelector('#approveRecord').click()");
      await wait(()=>js("document.querySelector('#answer').textContent.includes('已登记')"));assert.equal(registered.length,2);
      const questions=['东京出差','大阪出差'].map(task=>({type:'reminders.create',task,field:'title',question:'标题？'}));
      let revised='';
      registration.preview=async input=>{
        if(!input.includes('用户补充'))return {pending:questions,chain:null};
        revised=input;
        return reminderPlan;
      };
      await askReminder();await wait(()=>popup("document.querySelectorAll('#missing li input').length===2"));
      assert.equal(await popup("document.querySelector('#approveRecord').hidden"),true);
      assert.equal(host.inquiryPanel.isModal(),false);assert.equal(host.inquiryPanel.isAlwaysOnTop(),false);
      assert.ok(host.inquiryPanel.getSize()[0]>=600);
      await popup("const bulk=document.querySelector('#bulk input');bulk.value='统一标题';bulk.dispatchEvent(new Event('input',{bubbles:true}));const rows=document.querySelectorAll('#missing input');rows[1].value='单独标题';rows[1].dispatchEvent(new Event('input',{bubbles:true}))");
      await popup("const t=new DataTransfer();t.items.add(new File(['补充资料'], '说明.txt',{type:'text/plain'}));document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:t,bubbles:true,cancelable:true}))");
      await wait(()=>popup("document.querySelector('#filename').textContent==='说明.txt'"));
      await popup("document.querySelector('#sendInput').click()");
      await wait(ready);assert.match(revised,/东京出差.*统一标题/);assert.match(revised,/大阪出差.*单独标题/);assert.match(revised,/补充资料/);
      assert.equal(registered.length,2);host.inquiryPanel.close();await wait(()=>!host.inquiryPanel);
      assert.equal(registered.length,2);
      plan.chain.nodes.push({...plan.chain.nodes[0],key:'entry-2',params:{body:'第二条',category_id:1}});
      registration.preview=async()=>plan;
      registration.submitReviewed=async(_text,approved)=>{
        assert.equal(approved.chain.nodes[0].params.photos,undefined);
        assert.deepEqual(approved.chain.nodes[1].params.photos,['source.png','b.png','c.png'].map(name=>'https://fixture.test/photos/'+name));
        registered.push(approved);return {status:'completed',chain:{nodes:[]}};
      };
      await put('paste','source.png','image/png',image.toPNG());
      await wait(async()=>await fileName()==='source.png');
      await js("document.querySelector('#question').value='把图里内容记成随手记';document.querySelector('#questionForm').requestSubmit()");
      await wait(ready);assert.equal(photoWrites.length,0);
      assert.equal(await popup("document.querySelectorAll('.photo-pick').length"),3);
      await popup("document.querySelector('#photoTarget').value='1';document.querySelector('#sourcePhoto').click()");
      const pastePictures=async names=>{
        const pictures=names.map((name,i)=>({name,bytes:[...electron.nativeImage.createFromBitmap(Buffer.alloc(16*16*4,90+i*30),{width:16,height:16}).toPNG()]}));
        await popup(`(()=>{const t=new DataTransfer();for(const {name,bytes} of ${JSON.stringify(pictures)})t.items.add(new File([new Uint8Array(bytes)],name,{type:'image/png'}));document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:t,bubbles:true,cancelable:true}));})()`);
      };
      await pastePictures(['b.png','c.png']);await wait(()=>popup("document.querySelectorAll('.photo-pick img').length===3"));
      await pastePictures(['extra.png']);await wait(()=>popup("document.querySelector('#recordStatus').textContent.includes('最多')"));
      await popup("document.querySelectorAll('.photo-remove')[1].click()");
      await pastePictures(['b.png']);await wait(()=>popup("document.querySelectorAll('.photo-pick img').length===3"));
      assert.equal(photoWrites.length,0);
      await popup("document.querySelector('#approveRecord').click()");
      await wait(()=>popup("document.querySelector('#recordStatus').textContent.includes('503')"));
      assert.equal(registered.length,2);await wait(ready);
      await popup("document.querySelector('#approveRecord').click()");
      await wait(()=>registered.length===3);
      assert.deepEqual(photoWrites.map(r=>r.headers['X-Photo-Name']),['source.png','b.png','b.png','c.png']);
      assert.deepEqual(Buffer.from(photoWrites[0].body),image.toPNG());
      const ids=[],readText=client.askText;
      client.askText=async(question,opts)=>{
        if(opts?.image)ids.push(opts.turn.id);
        return readText(question,opts);
      };
      registration.preview=async input=>input.includes('用户补充')?reminderPlan:{pending:questions,chain:null};
      await askReminder();await wait(()=>popup("document.querySelectorAll('#missing li input').length===2"));
      await pastePictures(['local-a.png','local-b.png','local-c.png']);
      await wait(()=>popup("document.querySelectorAll('.photo-pick img').length===3"));
      await popup("document.querySelector('#sendInput').click()");await wait(ready);
      assert.equal(new Set(ids).size,3);assert.equal(photoWrites.length,4);
      await popup("document.querySelector('#discardRecord').click()");
      console.log('PASS：三个图片位、多图粘贴、移除补位、第四张拦截，确认时按顺序上传，失败重试复用已取得的回执。');
      console.log('PASS：无日期文字提醒预览、取消零写入、确认一次写入与回执展示。');
      console.log('PASS：拖入底图、粘贴图2、合成图识读、预览零提交、确认一次提交。');
      return;
    }
    for(const event of ['drop','paste']){
      const name=event+'.png';
      assert.ok(await put(event,name,'image/png',image.toPNG()));
      await wait(async()=>await fileName()===name);
      assert.ok(await js("document.querySelector('#attachmentImage').naturalWidth>0 && document.querySelector('#withScreen').disabled"));
      if(event==='drop'){
        await js("document.querySelector('#removeAttachment').click()");
        assert.equal(await fileName(),'');
      }else{
        await js("document.querySelector('#question').value='重启绯月';document.querySelector('#questionForm').requestSubmit()");
        await wait(()=>js("document.querySelector('#reply').dataset.state==='answer' && document.querySelector('#attachment').hidden"));
        assert.equal(calls,1);assert.equal(captures,0);
      }
    }
    assert.ok(await put('drop','bad.pdf','application/pdf',Buffer.from('%PDF-1.7')));
    await wait(()=>js("!document.querySelector('#attachmentError').hidden"));
    assert.equal(await fileName(),'');
    assert.ok(await put('drop','notes.txt','text/plain',Buffer.from('测试代号：海棠')));
    await wait(async()=>await fileName()==='notes.txt');
    await new Promise(resolve=>setTimeout(resolve,90_100));
    await wait(()=>!host.panel);
    await host.open();
    const restored=code=>host.panel.webContents.executeJavaScript(code);
    await wait(()=>restored("document.querySelector('#attachmentName').textContent==='notes.txt'"));
    await restored("document.querySelector('#questionForm').requestSubmit()");
    await wait(()=>restored("document.querySelector('#answer').textContent==='代号是海棠。' && document.querySelector('#attachment').hidden"));
    assert.equal(captures,0);assert.deepEqual(registered,[]);assert.deepEqual(searched,[]);
    console.log('PASS：拖入图片、粘贴图片、拖入文本、移除、格式提示、只附文件发送以及按附件内容回答。');
    return;
  }
  if(process.argv.includes('--idle-close')){
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    await pause(5500);
    await js("const i=document.querySelector('#question'); i.value='  保留原样的草稿  '; i.dispatchEvent(new Event('input',{bubbles:true}));");
    await pause(88_000);
    assert.equal(host.panel,panel,'输入后应重新计时');
    assert.equal(await js(`(() => {
      const reply=document.querySelector('#reply');
      reply.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));
      const wheel=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});
      reply.dispatchEvent(wheel);
      return wheel.defaultPrevented && getComputedStyle(reply).overflowY==='clip';
    })()`),true,'气泡没有滚轮滚动');
    await wait(()=>!host.panel);
    await host.open();
    const resumed=host.panel, resumedJs=code=>resumed.webContents.executeJavaScript(code);
    await wait(()=>resumedJs("document.querySelector('#question').value==='  保留原样的草稿  '"));
    mode='waitingCapture';
    await resumedJs("document.querySelector('#withScreen').click(); document.querySelector('#questionForm').requestSubmit();");
    await wait(()=>Boolean(release));
    await pause(90_400);
    assert.equal(host.panel,resumed,'查询期间禁止自动关闭');
    release();
    await wait(()=>resumedJs("document.querySelector('#reply').dataset.state==='answer'"));
    await pause(88_000);
    assert.equal(host.panel,resumed,'回复后获得完整一轮计时');
    await wait(()=>!host.panel);
    console.log('PASS：真实 90 秒空闲自动关闭、输入重新计时、鼠标移动和滚轮不续时、草稿恢复、查询期间保持打开。');
    return;
  }
  assert.equal(await js("document.querySelector('#pending').hidden"),true);
  panel.webContents.send('screen-qa:changed',{state:'error',text:'面板暂不可用。'});
  await wait(()=>js("document.querySelector('#answer').textContent==='面板暂不可用。'"));
  assert.equal(await js("document.querySelector('#badge').hidden"),true);
  if(process.argv.includes('--appearance')){
    const originalTheme=electron.nativeTheme.themeSource, originalBounds=panel.getBounds();
    const preview={state:'error',question:'你试着回复我一段100字的内容，介绍下罗马',text:'文字问答失败，请检查连接或稍后重试',retryable:true};
    for(const theme of ['light','dark']){
      electron.nativeTheme.themeSource=theme;
      for(const hasPending of [false,true]){
        panel.webContents.send('screen-qa:changed',{...preview,hasPending});
        await wait(()=>js("document.querySelector('#answer').textContent.includes('请检查连接') && matchMedia('(prefers-color-scheme: "+theme+")').matches"
          +" && document.querySelector('#pending').hidden==="+!hasPending));
        await js("document.querySelector('#question').focus()");
        for(const width of [300,originalBounds.width]){
        panel.webContents.enableDeviceEmulation({screenPosition:'desktop',viewSize:{width,height:originalBounds.height},scale:1});
        await wait(()=>js('Math.abs(innerWidth-'+width+')<=1'));
        const layout=await js(`(() => {
          const rect=id=>document.querySelector(id).getBoundingClientRect();
          const body=rect('.bubble'), send=rect('#send'), form=rect('form');
          const firstTool=document.querySelector('#pending').hidden?'#history':'#pending';
          return {sendInside:send.bottom<form.bottom && form.bottom<body.bottom,
            badgeFits:!document.querySelector('#badge').hidden && rect('#badge').right<=rect(firstTool).left,
            toolsFit:rect('#history').right<=rect('#close').left && rect('#close').right<body.right,
            retryFits:rect('#answer').right<=rect('#retry').left, replyFits:document.querySelector('#reply').scrollHeight<=rect('#reply').height+1,
            headerBlends:getComputedStyle(document.querySelector('header')).backgroundImage==='none'};
        })()`);
        for(const [check,passes] of Object.entries(layout))assert.ok(passes,theme+' '+width+' '+check);
        }
      }
      panel.webContents.disableDeviceEmulation();
      await snapshot('bubble-'+theme+'.png');
    }
    electron.nativeTheme.themeSource=originalTheme;
    panel.webContents.send('screen-qa:changed',{state:'answer',question:'多行摘要',text:'一\n二\n三\n四\n五\n六\n七\n八\n九\n十'});
    await wait(()=>js(`(() => {
      const answer=document.querySelector('#answer'), reply=document.querySelector('#reply'), more=document.querySelector('#full');
      return answer.textContent.includes('十') && more.hidden && reply.clientHeight>=answer.clientHeight-1;
    })()`));
    console.log('PASS：问答气泡浅深色、300/360 像素宽、失败提示、重试、焦点和多行回复的无滚动预览。');
    return;
  }
  await js("document.querySelector('#question').value='你好';document.querySelector('#question').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true}));");
  await wait(()=>js("document.querySelector('#answer').textContent==='你好呀'"));assert.equal(captures,0);
  await js("document.querySelector('#question').value='介绍下罗马';document.querySelector('#questionForm').requestSubmit()");
  await wait(()=>js("document.querySelector('#answer').textContent==='罗马坐落在台伯河畔。'"));
  assert.equal(romeAttempts,2);
  await js("document.querySelector('#withScreen').click()");
  await js("document.querySelector('#question').value='现在有天气预警吗';document.querySelector('#questionForm').requestSubmit();");
  await wait(()=>js("document.querySelector('#answer').textContent.includes('小仓北区')"));
  assert.match(await js("document.querySelector('#answer').textContent"),/小仓北区.*晴.*16°C/);
  assert.equal(captures,0);assert.equal(calls,0);
  mode='waiting';await js("document.querySelector('#question').value='这个报错是什么意思？';document.querySelector('#questionForm').requestSubmit();");
  await wait(()=>Boolean(release));assert.equal(await js("document.querySelector('#reply').dataset.state"),'waiting');
  await snapshot('waiting.png');mode='answer';release();
  await wait(()=>js("document.querySelector('#reply').dataset.state==='answer'"));
  assert.equal(captures,1);assert.equal(calls,1);await snapshot('answer.png');
  mode='error';await js("document.querySelector('#question').value='这个报错是什么意思？';document.querySelector('#questionForm').requestSubmit()");await wait(()=>js("document.querySelector('#reply').dataset.state==='error'"));
  assert.equal(captures,2);assert.equal(calls,2);assert.equal(await js("document.querySelector('#retry').hidden"),false);
  await snapshot('error.png');
  mode='answer';await js("document.querySelector('#retry').click()");await wait(()=>js("document.querySelector('#reply').dataset.state==='answer'"));assert.equal(captures,2);assert.equal(calls,3);
  mode='long';await js("document.querySelector('#questionForm').requestSubmit()");await wait(()=>js("document.querySelector('#answer').textContent.startsWith('<img')"));
  assert.equal(await js("document.querySelectorAll('#reply img').length"),0);assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await js("Array.from(new Intl.Segmenter().segment(document.querySelector('#answer').textContent)).length"),200);
  assert.equal(host.details,null);
  await js("document.querySelector('#full').click()");
  assert.ok(await js("document.querySelector('#answer').textContent.length")>200);
  await js("document.querySelector('#full').click()");
  await js("window.screenQuestion.details(true)");
  await wait(()=>host.details&&!host.details.webContents.isLoading());
  const historyJs=code=>host.details.webContents.executeJavaScript(code);
  await wait(()=>historyJs("Boolean(document.querySelector('details[open] p')?.textContent.includes('只能确定'))"));
  assert.ok(await historyJs("document.querySelector('details[open] p').textContent.length")>50);
  assert.ok(await historyJs("document.querySelectorAll('details').length")>=4);
  assert.equal(await historyJs("document.querySelectorAll('details[open] p img, img[src=x]').length"),0);
  assert.ok(await historyJs("[...document.querySelectorAll('details')].some(n=>n.querySelector('summary').textContent.includes('介绍下罗马')&&n.textContent.includes('罗马坐落在台伯河畔。')&&n.querySelector('.failure-log')?.textContent.includes('HTTP 504 · TIMEOUT'))"));
  assert.equal(await historyJs("Array.from(document.querySelectorAll('.failure-log')).some(n=>n.textContent.includes('AI_TIMEOUT'))"),false);
  assert.equal(await historyJs("Array.from(document.querySelectorAll('summary')).filter(n=>n.textContent.includes('手动重试')).length"),1);
  assert.equal(await historyJs("Array.from(document.querySelectorAll('summary')).filter(n=>n.textContent.includes('这个报错是什么意思')).length"),4);
  const historyPanel=host.details;
  await js("document.querySelector('#history').click()");
  await wait(()=>historyJs("!document.querySelector('details[open]')"));
  assert.equal(host.details,historyPanel);
  await host.openReview();await wait(()=>historyJs("['检查资料','完成提醒','已核实完成'].every(t=>document.querySelector('#turns .fy-card')?.textContent.includes(t))"));
  await historyJs("document.querySelector('#chat').click()");await wait(()=>historyJs("document.querySelectorAll('details').length>=4"));
  historyPanel.destroy();
  assert.equal(searched.length,0);
  const submit=async text=>{await js("document.querySelector('#question').value="+JSON.stringify(text)+";document.querySelector('#questionForm').requestSubmit()");};
  await host.open('registration');assert.equal(host.panel,panel);
  await wait(()=>js("document.querySelector('#mode').value==='registration'"));
  const beforeRegistration=registrationActions;
  await submit('午饭拉面');await wait(()=>js("document.querySelector('#answer').textContent.includes('已登记')"));
  assert.equal(registrationActions,beforeRegistration+1,'气泡接到登记触发一次专属动作');
  assert.deepEqual(registered,['午饭拉面']);
  await submit('上网搜一下 Firefox');await wait(()=>js("document.querySelector('#answer').textContent.includes('搜索结果 Firefox')"));
  await submit('FluxJet 是什么？');await wait(()=>js("document.querySelector('#answer').textContent.includes('搜索结果 FluxJet')"));
  assert.deepEqual(searched,['Firefox','FluxJet']);assert.equal(captures,3);
  assert.equal(registrationActions,beforeRegistration+1,'普通查询不触发登记动作');
  const pick=value=>js("document.querySelector('#mode').value="+JSON.stringify(value)
    +";document.querySelector('#mode').dispatchEvent(new Event('change'));true;");
  assert.deepEqual(await js("Array.from(document.querySelector('#mode').options,x=>x.textContent)"),['自动','绯月环球之旅','登记','查询网络','查询记忆（未开放）']);
  assert.equal(await js("document.querySelector('option[value=web]').disabled"),false);
  assert.equal(await js("document.querySelector('option[value=memory]').disabled"),true);
  await pick('memory');
  assert.equal(await js("document.querySelector('#send').disabled"),true);
  await submit('只留入口');
  assert.equal(await js("document.querySelector('#send').textContent"),'暂未开放');
  assert.deepEqual(searched,['Firefox','FluxJet']);
  await pick('web');
  assert.equal(await js("document.querySelector('#withScreen').disabled"),true);
  assert.equal(await js("document.querySelector('#withScreen').checked"),false);
  await submit('Firefox 最新版本');
  await wait(()=>js("document.querySelector('#answer').textContent.includes('据发布公告')"));
  assert.equal(await js("document.querySelector('#sources').hidden"),false);
  assert.deepEqual(searched,['Firefox','FluxJet','Firefox 最新版本']);assert.equal(captures,3);
  assert.deepEqual(registered,['午饭拉面']);
  await submit('把周报的内容改为定稿');
  await wait(()=>js("document.querySelector('#answer').textContent.includes('选择一个或多个')"));
  await wait(()=>js("!document.querySelector('#pending').hidden"));
  await js("document.querySelector('#pending').click()");
  await wait(()=>host.details&&historyJs("document.querySelectorAll('.candidate input').length===2"));
  await historyJs("for(const box of document.querySelectorAll('.candidate input'))box.click();[...document.querySelectorAll('button')].find(b=>b.textContent==='查看修改方案').click()");
  await wait(()=>historyJs("document.querySelector('#turns').textContent.includes('初稿 → 定稿')"));
  host.details.destroy();assert.equal(reminderWrites.length,0);
  await js("document.querySelector('#pending').click()");
  await wait(()=>host.details&&historyJs("document.querySelectorAll('#turns .fy-card h3').length===2"));
  await historyJs("[...document.querySelectorAll('button')].find(b=>b.textContent==='同意这组修改').click()");
  try{await wait(()=>historyJs("document.querySelector('#status').textContent.includes('已更新')"));}
  catch(error){throw Error(error.message+' · 提醒写入 '+reminderWrites.length+' · '+await historyJs("document.querySelector('#status').textContent"));}
  assert.equal(reminderWrites.length,2);host.details.destroy();
  await wait(()=>js("document.querySelector('#pending').hidden"));
  await submit('把编号1的标题改为周报归档');
  await wait(()=>js("document.querySelector('#answer').textContent.includes('修改方案')"));
  await submit('我同意');await wait(()=>js("document.querySelector('#answer').textContent.includes('先打开')"));
  assert.equal(reminderWrites.length,2);
  await js("document.querySelector('#pending').click()");
  await wait(()=>host.details&&historyJs("document.querySelector('#turns').textContent.includes('周报归档')"));
  host.details.destroy();await submit('我不同意');
  await wait(()=>js("document.querySelector('#answer').textContent.includes('已放弃')"));
  await wait(()=>js("document.querySelector('#pending').hidden"));
  assert.equal(reminderWrites.length,2);
  const before=panel.getBounds();pet.setBounds({x:400,y:400,width:240,height:360});await wait(()=>panel.getBounds().x!==before.x);
  mode='waiting';release=null;
  await js("if(!document.querySelector('#withScreen').checked)document.querySelector('#withScreen').click()");
  await submit('  关闭时也应保留原文  ');await wait(()=>Boolean(release));
  await js("document.querySelector('#close').click()");await wait(()=>!host.panel);
  release();await host.openReview();
  await wait(()=>historyJs("document.querySelector('#tasks').getAttribute('aria-pressed')==='true'"));
  await historyJs("document.querySelector('#chat').click()");
  await wait(()=>historyJs("Array.from(document.querySelectorAll('summary')).some(n=>n.textContent.endsWith('  关闭时也应保留原文  '))"));
  console.log('PASS：真实Electron问答/天气/200字预览/历史/登记/搜索/提醒多选/关闭重开/整组同意/单项拒绝/跟随和关闭。使用合成测试数据。');
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{host?.close();pet?.destroy();electron.app.exit(process.exitCode||0);}}
run().catch(error=>{console.error(error.stack);electron.app.exit(1);});
