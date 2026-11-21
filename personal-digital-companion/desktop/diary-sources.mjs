const labels={journal:'你的日记',deploy:'花园部署',paylog:'当日消费'};

export async function readDiarySources(api,day,signal){
  const items=[],errors=[];
  for(const [kind,label] of Object.entries(labels)){
    let cursor='',incomplete=false;
    const seen=new Set(),ids=new Set();
    try{
      do{
        const paylog=kind==='paylog';
        const query=new URLSearchParams(paylog?{from:day,to:day,cursor}:{kind,day,after:cursor||'0'});
        const page=await api((paylog?'expenses?':'sources?')+query,undefined,signal);
        if(!Array.isArray(page.records))throw Error('资料格式错误');
        if(paylog&&page.complete!==true)incomplete=true;
        for(const r of page.records){
          if(!r.id||ids.has(r.id))continue;
          ids.add(r.id);
          let content,at,fields;
          if(paylog){
            if(r.spendDate!==day)continue;
            if(r.amount==null||!Number.isFinite(Number(r.amount)))throw Error('消费金额缺失');
            at=Date.parse(day+'T00:00:00+09:00');
            content=[r.merchant,r.description,r.category,r.amount+' 日元',r.sourceMissing?'同步快照保留，原记录已缺失':''].filter(Boolean).join(' · ');
          }else{
            at=Date.parse(r.at);
            if(!Number.isFinite(at)||new Date(at+9*3600000).toISOString().slice(0,10)!==day)throw Error('资料日期异常');
            content=kind==='journal'?[r.title,r.content].filter(Boolean).join('\n'):
              [r.project,r.feature,r.version_before&&r.version_after&&r.version_before+' → '+r.version_after,r.note].filter(Boolean).join(' · ');
          }
          const values=kind==='journal'?[['标题',r.title],['正文',r.content]]:
            kind==='deploy'?[['项目',r.project],['功能',r.feature],['版本',r.version_before&&r.version_after&&r.version_before+' → '+r.version_after],['发布说明',r.note]]:
              [['商户',r.merchant],['说明',r.description],['类别',r.category],['金额',r.amount+' 日元'],['来源状态',r.sourceMissing?'同步快照保留，原记录已缺失':'']];
          if(content.length>500)fields=values;
          if(content.trim())items.push({...fields&&{fields},source:kind+':'+r.id,at,content,label});
        }
        cursor=page.nextCursor||'';
        if(cursor&&seen.has(cursor))throw Error('分页游标重复');
        seen.add(cursor);
      }while(cursor);
      if(incomplete)errors.push(label+'的同步范围未覆盖该日');
    }catch(error){signal.throwIfAborted();errors.push(label+'读取失败（'+error.message+'）');}
  }
  return {items,errors};
}
