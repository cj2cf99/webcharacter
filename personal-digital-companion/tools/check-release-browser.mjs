import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';

const page=new URL(process.argv[2]);
const nodeCount=Number(process.argv[3]??7);
assert.equal(page.hostname,'127.0.0.1');
const temp=resolve(tmpdir());
const profile=await mkdtemp(join(temp,'feiyue-chains-chrome-'));
assert.match(relative(temp,profile),/^feiyue-chains-chrome-[A-Za-z0-9]+$/);
const exe='C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(exe,['--headless','--disable-gpu','--no-proxy-server','--no-first-run',
  '--hide-scrollbars','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
  {windowsHide:true,stdio:'ignore'});
let ws;
try {
  let port;
  for(let i=0;i<100&&!port;i++){
    try {port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];}
    catch {await sleep(40);}
  }
  assert.match(port,/^\d+$/);
  const base='http://127.0.0.1:'+port;
  const tabs=await (await fetch(base+'/json/list')).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await once(ws,'open');
  let id=0;
  const pending=new Map();
  ws.addEventListener('message',({data})=>{
    const message=JSON.parse(data);
    const callback=pending.get(message.id);
    if(callback){pending.delete(message.id);callback(message);}
  });
  const command=(method,params={})=>new Promise((done,reject)=>{
    const next=++id;
    const timer=setTimeout(()=>{pending.delete(next);reject(Error(method+' timed out'));},4000);
    pending.set(next,response=>{
      clearTimeout(timer);
      if(response.error)reject(Error(response.error.message));
      else done(response.result);
    });
    ws.send(JSON.stringify({id:next,method,params}));
  });
  const js=async expression=>(await command('Runtime.evaluate',{expression,returnByValue:true})).result?.value;
  await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:profile});
  const moon = `(() => {
    const heading=document.querySelector('main.companion-page h1');
    const style=getComputedStyle(heading), glyph=getComputedStyle(heading,'::before');
    const badge=getComputedStyle(heading,'::after');
    return heading.parentElement===document.querySelector('main.companion-page') && heading.childElementCount===0 &&
      !document.querySelector('.companion-moon') && style.getPropertyValue('--page-ico')===style.getPropertyValue('--i-feiyue') &&
      glyph.animationName==='none' && glyph.maskImage.includes('data:image/svg+xml') && badge.maskImage==='none';
  })()`;
  const peers = `(() => {
    const feiyue=document.querySelector('#nav-companion'), reminder=document.querySelector('#nav-reminders');
    return feiyue.parentElement.parentElement===reminder.parentElement.parentElement &&
      feiyue.closest('.nav-group').dataset.navGroup==='schedule' &&
      !feiyue.closest('.nav-sublinks') && feiyue.getAttribute('aria-current')==='page' &&
      !document.querySelector('#nav-aim').hasAttribute('aria-current');
  })()`;
  const aligned = (id,label) => `(() => {
    const first=document.getElementById('${id}-new'), second=document.getElementById('${id}-refresh');
    const a=first.getBoundingClientRect(), b=second.getBoundingClientRect();
    return first.parentElement===second.parentElement && a.height>0 &&
      Math.abs(a.top-b.top)<1 && Math.abs(a.height-b.height)<1 && a.right<b.left &&
      first.textContent.trim()===${JSON.stringify(label)} && second.textContent.trim()==='刷新' &&
      !first.classList.contains('t-expand') && !second.classList.contains('t-expand');
  })()`;
  for(const width of [1250,768,320,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:780,deviceScaleFactor:1,mobile:width<500});
    await command('Page.navigate',{url:page.href});
    const wait=async expression=>{
      for(let i=0;i<70;i++){if(await js(expression))return;await sleep(40);}
      throw Error('Timed out '+expression+' '+await js('location.href')+' '+await js(
        "document.querySelector('main')?.innerText.slice(0,450)"
      ));
    };
    await wait("document.querySelector('#companion-chains details') != null");
    await wait("document.querySelector('main.companion-page h1').hasAttribute('data-ico-playing')");
    if(width===1250||width===390){
      if(width===390)await js("document.documentElement.dataset.theme='cyber';document.querySelector('.site-menu-toggle').click()");
      else await js("document.querySelector('.nav-group[data-nav-group=schedule] summary').click()");
      const menuEntry="document.querySelector('#nav-companion').parentElement";
      await wait(`${menuEntry}.hasAttribute('data-ico-playing')`);
      const clip=await js(`(()=>{
        const entry=${menuEntry}, box=entry.getBoundingClientRect(), glyph=getComputedStyle(entry,'::before');
        return {x:Math.round(scrollX+box.left+parseFloat(glyph.left)),y:Math.round(scrollY+box.top+parseFloat(glyph.top)),
          width:20,height:20,scale:1};
      })()`);
      const sample=()=>command('Page.captureScreenshot',{format:'png',clip}).then(result=>result.data);
      const early=await sample();
      await sleep(320);
      assert.notEqual(await sample(),early,'菜单里的弯月图标应随播放改变画面');
      await wait(`!${menuEntry}.hasAttribute('data-ico-playing')`);
      if(width===390)await js("document.querySelector('#site-drawer .drawer-close').click()");
      else await js("document.querySelector('.nav-group[data-nav-group=schedule]').open=false");
    }
    assert.equal(await js("document.querySelectorAll('#companion-chains li').length"),0);
    await js("document.querySelector('#companion-chains details').open=true");
    await wait("document.querySelectorAll('#companion-chains li').length==="+nodeCount);
    assert.equal(await js(`(() => {
      const menu=document.querySelector('.companion-tabs');
      const [first,second]=menu.querySelectorAll('button');
      return first.offsetLeft===second.offsetLeft && first.offsetTop<second.offsetTop &&
        menu.getBoundingClientRect().right<document.querySelector('.companion-content').getBoundingClientRect().left;
    })()`),true);
    assert.equal(await js(moon),true);
    assert.equal(await js(peers),true);
    assert.equal(await js(aligned('chain','新建任务链')),true);
    if(width<500){
      await js("document.querySelector('.site-menu-toggle').click()");
      await wait("document.querySelector('#site-drawer[open] #nav-companion')!=null");
      assert.equal(await js(peers),true);
      await js("document.querySelector('.drawer-close').click()");
    }
    for(const id of ['chain-state','task-state','template-state']){
      assert.deepEqual(await js(`[...document.querySelectorAll('#${id} button')].map(button=>button.textContent)`),['执行中','已完成','全部']);
    }
    if(width===1250){
      await js("document.querySelector('#companion-more').click()");
      await wait("document.querySelectorAll('#companion-chains > details').length===35");
      await js("document.querySelector('#chain-state [data-scope=ACTIVE]').click()");
      await wait("document.querySelector('#companion-status').textContent.includes('没有符合')");
    }
    const previous=await js('document.documentElement.dataset.theme');
    await js("document.querySelector('.theme-toggle').click()");
    await wait('document.documentElement.dataset.theme!=='+JSON.stringify(previous));
    assert.equal(await js(moon),true);
    assert.equal(await js(aligned('chain','新建任务链')),true);
    assert.equal(await js('document.documentElement.scrollWidth <= document.documentElement.clientWidth+1'),true);

    await command('Page.navigate',{url:new URL('/',page).href});
    await wait("document.readyState==='complete' && document.querySelector('#home .companion-portal') != null");
    if(width===1250){
      await js("document.querySelector('#home .companion-portal').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
      await wait("document.querySelector('#home .companion-portal').hasAttribute('data-ico-playing')");
    }
    await js("document.querySelector('#home .companion-portal').click()");
    await wait("location.pathname==='/companion/tasks' && document.querySelector('#task-list details') != null");
    assert.equal(await js("document.querySelector('#task-panel').hidden"),false);
    assert.equal(await js(aligned('task','新建任务')),true);
    if(width===1250){
      await js(`(() => {
        const original=window.fetch;
        window.fetch=(input,init)=>input==='/api/companion/devices' ?
          Promise.resolve(new Response('{"devices":[]}',{headers:{'Content-Type':'application/json'}})) : original(input,init);
        document.querySelector('#task-new').click();
      })()`);
      await wait("!document.querySelector('#task-type').disabled");
      await js(`(() => {
        const type=document.querySelector('#task-type');
        type.value='pc.echo';type.dispatchEvent(new Event('change'));
      })()`);
      assert.equal(await js("document.querySelector('#task-target option').textContent"),'暂无已登记电脑');
      assert.deepEqual(await js("[...document.querySelector('#task-target').options].filter(row=>!row.hidden&&!row.disabled).map(row=>row.textContent)"),['任一电脑']);
      assert.equal(await js("document.querySelector('#task-target-message').hidden"),false);
      await js("document.querySelector('#task-create-close').click()");
    }
    await js("document.querySelector('#task-list summary').focus(); document.querySelector('#task-list details').open=true");
    await wait("document.querySelector('#task-list .companion-values') != null");
    assert.equal(await js("document.activeElement===document.querySelector('#task-list summary')"),true);
    if(width===1250){
      await js("document.querySelector('#task-more').click()");
      await wait("document.querySelectorAll('#task-list > details').length===34");
    }
    await js("document.querySelector('[data-companion-view=templates]').click()");
    await wait("document.querySelectorAll('#task-templates > details').length===30");
    if(width===1250){
      await js("document.querySelector('#template-more').click()");
      await wait("document.querySelector('#template-more').hidden && [...document.querySelectorAll('#task-templates > details')].filter(row=>row.textContent.includes('合成模板')).length===34");
      await js("document.querySelector('#template-state [data-scope=ACTIVE]').click()");
      await wait("document.querySelector('#template-status').textContent.includes('没有符合')");
      await js("document.querySelector('#template-state [data-scope=COMPLETED]').click()");
      await wait("document.querySelector('#task-templates > details small')?.textContent.includes('已完成')");
    }
    const layout = await js(`(() => {
      const viewport=document.documentElement.clientWidth;
      return {viewport, scroll:document.documentElement.scrollWidth,
        overflow:[...document.querySelectorAll('body *')].filter(node=>node.getBoundingClientRect().right>viewport+1)
          .slice(0,10).map(node=>[node.tagName,node.id,node.className,Math.round(node.getBoundingClientRect().right)])};
    })()`);
    assert.ok(layout.scroll <= layout.viewport + 1,JSON.stringify(layout));
    if(width===390) {
      await js("document.querySelector('[data-companion-view=terminals]').click()");
      await wait("document.querySelectorAll('#terminal-list > details').length===2");
      await js(`(() => {
        const card=[...document.querySelectorAll('#terminal-list details')].find(item=>item.textContent.includes('验收用电脑'));
        card.open=true;
        card.querySelector('input').value='主终端验收';
        card.querySelector('form').requestSubmit();
      })()`);
      await wait("document.querySelector('#terminal-status').textContent.includes('已保存「主终端验收」')");
      await js(`(() => {
        const card=[...document.querySelectorAll('#terminal-list details')].find(item=>item.textContent.includes('主终端验收'));
        [...card.querySelectorAll('button')].find(button=>button.textContent==='恢复本地 ID').click();
      })()`);
      const bindingId='pc-10000000-0000-4000-8000-000000000001';
      let binding;
      for(let attempt=0;attempt<70&&!binding;attempt++){
        try {binding=JSON.parse(await readFile(join(profile,'feiyue-'+bindingId+'.json'),'utf8'));}
        catch {await sleep(40);}
      }
      assert.deepEqual(binding,{device_id:bindingId});
      await js(`(() => {
        const card=[...document.querySelectorAll('#terminal-list details')].find(item=>item.textContent.includes('验收用浏览器'));
        card.open=true;
        [...card.querySelectorAll('button')].find(button=>button.textContent==='恢复此浏览器绑定').click();
      })()`);
      await wait("document.querySelector('#terminal-binding').textContent.includes('验收用浏览器')");
      await js("document.querySelector('[data-companion-view=tasks]').click()");
      await js("document.querySelector('#task-new').click()");
      await wait("Array.from(document.querySelector('#task-type').options).some(row => row.value==='pc.echo')");
      const computerOptions=await (await fetch(new URL('/api/companion/tasklist',page))).json();
      const computerTypes=computerOptions.tasklist.filter(row=>row.executor==='pc').map(row=>row.type);
      assert.deepEqual(await js("[...document.querySelector('#task-type').options].slice(1).map(row=>row.value)"),computerTypes);
      await js(`(() => {
        const type=document.querySelector('#task-type');
        type.value='pc.echo'; type.dispatchEvent(new Event('change'));
      })()`);
      assert.deepEqual(await js("[...document.querySelector('#task-target').options].filter(row=>!row.hidden).map(row=>row.textContent)"),['任一电脑','主终端验收']);
      assert.equal(await js("document.querySelector('#task-target').value"),'');
      await js(`(() => {
        const type=document.querySelector('#task-type');
        type.value='pc.echo'; type.dispatchEvent(new Event('change'));
        const target=document.querySelector('#task-target');
        target.value=Array.from(target.options).find(option=>option.textContent==='主终端验收')?.value ?? '';
        document.querySelector('#task-fields textarea').value='网页任务验收';
        document.querySelector('#task-form').requestSubmit();
      })()`);
      await wait("!document.querySelector('#task-create').open && document.querySelector('#task-feedback').textContent.includes('已创建')");
      assert.equal(await js("document.querySelector('#task-state [data-scope=ACTIVE]').getAttribute('aria-pressed')"),'true');
      await wait("document.querySelector('#task-list details')?.textContent.includes('回显文字') && document.querySelector('#task-list details')?.textContent.includes('主终端验收')");
      await js("document.querySelector('#task-list details').open=true");
      await wait("Array.from(document.querySelectorAll('#task-list button')).some(button => button.textContent==='取消任务')");
      await js(`(() => {
        window.confirm=()=>true;
        Array.from(document.querySelectorAll('#task-list button')).find(button=>button.textContent==='取消任务').click();
      })()`);
      await wait("document.querySelector('#task-feedback').textContent.includes('已取消') && document.querySelector('#task-list details')==null");
      await js("document.querySelector('[data-companion-view=chains]').click(); document.querySelector('#chain-new').click()");
      await wait("!document.querySelector('#chain-create-fields').disabled");
      assert.equal(await js("!document.querySelector('#chain-mode')"),true);
      assert.deepEqual(await js("[...document.querySelector('.companion-chain-step select').options].slice(1).map(row=>row.value)"),computerTypes);
      assert.deepEqual(await js("[...document.querySelectorAll('.companion-chain-step select')[2].options].filter(row=>!row.hidden).map(row=>row.textContent)"),['任一电脑','主终端验收']);
      await js(`(() => {
        document.querySelector('#chain-name').value='电脑联调链';
        document.querySelector('#chain-add-step').click();
        const rows=[...document.querySelectorAll('.companion-chain-step')];
        rows.forEach((row,index)=>{
          const [type,before,target]=row.querySelectorAll('select');
          type.value='pc.echo'; type.dispatchEvent(new Event('change'));
          target.value=Array.from(target.options).find(option=>option.textContent==='主终端验收')?.value ?? '';
          row.querySelector('textarea').value='节点 '+index;
          if(index) before.selectedIndex=1;
        });
        document.querySelector('#chain-form').requestSubmit();
      })()`);
      await wait("!document.querySelector('#chain-create').open && document.querySelector('#chain-feedback').textContent.includes('电脑联调链')");
      await wait("document.querySelector('#companion-chains > details')?.textContent.includes('电脑联调链')");
      await js("document.querySelector('#companion-chains > details').open=true");
      await wait("document.querySelectorAll('#companion-chains li').length===2");
      await js("Array.from(document.querySelectorAll('#companion-chains button')).find(button=>button.textContent==='停止任务链').click()");
      await wait("document.querySelector('#chain-feedback').textContent.includes('已停止') && document.querySelector('#companion-chains > details')==null");
      await js("document.querySelector('#chain-state [data-scope=COMPLETED]').click()");
      await wait("document.querySelector('#companion-chains > details')?.textContent.includes('临时登记')");
    }
  }
  console.log('PASS: Chrome 1250/768/390/320, Feiyue icon playback, terminal binding, task creation and paging.');
} finally {
  ws?.close();
  if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
  await rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
