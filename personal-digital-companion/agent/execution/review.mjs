// 从执行器的原始尝试生成时间线，同时收录有本地操作或云端回执的事件。
const labels = {title:'标题', body:'内容', content:'内容', reflection:'感想', deadline:'截止', drive:'磁盘',
  message:'说明', text:'文本', name:'名称', count:'数量', record_id:'记录编号', category_id:'分类', value:'值'};

function describe(value, depth=0) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(item=>describe(item,depth+1)).filter(Boolean).join('、');
  return Object.entries(value).filter(([key])=> !/token|password|secret|credential|auth|api.?key|cookie/i.test(key))
    .map(([key,item])=>{
      const detail=describe(item,depth+1);
      return detail ? (labels[key]??key)+'：'+detail : '';
    }).filter(Boolean).join(depth?'，':'\n');
}

export function taskReview(db,{readOnly=false,onChange}={}) {
  if(!readOnly)db.exec(`CREATE TABLE IF NOT EXISTS task_review_events (
    event_key TEXT PRIMARY KEY, at TEXT NOT NULL, task_id TEXT NOT NULL,
    title TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS task_review_time ON task_review_events(at);
  CREATE INDEX IF NOT EXISTS executions_start_time ON executions(started_at);
  CREATE INDEX IF NOT EXISTS executions_finish_time ON executions(finished_at);`);
  const insert=db.prepare('INSERT INTO task_review_events(event_key,at,task_id,title,action,detail) VALUES(?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING');
  const attempts=db.prepare(`SELECT e.*,t.params_json,m.name FROM executions e
    JOIN local_tasks t USING(task_id) JOIN local_task_metadata m USING(task_id)
    WHERE (started_at>=? AND started_at<?) OR (finished_at>=? AND finished_at<?)`);
  const events=db.prepare('SELECT at,task_id,title,action,detail FROM task_review_events WHERE at>=? AND at<? ORDER BY at,rowid');
  function record({key,taskId,title,action,detail='',at=new Date().toISOString()}) {
    if(insert.run(key,at,taskId,title,action,detail).changes)onChange?.(at);
  }
  function read(day) {
    if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('东京日期无效');
    const start=Date.parse(day+'T00:00:00+09:00');
    const from=new Date(start).toISOString(), to=new Date(start+86400000).toISOString();
    const rows=[];
    for(const item of attempts.all(from,to,from,to)){
      const base={task_id:item.task_id,title:item.name}, prefix='第 '+item.attempt_no+' 次';
      if(item.started_at>=from&&item.started_at<to)rows.push({...base,at:item.started_at,action:prefix+'开始执行',
        detail:[describe(JSON.parse(item.params_json)),!item.finished_at?'尚无最终执行结果。':''].filter(Boolean).join('\n')});
      if(item.finished_at>=from&&item.finished_at<to)rows.push({...base,at:item.finished_at,
        action:prefix+(item.status==='COMPLETED'?'执行成功':'执行失败'),
        detail:item.error??describe(JSON.parse(item.result_json))});
    }
    rows.push(...events.all(from,to));
    return rows.map(row=>({...row,at:Date.parse(row.at)})).sort((a,b)=>a.at-b.at);
  }
  return {record,read};
}
