import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startDesktop} from '../desktop/shell.mjs';
import {createLocalModel} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'feiyue-study-window-'));
const out=join(root,'output/menu-qa');
const real=process.argv.includes('--real-cpu');
const japaneseSample=process.argv.find(arg=>arg.startsWith('--ja-sample='))?.slice('--ja-sample='.length);
if(japaneseSample){
  electron.app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  electron.app.commandLine.appendSwitch('use-file-for-fake-audio-capture',japaneseSample+'%noloop');
}
electron.app.setPath('userData',profile);
class TestTray{on(){} setToolTip(){} destroy(){}}
const q={id:'primary',bank_id:'bank',title:'颜色配对',type:'matching',status:'active',stem:'为两个对象选择颜色。',
  tag_ids:['color'],options:[{id:'red',text:'红色'},{id:'blue',text:'蓝色'}],pairs:[{id:'p1',text:'对象一'},{id:'p2',text:'对象二'}],
  answer_pairs:[{pair_id:'p1',option_id:'red'},{pair_id:'p2',option_id:'blue'}],explanation:'样例解析只在交卷后显示'};
const script={id:'restaurant',revision:1,scene:{title:'餐厅试练',roleA:'店員',roleB:'お客さん',goal:'询问菜单并点餐'},
  plan:{background:'餐厅内客人与服务员对话'},turns:[{step:1,a:{ja:'いらっしゃいませ。ご注文はお決まりですか。'},b:{ja:'メニューを見せてください。'}},
    {step:2,a:{ja:'こちらがメニューです。'},b:{ja:'ラーメンをお願いします。'}}]};
const paths=[join(profile,'exam.json'),join(profile,'script.json')];
writeFileSync(paths[0],JSON.stringify({format_version:'1.0',bank_id:'bank',source_key:'test',questions:[q]}));
writeFileSync(paths[1],JSON.stringify(script));
const dialog={showOpenDialog:async()=>({canceled:false,filePaths:[paths.shift()]})};
async function until(fn,label,ms=12000){
  const deadline=performance.now()+ms;
  while(performance.now()<deadline){if(await fn())return;await delay(60);}
  throw Error(label);
}

async function test(){
  await electron.app.whenReady();
  const fallback={start(){},close(){},async work(_input,request){
    const {finish}=JSON.parse(_input);
    assert(request.signal);
    return finish?{done:true,next:'またお越しください。',summary:'完成菜单沟通。',feedback:''}:
      {done:false,next:'はい、こちらがメニューです。',summary:'',feedback:'用「ください」表达得体。'};
  }};
  const llm=real?createLocalModel({utilityProcess:electron.utilityProcess,device:'cpu',modelPath:join(root,'desktop/models/Qwen3.5-2B-Q4_K_M.gguf')}):null;
  const localModel=llm?{start(){},close:()=>llm.close(),async work(text,{instruction,schema,signal,maxTokens}){
    await llm.start();assert.equal(llm.snapshot().state,'ready');
    const result=await llm.analyze(text,{hint:'personalityMemory',signal,skillInstruction:{instruction,schema,maxTokens}});
    assert.equal(result.error,undefined);
    return result;
  }}:fallback;
  const shell=await startDesktop({...electron,dialog,Tray:TestTray},{profile,benchmark:true,localModel,htmlMenu:true,windowSource:()=>()=>{}});
  try{
    await until(()=>shell.win.isVisible(),'桌宠未显示');
    shell.win.webContents.emit('context-menu');
    const popup=()=>electron.BrowserWindow.getAllWindows().find(w=>w.getTitle()==='绯月菜单');
    await until(()=>popup()?.isVisible()&&popup().webContents.executeJavaScript("[...document.querySelectorAll('#items > .item')].some(e=>e.innerText.includes('陪我学习'))").catch(()=>false),'自绘菜单未渲染学习入口');
    await popup().webContents.executeJavaScript("[...document.querySelectorAll('#items > .item')].find(e=>e.innerText.includes('陪我学习')).click()");
    await until(()=>shell.study.panel?.isVisible(),'首击学习面板未显示');
    let panel=shell.study.panel;
    const js=script=>panel.webContents.executeJavaScript(script).catch(error=>{throw Error('隔离学习脚本 '+script.slice(0,180)+': '+error.message);});
    const click=label=>js(`([...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})??(()=>{throw Error('按钮不存在')})()).click()`);
    const text=expected=>js(`document.body.innerText.includes(${JSON.stringify(expected)}) && document.querySelector('main').getAttribute('aria-busy')==='false'`);
    const ready=(label,ms)=>until(()=>text(label),`没有出现 ${label}：`+label,ms);
    await ready('暂无本机材料');
    await click('题库练习');await ready('继续正式场次');
    await click('导入 JSON');await ready('已缓存 1 份材料');
    await click('bank');await ready('本地模考 · 60 分钟');
    await click('本地模考 · 60 分钟');await ready('颜色配对');
    assert.equal(await text('样例解析只在交卷后显示'),false);
    const getSelected="[...document.querySelectorAll('.study-option select')].find(s=>s.getAttribute('aria-label')==='对象一').value";
    await js(`(()=>{const s=[...document.querySelectorAll('.study-option select')].find(s=>s.getAttribute('aria-label')==='对象一');s.value='red';s.dispatchEvent(new Event('change'))})()`);
    await js(`(()=>{const s=[...document.querySelectorAll('.study-option select')].find(s=>s.getAttribute('aria-label')==='对象二');s.value='blue';s.dispatchEvent(new Event('change'))})()`);
    await click('暂停');await ready('已暂停');
    panel.close();await until(()=>!shell.study.panel,'旧学习窗口未关闭');
    await shell.study.open();panel=shell.study.panel;
    await ready('继续上次');await js("[...document.querySelectorAll('button')].find(e=>e.innerText.includes('bank · 本地模考')).click()");
    await ready('已暂停');assert.equal(await js(getSelected),'red');
    await click('恢复计时');await ready('颜色配对');
    await js('window.confirm=()=>true;void 0');await click('交卷');await ready('样例解析只在交卷后显示');
    assert(await text('1 / 1 答对'));
    mkdirSync(out,{recursive:true});
    for(const theme of ['light','dark']){
      electron.nativeTheme.themeSource=theme;panel.setSize(360,590);await delay(250);
      const layout=await js(`({heads:document.querySelectorAll('header.fy-titlebar').length,
        scroll:document.querySelector('main').scrollWidth, width:document.querySelector('main').clientWidth,
        button:document.querySelector('#home').getBoundingClientRect().right, region:navigator.windowControlsOverlay.getTitlebarAreaRect().width})`);
      assert.equal(layout.heads,1);assert(layout.scroll<=layout.width+1);assert(layout.button<=layout.region);
      writeFileSync(join(out,`study-${theme}.png`),(await panel.webContents.capturePage()).toPNG());
    }
    await js("document.querySelector('#home').click()");await ready('语言对练');
    await click('语言对练');await ready('暂无本机材料');
    await click('导入 JSON');await ready('餐厅试练');
    await click('餐厅试练');await ready('自由对练');await click('自由对练');await ready('ご注文はお決まりですか');
    await js("const field=document.querySelector('textarea');field.focus();field.value='メニューを見せてください。';field.dispatchEvent(new Event('input'));");
    panel.close();await until(()=>!shell.study.panel,'输入框聚焦时关窗失败');
    await shell.study.open();panel=shell.study.panel;
    await ready('继续上次');await js("[...document.querySelectorAll('button')].find(e=>e.innerText.includes('餐厅试练 · 自由对练')).click()");
    await ready('ご注文はお決まりですか');
    assert.equal(await js("document.querySelector('textarea').value"),'メニューを見せてください。');
    await js("[...document.querySelectorAll('label')].find(x=>x.textContent.includes('没把握')).querySelector('input').click()");
    await ready('没把握');
    await click('回复 A');await ready('B · メニューを見せてください。',real?65000:12000);
    assert.equal(await text('用「ください」表达得体'),false);
    await click('结束并总结');await ready('验证这个表达',real?65000:12000);
    assert(await text('没把握 · 待验证'));
    assert(await text('メニューを見せてください。'));
    await click('验证这个表达');await ready('开始验证');
    assert.equal(await js("document.querySelector('[aria-label=选择能验证原句的小题]').options.length"),1);
    await click('开始验证');await ready('表达强化');
    await js("document.querySelector('textarea').value='メニューを見せてください。'");
    await click('提交 B 的回答');await ready('再试一次');
    await js("[...document.querySelectorAll('label')].find(x=>x.textContent.includes('没把握')).querySelector('input').click()");
    await ready('再试一次');await click('结束并复盘');await ready('返回来源作答');
    await click('返回来源作答');await ready('验证这个表达');
    if(japaneseSample){
      await js("document.querySelector('#home').click()");await ready('餐厅试练');
      await click('餐厅试练');await ready('自由对练');await click('自由对练');await ready('ご注文はお決まりですか');
      const record=()=>panel.webContents.executeJavaScript("document.querySelector('.fy-dictation-button')?.click()",true);
      await until(()=>js("!!document.querySelector('.fy-dictation-button:not([hidden]):not(:disabled)')"),'日语录入未就绪');
      await record();await until(()=>js("document.querySelector('.fy-dictation-button')?.dataset.recording==='true'"),'模拟麦克风未打开')
        .catch(async error=>{throw Error(`${error.message} · ${await js("document.querySelector('.fy-dictation-note')?.textContent")}`);});
      await delay(7900);await record();
      await until(()=>js("(()=>{const field=document.querySelector('textarea');return !field.readOnly && /[\\p{Script=Hiragana}\\p{Script=Katakana}]/u.test(field.value)})()"),'没有返回可编辑的日语听写',85000);
      assert.match(await js("document.querySelector('.study-prompt').textContent"),/ご注文はお決まりですか/u,'听写回填后仍需提交确认');
      console.log('PASS：模拟麦克风经本机 SenseVoice 日语识别，原文回填给用户核对。');
    }
    await js("document.querySelector('#home').click()");await ready('基础剧本');
    await click('基础剧本');await ready('已载入 30 套基础剧本');
    await click('下一页');await ready('上一页');
    await js("document.querySelector('#home').click()");
    await click('语言对练');
    await click('基础剧本');await ready('已载入 30 套基础剧本');
    console.log('PASS：隔离正式基线加载 30 套初始化剧本。');
    console.log('PASS：菜单首击、浅深色窄窗、考试续练、草稿恢复、逐句信心、从验证回到原答及基础剧本翻页。模型='+ (real?'本机 Qwen3.5-2B CPU':'替身'));
  }finally{await llm?.close();}
}
const timeout=setTimeout(()=>{console.error('学习面板测试超时');electron.app.exit(2);},japaneseSample?190000:real?175000:55000);
test().then(()=>{clearTimeout(timeout);electron.app.exit(0);},error=>{console.error(error);electron.app.exit(1);});
