import {randomUUID} from 'node:crypto';
import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createKnowledgeKeyring,knowledgeIndex,knowledgeUnavailable,openKnowledge,sealKnowledge} from './knowledge-keyring.mjs';

const version=2;
const pageSize=6;
const metadata=['cards','groups','instances','receipts','checks'];
const kinds=new Set(['positive','negative']);
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');
const text=(value,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
const strings=(value,limit=12)=>Array.isArray(value)?[...new Set(value.map(item=>text(item,300)).filter(Boolean))].slice(0,limit):[];
const clauses=(value,a,b)=>Array.isArray(value)?value.slice(0,12).map(row=>({[a]:text(row?.[a],500),[b]:text(row?.[b],800)}))
  .filter(row=>row[a]&&row[b]):[];

export function readKnowledgeCard(value,type,{draft=false}={}){
  if(!kinds.has(type))throw Error('知识库类型无效');
  const common={title:text(value?.title,120),aliases:strings(value?.aliases),source:text(value?.source,1600)};
  if(!common.title)throw Error('请输入知识标题');
  if(type==='positive'){
    const definition=text(value.definition),cases=clauses(value.cases,'when','do');
    if(!draft&&(!definition||!cases.length))throw Error('请填写定义和至少一种条件及做法');
    return {...common,definition,cases};
  }
  const condition=text(value.condition),mistake=text(value.mistake),reason=text(value.reason),instead=text(value.instead);
  if(!draft&&(!condition||!mistake||!reason||!instead))throw Error('请填写适用条件、错误做法、原因和替代办法');
  return {...common,condition,mistake,reason,instead,exceptions:clauses(value.exceptions,'when','do'),related:text(value.related,80)};
}

function words(value){
  const terms=new Set();
  for(const match of String(value??'').normalize('NFKC').toLowerCase().matchAll(/\p{Script=Han}+|[\p{L}\p{N}]+/gu)){
    const word=match[0];
    if(!/\p{Script=Han}/u.test(word)){terms.add(word);continue;}
    for(let i=0;i<word.length-1;i++)terms.add(word.slice(i,i+2));
  }
  return terms;
}

export function knowledgeMatch(query,fields){
  const key=normalize(query);
  if(!key)return 0;
  const terms=words(query);
  return fields.reduce((best,field)=>{
    const candidate=normalize(field);
    if(!candidate)return best;
    if(candidate===key)return Math.max(best,100);
    if(Math.min(key.length,candidate.length)>=2&&(key.includes(candidate)||candidate.includes(key)))return Math.max(best,20);
    const parts=words(field);
    return Math.max(best,[...parts].filter(term=>terms.has(term)).length);
  },0);
}

export function createKnowledgeStore(profile,now=Date.now){
  const file=join(profile,'knowledge.sqlite');
  const keyring=createKnowledgeKeyring(profile);
  const backups=join(profile,'knowledge-backups');
  let db,key;
  const keyId=current=>current.prepare('SELECT id FROM encryption').get()?.id;
  const binding=(table,id)=>'feiyue-knowledge-v2/'+table+'/'+id;
  const encode=(value,table,id)=>sealKnowledge(key,value,binding(table,id));
  const decode=(value,table,id)=>openKnowledge(key,value,binding(table,id));
  const hash=value=>{connection();return knowledgeIndex(key,value);};
  function connection(){
    if(db)return db;
    let next;
    try{
      if(!existsSync(file)&&existsSync(backups)&&readdirSync(backups).some(name=>/^(week|month)-/.test(name)))
        throw knowledgeUnavailable('原知识库文件缺失，请从已有周月备份恢复。');
      next=new DatabaseSync(file);
      const schema=next.prepare('PRAGMA user_version').get().user_version;
      if(schema===0){
        if(next.prepare("SELECT name FROM sqlite_schema WHERE type='table' LIMIT 1").get())throw knowledgeUnavailable();
        const id=keyring.create();
        next.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE encryption (id TEXT NOT NULL);
          CREATE TABLE cards (id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL, body BLOB NOT NULL);
          CREATE TABLE groups (id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL,
            card TEXT REFERENCES cards(id), base INTEGER, body BLOB NOT NULL);
          CREATE TABLE instances (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), source_key TEXT NOT NULL, at INTEGER NOT NULL, body BLOB NOT NULL);
          CREATE INDEX instances_group ON instances(group_id,at);
          CREATE UNIQUE INDEX instances_group_source ON instances(group_id,source_key);
          CREATE TABLE receipts (id TEXT PRIMARY KEY, card TEXT NOT NULL REFERENCES cards(id), body BLOB NOT NULL);
          CREATE TABLE checks (id TEXT PRIMARY KEY, at INTEGER NOT NULL, body BLOB NOT NULL);
          PRAGMA user_version=2;
        `);
        next.prepare('INSERT INTO encryption VALUES (?)').run(id);
        next.exec('COMMIT');
      }else if(schema!==version)throw knowledgeUnavailable('知识库版本不兼容，原文件已保留。');
      key=keyring.load(keyId(next));
      next.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1500');
      db=next;
      return db;
    }catch(error){next?.close();key?.fill(0);key=undefined;throw error.code==='KNOWLEDGE_UNAVAILABLE'?error:knowledgeUnavailable();}
  }
  function close(){
    if(db){db.close();db=undefined;}
    key?.fill(0);key=undefined;
  }
  function importKey(source,backupKey){
    close();
    let current;
    if(existsSync(file)){
      let reader;
      try{reader=new DatabaseSync(file,{readOnly:true});current=inspect(reader);}
      catch{/* 损坏的现库继续保留，密钥按现有文件或快照核对。 */}
      finally{reader?.close();}
    }
    let saved;
    try{saved=keyring.currentId();}catch{/* 仍可用原密钥修复损坏的密钥文件。 */}
    const hasData=current&&Object.values(current).some(value=>typeof value==='number'&&value>0);
    const required=hasData?current.keyId:backupKey??(!current&&existsSync(file)?saved:null);
    let imported;
    return keyring.importKey(source,id=>{
      if(required&&id!==required)throw knowledgeUnavailable('这把密钥与本机知识库不匹配，原密钥已保留。');
      imported=id;
    },()=>{
      if(!current||hasData||current.keyId===imported)return;
      const empty=new DatabaseSync(file);
      try{empty.prepare('UPDATE encryption SET id=?').run(imported);}
      finally{empty.close();}
    });
  }
  const sql=statement=>connection().prepare(statement);
  function transaction(work){
    const current=connection();current.exec('BEGIN IMMEDIATE');
    try{const result=work();current.exec('COMMIT');return result;}
    catch(error){current.exec('ROLLBACK');throw error;}
  }
  const publicRow=(row,table='cards')=>row&&{...row,body:decode(row.body,table,row.id)};
  const card=id=>publicRow(sql('SELECT * FROM cards WHERE id=?').get(id));
  const group=id=>publicRow(sql('SELECT * FROM groups WHERE id=?').get(id),'groups');
  const instances=id=>sql('SELECT id,at,body FROM instances WHERE group_id=? ORDER BY at,rowid').all(id).map(row=>publicRow(row,'instances'));
  const groupsFor=id=>sql("SELECT * FROM groups WHERE card=? AND state<>'closed' ORDER BY updated DESC").all(id).map(row=>publicRow(row,'groups'));
  const closeGroup=(id,cardId)=>sql("UPDATE groups SET state='closed',card=?,revision=revision+1,updated=? WHERE id=?")
    .run(cardId,now(),id);
  function summary(row,groupRow=false){
    return {id:row.id,kind:row.kind,revision:row.revision,state:row.state,updated:row.updated,title:row.body.title,
      ...(groupRow?{card:row.card,count:sql('SELECT COUNT(*) AS n FROM instances WHERE group_id=?').get(row.id).n}:{})};
  }
  function items({view='positive',kind='',query='',page=1}={}){
    const isGroup=view==='pending';
    if(!isGroup&&!kinds.has(view))throw Error('知识视图无效');
    const table=isGroup?'groups':'cards',filter=kinds.has(kind)?kind:'';
    const where=isGroup?"state='pending' AND (?='' OR kind=?)":'kind=?';
    const args=isGroup?[filter,filter]:[view];
    const from=' FROM '+table+' WHERE '+where,select='SELECT *'+from+' ORDER BY updated DESC,id';
    const wanted=Number.isSafeInteger(page)?Math.max(1,page):1;
    const paginate=(total,read)=>{
      const pages=Math.max(1,Math.ceil(total/pageSize)),position=Math.min(wanted,pages);
      return {page:position,pages,total,rows:read((position-1)*pageSize).map(row=>summary(row,isGroup))};
    };
    if(!query){
      const total=sql('SELECT count(*) AS n'+from).get(...args).n;
      return paginate(total,offset=>sql(select+' LIMIT ? OFFSET ?').all(...args,pageSize,offset).map(row=>publicRow(row,table)));
    }
    const matches=[];
    for(const raw of sql(select).iterate(...args)){
      const row=publicRow(raw,table);
      if(knowledgeMatch(query,[row.body.title,...row.body.aliases]))matches.push(row);
    }
    return paginate(matches.length,offset=>matches.slice(offset,offset+pageSize));
  }
  function detail(id,isGroup=false){
    if(isGroup){
      const row=group(id);
      if(!row)throw Error('待确认卡已不存在');
      return {...row,instances:instances(id),current:row.card?card(row.card):null};
    }
    const row=card(id);
    if(!row)throw Error('知识条目已不存在');
    return {...row,gaps:groupsFor(id).map(gap=>summary(gap,true)),
      related:row.body.related?card(row.body.related):null};
  }
  function candidates(query,table='cards'){
    const groupRows=table==='groups';
    const rows=groupRows?sql("SELECT * FROM groups WHERE kind=? AND state<>'closed' ORDER BY updated DESC")
      :sql("SELECT * FROM cards WHERE kind=? AND state='active' ORDER BY updated DESC");
    const result=[];
    for(const kind of kinds){
      const ranked=[];
      for(const raw of rows.iterate(kind)){
        const row=publicRow(raw,table),b=row.body;
        const fields=groupRows?[b.title,...b.aliases]:[b.title,...b.aliases,b.condition,...(b.cases??[]).map(item=>item.when),
          ...(b.exceptions??[]).map(item=>item.when)];
        ranked.push({...row,score:knowledgeMatch(query,fields)});
      }
      // 保留少量同义候选，具体适用条件和例外交给本机判断。
      ranked.sort((a,b)=>b.score-a.score);
      result.push(...ranked.slice(0,groupRows?5:6));
    }
    return result;
  }
  function writeCard({id,revision,kind,body,state='active',resolved=[]}){
    const old=id?card(id):null;
    if(id&&(!old||old.revision!==revision||old.kind!==kind))throw Error('知识已更新，请对照当前版本后重试');
    if(!['active','disabled'].includes(state))throw Error('知识状态无效');
    const data=readKnowledgeCard(body,kind);
    if(data.related&&card(data.related)?.kind!=='positive')throw Error('请选择有效的关联正向条目');
    const key=id??randomUUID(),next=(old?.revision??0)+1;
    sql(`INSERT INTO cards VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,
      state=excluded.state,updated=excluded.updated,body=excluded.body`).run(key,kind,next,state,now(),encode(data,'cards',key));
    for(const gap of groupsFor(key))if(resolved.includes(gap.id))closeGroup(gap.id,key);
    return card(key);
  }
  function saveCard(input){return transaction(()=>writeCard(input));}
  function correct({source,cardId,revision,body,groupId}){
    if(!source)throw Error('缺少原始纠正编号');
    return transaction(()=>{
      const id=hash(['long-term',source]),old=sql('SELECT body FROM receipts WHERE id=?').get(id);
      if(old)return decode(old.body,'receipts',id);
      const row=writeCard({id:cardId,revision,kind:'negative',body});
      const gap=groupId&&group(groupId);
      if(gap?.kind==='negative'&&gap.state!=='closed'&&(!gap.card||gap.card===row.id))closeGroup(gap.id,row.id);
      const receipt={id:row.id,revision:row.revision,title:row.body.title};
      sql('INSERT INTO receipts VALUES (?,?,?)').run(id,row.id,encode(receipt,'receipts',id));
      return receipt;
    });
  }
  function record({kind,source,point,title,evidence,condition,cardId,groupId,draft}){
    if(!source||!point||!kinds.has(kind)||!text(evidence))throw Error('缺少知识实例依据');
    const key=hash([kind,source,normalize(point)]);
    return transaction(()=>{
      const previous=sql('SELECT group_id FROM instances WHERE id=?').get(key);
      if(previous)return summary(group(previous.group_id),true);
      const linked=cardId?card(cardId):null;
      if(cardId&&(!linked||linked.kind!==kind||linked.state!=='active'))throw Error('关联知识已更新，请重新核对');
      let g=groupId&&group(groupId);
      if(!g||g.kind!==kind||g.state==='closed'||g.card!==(linked?.id??null))g=null;
      if(!g){
        g=sql("SELECT * FROM groups WHERE kind=? AND state<>'closed' AND card IS ?").all(kind,linked?.id??null)
          .map(row=>publicRow(row,'groups')).find(row=>normalize(row.body.title)===normalize(title||point));
      }
      if(!g){
        const id=randomUUID();
        sql('INSERT INTO groups VALUES (?,?,?,?,?,?,?,?)').run(id,kind,1,'collecting',now(),linked?.id??null,linked?.revision??null,
          encode(readKnowledgeCard({...draft,title:title||point},kind,{draft:true}),'groups',id));
        g=group(id);
      }
      const sourceKey=hash(['source',source]);
      if(sql('SELECT 1 FROM instances WHERE group_id=? AND source_key=?').get(g.id,sourceKey))return summary(g,true);
      sql('INSERT INTO instances VALUES (?,?,?,?,?)').run(key,g.id,sourceKey,now(),encode({source:text(source,380),point:text(point,300),
        evidence:text(evidence,800),condition:text(condition,600)},'instances',key));
      const count=sql('SELECT COUNT(*) AS n FROM instances WHERE group_id=?').get(g.id).n;
      sql('UPDATE groups SET state=?,revision=revision+1,updated=? WHERE id=?').run(count>=3?'pending':'collecting',now(),g.id);
      return summary(group(g.id),true);
    });
  }
  function saveGroup({id,revision,body,confirm=false,useCurrent=false}){
    return transaction(()=>{
      const g=group(id);
      if(!g||g.revision!==revision||g.state==='closed')throw Error('待确认卡已更新，请重新打开');
      if(!confirm){
        sql('UPDATE groups SET body=?,revision=revision+1,updated=? WHERE id=?')
          .run(encode(readKnowledgeCard(body,g.kind,{draft:true}),'groups',id),now(),id);
        return detail(id,true);
      }
      if(g.state!=='pending')throw Error('此组尚未达到三次');
      const current=g.card?card(g.card):null;
      if(current&&current.revision!==g.base&&!useCurrent)throw Error('关联知识已有新版本，请对照当前条目后确认');
      const result=writeCard({id:current?.id,revision:current?.revision,kind:g.kind,body});
      closeGroup(id,result.id);
      return result;
    });
  }
  function split({id,revision,instanceIds,title}){
    return transaction(()=>{
      const g=group(id);
      if(!g||g.revision!==revision||g.state==='closed')throw Error('待确认卡已更新，请重新打开');
      const ids=new Set(strings(instanceIds,200)),rows=instances(id);
      if(!ids.size||ids.size>=rows.length||[...ids].some(key=>!rows.some(row=>row.id===key)))throw Error('请选择部分实例重新归组');
      const next=randomUUID();
      sql('INSERT INTO groups VALUES (?,?,?,?,?,?,?,?)').run(next,g.kind,1,ids.size>=3?'pending':'collecting',now(),g.card,g.base,
        encode(readKnowledgeCard({title},g.kind,{draft:true}),'groups',next));
      for(const key of ids)sql('UPDATE instances SET group_id=? WHERE id=?').run(next,key);
      sql('UPDATE groups SET state=?,revision=revision+1,updated=? WHERE id=?')
        .run(rows.length-ids.size>=3?'pending':'collecting',now(),id);
      return {original:summary(group(id),true),separated:summary(group(next),true)};
    });
  }
  function receipt(source){
    const id=hash(['long-term',source]),row=sql('SELECT body FROM receipts WHERE id=?').get(id);
    return row?decode(row.body,'receipts',id):null;
  }
  function resolved(identity,value){
    const id=hash(['resolved',identity]);
    if(!value){
      const row=sql('SELECT body FROM checks WHERE id=?').get(id);
      return row?decode(row.body,'checks',id):null;
    }
    transaction(()=>{
      sql('INSERT OR REPLACE INTO checks VALUES (?,?,?)').run(id,now(),encode(value,'checks',id));
      sql('DELETE FROM checks WHERE id IN (SELECT id FROM checks ORDER BY at DESC,rowid DESC LIMIT -1 OFFSET 100)').run();
    });
  }
  function inspect(current,{verify=false}={}){
    if(current.prepare('PRAGMA user_version').get().user_version!==version||
      current.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||current.prepare('PRAGMA foreign_key_check').get())
      throw Error('知识库备份未通过完整性或版本检查');
    const id=keyId(current);
    if(verify){
      const snapshotKey=keyring.load(id);
      try{
        for(const table of metadata)for(const row of current.prepare('SELECT id,body FROM '+table).iterate())
          openKnowledge(snapshotKey,row.body,binding(table,row.id));
      }finally{snapshotKey.fill(0);}
    }
    return {keyId:id,positive:current.prepare("SELECT COUNT(*) AS n FROM cards WHERE kind='positive'").get().n,
      negative:current.prepare("SELECT COUNT(*) AS n FROM cards WHERE kind='negative'").get().n,
      pending:current.prepare("SELECT COUNT(*) AS n FROM groups WHERE state='pending'").get().n,
      groups:current.prepare('SELECT COUNT(*) AS n FROM groups').get().n,instances:current.prepare('SELECT COUNT(*) AS n FROM instances').get().n,
      receipts:current.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,
      checks:current.prepare('SELECT COUNT(*) AS n FROM checks').get().n};
  }
  return {file,keyring,currentKey:()=>keyId(connection()),connection,inspect,card,detail,items,candidates,saveCard,correct,receipt,record,saveGroup,split,resolved,
    importKey,close};
}
