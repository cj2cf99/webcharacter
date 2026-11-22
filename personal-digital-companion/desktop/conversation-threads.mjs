import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {tokyoDay} from './conversation-history.mjs';

export const closingMessage='这条线已经聊了很久啦。我先把它收好，我们换个话题吧。';
export const endsConversation=text=>/^(?:(?:绯月|老公)[，, ]*)?(?:这(?:个)?话题(?:就)?到此为止|这件事到此为止|结束(?:本次|这条|这个)?(?:对话|聊天|追问)|不想再聊这个|不聊这个了|聊到这里就结束)[。！! ]*$/u.test(text);
const ordinaryPurpose='理解你的意思并回应当前话题';
const dayPattern=/^\d{4}-\d{2}-\d{2}$/u;
const size=6;

export function createConversationThreads(profile,safeStorage,now=Date.now){
  const db=new DatabaseSync(join(profile,'conversations.sqlite'));
  db.exec(`PRAGMA busy_timeout=1500;
    CREATE TABLE IF NOT EXISTS conversation_lines (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, at INTEGER NOT NULL, latest INTEGER NOT NULL,
      rounds INTEGER NOT NULL DEFAULT 0, closed INTEGER, pending INTEGER NOT NULL DEFAULT 0,
      failure BLOB, preview BLOB, payload BLOB NOT NULL, summary BLOB, reference BLOB
    );
    CREATE INDEX IF NOT EXISTS conversation_lines_open ON conversation_lines(kind,closed,latest);
    CREATE TABLE IF NOT EXISTS conversation_messages (
      seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, thread TEXT NOT NULL, at INTEGER NOT NULL,
      day TEXT NOT NULL, who TEXT NOT NULL, answered INTEGER NOT NULL DEFAULT 0, organize INTEGER NOT NULL DEFAULT 0,
      payload BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversation_messages_line ON conversation_messages(thread,seq);
    CREATE INDEX IF NOT EXISTS conversation_messages_day ON conversation_messages(day,thread);
    CREATE INDEX IF NOT EXISTS conversation_messages_organize ON conversation_messages(organize,thread,seq);
    CREATE TABLE IF NOT EXISTS conversation_organization (
      id TEXT PRIMARY KEY, thread TEXT NOT NULL UNIQUE, first INTEGER NOT NULL, last INTEGER NOT NULL, at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_overdue (message TEXT PRIMARY KEY);`);
  const encode=value=>safeStorage.encryptString(JSON.stringify(value));
  const decode=value=>value==null?null:JSON.parse(safeStorage.decryptString(Buffer.from(value)));
  const row=db.prepare('SELECT * FROM conversation_lines WHERE id=?');
  const newLine=db.prepare('INSERT OR IGNORE INTO conversation_lines(id,kind,at,latest,payload) VALUES(?,?,?,?,?)');
  const add=db.prepare('INSERT INTO conversation_messages(id,thread,at,day,who,answered,organize,payload) VALUES(?,?,?,?,?,?,?,?)');
  const messages=db.prepare('SELECT * FROM conversation_messages WHERE thread=? ORDER BY seq');
  const recent=db.prepare('SELECT * FROM conversation_messages WHERE thread=? ORDER BY seq DESC LIMIT ?');
  const unanswered=db.prepare("SELECT * FROM conversation_messages WHERE thread=? AND who='你' AND answered=0 ORDER BY seq");
  const update=db.prepare('UPDATE conversation_lines SET latest=max(latest,?),preview=?,pending=pending+?,failure=NULL WHERE id=?');
  const markAnswered=db.prepare('UPDATE conversation_messages SET answered=1 WHERE thread=? AND id=? AND answered=0');
  const end=db.prepare('UPDATE conversation_lines SET closed=?,payload=? WHERE id=? AND closed IS NULL');
  const setRounds=db.prepare('UPDATE conversation_lines SET rounds=rounds+?,pending=pending-? WHERE id=?');
  const failure=db.prepare('UPDATE conversation_lines SET failure=? WHERE id=? AND pending>0 AND closed IS NULL');
  const operation=db.prepare('SELECT * FROM conversation_organization WHERE thread=?');
  const pendingOrganization=db.prepare('SELECT * FROM conversation_messages WHERE thread=? AND organize=1 ORDER BY seq LIMIT 12');
  const exactMessages=db.prepare('SELECT * FROM conversation_messages WHERE thread=? AND seq BETWEEN ? AND ? AND organize=1 ORDER BY seq');
  const oldMessages=db.prepare('SELECT * FROM conversation_messages WHERE thread=? AND seq<? ORDER BY seq DESC LIMIT 10');
  function transaction(run){
    db.exec('BEGIN IMMEDIATE');
    try{const value=run();db.exec('COMMIT');return value;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  const readMessage=({id,seq,at,who,payload})=>({id,seq,at,who,...decode(payload)});
  function readLine(value){
    if(!value)return null;
    const {id,kind,at,latest,rounds,closed,pending}=value;
    return {id,kind,at,latest,rounds,closed,pending,error:decode(value.failure),...decode(value.payload),preview:decode(value.preview)};
  }
  function append(id,{id:messageId=randomUUID(),at=now(),who,text,organize=false,answered=false,...metadata}){
    const needsReply=who==='你'&&!answered;
    add.run(messageId,id,at,tokyoDay(at),who,Number(answered),Number(organize),encode({text,...metadata}));
    update.run(at,encode({id:messageId,at,who,text:text.slice(0,240)}),Number(needsReply),id);
    return {id:messageId,at,who,text,...metadata};
  }
  function create({id=randomUUID(),kind='ordinary',at=now(),title='',origin='',source=null,desire='',purpose=ordinaryPurpose,first=[],legacyClosed=false}={}){
    return transaction(()=>{
      if(newLine.run(id,kind,at,at,encode({title,origin,source,desire,purpose})).changes){
        for(const message of first)append(id,{...message,answered:legacyClosed||!message.legacyPending});
        if(first.length){
          let waiting=false,rounds=0;
          for(const message of first){
            if(message.who==='你')waiting=true;
            else if(waiting){rounds++;waiting=false;}
          }
          setRounds.run(rounds,0,id);
        }
        if(legacyClosed)end.run(first.at(-1)?.at??at,encode({title,origin,source,desire,purpose,endedBy:first.at(-1)?.who,endMessageId:first.at(-1)?.id}),id);
        else if(first.at(-1)?.legacyPending)failure.run(encode({text:'旧线有一条原话等待续答。'}),id);
      }
      return readLine(row.get(id));
    });
  }
  function submit(id,{messageId,text,mode='auto',organize=true,handled=false,reference=false,registration=false,backgroundRegistration=false}={}){
    text=typeof text==='string'?text.trim():'';
    if(!text||text.length>12000)throw Error('请输入有效的文字');
    return transaction(()=>{
      const saved=row.get(id);
      if(!saved||saved.closed!==null||saved.rounds>100)throw Error('这条对话只能回看');
      if(messageId){
        if(typeof messageId!=='string'||!/^[\w-]{1,128}$/u.test(messageId))throw Error('发言编号无效');
        const prior=db.prepare('SELECT * FROM conversation_messages WHERE id=?').get(messageId);
        if(prior){
          const message=readMessage(prior);
          if(prior.thread!==id||prior.who!=='你'||message.text!==text)throw Error('发言编号已使用');
          return message;
        }
      }
      const meta=decode(saved.payload);
      if(!saved.preview&&saved.kind==='ordinary'&&!meta.title){
        const title=Array.from(text.replace(/\s+/gu,' ')).slice(0,28).join('');
        const origin='用户开启普通对话';
        Object.assign(meta,{title,origin});
        db.prepare('UPDATE conversation_lines SET payload=? WHERE id=?').run(encode(meta),id);
      }
      const message=append(id,{id:messageId,who:'你',text,mode,organize,handled,reference,registration,backgroundRegistration});
      if(endsConversation(text)){
        end.run(message.at,encode({...meta,endedBy:'你',endMessageId:message.id}),id);
      }
      return message;
    });
  }
  function finish(id,group,text,closing=false,extra={}){
    return transaction(()=>{
      const saved=row.get(id);
      if(!saved||saved.closed!==null||saved.rounds>100||!group.length)return null;
      const pending=unanswered.all(id);
      if(!group.every((key,index)=>pending[index]?.id===key))return null;
      if(closing&&pending.length!==group.length)return null;
      const message=append(id,{who:'绯月',text,covers:group,...extra});
      for(const key of group)markAnswered.run(id,key);
      setRounds.run(1,group.length,id);
      if(closing)end.run(message.at,encode({...decode(saved.payload),endedBy:'绯月',endMessageId:message.id}),id);
      return message;
    });
  }
  function list(kind,day,page=0){
    if(!['active','questions','history'].includes(kind)||kind==='history'&&!dayPattern.test(day))throw Error('筛选条件无效');
    const counts=Object.fromEntries(db.prepare(`SELECT kind,count(*) AS count FROM conversation_lines
      WHERE closed IS NULL AND rounds<=100 AND preview IS NOT NULL GROUP BY kind`).all().map(r=>[r.kind,r.count]));
    const filter=kind==='history'?'id IN (SELECT thread FROM conversation_messages WHERE day=?)':
      'kind=? AND closed IS NULL AND rounds<=100 AND preview IS NOT NULL';
    const parameter=kind==='history'?day:kind==='active'?'ordinary':'question';
    const total=kind==='history'?db.prepare('SELECT count(DISTINCT thread) AS n FROM conversation_messages WHERE day=?').get(day).n:counts[parameter]??0;
    const pages=Math.max(1,Math.ceil(total/size));
    page=Math.max(0,Math.min(Number.isInteger(page)?page:0,pages-1));
    const rows=db.prepare(`SELECT * FROM conversation_lines WHERE ${filter} ORDER BY latest DESC,rowid DESC LIMIT ? OFFSET ?`)
      .all(parameter,size,page*size).map(value=>{
        const {source,origin,desire,purpose,preview,...line}=readLine(value);
        return {...line,sourceLabel:source?.label,preview};
      });
    return {rows,counts,page,pages};
  }
  function organization(id){
    return transaction(()=>{
      let batch=operation.get(id);
      if(!batch){
        const pending=pendingOrganization.all(id);
        if(!pending.length)return null;
        batch={id:randomUUID(),thread:id,first:pending[0].seq,last:pending.at(-1).seq,at:pending[0].at};
        db.prepare('INSERT INTO conversation_organization VALUES(?,?,?,?,?)').run(batch.id,id,batch.first,batch.last,batch.at);
      }
      return {...batch,turns:exactMessages.all(id,batch.first,batch.last).map(readMessage),
        history:oldMessages.all(id,batch.first).reverse().map(readMessage)};
    });
  }
  return {
    create,submit,finish,list,organization,get:id=>typeof id==='string'?readLine(row.get(id)):null,
    latest:()=>readLine(db.prepare(`SELECT * FROM conversation_lines WHERE kind='ordinary' AND closed IS NULL AND rounds<=100
      ORDER BY preview IS NULL,latest DESC,rowid DESC LIMIT 1`).get()),
    detail(id,limit){
      const line=readLine(row.get(id));
      return line&&{...line,messages:(limit?recent.all(id,limit).reverse():messages.all(id)).map(readMessage)};
    },
    pending:id=>unanswered.all(id).map(readMessage),
    archiveTurns(day){
      const replies=db.prepare("SELECT * FROM conversation_messages WHERE day=? AND who='绯月' ORDER BY at DESC,seq DESC").all(day);
      const original=db.prepare('SELECT * FROM conversation_messages WHERE id=? AND thread=?');
      return replies.flatMap(row=>{
        const reply=readMessage(row);
        if(!reply.covers?.length)return [];
        const sources=reply.covers.map(id=>original.get(id,row.thread)).filter(Boolean).map(readMessage);
        if(!sources.length)return [];
        return [{id:reply.id,threadId:row.thread,at:reply.at,answeredAt:reply.at,question:sources.map(message=>message.text).join('\n'),
          text:reply.text,state:'answer'}];
      });
    },
    recover:()=>db.prepare('SELECT id FROM conversation_lines WHERE pending>0 AND closed IS NULL AND rounds<=100 AND failure IS NULL').all(),
    fail:(id,error)=>failure.run(encode(error),id),
    readSummary:id=>decode(row.get(id)?.summary),
    saveSummary:(id,summary)=>db.prepare('UPDATE conversation_lines SET summary=? WHERE id=?').run(encode(summary),id),
    readReference:id=>decode(row.get(id)?.reference),
    saveReference:(id,reference)=>db.prepare('UPDATE conversation_lines SET reference=? WHERE id=?').run(encode(reference),id),
    organizationLinks:()=>db.prepare('SELECT DISTINCT thread FROM conversation_messages WHERE organize=1').all().map(r=>r.thread),
    organizationId:id=>operation.get(id)?.id,
    organizationComplete(batch){
      transaction(()=>{
        db.prepare('UPDATE conversation_messages SET organize=2 WHERE thread=? AND seq BETWEEN ? AND ? AND organize=1').run(batch.thread,batch.first,batch.last);
        db.prepare('DELETE FROM conversation_organization WHERE id=?').run(batch.id);
      });
    },
    overdue(before){
      const rows=db.prepare(`SELECT m.thread,m.id FROM conversation_messages m WHERE m.organize=1 AND m.at<?
        AND m.seq=(SELECT min(n.seq) FROM conversation_messages n WHERE m.thread=n.thread AND n.organize=1)
        AND m.id NOT IN (SELECT message FROM conversation_overdue)`).all(before);
      return rows.filter(item=>db.prepare('INSERT OR IGNORE INTO conversation_overdue VALUES(?)').run(item.id).changes);
    },
    close:()=>db.close(),
  };
}
