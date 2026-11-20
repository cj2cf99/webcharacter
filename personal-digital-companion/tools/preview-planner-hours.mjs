// 仅从本次测试的内存 SQLite 初始化 workerd。关闭后丢弃验收数据。
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';

async function initialize(db, sqlite) {
  const schema=sqlite.prepare("SELECT name,type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid").all();
  const statements=schema.map(row=>db.prepare(row.sql));
  for(const table of schema.filter(row=>row.type==='table')){
    const name='"'+table.name.replaceAll('"','""')+'"';
    for(const row of sqlite.prepare('SELECT * FROM '+name).all()){
      const columns=Object.keys(row).map(key=>'"'+key.replaceAll('"','""')+'"');
      statements.push(db.prepare('INSERT INTO '+name+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').bind(...Object.values(row)));
    }
  }
  await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...statements]);
}

export async function previewPlannerHours({main,api,planDb,taskDb,issuer,sub,serve}){
  const require=createRequire(join(main,'package.json'));
  const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
  const desktop=resolve(import.meta.dirname,'../desktop');
  async function bundle(contents,resolveDir){
    const result=await build({stdin:{contents,resolveDir},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
    return result.outputFiles[0].text;
  }
  const ui=await bundle(`import {createReminderReviewFlow} from './reminder-review-flow.mjs';
    window.reminderReview=createReminderReviewFlow({request:(path,options)=>fetch(path.replace('/api/','/api/companion/'),options)});
    await import('./reminder-review-ui.mjs');`,desktop);
  const assets={'/':[readFileSync(join(desktop,'reminder-review.html'),'utf8'),'text/html'],
    '/reminder-review-ui.mjs':[ui,'text/javascript'],'/reminder-review.css':[readFileSync(join(desktop,'reminder-review.css'),'utf8'),'text/css']};
  const modulePath=name=>JSON.stringify(name.replaceAll('\\','/'));
  const script=await bundle(`import {handleCompanion} from ${modulePath(join(api,'src/companion/agent/host/subscriptions.mjs'))};
    import {companionReminderReview} from './src/features/companion/reminder-review-gateway.js';
    const assets=${JSON.stringify(assets)};
    export default {async fetch(request,env){
      const path=new URL(request.url).pathname;
      if(Object.hasOwn(assets,path)){const [body,type]=assets[path];return new Response(body,{headers:{'Content-Type':type+'; charset=utf-8'}});}
      if(!path.startsWith('/api/companion/'))return new Response(null,{status:404});
      const call=(op,...args)=>companionReminderReview(env,op,...args);
      const host={reviewReminders:()=>call('list'),reviewReminderStatus:id=>call('status',id),changeReviewReminder:(id,body)=>call('change',id,body)};
      return handleCompanion(request,{...env,COMPANION_HOST:host},'fixture',false);
    }};`,main);
  const runtime=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:serve?8796:0,cf:false,workers:[{name:'hours',modules:true,script,compatibilityDate:'2026-10-27',
    d1Databases:['mymaindb','COMPANION_DB'],d1Persist:false,bindings:{APP_ENV:'test',ACCESS_MODE:'mock',
      ACCESS_ISSUER:issuer,ACCESS_AUD:'fixture',ALLOWED_OWNER_SUBS:sub,PLANNER_REDESIGN:'execution'}}]}));
  try{
    await initialize(await runtime.getD1Database('mymaindb','hours'),planDb);
    await initialize(await runtime.getD1Database('COMPANION_DB','hours'),taskDb);
    const url=await runtime.ready,call=(path,body)=>runtime.dispatchFetch(new URL(path,url),body===undefined?{}:{
      method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;});
    assert.equal((await runtime.dispatchFetch(url)).status,200);
    const base='/api/companion',list=await call(base+'/reminder-review'),item=list.items.find(row=>row.plannerWork);
    assert.ok(item?.plannerWork.dispatchId);
    if(serve){console.log('本地工时验收 '+url.href);await once(process,'SIGINT');return;}
    const {submission_id}=await call(base+'/task-submissions',{});
    const {task_id}=await call(base+'/tasks',{type:'planner.hours.record',submission_id,params:{
      reminderId:item.id,dispatchId:item.plannerWork.dispatchId,today:list.today,version:item.version,actualHours:1.5}});
    const result=await call(base+'/tasks/'+task_id+'/execute',{});
    assert.equal(result.result.actualHours,1.5);assert.equal((await call(base+'/reminder-review')).recordedHours[0].plannerRecord.actualHours,1.5);
    console.log('PASS：本地 workerd 工时页面、任务执行和 D1 回读。');
  }finally{await runtime.dispose();}
}
