import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createMessageBoxes} from '../desktop/message-box.mjs';

const root=resolve(import.meta.dirname,'..'),out=join(root,'output/message-box-qa');
mkdirSync(out,{recursive:true});
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-message-box-')));
async function run(){
  electron.app.on('window-all-closed',()=>{});
  await electron.app.whenReady();
  let current,ready;
  class HiddenWindow extends electron.BrowserWindow {
    constructor(options){
      super({...options,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});
      current=this;
    }
    show(){ready();}
  }
  const host=createMessageBoxes({...electron,BrowserWindow:HiddenWindow,dialog:{
    showMessageBox(){throw Error('测试中意外回退到系统弹窗');},
  }},{root,bundle:join(root,'output/desktop-bundle')});
  async function open(options){
    const shown=new Promise(resolve=>{ready=resolve;});
    const result=host.showMessageBox(options);
    let timeout;
    try{
      await Promise.race([shown,result.then(()=>{throw Error('弹窗提前结束');}),new Promise((_,reject)=>{
        timeout=setTimeout(()=>reject(Error('弹窗未就绪')),8000);
      })]);
    }finally{clearTimeout(timeout);}
    return {result,js:code=>current.webContents.executeJavaScript(code)};
  }
  async function snapshot(name){
    await new Promise(resolve=>setTimeout(resolve,250));
    writeFileSync(join(out,name+'.png'),(await current.webContents.capturePage()).toPNG());
  }
  try{
    for(const theme of ['light','dark']){
      electron.nativeTheme.themeSource=theme;
      const prompt=await open({type:'warning',title:'确认重启',message:'有任务正在执行，重启可能中断任务',
        detail:'结果未知的任务会在下次启动时提示处理。',buttons:['取消重启','确认重启'],defaultId:0,cancelId:0});
      assert.equal(await prompt.js("document.activeElement.textContent"),'取消重启');
      await snapshot('confirm-'+theme);
      await prompt.js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
      assert.equal((await prompt.result).response,0);
    }
    const labels=Array.from({length:24},(_,i)=>'任务组 '+(i+1));
    const list=await open({title:'主动接取任务',message:'选择任务组查看完整链',detail:'任务详情\n'.repeat(80),
      buttons:['关闭',...labels],defaultId:0,cancelId:0});
    assert(await list.js("['.copy','#actions'].every(s=>{const e=document.querySelector(s);return e.clientHeight>0&&e.scrollHeight>e.clientHeight})"));
    await list.js("document.querySelector('#actions').lastElementChild.click()");
    assert.equal((await list.result).response,24);
    const info=await open({title:'云端连接',message:'连接正常',detail:'<img src=x>',buttons:['测试连接','关闭'],cancelId:1});
    assert.equal(await info.js("document.querySelector('#detail').childElementCount"),0);
    current.close();assert.equal((await info.result).response,1);
    assert.equal(host.active,false);
    console.log('PASS：浅深色实际渲染、取消焦点、Esc、任务列表滚动与选择编号、关闭返回值、详情纯文本。');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{host.close();electron.app.exit(process.exitCode||0);}
}
run().catch(error=>{console.error(error);electron.app.exit(1);});
