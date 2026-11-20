// 供桌宠私有 RPC 读取单个东京日期。个人日记与绯月生成的手记分库存放。
export async function memorySources(env,{kind,day,after='0'}){
  const start=Date.parse(day+'T00:00:00+09:00');
  if(typeof day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(day)||!Number.isFinite(start)||
    new Date(start+9*3600000).toISOString().slice(0,10)!==day||
    !['journal','deploy'].includes(kind)||!/^\d+$/.test(after)||!Number.isSafeInteger(Number(after)))throw Error('日记来源参数无效');
  const journal=kind==='journal';
  const sql=journal
    ? 'SELECT seq AS id,regDatetime AS at,title,content FROM diaries WHERE seq>? AND julianday(regDatetime)>=julianday(?) AND julianday(regDatetime)<julianday(?) ORDER BY seq LIMIT 21'
    : `SELECT i.id,d.deployed_at AS at,p.name AS project,i.flower_name AS feature,i.version_before,i.version_after,i.note
       FROM garden_deploy_item i JOIN garden_deploy d ON d.id=i.deploy_id LEFT JOIN garden_project p ON p.id=i.project_id
       WHERE i.id>? AND julianday(d.deployed_at)>=julianday(?) AND julianday(d.deployed_at)<julianday(?) ORDER BY i.id LIMIT 21`;
  const {results}=await env.mymaindb.prepare(sql).bind(Number(after),new Date(start).toISOString(),new Date(start+86400000).toISOString()).all();
  const records=results.slice(0,20);
  return {records,nextCursor:results.length>20?String(records.at(-1).id):null};
}
