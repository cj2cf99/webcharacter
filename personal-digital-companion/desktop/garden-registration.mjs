import {createHash} from 'node:crypto';

export const tables = ['project','flower','seed','improvement','bug','project_relation','platform',
  'platform_feature','link','data_source','data_source_flower','deploy','deploy_item'];
export const inputFields={
  projects:['name','kind','created_at','path','repo_url','site_url','docs','stack'],
  flowers:['project_id','name','type','stage','done_at'],seeds:['project_id','title','status'],
  improvements:['flower_id','title','status','note'],bugs:['flower_id','title','severe','status','note'],
  relations:['project_a','project_b','type','note','home_data'],platforms:['name','abbr'],
  features:['platform_id','name','abbr','sort_order'],links:['flower_id','feature_id','status'],
  sources:['name','abbr','runner_platform_id','runner_project_id','from_flower_id','collect','relay','display','content','freq','status','note','flower_ids'],
  land:['name','type'],deploy:['deployed_at','items'],
};
export const batchId = /^[a-z0-9][a-z0-9_-]{0,79}$/;
export const hash = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export const same = (left,right)=>canonical(left)===canonical(right);
export function invariant(ok,message) { if(!ok) throw Error(message); }
const columns=row=>Object.keys(row);
const col=name=>{
  invariant(/^[a-z][a-z0-9_]*$/.test(name),'字段名称无效');
  return '"'+name+'"';
};
function literal(value) {
  if(value===null) return 'NULL';
  if(typeof value==='number' && Number.isFinite(value)) return String(value);
  invariant(typeof value==='string'&&!value.includes('\0'),'花园字段值无效');
  // Windows Git 可能归一化 SQL 文件换行；业务字段中的 CR 必须原样保留。
  if(value.includes('\r'))return "CAST(X'"+Buffer.from(value,'utf8').toString('hex')+"' AS TEXT)";
  return "'"+value.replaceAll("'","''")+"'";
}
export function keyOf(table,row){
  const names=table==='data_source_flower'?['source_id','flower_id']:['id'];
  return Object.fromEntries(names.map(name=>{
    invariant(Number.isSafeInteger(row[name])&&row[name]>0,'花园目标缺少准确编号');
    return [name,row[name]];
  }));
}
const where=row=>columns(row).map(name=>col(name)+' IS '+literal(row[name])).join(' AND ');
export const targetId=c=>c.table+':'+canonical(keyOf(c.table,c.before??c.after));
export const stepFile=i=>'step-'+String(i+1).padStart(3,'0')+'.sql';
export function validatePlan(plan) {
  invariant(plan?.format===1&&typeof plan.id==='string'&&batchId.test(plan.id)&&typeof plan.title==='string'&&plan.title.trim()&&plan.title.length<=200,'清单编号、版本或名称无效');
  invariant(Number.isSafeInteger(plan.revision)&&plan.revision>=0&&/^[a-f0-9]{64}$/.test(plan.schemaHash),'清单缺少结构或数据基线');
  invariant(['garden','desktop-update'].includes(plan.kind)&&typeof plan.result==='string'&&plan.result.trim()&&Array.isArray(plan.noChanges)&&plan.noChanges.every(v=>typeof v==='string'),'缺少实际结果或无需更新项');
  invariant(['succeeded','failed','none'].includes(plan.release??'none')&&(plan.kind!=='desktop-update'||['succeeded','failed'].includes(plan.release)),'请提供实际发布结果');
  invariant(Array.isArray(plan.steps)&&plan.steps.length>0&&plan.steps.length<=100,'每批需要 1 至 100 个步骤');
  const latest=new Map();
  for(const step of plan.steps){
    invariant(typeof step.label==='string'&&step.label.trim()&&step.label.length<=240&&Array.isArray(step.changes)&&step.changes.length&&step.changes.length<=300,'步骤内容无效');
    invariant(Array.isArray(step.scope?.projects)&&Array.isArray(step.scope?.flowers),'缺少归属信息');
    for(const entry of scopeTargets(step)) {
      keyOf(entry.table,entry.after);
      invariant(typeof entry.after.name==='string'&&entry.after.name.length,'归属名称无效');
    }
    if(plan.kind==='desktop-update'){
      const [p]=step.scope.projects,[f]=step.scope.flowers;
      invariant(step.scope.projects.length===1&&step.scope.flowers.length===1&&p.name==='网页角色组件'&&f.name==='绯月（桌面精灵）'&&f.project_id===p.id,'桌宠更新归属不符');
      for(const c of step.changes){
        invariant(['project','flower','seed','improvement','bug','deploy','deploy_item'].includes(c.table),'桌宠登记超出项目范围');
        for(const r of [c.before,c.after].filter(Boolean)){
          invariant((c.table!=='project'||r.id===p.id)&&(c.table!=='flower'||r.id===f.id)&&
            (r.project_id==null||r.project_id===p.id)&&(r.flower_id==null||r.flower_id===f.id),'桌宠登记目标与清单归属不符');
        }
        if(c.table==='deploy')invariant(step.changes.some(item=>item.table==='deploy_item'&&item.after?.deploy_id===(c.after??c.before).id),'部署缺少对应的绯月明细');
      }
    }
    const seen=new Set();
    for(const c of step.changes){
      if(plan.release==='failed')invariant(!['deploy','deploy_item'].includes(c.table),'失败发布不能生成成功部署或版本');
      invariant(tables.includes(c.table)&&Object.hasOwn(c,'before')&&Object.hasOwn(c,'after')&&!same(c.before,c.after),'无效或重复的花园变更');
      invariant(c.after!==null||['data_source_flower','deploy_item'].includes(c.table),'登记不能删除主记录');
      for(const row of [c.before,c.after].filter(r=>r!==null)){
        invariant(row&&typeof row==='object'&&!Array.isArray(row),'花园行无效');
        for(const [k,v] of Object.entries(row)){col(k);literal(v);}
        keyOf(c.table,row);
      }
      if(c.before&&c.after)invariant(same(keyOf(c.table,c.before),keyOf(c.table,c.after))&&same(columns(c.before).sort(),columns(c.after).sort()),'不能改变主键或省略前后字段');
      const id=targetId(c);
      invariant(!seen.has(id)&&(!latest.has(id)||same(c.before,latest.get(id))),'同一目标的连续变更不一致');
      seen.add(id);latest.set(id,c.after);
    }
  }
  if(plan.release==='failed')invariant(plan.steps.some(step=>step.changes.some(c=>c.after?.note?.includes('[发布中:'))),'失败登记需保留发布中标记及实际原因');
  return plan;
}
function matches(c,row) {
  const scope=where(row??keyOf(c.table,c.before??c.after));
  return (row?'':'NOT ')+'EXISTS(SELECT 1 FROM garden_'+c.table+' WHERE '+scope+')';
}
// A failed guard violates garden_revision's id/revision CHECK and rolls back the D1 import.
const guard=condition=>'INSERT INTO garden_revision(id,revision) SELECT 1,-1 WHERE NOT COALESCE(('+condition+'),0);';
export function scopeTargets(step){
  return [...step.scope.projects.map(({id,name})=>({table:'project',after:{id,name}})),
    ...step.scope.flowers.map(({id,project_id,name})=>({table:'flower',after:{id,project_id,name}}))];
}
export function compileStep(plan,i){
  const rev=plan.revision+i, changes=plan.steps[i].changes;
  const sql=[guard('EXISTS(SELECT 1 FROM garden_revision WHERE id=1 AND revision='+rev+')')];
  for(const s of scopeTargets(plan.steps[i]))if(!changes.some(c=>targetId(c)===targetId(s)))sql.push(guard(matches(s,s.after)));
  for(const c of changes)sql.push(guard("(SELECT count(*) FROM pragma_table_info('garden_"+c.table+"'))="+columns(c.after??c.before).length));
  for(const c of changes)sql.push(guard(matches(c,c.before)));
  for(const c of changes){
    const table='garden_'+c.table, key=where(keyOf(c.table,c.after??c.before));
    if(!c.after)sql.push('DELETE FROM '+table+' WHERE '+key+';');
    else if(!c.before)sql.push('INSERT INTO '+table+'('+columns(c.after).map(col).join(',')+') VALUES('+Object.values(c.after).map(literal).join(',')+');');
    else{
      const fields=columns(c.after).filter(k=>!same(c.before[k],c.after[k]));
      sql.push('UPDATE '+table+' SET '+fields.map(k=>col(k)+'='+literal(c.after[k])).join(',')+' WHERE '+key+';');
    }
  }
  for(const c of changes)sql.push(guard(matches(c,c.after)));
  sql.push('UPDATE garden_revision SET revision='+String(rev+1)+' WHERE id=1 AND revision='+rev+';');
  return sql.join('\n')+'\n';
}
export function effectiveChanges(plan){
  const changes=new Map();
  for(const step of plan.steps)for(const c of step.changes)changes.set(targetId(c),c);
  return [...changes.values()];
}
export const schemaQuery="SELECT type,name,sql FROM sqlite_schema WHERE substr(tbl_name,1,7)='garden_' AND sql IS NOT NULL ORDER BY type,name";
export const revisionQuery='SELECT revision FROM garden_revision WHERE id=1';
export function selectRows(table,keys){
  invariant(tables.includes(table),'未知花园目标');
  return 'SELECT * FROM garden_'+table+' WHERE '+keys.map(k=>'('+where(k)+')').join(' OR ');
}

