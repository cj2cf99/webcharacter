import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {batchId,canonical,compileStep,hash,invariant,keyOf,same,schemaQuery,revisionQuery,selectRows,stepFile,targetId,validatePlan} from './garden-registration.mjs';

const execute=promisify(execFile);
export const gardenRepo='G:/cloudflare/myapp';
async function run(command,args,cwd,timeout=120000){
  const {stdout}=await execute(command,args,{cwd,windowsHide:true,timeout,maxBuffer:32*1024*1024,
    env:{...process.env,ELECTRON_RUN_AS_NODE:'1',CI:'1',WRANGLER_SEND_METRICS:'false'}});
  return stdout;
}
export function remoteGarden(repo=gardenRepo){
  async function call(args){
    const importing=args[0]==='--file';
    let raw;
    try{
      // Wrangler 的参数解析会把 Electron 的脚本路径也当成子命令。
      const node=process.versions.electron?'node':process.execPath;
      raw=await run(node,[join(repo,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','stockanalysis','--remote','--json',...args],repo);
    }catch{throw Error(importing?'Wrangler 导入命令未正常返回，请按原批次核对本步写入结果':'Wrangler 查询失败，请检查本机连接与授权，再恢复原批次');}
    // 远端文件导入即使带 --json，也会在 stdout 的 JSON 前输出树形上传进度。
    const json=importing?raw.trimStart().replace(/^(?:[├│][^\r\n]*\r?\n)+/u,''):raw;
    let result;
    try{result=JSON.parse(json);}catch{throw Error(importing?'无法解析 D1 导入回执，请按原批次核对写入结果':'无法解析 D1 查询回执');}
    invariant(Array.isArray(result)&&result.length&&result.every(part=>part?.success===true),'D1 回执未确认成功');
    return result[0].results??[];
  }
  return {
    read:sql=>call(['--command',sql]),
    async write(sql){
      const dir=await mkdtemp(join(tmpdir(),'feiyue-garden-'));
      try{const file=join(dir,'step.sql');await writeFile(file,sql,{mode:0o600});await call(['--file',file,'--yes']);}
      finally{await rm(dir,{recursive:true,force:true});}
    },
  };
}
// Only a package in the local integration repository's checked-in history can be executed.
export async function loadPackage({id,commit,reviewHash,userConfirmed},repo=gardenRepo){
  invariant(userConfirmed===true&&typeof id==='string'&&batchId.test(id)&&/^[a-f0-9]{40}$/.test(commit)&&/^[a-f0-9]{64}$/.test(reviewHash),'需要已明确确认的清单编号、Git 提交和摘要');
  const prefix='database/changes/'+id+'/';
  const git=async args=>{
    try{return await run('git',['-C',repo,...args],repo,15000);}
    catch{throw Error('审核包未提交、路径不符或提交不属于当前发布历史');}
  };
  await git(['merge-base','--is-ancestor',commit,'HEAD']);
  // 主项目也可能位于 Git 工作树的子目录；使用 git -C 指定的项目作为基准。
  const read=name=>git(['show',commit+':./'+prefix+name]);
  const plan=validatePlan(JSON.parse(await read('registration.json')));
  invariant(plan.id===id&&hash(canonical(plan))===reviewHash,'已确认清单摘要不匹配');
  for(let i=0;i<plan.steps.length;i++){
    const sql=(await read(stepFile(i))).replaceAll('\r\n','\n');
    invariant(sql===compileStep(plan,i),'已提交 SQL 与已确认的字段或顺序不符');
  }
  return plan;
}
export async function inspectGarden(db,plan,changes,scope=[]){
  const getRev=async()=> (await db.read(revisionQuery))[0]?.revision;
  const revision=await getRev();
  invariant(hash(canonical(await db.read(schemaQuery)))===plan.schemaHash,'花园结构已变化，需要重新核对清单');
  const rows=new Map();
  const all=new Map([...scope,...changes].map(c=>[targetId(c),c]));
  for(const table of new Set([...all.values()].map(c=>c.table))){
    const targets=[...all.values()].filter(c=>c.table===table);
    for(let offset=0;offset<targets.length;offset+=50){
      const keys=targets.slice(offset,offset+50).map(c=>keyOf(table,c.before??c.after));
      for(const row of await db.read(selectRows(table,keys)))rows.set(targetId({table,after:row}),row);
    }
  }
  invariant(await getRev()===revision,'读取期间花园已变化，请重新核对');
  const ownersMatch=scope.every(s=>changes.some(c=>targetId(c)===targetId(s))||
    Object.entries(s.after).every(([k,v])=>rows.get(targetId(s))?.[k]===v));
  const match=side=>ownersMatch&&changes.every(c=>same(rows.get(targetId(c))??null,c[side]));
  return {revision,before:match('before'),after:match('after')};
}

