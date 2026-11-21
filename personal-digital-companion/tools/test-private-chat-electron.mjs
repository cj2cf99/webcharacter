import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {attachConversationDetails} from '../desktop/conversation-details.mjs';
import {attachDictation} from '../desktop/dictation-host.mjs';
import {createMenuPopup} from '../desktop/menu-popup.mjs';
import {attachPrivateChatPanel} from '../desktop/private-chat-panel.mjs';
import {createPrivateChat,waitingImage,waitingLabel} from '../desktop/private-chat.mjs';
import {createLocalModel} from '../desktop/local-model.mjs';
import voices from '../assets/voice/private-chat/manifest.json' with {type:'json'};

const {app,BrowserWindow,Menu}=electron,root=resolve(import.meta.dirname,'..');
const bundle=join(root,'output/desktop-bundle'),profile=mkdtempSync(join(tmpdir(),'feiyue-private-ui-'));
const realCpu=process.argv.includes('--real-cpu');
app.setPath('userData',profile);
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.on('window-all-closed',()=>{});
function trackAudio(){
  window.testAudio=[];
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){
    const body=this.src.startsWith('blob:');
    const clip={src:body?'正文':this.src.split('/').at(-1),loop:this.loop,ended:false};
    if(body)clip.afterPriorAudio=window.testAudio.every(previous=>previous.ended);
    window.testAudio.push(clip);
    this.addEventListener('ended',()=>{clip.ended=true;},{once:true});
    return play.call(this);
  };
}
const windows=title=>BrowserWindow.getAllWindows().find(win=>win.getTitle()===title);
const inspect=(win,expression,gesture=false)=>win.webContents.executeJavaScript(expression,gesture);
async function until(check,message,waitMs=realCpu?60000:12000){
  const deadline=performance.now()+waitMs;
  while(performance.now()<deadline){if(await check())return;await delay(50);}
  throw Error(message);
}
const draw=id=>(voices.startup.indexOf(id)+0.5)/voices.startup.length;

async function test(){
  await app.whenReady();
  const audioProbe=join(profile,'test-audio-preload.cjs');
  writeFileSync(audioProbe,`require('electron').contextBridge.executeInMainWorld({func:${trackAudio.toString()}});`);
  const preload=electron.session.defaultSession.registerPreloadScript({type:'frame',filePath:audioProbe,
    includeGlobs:[pathToFileURL(join(bundle,'private-chat.html')).href]});
  const win=new BrowserWindow({show:false,width:200,height:300,x:720,y:420});
  const wav=Uint8Array.from(readFileSync(join(bundle,'voice/private-chat/accepted.wav')));
  const first=Promise.withResolvers(),late=Promise.withResolvers();
  let chat,prepares=0,releases=0,renders=0,transcriptions=0,crashing=false,voiceDraws=0;
  let now=Date.now();
  const panel=attachPrivateChatPanel(electron,{win,root,bundle,chat:()=>chat,visible:false});
  const dictation=attachDictation(electron,{root,bundle,voice:{enabled:true,transcribe(){
    transcriptions++;return {text:'嗯，嗯，周末去散步'};},stopRecording(){}},
    privateModel:owner=>({work:(text,opts)=>chat.modelWork(panel.owner(owner),text,opts)})});
  const details=attachConversationDetails(electron,{root,profile,bundle,visible:false,
    auditPending:()=>chat.waiting?[chat.waiting]:[],resumeAudit:async id=>(await chat.accept(id)).error??''});
  const menu=createMenuPopup(electron,{root,bundle});
  chat=createPrivateChat({profile,view:panel,readGpu:async()=>({utilization:39,freeMiB:4200}),idle:()=>true,now:()=>now,
    random:()=>draw(voiceDraws++===0?'acceptedCount':'acceptedTail'),
    prepare(){prepares++;menu.hide();details.panel?.hide();},resume(){releases++;},
    createModel:()=>realCpu?createLocalModel({utilityProcess:electron.utilityProcess,device:'cpu',
      modelPath:join(root,'desktop/models/Qwen3.5-2B-Q4_K_M.gguf'),
      log:event=>{if(event.duration_ms)console.log(event.stage,event.duration_ms+' ms');}}):({start(){},snapshot:()=>({state:'ready',backend:'cpu',gpuLayers:0}),close(){},
      analyze:async(_text,{skillInstruction})=>skillInstruction.schema.properties.text?{text:'周末去散步'}
        :{reply:'今天我看到一只小狗在雨后散步，它一路踩着积水，最后在树下面甩了甩毛。我一下就想到你了，想问你今天有没有碰到一件让你突然笑出来的小事呀。',done:false}}),
    createVoice:()=>({render(){
      renders++;
      if(crashing)return late.promise;
      return renders===1?first.promise:{wav};
    },close(){}}),
  });
  try{
    chat.plan({id:'round',topics:['雨后的散步','今天好玩的事','周末去哪']});
    const commands=Menu.buildFromTemplate([{label:waitingLabel,fyImage:waitingImage,click(){void chat.accept(chat.waiting?.id);}}]);
    await menu.show(commands,{x:150,y:100});
    await until(async()=>{
      const popup=windows('绯月菜单');
      return popup&&await inspect(popup,"document.querySelector('.menu-face')?.naturalWidth>0");
    },'菜单没有显示 B 头像');
    menu.hide();
    await chat.tick();
    const bubble=windows('绯月 · 专聊');
    await until(()=>inspect(bubble,"document.querySelector('main').dataset.phase==='invite'"),'邀请页没有就绪');
    assert.equal(await inspect(bubble,"document.querySelector('img').complete"),true);
    assert.equal(prepares,0);
    await until(()=>inspect(bubble,'window.testAudio[0]?.ended'),'首次邀请语音没有完整播出');
    await chat.tick();
    assert.deepEqual(await inspect(bubble,'window.testAudio'),[{src:'invite.wav',loop:false,ended:true}]);
    now+=7200000;
    await chat.tick();
    await until(()=>inspect(bubble,'window.testAudio[1]?.ended'),'两小时后未播新的提醒');
    await chat.tick();
    assert.deepEqual(await inspect(bubble,'window.testAudio'),Array.from({length:2},()=>({src:'invite.wav',loop:false,ended:true})));

    await inspect(bubble,"document.querySelector('#dismiss').click()");
    await until(()=>bubble.isDestroyed(),'关闭邀请没有保留待聊');
    await details.open(null,'pending');
    await until(()=>inspect(details.panel,"document.querySelector('.private-chat-invite img')?.naturalWidth>0"),'待处理没有显示 B 头像');
    assert.equal(await inspect(details.panel,"document.querySelector('.private-chat-invite').textContent"),waitingLabel);
    await inspect(details.panel,"document.querySelector('.private-chat-invite').click()");
    await until(()=>renders===1,'首段合成未开始');
    const accepted=windows('绯月 · 专聊');
    assert.equal(await inspect(accepted,"document.querySelector('main').dataset.phase"),'preparing');
    assert.equal(await inspect(accepted,"document.querySelector('#line').textContent"),voices.lines.acceptedCount.text);
    assert.equal(prepares,1);
    first.resolve({wav});
    await until(()=>inspect(accepted,"document.querySelector('main').dataset.phase==='reply'"),'没有自动播完接话和正文',30000);
    const playback=await inspect(accepted,'window.testAudio');
    assert.equal(playback.filter(clip=>clip.src===voices.lines.acceptedCount.file).length,1);
    const spoken=playback.filter(clip=>clip.src==='正文');
    assert.equal(spoken.length,renders);
    assert.ok(spoken.every(clip=>clip.afterPriorAudio),'长接话播完后才播放正文');
    assert.ok(playback.every(clip=>!clip.loop&&clip.ended));
    assert.equal(await inspect(accepted,"document.querySelector('#mic').hidden"),false);
    assert.equal(await inspect(accepted,"document.querySelector('#draft').disabled"),false);
    await inspect(accepted,"document.querySelector('#mic').click()",true);
    await until(()=>inspect(accepted,"document.querySelector('#mic').dataset.recording==='true'"),'专聊麦克风未获得本机音频');
    await delay(900);
    await inspect(accepted,"document.querySelector('#mic').click()");
    await until(()=>inspect(accepted,"document.querySelector('#mic-status').textContent==='已整理听写'"),'专聊录音未交给同场文字模型整理');
    assert.equal(transcriptions,1);
    assert.match(await inspect(accepted,"document.querySelector('#draft').value"),/^周末去散步[。！]?$/);
    await inspect(accepted,"document.querySelector('#dismiss').click()");
    await until(()=>releases===1,'主动结束没有释放状态');
    assert.equal(chat.active,null);
    assert.equal(accepted.isDestroyed(),true);
    console.log('PASS：Electron 菜单及待处理头像、接话页、完整首段自动播放、麦克风采集和校正、主动结束。');

    chat.plan({id:'crash-round',topics:['下午喝茶','明天散步','窗边的花']});
    const waitingId=chat.waiting.id,rendersBeforeCrash=renders;
    crashing=true;
    await menu.show(commands,{x:150,y:100});
    await until(()=>menu.open,'专聊菜单未打开');
    await inspect(windows('绯月菜单'),"for(let i=0;i<2;i++)document.querySelector('.item').click()");
    await until(()=>renders>rendersBeforeCrash,'生语音前未进入异常测试');
    const crashingBubble=windows('绯月 · 专聊');
    assert.equal(await inspect(crashingBubble,"document.querySelector('main').dataset.phase"),'preparing');
    assert.equal(await inspect(crashingBubble,"document.querySelector('#line').textContent"),voices.lines.acceptedTail.text);
    await until(()=>inspect(crashingBubble,'window.testAudio[0]?.ended'),'新的随机接话音频未播完');
    assert.equal(voiceDraws,2,'每场只随机选择一次');
    assert.deepEqual(await inspect(crashingBubble,'window.testAudio'),[{src:voices.lines.acceptedTail.file,loop:false,ended:true}]);
    console.log('PASS：连续两场覆盖两条接话语音，菜单连点只选择并播放一次。');
    crashingBubble.webContents.forcefullyCrashRenderer();
    await until(()=>releases===2,'渲染崩溃没有释放状态');
    late.resolve({wav});
    await delay(150);
    assert.equal(chat.waiting.id,waitingId);
    assert.equal(chat.active,null);
    assert.equal(windows('绯月 · 专聊'),undefined);
    console.log('PASS：渲染崩溃释放专聊，恢复待聊，迟到首段没有重新开窗。');
  }finally{
    await chat.close();dictation.close();details.close();menu.close();win.destroy();
    electron.session.defaultSession.unregisterPreloadScript(preload);
  }
}
test().then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
