import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startDesktop} from '../desktop/shell.mjs';
import {createLocalModel} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..'),out=join(root,'output/knowledge-qa');
mkdirSync(out,{recursive:true});
const profile=mkdtempSync(join(out,'profile-'));
const files={key:join(profile,'exported.key'),sqlite:join(profile,'exported.sqlite')};
const real=process.argv.includes('--real-cpu');
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
class TestTray{on(){} setToolTip(){} destroy(){}}
const dialogs={
  showSaveDialog:async(_window,options)=>({canceled:false,filePath:files[options.filters[0].extensions[0]]}),
  showOpenDialog:async(_window,options)=>({canceled:false,filePaths:[files[options.filters[0].extensions[0]]]}),
};
const rule='以后听到先放一下就保留草稿，除非已定稿且明确确认就走原归档确认。';
const canned={state:'continue',cards:'',group:'',point:'',title:'',answer:'',condition:'',evidence:'',linked:'',mistake:''};
async function until(check,label,ms=12000){
  const end=performance.now()+ms;
  while(performance.now()<end){if(await check())return;await delay(55);}
  throw Error(label);
}
async function test(){
  await electron.app.whenReady();
  const llm=real?createLocalModel({utilityProcess:electron.utilityProcess,device:'cpu',modelPath:join(root,'desktop/models/Qwen3.5-4B-Q4_K_M.gguf')}):null;
  const model={start(){},close:()=>llm?.close(),async memory(payload,instruction,schema,signal,{maxTokens}){
    if(llm){
      await llm.start();
      assert.equal(llm.snapshot().state,'ready');
      const result=await llm.analyze(payload,{hint:'personalityMemory',signal,skillInstruction:{instruction,schema,maxTokens}});
      console.log('隔离知识推理',JSON.stringify(result));
      assert.equal(result.error,undefined);
      return result;
    }
    const input=JSON.parse(payload),candidate=input.知识?.find(row=>row.kind==='negative');
    if(!candidate)return canned;
    return {...canned,state:'apply',cards:candidate.id,answer:input.材料.includes('已定稿')?candidate.exceptions[0].do:candidate.instead};
  }};
  let cloud=0;
  const runtime=await startDesktop({...electron,dialog:dialogs,Tray:TestTray},{
    profile,localModel:model,htmlMenu:true,windowSource:()=>()=>{},
    screenQuestionClient:{forget(){},askStandalone(){cloud++;},askText(){cloud++;}},
  });
  try{
    await until(()=>runtime.win.isVisible(),'桌宠未显示');
    runtime.win.webContents.emit('context-menu');
    const popup=()=>electron.BrowserWindow.getAllWindows().find(win=>win.getTitle()==='绯月菜单');
    await until(()=>popup()?.isVisible(),'右键菜单未显示');
    await popup().webContents.executeJavaScript(`document.querySelector('button[title="阅读与学习"]').click();
      const entry=document.querySelector('button[title="知识库"]');if(!entry.offsetParent)throw Error('知识库入口未展开');entry.click();`);
    await until(()=>runtime.knowledge.panel?.isVisible(),'知识库冷启动首击未显示');
    const panel=runtime.knowledge.panel;
    const js=code=>panel.webContents.executeJavaScript(code);
    const click=label=>js("([...document.querySelectorAll('button')].find(button=>button.textContent.trim()==="+JSON.stringify(label)+")??(()=>{throw Error('按钮缺失')})()).click()");
    const presented=text=>js("document.body.innerText.includes("+JSON.stringify(text)+")&&document.querySelector('main').getAttribute('aria-busy')==='false'");
    const waitText=text=>until(()=>presented(text),'页面未显示 '+text);
    await waitText('暂无条目');
    await click('新建');await waitText('新建 正向条目');
    const form=()=>[...document.querySelectorAll('form label')].map(el=>el.innerText.trim());
    await js("(()=>{const f="+form.toString()+"; const names=f();for(const [name,value] of Object.entries({'标题':'测试月报','定义':'月度报告','条件':'未定稿','做法':'放到草稿区'})){document.querySelectorAll('form label')[names.indexOf(name)].querySelector('input,textarea').value=value;}})()");
    await click('保存');await waitText('已保存。');
    for(const theme of ['light','dark']){
      electron.nativeTheme.themeSource=theme;panel.setSize(360,580);await delay(180);
      const layout=await js("({bars:document.querySelectorAll('header.fy-titlebar').length,width:innerWidth,scroll:document.documentElement.scrollWidth,main:document.querySelector('main').scrollWidth-document.querySelector('main').clientWidth,overlay:navigator.windowControlsOverlay.getTitlebarAreaRect().width,caption:document.querySelector('.fy-caption h1').getBoundingClientRect().right})");
      assert.equal(layout.bars,1);assert(layout.scroll<=layout.width+1&&layout.main<=1,JSON.stringify(layout));assert(layout.caption<layout.overlay);
      writeFileSync(join(out,'knowledge-'+theme+'.png'),(await panel.webContents.capturePage()).toPNG());
    }
    await runtime.screenQuestion.open();
    const bubble=runtime.screenQuestion.panel;
    const ask=text=>bubble.webContents.executeJavaScript('window.screenQuestion.ask('+JSON.stringify(text)+')');
    const bubbleText=text=>bubble.webContents.executeJavaScript("document.body.innerText.includes("+JSON.stringify(text)+")");
    await ask(rule);
    await until(()=>bubbleText('已记住这条长期纠正'),'气泡未取得纠正回执');
    await bubble.webContents.executeJavaScript("document.querySelector('#knowledge-card').click()");
    await waitText('编辑 负向条目');
    await ask('先放一下');
    await until(()=>bubbleText('保留草稿'),'气泡未应用负向规则',real?45000:12000).catch(async error=>{
      error.message+=' · '+await bubble.webContents.executeJavaScript('document.querySelector("#reply").innerText');
      throw error;
    });
    await ask('已定稿且明确确认，这次先放一下');
    await until(()=>bubbleText('归档确认'),'气泡未应用规则例外',real?45000:12000);
    if(real){
      await ask('如果我只说先放一下，我没有告诉你已经定稿，这份资料要怎么处理？');
      await until(()=>bubbleText('保留草稿'),'真实模型未识别自然改述',45000).catch(async error=>{
        error.message+=' · '+await bubble.webContents.executeJavaScript('document.querySelector("#reply").innerText');
        throw error;
      });
    }
    assert.equal(cloud,0);
    await click('备份');
    await waitText('导出密钥');
    await click('检查备份');await waitText('预览恢复');
    assert.equal(await js("[...document.querySelectorAll('button')].filter(button=>button.textContent==='导出密钥').length"),1);
    assert.equal(await js("document.querySelectorAll('.archive-card').length"),1);
    await click('导出密钥');await waitText('密钥已导出');
    assert.equal(readFileSync(files.key).length,32);
    await click('导出备份');await waitText('备份已导出');
    await click('导入密钥');await waitText('已导入密钥');
    await click('选择备份文件');await waitText('恢复预览');
    assert(await presented('确认恢复'));
    await click('返回备份');await waitText('周月备份');
    console.log('PASS：知识库菜单首击、浅深色标题栏、气泡纠正和例外、导入导出与恢复预览。模型：'+(real?'Qwen3.5-4B CPU':'替身'));
  }finally{await llm?.close();}
}
const timeout=setTimeout(()=>{console.error('知识库 Electron 测试超时');electron.app.exit(2);},real?150000:45000);
test().then(()=>{clearTimeout(timeout);electron.app.exit(0);},error=>{console.error(error);electron.app.exit(1);});
