import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const url=new URL(process.argv.at(-1));
if(url.hostname!=='127.0.0.1')throw Error('仅支持本机隔离验收');
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-reader-')));
async function test(){
  await electron.app.whenReady();
  const w=new electron.BrowserWindow({width:1280,height:850,show:false,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false,offscreen:true}});


  const js=code=>w.webContents.executeJavaScript(code);
  const requests=[];
  w.webContents.session.webRequest.onBeforeRequest((d,cb)=>{requests.push(new URL(d.url).pathname);cb({});});
  async function wait(code){for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,35));}throw Error(code+" "+JSON.stringify(await js("({width: innerWidth, open: document.querySelector('#reader')?.open})")));}
  for(const width of [1280,768,375]){
    w.setContentSize(width,850);
    await w.loadURL(url.href);
    await wait("document.querySelectorAll('.entry').length===3");
    const heading="document.querySelector('#cover-title')";
    const marker=host=>host+".querySelector('.feiyue-journal-mark')";
    async function verifySweep(host){
      const mark=marker(host);
      await wait(host+".hasAttribute('data-ico-playing')");
      assert(await js("getComputedStyle("+mark+").backgroundImage.includes('/assets/icons/feiyue-journal.svg')"));
      assert(await js("getComputedStyle("+mark+",'::after').backgroundImage.includes('data:image/svg+xml')"));
      assert.deepEqual(await js("[getComputedStyle("+mark+").width,getComputedStyle("+mark+").height]"),['28px','32px']);
      await wait("!"+host+".hasAttribute('data-ico-playing')");
      assert.equal(await js("getComputedStyle("+mark+",'::after').backgroundImage"),'none');
    }
    await verifySweep(heading);
    await js(heading+".dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
    await verifySweep(heading);
    const menuIcon="document.querySelector('.nav-entry:has(>a[data-nav=feiyue-memory])')";
    const menuLink=menuIcon+".querySelector('a')";
    const menuOpen=width<768?"document.querySelector('.site-menu-toggle').click()":menuIcon+".closest('details').querySelector('summary').click()";
    await js(menuOpen);
    await verifySweep(menuIcon);
    await js(menuLink+".dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
    await verifySweep(menuIcon);
    if(width<768)await js("document.querySelector('.drawer-close').click()");
    else await js(menuIcon+".closest('details').querySelector('summary').click()");

    assert(await js("document.querySelector('.cover-art img').decode().then(()=>true)"));
    for (const theme of ['ink','cyber']) {
      if (await js("document.documentElement.dataset.theme")!==theme) await js("document.querySelector('.theme-toggle').click()");
      await wait("document.documentElement.dataset.theme==='"+theme+"'");
      const paper=theme==='ink'?'rgb(255, 250, 244)':'rgb(44, 39, 53)';
      await wait("getComputedStyle(document.querySelector('.collection')).backgroundColor==='"+paper+"'");
      assert(await js("document.documentElement.scrollWidth<=innerWidth"),width+'px '+theme);
      if(process.env.FEIYUE_READER_SHOTS){
        await new Promise(done=>setTimeout(done,500));
        writeFileSync(join(process.env.FEIYUE_READER_SHOTS,theme+'-'+width+'.png'),(await w.webContents.capturePage()).toPNG());
      }
    }
    // 从共用主题取实际图标，在手记文档的图片策略下解码。
    assert(await js(`(async () => {
      const mask = getComputedStyle(document.documentElement).getPropertyValue('--i-search').trim();
      const match = /^url\\(["']?(data:image\\/svg\\+xml,.*?)["']?\\)$/.exec(mask);
      if (!match) return false;
      const icon = new Image();
      icon.src = match[1];
      await icon.decode();
      return icon.naturalWidth > 0;
    })()`), '手记页面应能加载共用搜索图标');
    assert(!requests.some(p=>/memory\/diaries\/2026/.test(p)),'首屏只加载索引');
    await js("document.querySelector('.entry').click()");
    await wait("document.querySelector('#reader').open && document.querySelector('#article').textContent.includes('买的是散文集。') && document.querySelector('#article').textContent.includes('绯月私语：这个答案我记住了。')");
    assert.deepEqual(await js("Array.from(document.querySelectorAll('#article section h3'),n=>n.textContent)"),['你的日记']);
    await js("document.querySelector('#reader [data-dismiss]').click()");
    await js("document.querySelector('#nagTab').click()");
    await wait("document.querySelector('.entry')?.innerText.includes('消费')");
    for(const i of [0,1]){
      await js("document.querySelectorAll('.entry')["+i+"].click()");
      await wait("document.querySelector('#article button')?.innerText.includes('原记录')");
      await js("document.querySelector('#article button').click()");
      await wait(i===0?"document.querySelector('#originBody').innerText.includes('P-BOOK')":"document.querySelector('.thread-focus')?.innerText.includes('已解')");
      await js("document.querySelector('#returnOrigin').click()");
      assert(await js("document.querySelector('#reader').open && !document.querySelector('#origin').open"));
      await js("document.querySelector('#reader button').click()");
    }
    await js("document.querySelectorAll('.entry')[2].click()");
    await wait("document.querySelector('#article')?.innerText.includes('2026-11-18.1')");
    assert.equal(await js("document.querySelectorAll('#article button').length"),1);
    await js("document.querySelector('#article button').click()");
    await wait("document.querySelector('#originBody').innerText.includes('2026-11-20 · 第 1 篇')");
    assert(!requests.some(p=>p.endsWith('/diaries/2026-11-18.1')),'附引篇目只显示快照');
    await js("document.querySelector('#returnOrigin').click()");
    await js("document.querySelector('#reader [data-dismiss]').click()");
    await js("document.querySelector('.theme-toggle').click()");
    assert(await js("document.documentElement.scrollWidth<=innerWidth"));
    await w.loadURL(new URL('/',url).href);
    const portal="document.querySelector('#home .portal[href=\"/companion/memory/\"]')";
    await js(portal+".dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
    await verifySweep(portal);
    assert(requests.includes('/assets/icons/anim/feiyue-journal-sweep.svg'));
    requests.length=0;
  }
  w.destroy();console.log('PASS 桌面及手机，两种主题，列表、打开日记核对正文与私语、三类念叨来源、主篇唯一回链及返回。');
}
test().then(()=>electron.app.exit(0),error=>{console.error(error);electron.app.exit(1);});
