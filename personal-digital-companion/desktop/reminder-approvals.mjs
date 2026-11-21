import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {tokyoDay} from './conversation-history.mjs';
import {parseReminderCommand,proposal} from './reminder-command.mjs';

const lifetime=60*60*1000;
export function createReminderApprovals({profile,safeStorage,request,now=Date.now,onChange=()=>{}}) {
  const db=new DatabaseSync(join(profile,'reminder-approvals.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,expires INTEGER NOT NULL,data BLOB NOT NULL)');
  let queue=Promise.resolve(),timer,closed=false;
  let pausing=false;
  const unconfirmed=new Map();
  function serial(run) {
    if(pausing)return Promise.reject(Error('绯月正在准备重启。'));
    const job=queue.then(()=>{if(closed)throw Error('绯月已关闭。');return run();});
    queue=job.catch(()=>{});
    return job;
  }
  function expire(){
    clearTimeout(timer);
    const {changes}=db.prepare('DELETE FROM drafts WHERE expires<=?').run(now());
    const next=db.prepare('SELECT MIN(expires) AS expires FROM drafts').get().expires;
    if(next!=null){timer=setTimeout(()=>{if(!closed)expire();},Math.max(1,next-now()));timer.unref?.();}
    if(changes)onChange();
  }
  expire();
  async function save(draft){
    const bytes=await safeStorage.encryptStringAsync(JSON.stringify(draft));
    if(draft.expires<=now())throw Error('本次选择已到期。');
    db.prepare('INSERT INTO drafts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(draft.id,draft.expires,bytes);
    expire();onChange();
  }
  async function read(){
    expire();
    const records=db.prepare('SELECT data FROM drafts ORDER BY rowid').all();
    const values=await Promise.all(records.map(async row=>JSON.parse((await safeStorage.decryptStringAsync(Buffer.from(row.data))).result)));
    return values.filter(d=>d.expires>now());
  }
  async function post(suffix,body,signal){
    if(!request)throw Error('请先连接绯月提醒服务。');
    const response=await request('/api/reminder-edits'+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data)throw Object.assign(Error(data?.error?.message??'提醒服务暂不可用，请稍后查询核对。'),{status:response.status});
    return data;
  }
  function preview(drafts){
    const choices=[],ready=[],rows=new Map();
    for(const draft of drafts){
      if(!draft.entries){choices.push({id:draft.id,expires:draft.expires,question:draft.question,
        candidates:draft.candidates.map(({id,title,deadline,content,locked})=>({id,title,deadline,content,locked}))});continue;}
      ready.push(draft);
      for(const entry of draft.entries){
        let row=rows.get(entry.id);
        if(!row){row={base:entry,changes:{},expires:draft.expires};rows.set(entry.id,row);}
        row.expires=Math.min(row.expires,draft.expires);
        // 同一事项来自不同快照时要求重新查询，不能把旧预览套到新版本。
        if(row.base.version!==entry.version)row.conflict=true;
        Object.assign(row.changes,draft.changes);
      }
    }
    const token=ready.map(d=>d.id).join('/');
    const entries=[...rows.values()].map(r=>({...proposal(r.base,r.changes),expires:r.expires,conflict:r.conflict}));
    return {choices,token,entries,expires:ready.length?Math.min(...ready.map(d=>d.expires)):null};
  }
  function selectEntries(draft,ids){
    if(!Array.isArray(ids)||!ids.length||ids.some(id=>!draft.candidates.some(r=>r.id===id&&!r.locked)))throw Error('请选一个或多个可修改的事项。');
    const entries=draft.candidates.filter(r=>ids.includes(r.id)&&proposal(r,draft.changes).diff.length);
    if(!entries.length)throw Error('所选事项已是目标值。');
    return {id:draft.id,expires:draft.expires,changes:draft.changes,entries};
  }
  function remove(ids){
    const stmt=db.prepare('DELETE FROM drafts WHERE id=?');
    db.exec('BEGIN IMMEDIATE');
    try{for(const id of ids)stmt.run(id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    expire();onChange();
  }
  db.exec('CREATE TABLE IF NOT EXISTS restart_edits (id TEXT PRIMARY KEY, data BLOB NOT NULL)');
  async function runApproved(entry){
    const name='#'+entry.id+' '+entry.title;
    if(entry.conflict||entry.expires<=now())return name+'：清单已过期或版本冲突，请重新查询。';
    try {
      const result=await post('/'+entry.id,{patch:entry.patch,version:entry.version,expiresAt:entry.expires});
      if(result.accepted===true){unconfirmed.delete(entry.id);return name+'：已更新\n'+entry.diff.join('\n');}
      unconfirmed.set(entry.id,entry.patch);return name+'：结果待核对';
    }catch(error){if(!(error.status>=400&&error.status<500))unconfirmed.set(entry.id,entry.patch);return name+'：'+error.message+' 请查询核对。';}
  }
  function resumePaused(){
    return serial(async()=>{
      for(const row of db.prepare('SELECT id,data FROM restart_edits ORDER BY rowid').all()){
        const {result}=await safeStorage.decryptStringAsync(Buffer.from(row.data));
        if(pausing)break;
        // 已发送的修改不能自动重放；请求仍带原有效期与版本。
        db.prepare('DELETE FROM restart_edits WHERE id=?').run(row.id);
        await runApproved(JSON.parse(result));
        if(unconfirmed.size)throw Error('恢复的提醒修改结果待核对。');
      }
    });
  }
  function verifyEdits(items){
    for(const row of items){
      const patch=unconfirmed.get(row.id);
      if(patch && Object.entries(patch).every(([key,value])=>JSON.stringify(row[key])===JSON.stringify(value)))unconfirmed.delete(row.id);
    }
  }
  return {
    resumePaused,
    async drainForRestart(){
      pausing=true;
      await queue;
      for(const id of unconfirmed.keys()){
        const result=await post('',{id});
        verifyEdits(result.items);
      }
      if(unconfirmed.size)throw Error('提醒修改的回执待核对，请查询提醒 #'+[...unconfirmed.keys()].join('、#')+'。');
    },
    cancelRestart(){pausing=false;},
    hasPending(){return Boolean(db.prepare('SELECT 1 FROM drafts WHERE expires>? LIMIT 1').get(now()));},
    view:()=>serial(async()=>preview(await read())),
    submit:(question,signal,planCommand)=>serial(async()=>{
      const today=tokyoDay(now());
      let parsed;
      try{parsed=parseReminderCommand(question,today);}
      catch(error){
        if(!planCommand)throw error;
        const plan=await planCommand(question,today,error.message);
        signal?.throwIfAborted();
        if(plan.question)return plan.question;
        parsed=parseReminderCommand(plan.command,today);
      }
      const {filter,changes}=parsed;
      const {items}=await post('',filter,signal);
      signal?.throwIfAborted();
      verifyEdits(items);
      if(!items.length)return '没有找到匹配的未完成提醒。';
      if(!changes)return items.map(row=>['#'+row.id+' '+row.title,row.deadline||'无截止日期',row.content,row.recurrenceText,row.locked].filter(Boolean).join(' · ')).join('\n');
      if(!items.some(r=>!r.locked))return '匹配的提醒由来源模块管理，无法在这里修改。';
      const draft={id:crypto.randomUUID(),expires:now()+lifetime,question,changes,candidates:items};
      await save(items.length===1?selectEntries(draft,[items[0].id]):draft);
      return items.length===1?'已准备修改方案，请在「待确认」查看并决定。':'找到 '+items.length+' 项。请在「待确认」选择一个或多个事项。';
    }),
    decide:input=>serial(async()=>{
      const drafts=await read();
      if(input.action==='select'||input.action==='dismiss'){
        const draft=drafts.find(d=>d.id===input.id&&!d.entries);
        if(!draft)throw Error('选择已到期或已处理。');
        if(input.action==='dismiss')remove([draft.id]);
        else await save(selectEntries(draft,input.ids));
        return input.action==='select'?'已整理修改方案，请核对后决定。':'已放弃本次选择。';
      }
      const group=preview(drafts);
      if(!group.token||group.token!==input.token)throw Error('待确认清单已变化，请查看最新方案。');
      if(!['approve','reject'].includes(input.action))throw Error('请选择同意或放弃。');
      const ids=drafts.filter(d=>d.entries).map(d=>d.id);
      if(input.action==='reject'){remove(ids);return '已放弃本组修改。';}
      // 先消费显式同意。双击或进程重启都不会自动重放不确定的写入。
      remove(ids);
      const results=[];
      for(const entry of group.entries){
        if(pausing){
          const bytes=await safeStorage.encryptStringAsync(JSON.stringify(entry));
          db.prepare('INSERT INTO restart_edits VALUES(?,?)').run(crypto.randomUUID(),bytes);
          results.push('#'+entry.id+'：已排入重启后的任务');
        }else results.push(await runApproved(entry));
      }
      return results.join('\n');
    }),
    close(){clearTimeout(timer);closed=true;void queue.finally(()=>{clearTimeout(timer);db.close();});},
  };
}
