// 抽卡窗口隔离检查：真实 Electron 窗口与系统加密；接口用假实现，图片与资料只写临时目录。
// 运行：node desktop/node_modules/electron/cli.js tools/run-electron-check.mjs tools/test-card-draw-electron.mjs
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {attachCardDraw} from '../desktop/card-draw-host.mjs';

const root=resolve(import.meta.dirname,'..'),bundle=join(root,'output/desktop-bundle');
const profile=mkdtempSync(join(tmpdir(),'feiyue-card-')),pictures=join(profile,'pictures'),out=join(root,'output/card-draw-qa');
electron.app.setPath('userData',profile);
electron.app.on('window-all-closed',()=>{});
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const png=(width,height,seed)=>{
  const pixels=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    pixels[i]=(seed*53+y/4)%256;pixels[i+1]=(seed*29+x/4)%256;pixels[i+2]=(seed*91)%256;pixels[i+3]=255;
  }
  return electron.nativeImage.createFromBitmap(pixels,{width,height}).toPNG();
};

async function test(){
  await electron.app.whenReady();
  mkdirSync(out,{recursive:true});
  // 真实显示在屏幕外且不抢焦点，动画和重绘照常推进。
  class OffscreenWindow extends electron.BrowserWindow{
    constructor(options){super({...options,show:false,x:-3000,y:100});}
    show(){this.showInactive();} focus(){}
  }
  let offset=0,serial=0,reply=null;
  const calls=[],notices=[],errors=[];
  const host=attachCardDraw({...electron,BrowserWindow:OffscreenWindow},{root,bundle,profile,pictureRoot:pictures,enabled:false,
    onNotice:text=>notices.push(text),
    overrides:{now:()=>Date.now()+offset,trash:async file=>rmSync(file),
      fetcher:async(url,options)=>{
        calls.push({url,body:JSON.parse(options.body)});
        if(reply)return reply();
        return Response.json({data:[{b64_json:png(256,256,++serial).toString('base64')}],
          usage:{input_tokens:1000,input_tokens_details:{text_tokens:100,image_tokens:900},output_tokens:200}});
      }}});
  const round=async()=>{offset+=61_000;await host.core.tick();await host.core.idle;await wait(250);};
  let contents;
  async function open(){
    await host.open();
    contents=host.panel.webContents;
    contents.on('console-message',event=>{if(event.level==='error'||/Content Security Policy/.test(event.message))errors.push(event.message);});
    await wait(500);
  }
  const js=code=>contents.executeJavaScript(code,true);
  const until=async(code,label)=>{
    for(let i=0;i<100;i++){if(await js(code))return;await wait(100);}
    assert.fail(label+'：'+await js('document.body.innerText.slice(0,600)'));
  };
  const shot=async name=>{await wait(900);writeFileSync(join(out,name+'.png'),(await contents.capturePage()).toPNG());};
  const fits=async label=>assert.deepEqual(await js('[document.documentElement.scrollWidth<=innerWidth,main.scrollWidth<=main.clientWidth]'),[true,true],label+' 无横向滚动');

  electron.nativeTheme.themeSource='light';
  await open();
  await until(`document.querySelector('#stateText').textContent==='已停止'`,'初始状态');
  assert.match(await js(`document.querySelector('#keyChip').textContent`),/未填密钥/);

  // 真实文件选择：大图缩到长边 1024
  const big=join(profile,'big.png'),bad=join(profile,'bad.png');
  writeFileSync(big,png(2400,1200,3));writeFileSync(bad,'not an image');
  contents.debugger.attach();
  const choose=async(slot,file)=>{
    const {root:node}=await contents.debugger.sendCommand('DOM.getDocument');
    const {nodeId}=await contents.debugger.sendCommand('DOM.querySelector',{nodeId:node.nodeId,selector:`[data-slot=${slot}] input[type=file]`});
    await contents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[file]});
  };
  await choose('who',big);
  await until(`!document.querySelector('[data-slot=who] img').hidden`,'选择图片后显示');
  const saved=electron.nativeImage.createFromPath(join(profile,'card-draw/refs/who.png')).getSize();
  assert.deepEqual([saved.width,saved.height],[1024,512]);
  await choose('who',bad);
  await until(`document.querySelector('[data-slot=who] em').textContent.includes('读不了')`,'坏图提示');
  assert.ok(!await js(`document.querySelector('[data-slot=who] img').hidden`),'坏图保留原图');
  // 拖放与粘贴
  const transfer=`(async()=>{const c=document.createElement('canvas');c.width=300;c.height=500;c.getContext('2d').fillRect(0,0,150,250);
    const blob=await new Promise(r=>c.toBlob(r,'image/webp'));const d=new DataTransfer();d.items.add(new File([blob],'a.webp',{type:'image/webp'}));return d;})()`;
  await js(`(async()=>{const d=await ${transfer};document.querySelector('[data-slot=wear]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:d}));})()`);
  await until(`!document.querySelector('[data-slot=wear] img').hidden`,'拖放图片');
  await js(`(async()=>{const d=await ${transfer};document.activeElement.blur();dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));})()`);
  await until(`!document.querySelector('[data-slot=act] img').hidden`,'粘贴到空槽');
  await js(`document.querySelector('[data-slot=act] .clear').click()`);
  await until(`document.querySelector('[data-slot=act] img').hidden`,'移除图片');
  assert.ok(!existsSync(join(profile,'card-draw/refs/act.png')));
  // 没有扩展名的图片文件，系统给不出类型，仍按内容读取
  const bare=join(profile,'reference-without-extension');writeFileSync(bare,png(80,60,7));
  await choose('act',bare);
  assert.equal(await js(`document.querySelector('[data-slot=act] input').value`),'');
  await until(`!document.querySelector('[data-slot=act] img').hidden`,'无类型图片（选择）');
  await js(`document.querySelector('[data-slot=act] .clear').click()`);
  await until(`document.querySelector('[data-slot=act] img').hidden`,'再次移除');
  await js(`(async()=>{const d=await ${transfer};const blob=d.files[0];const n=new DataTransfer();n.items.add(new File([blob],'noext'));
    document.activeElement.blur();dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:n}));})()`);
  await until(`!document.querySelector('[data-slot=act] img').hidden`,'无类型图片（粘贴）');
  await js(`document.querySelector('[data-slot=act] .clear').click()`);
  await until(`document.querySelector('[data-slot=act] img').hidden`,'最后移除');
  // 提示词框里粘贴“文字 + 无类型附件”按文字处理，不拦截、不放进图片槽
  const mixed=await js(`(async()=>{const d=new DataTransfer();d.items.add(new File(['junk'],'noext'));d.setData('text/plain','一段文字');
    const box=document.querySelector('#prompt');box.focus();const e=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d});
    box.dispatchEvent(e);await new Promise(r=>setTimeout(r,600));
    const slot=document.querySelector('[data-slot=act]');return [e.defaultPrevented,slot.querySelector('img').hidden,slot.querySelector('em').textContent.includes('读不了')];})()`);
  assert.deepEqual(mixed,[false,true,false],'提示词框粘贴文字不被拦下');
  // 提示词框里只粘贴图片，仍放进空槽
  await js(`(async()=>{const d=await ${transfer};const box=document.querySelector('#prompt');box.focus();
    box.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));})()`);
  await until(`!document.querySelector('[data-slot=act] img').hidden`,'提示词框里粘贴图片');
  await js(`document.querySelector('[data-slot=act] .clear').click()`);
  await until(`document.querySelector('[data-slot=act] img').hidden`,'移除后');
  // 一次粘贴多个文件时优先取图片类型
  await js(`(async()=>{const d=await ${transfer};const n=new DataTransfer();n.items.add(new File(['junk'],'noext'));n.items.add(d.files[0]);
    document.activeElement.blur();dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:n}));})()`);
  await until(`!document.querySelector('[data-slot=act] img').hidden`,'多文件取图片');
  await js(`document.querySelector('[data-slot=act] .clear').click()`);
  await until(`document.querySelector('[data-slot=act] img').hidden`,'多文件移除');
  // 提示词记忆
  await js(`document.querySelector('#prompt').focus()`);await contents.insertText('雨夜屋顶上的猫');
  await until(`document.querySelector('#saved').classList.contains('on')`,'已记住');
  assert.equal(host.core.action('state').prompt,'雨夜屋顶上的猫');
  assert.match(await js(`document.querySelector('[data-slot=act] em').textContent`),/模型发挥/);
  await shot('setup-light');

  // 开关与密钥：真实回车提交
  await js(`document.querySelector('#power').click()`);
  await until(`document.querySelector('#keyBox').open`,'要求填写密钥');
  await js(`document.querySelector('#keyInput').focus()`);await contents.insertText('sk-isolated-check-123');
  contents.sendInputEvent({type:'keyDown',keyCode:'Enter'});contents.sendInputEvent({type:'char',keyCode:'\r'});contents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await until(`document.querySelector('#keyChip').textContent.includes('待首次验证')`,'回车使用密钥');
  const keyFile=join(profile,'card-draw/key.bin');
  assert.ok(!existsSync(keyFile),'成功前不落盘');
  await round();
  assert.equal(calls[0].url,'https://api.openai.com/v1/images/edits');assert.equal(calls[0].body.images.length,2);
  await until(`document.querySelector('#keyChip').textContent.includes('已保存')`,'首次成功后保存');
  if(electron.safeStorage.isEncryptionAvailable()){
    assert.ok(!readFileSync(keyFile).includes('sk-isolated'),'密钥文件不是明文');
    assert.equal(electron.safeStorage.decryptString(readFileSync(keyFile)),'sk-isolated-check-123');
  }
  assert.ok(!await js(`document.documentElement.innerHTML.includes('sk-isolated')`),'页面不留密钥');

  // 关窗后继续抽
  host.panel.close();await wait(300);assert.equal(host.panel,null);
  for(let i=0;i<22;i++){offset+=61_000;await host.core.tick();await host.core.idle;}
  assert.equal(readdirSync(join(pictures,'抽卡')).length,23);
  await open();
  assert.equal(await js(`document.querySelector('#prompt').value`),'雨夜屋顶上的猫','重开恢复提示词');
  await until(`!document.querySelector('[data-slot=who] img').hidden`,'重开恢复参考图');

  await js(`document.querySelector('[data-tab=cards]').click()`);
  await until(`document.querySelectorAll('#cards .card').length===20`,'每页 20 张');
  await until(`[...document.querySelectorAll('#cards img')].slice(0,4).every(i=>i.naturalWidth===256)`,'本地图片可显示');
  assert.equal(await js(`document.querySelector('#cardsPager span').textContent`),'1 / 2');
  const firstName=await js(`document.querySelector('#cards .card').dataset.name`);
  await round();
  await until(`!document.querySelector('#fresh').hidden`,'新卡提示');
  assert.equal(await js(`document.querySelector('#cards .card').dataset.name`),firstName,'新卡不插入当前页');

  // 勾选、撤回、倒计时、高清
  const box=i=>`document.querySelectorAll('#cards .pick input')[${i}]`;
  await js(`${box(0)}.click()`);
  await until(`document.querySelector('#cards .card .count')`,'撤回倒计时');
  await js(`${box(0)}.click()`);
  await until(`!document.querySelector('#cards .card .badge')`,'撤回');
  await js(`${box(1)}.click()`);
  await until(`document.querySelectorAll('#cards .card')[1].querySelector('.count')`,'再次勾选');
  await shot('cards-light');
  await wait(5200);
  await until(`document.querySelectorAll('#cards .card')[1].querySelector('.badge')?.textContent.includes('排队')`,'撤回期结束转排队');
  await round();
  await until(`document.querySelectorAll('#cards .card')[1].querySelector('.badge')?.textContent.includes('已高清')`,'高清完成');
  assert.equal(calls.at(-1).body.size,'2048x2048');assert.ok(notices.includes('高清完成'));
  // 大图里勾选
  await js(`document.querySelectorAll('#cards .card img')[2].click()`);
  await until(`document.querySelector('#viewer').open&&!document.querySelector('#viewPick').hidden`,'大图');
  await js(`document.querySelector('#viewPick').click()`);
  await until(`document.querySelector('#viewPick').textContent.includes('已勾选')&&${box(2)}.checked`,'大图勾选同步');
  await js(`document.querySelector('#viewPick').click()`);
  await until(`!${box(2)}.checked`,'大图取消');
  await js(`document.querySelector('#viewer').close()`);
  await js(`document.querySelector('[data-tab=hd]').click()`);
  await until(`document.querySelectorAll('#hd .card img').length===1`,'高清页');

  // 暂停与继续
  reply=()=>Response.json({error:{type:'insufficient_quota',code:'credit_balance_exhausted'}},{status:429});
  await round();
  await until(`!document.querySelector('#banner').hidden&&document.querySelector('#bannerText').textContent.includes('额度不足')`,'暂停条');
  electron.nativeTheme.themeSource='dark';host.panel.setContentSize(360,700);await wait(400);
  await fits('360 高清页');await shot('hd-dark-360');
  await js(`document.querySelector('[data-tab=setup]').click()`);await fits('360 配置页');await shot('setup-dark-360');
  reply=null;await js(`document.querySelector('#resume').click()`);
  await until(`document.querySelector('#banner').hidden&&document.querySelector('#power').getAttribute('aria-checked')==='true'`,'继续');
  await js(`document.querySelector('[data-tab=cards]').click()`);
  await until(`document.querySelectorAll('#cards .card').length===20`,'返回挑卡');
  await fits('360 挑卡页');await shot('cards-dark-360');

  // 清理：只留勾选的
  const total=readdirSync(join(pictures,'抽卡')).length;
  await js(`document.querySelector('#clean').click()`);
  await until(`document.querySelector('#confirmBox').open`,'清理确认');
  assert.equal(await js(`Number(document.querySelector('#confirmNum').textContent)`),total-1);
  await shot('confirm-dark-360');
  await js(`document.querySelector('#confirmBox button[value=ok]').click()`);
  await until(`document.querySelectorAll('#cards .card').length===1`,'清理后只剩勾选');
  assert.equal(readdirSync(join(pictures,'抽卡')).length,1);assert.equal(readdirSync(join(pictures,'高清')).length,1);
  host.panel.setContentSize(760,800);electron.nativeTheme.themeSource='dark';
  await js(`document.querySelector('[data-tab=setup]').click()`);await fits('760 配置页');await shot('setup-dark');
  // 刚输入就关窗，文字仍要记住
  await js(`prompt_=document.querySelector('#prompt');prompt_.value='';prompt_.focus()`);
  await contents.insertText('关窗前最后一句');
  host.panel.close();await wait(500);
  assert.equal(host.core.action('state').prompt,'关窗前最后一句','关窗保存提示词');
  assert.deepEqual(errors,[],'页面无错误与 CSP 拦截');
  host.close();
  // 真实定时器：重新挂载后沿用开关与密钥，不手动调用也按时出图
  let jump=0;
  const before=calls.length;
  const live=attachCardDraw({...electron,BrowserWindow:OffscreenWindow},{root,bundle,profile,pictureRoot:pictures,
    overrides:{now:()=>Date.now()+jump,fetcher:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return Response.json({data:[{b64_json:png(64,64,++serial).toString('base64')}]});
    }}});
  if(electron.safeStorage.isEncryptionAvailable())assert.equal(live.core.action('state').key,'saved','重启后无需再填密钥');
  else live.core.action('setKey','sk-isolated-check-123');
  assert.equal(live.core.action('state').on,true,'重启后开关保持');
  await wait(1500);assert.equal(calls.length,before,'启动后先等一轮');
  jump=61_000;await wait(2500);
  assert.equal(calls.length,before+1,'定时器到点自动抽一张');
  live.close();
  console.log('PASS：抽卡窗口隔离检查，截图在 '+out);
}
try{
  await test();
  try{rmSync(profile,{recursive:true,force:true});}
  catch{console.log('临时资料目录仍被 Electron 占用，留在系统临时目录：'+profile);}
  electron.app.exit(0);
}catch(error){console.error(error);console.error('临时目录：'+profile);electron.app.exit(1);}
