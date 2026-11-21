// 独立调用方。它只使用 Node 标准库和实际 HTTP 说明；cwd 是自己的空白临时目录。
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

const [address,mode,message]=process.argv.slice(2);
const guide=await (await fetch(address)).json();
const {firstUse,instance}=guide;
assert.equal(instance.pid,process.ppid);
assert.equal(guide.baseURL,address);
assert.equal(new URL(address).hostname,'127.0.0.1');
assert.notEqual(new URL(address).port,'8765');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const save=(file,data)=>writeFileSync(file,JSON.stringify(data),{flag:'wx'});
const paths={catalogFile:resolve('catalog.json'),requestFile:resolve('request.json'),draftDir:resolve('draft')};
const run=(key,values)=>{
  const {command,args,cwd}=firstUse.commands[key];
  const argv=args.map(arg=>arg.replace(/\{(\w+)\}/g,(_,name)=>{assert.ok(values[name]);return values[name];}));
  if(command==='npm.cmd'&&process.platform==='win32'){
    assert.deepEqual(argv,['run','db:sync-schema']);
    return execFileSync('cmd.exe',['/d','/c','npm.cmd run db:sync-schema'],{cwd,encoding:'utf8',windowsHide:true});
  }
  return execFileSync(command==='npm.cmd'?'npm':command,argv,{cwd,encoding:'utf8',windowsHide:true});
};
const auth=firstUse.authentication;
const token=readFileSync(join(instance.profile,auth.fileRelativeToVerifiedProfile),auth.encoding).trim();
const headers={[auth.header]:auth.scheme+' '+token,'Content-Type':guide.contentType};
const endpoint=(method,path)=>address+guide.routes.find(r=>r.method===method&&r.path===path).path;
if(mode==='preview'){
  const intent=JSON.parse(message),batchId='isolated-first-release';
  run('sync',paths);
  run('inspect',paths);
  const {resources,baseline}=read(paths.catalogFile);
  const projects=resources.projects.filter(p=>p.name===intent.project);
  assert.equal(projects.length,1);
  assert.equal(resources.flowers.filter(f=>f.name===intent.flower).length,2);
  const flowers=resources.flowers.filter(f=>f.project_id===projects[0].id&&f.name===intent.flower);
  assert.equal(flowers.length,1);
  const [flower]=flowers;
  assert.ok(resources.deploy.flatMap(d=>d.items).some(i=>i.flower_id===flower.id));
  assert.equal(resources.improvements.filter(i=>i.flower_id===flower.id&&i.title===intent.update).length,0);
  const request={...guide.firstUse.requestTemplate,id:batchId,title:intent.update,result:intent.result,baseline,noChanges:['种子、Bug、项目、功能及其他配置'],steps:[
    {resource:'improvements',label:'登记改善',data:{title:intent.update,flower_id:flower.id,status:'done'}},
    {resource:'deploy',label:'登记部署',data:{deployed_at:intent.time,items:[{flower_id:flower.id,note:'[发布成功:'+batchId+'] '+intent.update}]}},
  ]};
  save(paths.requestFile,request);
  const receipt=JSON.parse(run('prepare',paths));
  save('preview.json',receipt);
  console.log(JSON.stringify({receipt,plan:read(receipt.file)}));
}else if(mode==='confirmed'){
  const {id,reviewHash,file}=read('preview.json');
  assert.equal(message,reviewHash,'隔离验收方应逐项核对并明确返回对应摘要');
  const to=join(firstUse.packageRoot,id);
  mkdirSync(firstUse.packageRoot,{recursive:true});
  cpSync(paths.draftDir,to,{recursive:true,errorOnExist:true,force:false});
  assert.deepEqual(read(join(to,'registration.json')),read(file));
  run('stage',{id});run('commit',{id});
  const commit=run('readCommit',{id}).trim();
  const url=endpoint('POST','/v1/batches'),getURL=endpoint('GET','/v1/batches/:id').replace(':id',id);
  const body=JSON.stringify({id,commit,reviewHash,userConfirmed:true});
  const post=()=>fetch(url,{method:'POST',headers,body});
  assert.equal((await post()).status,202);
  let receipt;
  for(let attempt=0;attempt<200;attempt++){
    receipt=await (await fetch(getURL,{headers})).json();
    if(['done','blocked'].includes(receipt.state))break;
    await wait(25);
  }
  assert.equal(receipt.state,'done',receipt.error);
  assert.equal(receipt.reviewHash,reviewHash);
  const replay=await post();assert.equal(replay.status,200);assert.equal((await replay.json()).existing,true);
  console.log(JSON.stringify(receipt));
}else throw Error('未知演练阶段');
