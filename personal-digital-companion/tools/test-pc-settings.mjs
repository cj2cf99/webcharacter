import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {SettingsStore,defaults} from '../desktop/settings-store.mjs';
import {BehaviorController} from '../desktop/behavior-controller.mjs';
const dir=mkdtempSync(join(tmpdir(),'pc-settings-test-')),bundle=resolve('output/desktop-bundle');
try{
 let store=new SettingsStore(dir,bundle,{enabled:false,volume:27,nodes:{idle:{enabled:false,volume:42}}});assert.equal(store.snapshot().config.master.volume,27);assert.equal(store.snapshot().config.states.idle.sound.single.volume,42);
 for(const id of ['laugh-soft','greeting-dear','laugh-bell-v3']){const asset=store.catalog().find(a=>a.id==='voice:'+id);assert(asset&&asset.kind==='audio');assert(existsSync(new URL(asset.url)));}
 const untouched=JSON.stringify(store.snapshot().config);new SettingsStore(dir,bundle);assert.equal(JSON.stringify(store.snapshot().config),untouched,'新增资源不改节点映射');
 let c=store.snapshot().config;c.states.hover.force=true;c.states.hover.slots.enter='click';store.save(c,'animation');
 c.master.volume=63;c.states.hover.sound.enter.delay=1.2;store.save(c,'sound');
 store=new SettingsStore(dir,bundle);assert.equal(store.snapshot().config.states.hover.slots.enter,'click');assert.equal(store.snapshot().config.states.hover.force,true);assert.equal(store.snapshot().config.states.hover.sound.enter.delay,1.2);assert.equal(store.snapshot().config.master.volume,63);
 const wrong=store.snapshot().config;wrong.target='web';assert.throws(()=>store.save(wrong,'animation'),/PC/);
 const invalid=store.snapshot().config;invalid.states.hover.slots.enter='missing';assert.throws(()=>store.save(invalid,'animation'),/缺少/);assert.equal(store.snapshot().config.states.hover.slots.enter,'click');
 const stale=defaults();stale.master.volume=1;store.save(stale,'animation');assert.equal(store.snapshot().config.master.volume,63,'动画保存不覆盖声音');
 const before=JSON.stringify(store.snapshot().config),persist=store.persist;store.persist=()=>{throw Error('disk failed')};assert.throws(()=>store.save(defaults(),'animation'),/disk failed/);assert.equal(JSON.stringify(store.snapshot().config),before);store.persist=persist;
 const asset=store.importFile(resolve('assets/voice/unified-zh.wav'),'audio').assets.at(-1);assert(existsSync(new URL(asset.url)));store.rename(asset.id,'测试声音');assert.equal(new SettingsStore(dir,bundle).catalog().at(-1).name,'测试声音');
 const log=[],cfg=defaults(),ctrl=new BehaviorController(cfg,(id,p)=>log.push([id,p]));cfg.states.hover.force=true;ctrl.start('hover');ctrl.over=true;ctrl.input('drag',true);assert.equal(ctrl.phase,'enter');ctrl.input('drag',false);ctrl.over=false;ctrl.ended();assert.equal(ctrl.phase,'exit');ctrl.input('drag',true);assert.equal(ctrl.phase,'exit');ctrl.input('drag',false);ctrl.ended();assert.equal(ctrl.current,'idle','强制结束后已松开不补播拖拽');
 ctrl.start('hover');ctrl.over=true;ctrl.ended();assert.equal(ctrl.phase,'loop');assert(ctrl.canNativeLoop());ctrl.input('over',false);assert(!ctrl.canNativeLoop());ctrl.ended();assert.equal(ctrl.phase,'exit');ctrl.ended();assert.equal(ctrl.current,'idle');
 ctrl.start('work');ctrl.work=true;ctrl.input('drag',true);assert.equal(ctrl.current,'drag','非强制被拖拽抢占');ctrl.input('drag',false);ctrl.reconfigure(cfg);assert.equal(ctrl.current,'work','退出期间保存按有效意图恢复');
 ctrl.start('click');ctrl.ended();assert.notEqual(ctrl.current,'click');cfg.states.click.mode='triple';cfg.states.click.slots={single:'click',enter:'click',loop:'click',exit:'click'};ctrl.start('click');ctrl.ended();assert.equal(ctrl.phase,'loop');ctrl.ended();assert.equal(ctrl.phase,'exit');ctrl.ended();assert.equal(ctrl.current,'work');
 cfg.states.idle.force=true;ctrl.work=false;ctrl.drag=false;ctrl.over=false;ctrl.start('idle');ctrl.input('specialPending',true);assert.equal(ctrl.current,'idle');assert(!ctrl.canNativeLoop());ctrl.ended();assert.equal(ctrl.current,'special','特殊待机遵循强制完成');
 console.log('PASS：本地写入/重建回读、PC目标拒绝、声音/动画独立保存、导入复制、重命名、写入失败不污染、强制退出/拖拽与三段事件。');
}finally{rmSync(dir,{recursive:true,force:true});}
