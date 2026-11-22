import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gardenRepo,remoteGarden} from '../desktop/garden-backend.mjs';
import {batchId,canonical,compileStep,hash,inputFields,invariant,revisionQuery,same,schemaQuery,stepFile,tables,targetId,validatePlan} from '../desktop/garden-registration.mjs';

const tableName=t=>'garden_'+t;
function snapshot(db){
  return new Map(tables.flatMap(table=>db.prepare('SELECT * FROM '+tableName(table)).all().map(after=>{
    const change={table,after};return [targetId(change),change];
  })));
}
function difference(before,after){
  const changes=[];
  for(const [id,c] of before)if(!after.has(id))changes.push({table:c.table,before:c.after,after:null});
  for(const [id,c] of after){
    const old=before.get(id)?.after??null;
    if(!same(old,c.after))changes.push({table:c.table,before:old,after:c.after});
  }
  return changes;
}
function binding(db){
  return {
    prepare(sql){return {sql,args:[],bind(...args){return {sql,args};}};},
    batch(items){return items.map(({sql,args})=>{
      const query=db.prepare(sql);
      if(query.columns().length)return {results:query.all(...args)};
      query.run(...args);return {results:[]};
    });},
  };
}
async function copyGarden(source,db){
  const revision=(await source.read(revisionQuery))[0]?.revision;
  const schema=await source.read(schemaQuery);
  db.exec('PRAGMA foreign_keys=OFF');
  for(const entry of schema.filter(s=>s.type==='table'))db.exec(entry.sql);
  for(const name of ['revision',...tables]){
    const rows=await source.read('SELECT * FROM '+tableName(name));
    if(!rows.length)continue;
    const fields=Object.keys(rows[0]);
    invariant(fields.every(f=>/^[a-z][a-z0-9_]*$/.test(f)),'未知花园字段');
    const insert=db.prepare('INSERT INTO '+tableName(name)+'('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')');
    for(const row of rows)insert.run(...fields.map(k=>row[k]));
  }
  for(const entry of schema.filter(s=>['index','trigger'].includes(s.type)))db.exec(entry.sql);
  db.exec('PRAGMA foreign_keys=ON');
  invariant(revision===(await source.read(revisionQuery))[0]?.revision&&same(schema,await source.read(schemaQuery)),'读取期间花园数据或结构发生变化，请重新制单');
  return {revision,schemaHash:hash(canonical(schema))};
}
function ownership(db,changes){
  const projects=new Map(),flowers=new Map();
  for(const c of changes){
    const r=c.after??c.before;
    const ids=[r.flower_id,r.from_flower_id,c.table==='flower'?r.id:null];
    const projectIds=[r.project_id,r.project_a,r.project_b,r.runner_project_id,c.table==='project'?r.id:null];
    for(const id of ids.filter(Boolean)){
      const f=db.prepare('SELECT id,project_id,name FROM garden_flower WHERE id=?').get(id);
      invariant(f,'功能归属无法确认');flowers.set(f.id,f);projectIds.push(f.project_id);
    }
    for(const id of projectIds.filter(Boolean)){
      const p=db.prepare('SELECT id,name FROM garden_project WHERE id=?').get(id);
      invariant(p,'项目归属无法确认');projects.set(p.id,p);
    }
  }
  return {projects:[...projects.values()],flowers:[...flowers.values()]};
}
// 同一次稳定读取提供实际编号、关联和花园模型计算的当前版本。
export async function inspectTargets(source,modelPath){
  const {createCloudStore}=await import(pathToFileURL(modelPath));
  const db=new DatabaseSync(':memory:');
  try{
    const baseline=await copyGarden(source,db);
    const store=await createCloudStore(binding(db));
    const deploy=db.prepare('SELECT id FROM garden_deploy ORDER BY deployed_at DESC,id DESC').all()
      .map(({id})=>store.history(id));
    return {baseline,resources:{...store.snapshot(),deploy}};
  }finally{db.close();}
}
// 新增部署/改善/Bug 可在别的发布结束后重取版本；核对原目录中的归属与重复项。
function canRefresh(request,catalog,db,baseline){
  if(!catalog||!same(catalog.baseline,request.baseline)||catalog.baseline.schemaHash!==baseline.schemaHash)return false;
  for(const step of request.steps){
    if(step.id!=null||!['deploy','bugs','improvements'].includes(step.resource))return false;
    const items=step.resource==='deploy'?step.data.items:[step.data];
    for(const item of items){
      const old=catalog.resources.flowers.find(f=>f.id===item.flower_id);
      const project=catalog.resources.projects.find(p=>p.id===old?.project_id);
      const live=db.prepare('SELECT f.name,p.id,p.name AS project FROM garden_flower f JOIN garden_project p ON p.id=f.project_id WHERE f.id=?').get(item.flower_id);
      if(!old||!project||live?.name!==old.name||live.id!==project.id||live.project!==project.name)return false;
      if(step.resource!=='deploy'){
        const table=step.resource==='bugs'?'garden_bug':'garden_improvement';
        if(db.prepare('SELECT id FROM '+table+' WHERE flower_id=? AND title=?').get(item.flower_id,item.title))return false;
      }
    }
  }
  return true;
}
export async function preparePlan(request,source,modelPath=join(gardenRepo,'src/features/garden/store.mjs'),catalog=null){
  const {createCloudStore}=await import(pathToFileURL(modelPath));
  invariant(['garden','desktop-update'].includes(request.kind),'kind 须为 garden 或 desktop-update');
  invariant(Array.isArray(request.steps)&&request.steps.length&&request.steps.length<=100,'需要有序步骤');
  invariant(typeof request.result==='string'&&request.result.trim()&&Array.isArray(request.noChanges)&&request.noChanges.every(v=>typeof v==='string'),'请说明实际结果及无需更新的类别');
  const db=new DatabaseSync(':memory:');
  try{
    const baseline=await copyGarden(source,db);
    if(Object.hasOwn(request,'baseline'))invariant(same(request.baseline,baseline)||canRefresh(request,catalog,db,baseline),'目标目录的结构或修订已变化，请重新查询并核对目标');
    const plan={format:1,id:request.id,title:request.title,kind:request.kind,release:request.release??'none',result:request.result,noChanges:request.noChanges,...baseline,steps:[]};
    if(request.continues){
      invariant(/^[a-f0-9]{64}$/.test(request.continues),'续办需要原确认摘要');
      plan.continues=request.continues;
    }
    if(plan.release!=='none'&&!plan.continues){
      const marker=':'+plan.id+']';
      for(const table of ['improvement','bug','deploy_item']){
        invariant(!db.prepare('SELECT 1 FROM garden_'+table+' WHERE instr(note,?)>0 LIMIT 1').get(marker),'花园已有此发布标记，请先查看原登记及批次回执');
      }
    }
    const newDeploys=request.steps.filter(s=>s.resource==='deploy'&&s.id==null);
    if(plan.release==='succeeded' && (!plan.continues || newDeploys.length)){
      invariant(newDeploys.length===1,'同一成功发布必须合并为一条部署，每个功能只登记一次');
      const marker='[发布成功:'+plan.id+']';
      invariant(!db.prepare('SELECT 1 FROM garden_deploy_item WHERE instr(note,?)>0 LIMIT 1').get(marker),'该发布已经登记，请查看原批次回执');
      invariant(newDeploys[0].data.items.every(i=>typeof i.note==='string'&&i.note.includes(marker)),'每条成功明细须携带本批发布成功标记 '+marker);
    }
    for(const step of request.steps){
      invariant(step&&Object.keys(step).every(k=>['label','resource','id','data'].includes(k)),'步骤仅支持 label、resource、id、data；修改须使用 id');
      invariant(Object.hasOwn(inputFields,step.resource)&&step.data&&typeof step.data==='object'&&!Array.isArray(step.data),'未知登记类型或缺少登记字段');
      invariant(Object.keys(step.data).every(k=>inputFields[step.resource].includes(k)),'包含不支持的登记字段');
      if(step.resource==='deploy')invariant(Array.isArray(step.data.items)&&step.data.items.every(item=>item&&Object.keys(item).every(k=>['flower_id','note','item_id'].includes(k))),'部署明细包含不支持的字段');
      if(Object.hasOwn(step,'id'))invariant(Number.isSafeInteger(step.id)&&step.id>0,'修改或落地须填准确的正整数编号，新增请省略 id');
      const before=snapshot(db),store=await createCloudStore(binding(db));
      if(step.resource==='land')store.land(step.id,step.data);
      else if(step.resource==='deploy'){
        const data=plan.release==='succeeded' && !step.id?{...step.data,release_key:plan.id}:step.data;
        store.deploy(data,step.id??null);
      }
      else store.mutate(step.resource,step.id??null,step.data);
      await store.commit();
      const changes=difference(before,snapshot(db)),scope=ownership(db,changes);
      if(request.kind==='desktop-update'){
        const target=scope.flowers.find(f=>f.name==='绯月（桌面精灵）');
        const project=scope.projects.find(p=>p.name==='网页角色组件');
        invariant(project&&scope.projects.length===1&&scope.flowers.length<=1&&(!scope.flowers.length||target?.project_id===project.id),'桌宠更新必须归属网页角色组件的既有绯月功能');
        const existing=db.prepare('SELECT id FROM garden_flower WHERE project_id=? AND name=?').all(project.id,'绯月（桌面精灵）');
        invariant(existing.length===1&&!changes.some(c=>c.table==='flower'&&!c.before),'桌宠功能缺失或归属不唯一');
        if(!scope.flowers.length)scope.flowers.push({id:existing[0].id,project_id:project.id,name:'绯月（桌面精灵）'});
      }
      plan.steps.push({label:step.label,scope,changes});
    }
    return validatePlan(plan);
  }finally{db.close();}
}
export async function writePackage(plan,dir){
  // Exclusive directory creation prevents overwriting a previously reviewed package.
  await mkdir(dir);
  await writeFile(join(dir,'registration.json'),JSON.stringify(plan,null,2)+'\n');
  for(let i=0;i<plan.steps.length;i++)await writeFile(join(dir,stepFile(i)),compileStep(plan,i));
  return hash(canonical(plan));
}
async function turnClient(address,request){
  invariant(batchId.test(request.id),'批次编号无效');
  const url=new URL(address);
  invariant(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.origin===address,'取号仅支持已核实的本机 HTTP 实例');
  const info=await fetch(address+'/infoguide',{redirect:'error'}).then(r=>r.json());
  invariant(info.baseURL===address&&info.version>=7,'此实例尚未支持并行取号，请核对安装版本');
  const token=(await readFile(join(info.instance.profile,'local-api.token'),'utf8')).trim();
  const draftHash=hash(canonical(request));
  async function call(action='',reviewHash,poll=false,unsealedOnly=false){
    const response=await fetch(address+'/v1/registration-turns/'+request.id+action,{
      method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({draftHash,reviewHash,poll,continues:request.continues,unsealedOnly})});
    const value=await response.json();
    invariant(response.ok,value.error||'取号失败');return value;
  }
  return call;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  const repo=args[0]==='--repo'?resolve(args.splice(0,2)[1]):gardenRepo;
  const address=args[0]==='--instance'?args.splice(0,2)[1]:'http://127.0.0.1:8765';
  const catalogFile=args[0]==='--catalog'?args.splice(0,2)[1]:null;
  const modelPath=join(repo,'src/features/garden/store.mjs'),source=remoteGarden(repo);
  if(args.length===2&&args[0]==='inspect'){
    const catalog=await inspectTargets(source,modelPath);
    await writeFile(args[1],JSON.stringify(catalog,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({file:resolve(args[1]),baseline:catalog.baseline}));
  }else if(args[0]==='cancel'&&args.length===2){
    const request=JSON.parse((await readFile(args[1],'utf8')).replace(/^\uFEFF/,''));
    console.log(JSON.stringify(await (await turnClient(address,request))('/cancel')));
  }else{
    const structured=args[0]==='prepare'&&args.length===3;
    if(structured)args.shift();
    invariant(args.length===2,'用法：[--repo 仓库] inspect 新目录文件.json | prepare 请求.json 新包目录 | 请求.json 新包目录');
    const [input,output]=args;
    const request=JSON.parse((await readFile(input,'utf8')).replace(/^\uFEFF/,''));
    if(structured)invariant(request.baseline,'请先 inspect，再复制目录的 baseline 对象制单');
    const call=(structured||['succeeded','failed'].includes(request.release))?await turnClient(address,request):null;
    if(call){
      let turn=await call();
      if(turn.state==='waiting')console.error('等待统一取号，位置 '+turn.position+'。放弃时使用 cancel 和原请求文件。');
      while(turn.state==='waiting'){await wait(1500);turn=await call('',undefined,true);}
      if(turn.state==='submitted'){console.log(JSON.stringify(turn));process.exit(0);}
      if(turn.reviewHash){
        const file=resolve(output,'registration.json');
        const saved=JSON.parse(await readFile(file,'utf8'));
        invariant(hash(canonical(saved))===turn.reviewHash,'请使用上次定稿目录，或先取消原取号');
        console.log(JSON.stringify({file,reviewHash:turn.reviewHash,id:request.id}));process.exit(0);
      }
    }
    try{
      const catalog=catalogFile?JSON.parse((await readFile(catalogFile,'utf8')).replace(/^\uFEFF/,'')):null;
      const plan=await preparePlan(request,source,modelPath,catalog);
      const reviewHash=await writePackage(plan,resolve(output));
      if(call){const sealed=await call('',reviewHash);invariant(sealed.state==='ready','此批次已提交，请查看原回执');}
      if(structured)console.log(JSON.stringify({file:resolve(output,'registration.json'),reviewHash,id:plan.id}));
      else{console.log(JSON.stringify(plan,null,2));console.log('reviewHash '+reviewHash);}
    }catch(error){
      if(call)await call('/cancel',undefined,false,true).catch(()=>console.error('取号状态待核对，请使用原编号查询或取消。'));
      throw error;
    }
  }
}
