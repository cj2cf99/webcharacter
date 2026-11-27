import {app,BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const [bundle,preload]=process.argv.slice(-2);
app.setPath('userData',mkdtempSync(join(tmpdir(),'study-paged-')));
async function test(){
  await app.whenReady();
  const w=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,offscreen:true}});
  const errors=[];w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
  await w.loadFile(resolve(bundle,'study.html'));
  const js=s=>w.webContents.executeJavaScript(s),idle=()=>delay(200);
  const count=s=>js(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const turn=async(scope,label)=>{await js(`document.querySelector('${scope} .study-turn button[aria-label="${label}"]').click()`);await idle();};
  const page=scope=>js(`document.querySelector('${scope} .study-turn span').textContent`);
  const click=async label=>{await js(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}).click()`);await idle();};
  await idle();
  // 场景行内 12 个话题分两页。
  assert.equal(await count('.study-topic'),10);assert.equal(await page('.study-paged'),'1 / 2');
  await turn('.study-paged','下一页');assert.equal(await count('.study-topic'),2);
  // 继续上次含正式考试时仍不超过 10 条，正式考试排第一。
  await click('题库练习');assert.equal(await count('.study-tile[data-tone=warn]'),10);
  assert.equal(await js("document.querySelector('.study-tile').textContent"),'继续正式考试');
  await click('复盘记录');assert.equal(await count('.study-tile'),10);assert.equal(await page('#study-actions'),'1 / 2');
  await turn('#study-actions','较早');assert.equal(await count('.study-tile'),3);assert.equal(await page('#study-actions'),'2 / 2');
  await js("document.querySelector('.study-tile').click()");await idle();
  await js("document.querySelector('.study-back').click()");await idle();assert.equal(await page('#study-actions'),'2 / 2');
  await js("document.querySelector('.study-tile').click()");await idle();
  await click('💬 题目评论');
  const comments="[aria-label]";
  const entries=()=>js("[...document.querySelectorAll('.study-thread')].at(-1).querySelectorAll('.study-entry').length");
  assert.equal(await entries(),10);
  const turnThread=async label=>{await js(`[...document.querySelectorAll('.study-thread')].at(-1).querySelector('.study-turn button[aria-label="${label}"]').click()`);await idle();};
  await turnThread('下一页');assert.equal(await entries(),2);
  await turnThread('上一页');await click('＋ 添加评论');
  await js("(()=>{const f=[...document.querySelectorAll('.study-thread textarea')].at(-1);f.value='新评论';})()");
  await click('保存');
  // 保存后跳到新条目所在的末页。
  assert.equal(await entries(),3);assert(await js("document.body.innerText.includes('新评论')"));
  assert.deepEqual(errors,[]);
  console.log('PASS：话题、续练、复盘记录页码保持与评论超过十条的翻页');
}
test().then(()=>app.exit(0),e=>{console.error(e);app.exit(1);});
setTimeout(()=>{console.error('超时');app.exit(2);},40000);
