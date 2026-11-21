// 私有桌宠 RPC 复用主站 GET /api/v1/expenses 的 handler 和快照分页。
export async function memoryExpenses(env,{from,to,cursor},{createContext,configuredOwners,getExpenses}){
  const validDay=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&new Date(s+'T12:00Z').toJSON()?.startsWith(s);
  if(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>14*86400000||
    cursor!=null&&(typeof cursor!=='string'||cursor.length>8000))throw Error('消费查询区间无效');
  const context=createContext(env),owners=await configuredOwners(context.cfg);
  if(owners.length!==1)throw Error('未确定绯月所属的消费账户');
  const url=new URL('https://companion.internal/api/v1/expenses');
  url.search=new URLSearchParams({from,to,limit:'100',...(cursor?{cursor}:{})});
  const {data}=await getExpenses(context.with({owner:owners[0]}),new Request(url),null,url);
  return {records:data.records,nextCursor:data.nextCursor,complete:data.coverage.complete};
}
