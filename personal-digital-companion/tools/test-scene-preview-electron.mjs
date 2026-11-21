import electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {previewServer} from './scene-preview.mjs';
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-scene-qa-')));
const server=previewServer();
const limit=setTimeout(()=>{console.error('测试超时');electron.app.exit(2);},60000);
async function run(){
  await electron.app.whenReady();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const window=new electron.BrowserWindow({show:false,width:800,height:800,webPreferences:{offscreen:true}});
  window.webContents.on('console-message',(_e,level,message)=>{if(level>=2)console.error(message);});
  const js=async code=>{try{return await window.webContents.executeJavaScript(code);}catch(e){throw Error(code+' '+e.message);}};
  const frame=code=>js('(()=>{const win=document.querySelector("iframe").contentWindow,doc=win.document;'+(code.includes(';')?'':'return ')+code.replaceAll('document.','doc.').replaceAll('location.search','win.location.search').replaceAll('<=innerWidth','<=win.innerWidth')+';})()');
  async function until(fn){for(let i=0;i<120;i++){if(await fn().catch(()=>false))return;await new Promise(r=>setTimeout(r,25));}throw Error('UI timeout');}
  await window.loadURL('http://127.0.0.1:'+server.address().port);
  for(const width of [375,768,1040]){
    window.setContentSize(width,780);
    for(const [key,count,marks] of [['target',1,1],['pair',2,1],['whole',1,0],['share',1,0]]){
      console.log(width,key);
      if(!await js("document.querySelector('[data-key="+key+"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('iframe').hidden"))await js("document.querySelector('[data-key="+key+"]').click()");
      await until(()=>frame("location.search==='?case="+key+"'&&document.querySelectorAll('#images img').length==="+count+"&&[...document.querySelectorAll('#images img')].every(i=>i.naturalWidth)"));
      assert.equal(await frame("document.querySelectorAll('#images .mark').length"),marks);
      assert.equal(await frame("document.documentElement.scrollWidth<=innerWidth"),true);
      await frame("document.querySelector('.picture').click()");assert.equal(await frame("document.querySelector('dialog').open"),true);
      await frame("document.querySelector('#back').click()");
      await frame("document.querySelector('#skip').scrollIntoView({block:'nearest'})");
      assert.equal(await frame("document.querySelector('#skip').getBoundingClientRect().bottom<=win.innerHeight+1"),true);
      if(key==='target')await frame("document.querySelector('#reply').value='月相';document.querySelector('form').requestSubmit()");
      else await frame("document.querySelector('#skip').click()");
      await until(()=>js("document.querySelector('iframe').hidden"));
    }
  }
  await js("document.querySelector('[data-key=bubble]').click()");
  await until(()=>frame("document.querySelector('#answer')?.textContent.length===200"));
  await until(()=>js("document.querySelector('iframe').offsetHeight>260"));
  await frame("document.querySelector('#full').click()");
  assert.ok(await frame("document.querySelector('#answer').textContent.length>200"));
  await frame("document.querySelector('#full').click()");
  assert.equal(await frame("document.querySelector('#answer').textContent.length"),200);
  console.log('PASS: 场景三种宽度、四种图文、放大返回、回应收起、气泡增高及 200 字展开收起');
}
run().then(()=>electron.app.exit(0),e=>{console.error(e);electron.app.exit(1);}).finally(()=>{clearTimeout(limit);server.close();});
