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
const paths=[join(profile,'exam.json'),join(profile,'script.json'),join(profile,'long.json')];
writeFileSync(paths[0],JSON.stringify({format_version:'1.0',bank_id:'bank',source_key:'test',questions:[q]}));
writeFileSync(paths[1],JSON.stringify(script));
writeFileSync(paths[2],JSON.stringify({format_version:'1.0',bank_id:'long',questions:
  Array.from({length:21},(_,i)=>({...q,id:'question-'+i,bank_id:'long'}))}));
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
  const opened=[];
  const system={openExternal:async url=>{opened.push(url);},openPath:electron.shell.openPath};
  const shell=await startDesktop({...electron,shell:system,dialog,Tray:TestTray},{profile,benchmark:true,localModel,htmlMenu:true,windowSource:()=>()=>{}});
  try{
    await until(()=>shell.win.isVisible(),'桌宠未显示');
    shell.win.webContents.emit('context-menu');
    const popup=()=>electron.BrowserWindow.getAllWindows().find(w=>w.getTitle()==='绯月菜单');
    await until(()=>popup()?.isVisible(),'自绘菜单未显示');
    await popup().webContents.executeJavaScript(`document.querySelector('button[title="阅读与学习"]').click();
      const entry=document.querySelector('button[title="陪我学习"]');if(!entry.offsetParent)throw Error('陪我学习入口未展开');entry.click();`);
    await until(()=>shell.study.panel?.isVisible(),'首击学习面板未显示');
    let panel=shell.study.panel;
    const js=script=>panel.webContents.executeJavaScript(script);
    const click=label=>js(`([...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})??(()=>{throw Error('按钮不存在')})()).click()`);
    const text=expected=>js(`document.body.innerText.includes(${JSON.stringify(expected)}) && document.querySelector('main').getAttribute('aria-busy')==='false'`);
    const ready=(label,ms)=>until(()=>text(label),`没有出现 ${label}：`+label,ms);
    await ready('暂无本机材料');
    assert(panel.isMaximized(),'学习窗口未默认铺满屏幕');
    const back=()=>js("document.querySelector('.study-back').click()");
    const backText=()=>js("document.querySelector('.study-back')?.textContent??''");
    const pressed=()=>js("document.querySelector('#study-nav [aria-pressed=true]').textContent");
    const shot=async name=>{mkdirSync(out,{recursive:true});await delay(900);
      writeFileSync(join(out,`study-wide-${name}.png`),(await panel.webContents.capturePage()).toPNG());};
    assert.equal(await backText(),'');
    await click('题库练习');await ready('继续正式场次');
    await click('导入 JSON');await ready('已缓存 1 份材料');
    await shot('bank-home');
    await click('bank');await ready('本地模考 · 60 分钟');
    // 材料页返回主页，场次页返回材料页。
    assert.equal(await backText(),'返回');await shot('material');
    await back();await ready('继续正式场次');assert.equal(await backText(),'');
    await click('bank');await ready('本地模考 · 60 分钟');
    await click('本地模考 · 60 分钟');await ready('颜色配对');
    assert.equal(await pressed(),'题库练习');
    assert.equal(await text('样例解析只在交卷后显示'),false);
    const getSelected="[...document.querySelectorAll('.study-option select')].find(s=>s.getAttribute('aria-label')==='对象一').value";
    await js(`(()=>{const s=[...document.querySelectorAll('.study-option select')].find(s=>s.getAttribute('aria-label')==='对象一');s.value='red';s.dispatchEvent(new Event('change'))})()`);
    await js(`(()=>{const s=[...document.querySelectorAll('.study-option select')].find(s=>s.getAttribute('aria-label')==='对象二');s.value='blue';s.dispatchEvent(new Event('change'))})()`);
    await click('暂停');await ready('已暂停');
    // 暂停时写笔记后直接关窗，笔记不能丢。
    await js("const memo=document.querySelector('.study-memo');memo.focus();memo.value='先排除蓝色';memo.dispatchEvent(new Event('input'));");
    panel.close();await until(()=>!shell.study.panel,'旧学习窗口未关闭');
    await shell.study.open();panel=shell.study.panel;
    await ready('继续上次');
    const resume="[...document.querySelectorAll('.study-tile')].find(e=>e.dataset.meta?.startsWith('本地模考')).click()";
    await js(resume);await ready('已暂停');
    // 从语言主页续考，返回时回到所属的题库练习主页。
    await back();await ready('继续正式场次');assert.equal(await pressed(),'题库练习');
    await js(resume);await ready('已暂停');assert.equal(await js(getSelected),'red');
    assert.equal(await js("document.querySelector('.study-memo').value"),'先排除蓝色');
    await js("document.querySelector('.study-link').click()");
    await until(()=>opened.length===1,'知识库链接未打开');
    assert.equal(opened[0],'https://myapp.cj2cf99.workers.dev/knowledge/');
    await shot('exam');
    await click('恢复计时');await ready('颜色配对');
    await js('window.confirm=()=>true;void 0');await click('交卷');await ready('样例解析只在交卷后显示');
    assert(await text('1 / 1 答对'));await ready('交卷笔记');assert(await text('先排除蓝色'));
    const write=value=>js(`(()=>{const field=document.querySelector('.study-thread textarea');field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('input'))})()`);
    await click('✍️ 添加考后复盘');await write('下次看清配对方向');await click('保存');await ready('考后复盘 · 1');
    await click('编辑');await write('改过的复盘');await click('保存');await ready('改过的复盘');
    await shot('review');
    // 未连接学习服务时评论给出原因，入口保留可重试。
    await click('💬 题目评论');await ready('学习服务尚未连接');await ready('💬 题目评论');
    await js('window.confirm=()=>true;void 0');await click('删除');await ready('✍️ 添加考后复盘');
    assert.equal(await text('改过的复盘'),false);
    await click('复盘记录');await ready('本机复盘');await shot('history');
    await js("document.querySelector('.study-tile').click()");await ready('1 / 1 答对');
    assert.equal(await pressed(),'复盘记录');
    await back();await ready('本机复盘');
    await js("document.querySelector('.study-tile').click()");await ready('1 / 1 答对');
    mkdirSync(out,{recursive:true});
    for(const theme of ['light','dark']){
      electron.nativeTheme.themeSource=theme;panel.unmaximize();panel.setSize(360,590);await delay(900);
      const layout=await js(`({heads:document.querySelectorAll('header.fy-titlebar').length,
        scroll:document.querySelector('main').scrollWidth, width:document.querySelector('main').clientWidth,
        button:document.querySelector('#home').getBoundingClientRect().right,
        nav:document.querySelector('#study-nav').getBoundingClientRect().height, region:navigator.windowControlsOverlay.getTitlebarAreaRect().width})`);
      assert.equal(layout.heads,1);assert(layout.scroll<=layout.width+1);assert(layout.button<=layout.region);
      assert(layout.nav<60,'窄窗导航换行');
      writeFileSync(join(out,`study-${theme}.png`),(await panel.webContents.capturePage()).toPNG());
    }
    electron.nativeTheme.themeSource='light';panel.maximize();await delay(300);
    // 标题栏主页按钮回到当前场次所属功能的主页。
    await js("document.querySelector('#home').click()");await ready('继续正式场次');
    await click('语言对练');await ready('暂无本机材料');await shot('language-empty');
    await click('✨ 生成对话');await ready('对话步数');assert.equal(await backText(),'返回');await shot('generate');
    await back();await ready('场景与剧本');
    await click('导入 JSON');await ready('餐厅试练');await shot('language-home');
    panel.unmaximize();panel.setSize(360,590);
    await click('餐厅试练');await ready('自由对练');await shot('language-material');
    await click('自由对练');await ready('ご注文はお決まりですか');
    assert.equal(await backText(),'结束并返回');await shot('talk');
    // 返回即结束语言场次：回到材料页，未作答的场次不进复盘。
    await back();await ready('抽取薄弱句');
    await click('复盘记录');await ready('本机复盘');
    assert.equal(await js("[...document.querySelectorAll('.study-tile')].some(e=>e.innerText.includes('餐厅试练'))"),false);
    await click('语言对练');await ready('场景与剧本');
    await click('餐厅试练');await ready('自由对练');await click('自由对练');await ready('ご注文はお決まりですか');
    await js("const field=document.querySelector('textarea');field.focus();field.value='メニューを見せてください。';field.dispatchEvent(new Event('input'));");
    panel.close();await until(()=>!shell.study.panel,'输入框聚焦时关窗失败');
    await shell.study.open();panel=shell.study.panel;
    // 语言对练不续练：未提交就关窗的场次丢弃，重新开始。
    await ready('场景与剧本');
    assert.equal(await text('餐厅试练 · 自由对练'),false);
    await click('餐厅试练');await ready('自由对练');await click('自由对练');await ready('ご注文はお決まりですか');
    assert.equal(await js("document.querySelector('textarea').value"),'');
    await js("const field=document.querySelector('textarea');field.value='メニューを見せてください。';field.dispatchEvent(new Event('input'));");
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
    await click('返回来源作答');await ready('验证这个表达');await shot('talk-review');
    await back();await ready('抽取薄弱句');
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
    await click('题库练习');await ready('继续正式场次');
    await click('导入 JSON');await ready('已缓存 1 份材料');
    await click('long');await ready('本地模考 · 60 分钟');
    await click('本地模考 · 60 分钟');await ready('颜色配对');
    await js('window.confirm=()=>true;void 0');await click('交卷');await ready('0 / 21 答对');
    assert.equal(await js("document.querySelectorAll('[id^=study-review-]').length"),20);
    await click('下一页');await ready('上一页');
    assert.equal(await js("document.querySelectorAll('[id^=study-review-]').length"),1);
    assert(await js("!!document.getElementById('study-review-20')"));
    await click('再练原题');await ready('提交并查看解析');
    await click('结束并复盘');await ready('返回来源作答');
    await click('返回来源作答');await ready('0 / 21 答对');
    assert(await js("!!document.getElementById('study-review-20')"));
    await back();await ready('本地模考 · 60 分钟');
    await back();await ready('继续正式场次');
    console.log('PASS：默认铺满、逐级返回与功能归属、菜单首击、浅深色窄窗、考试续练、语言场次不续练、逐句信心、从验证回到原答及基础剧本翻页。模型='+ (real?'本机 Qwen3.5-2B CPU':'替身'));
  }finally{await llm?.close();}
}
const timeout=setTimeout(()=>{console.error('学习面板测试超时');electron.app.exit(2);},japaneseSample?220000:real?200000:90000);
test().then(()=>{clearTimeout(timeout);electron.app.exit(0);},error=>{console.error(error);electron.app.exit(1);});
