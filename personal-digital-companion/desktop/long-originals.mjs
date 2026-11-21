import {createHash} from 'node:crypto';
import {openAsBlob} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {atomicFile} from './memory-archive.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const limit=1024*1024;
const secrets=[
  /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gi,
  /(?:authorization\s*:\s*(?:bearer|basic)|bearer|password|passwd|token|secret|api[_ -]?key|密码|口令|密钥|令牌)["']?\s*(?:是|为|[:：=])?\s*(?:"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|[^\s"',，。;；}]+)/gi,
  /\b(?:sk-[\w-]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g
];

export function maskOriginal(raw,end=raw.length){
  const spans=secrets.flatMap(rx=>Array.from(raw.matchAll(rx),m=>[m.index,m.index+m[0].length])).sort((a,b)=>a[0]-b[0]);
  let pos=0,text='';
  for(const [start,stop] of spans){
    if(start>=end)break;
    if(start>=pos)text+=raw.slice(pos,start)+'〔凭据略〕';
    pos=Math.max(pos,stop);
  }
  return text+raw.slice(pos,end);
}

export function longSource(raw,label,source){
  if(raw.length<=500)return null;
  const chars=Array.from(raw);
  if(chars.length<=500)return null;
  return {id:hash(source).slice(0,32),label,text:maskOriginal(raw),preview:maskOriginal(raw,chars.slice(0,200).join('').length)};
}

export async function summarizeOriginal(text,generate){
  // Repeated sentences are evidence once for the synopsis. The TXT still carries every occurrence.
  const sentences=text.match(/[^。！？；\n]+[。！？；\n]*|[。！？；\n]+/gu)??[text];
  const seen=new Set();
  const distinct=sentences.filter(line=>{
    const key=line.trim();if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
  let points=Array.from(distinct.join('')||text);
  const chunk=400; // Fits the 2048-token context even with four-byte code points.
  for(;;){
    const reduced=[];
    for(let i=0;i<points.length;i+=chunk){
      const summary=String(await generate(points.slice(i,i+chunk).join(''))||'').trim();
      if(!summary)throw Error('长文概要尚未生成');
      reduced.push(Array.from(maskOriginal(summary)).slice(0,200).join(''));
    }
    if(reduced.length===1)return reduced[0];
    points=Array.from(reduced.join('\n'));
  }
}

export const marker=id=>'〔附件原文 '+id+'〕';
export function createOriginalFiles({db,profile,memory,request,report}){
  db.exec(`CREATE TABLE IF NOT EXISTS original_groups(target TEXT PRIMARY KEY,ids TEXT,path TEXT);
    CREATE TABLE IF NOT EXISTS original_reports(path TEXT PRIMARY KEY,target TEXT,size INTEGER,sent INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS original_summaries(id TEXT PRIMARY KEY,summary TEXT);`);
  async function excerpt(section,generate){
    const previous=db.prepare('SELECT summary FROM original_summaries WHERE id=?').get(section.id);
    const summary=previous?.summary??await summarizeOriginal(section.text,generate);
    if(!previous)db.prepare('INSERT OR IGNORE INTO original_summaries VALUES(?,?)').run(section.id,summary);
    return section.preview+'\n概要：'+summary+'\n'+marker(section.id);
  }
  async function upload(target,path,digest,size,signal){
    const data=new FormData();
    data.set('file',await openAsBlob(path,{type:'text/plain'}),'原文.txt');
    const res=await request('/api/memory/'+target+'/original',{method:'POST',signal,body:data});
    if(!res.ok)throw Error('自动 TXT 上传失败（HTTP '+res.status+'）');
    const uploaded=await res.json();
    if(uploaded.hash!==digest||uploaded.bytes!==size)throw Error('自动 TXT 回执不符');
  }
  async function prepare(kind,id,day,prior,sections,signal){
    const target=kind+'/'+id;
    const local=db.prepare('SELECT * FROM original_groups WHERE target=?').get(target);
    const localIds=local?JSON.parse(local.ids):[];
    const remoteIds=prior?.ids??[];
    let ids=[],text='',useLocal=false;
    if(local&&remoteIds.every((v,i)=>localIds[i]===v)){
      try{
        const bytes=await readFile(local.path),digest=hash(bytes);
        useLocal=local.path.endsWith('-'+digest.slice(0,16)+'.txt')&&
          (!prior||localIds.length!==remoteIds.length||digest===prior.hash);
        if(useLocal){ids=[...localIds];text=bytes.toString('utf8');}
      }catch(error){if(error.code!=='ENOENT')throw error;}
    }
    let additions=sections;
    if(!useLocal){
      const supplied=new Map(sections.map(s=>[s.id,s]));
      const localOnly=localIds.filter(id=>!remoteIds.includes(id));
      if(localOnly.some(id=>!supplied.has(id)))throw Error('本地 TXT 原文缺失或已变化，已保留待处理记录。');
      if(prior){
        const res=await request('/api/memory/'+target+'/original',{method:'GET',signal});
        if(!res.ok)throw Error('无法读取已有 TXT 原文');
        const bytes=Buffer.from(await res.arrayBuffer());
        if(hash(bytes)!==prior.hash)throw Error('已有 TXT 版本变化，请重试');
        text=bytes.toString('utf8');ids=[...remoteIds];
      }
      if(localOnly.length)additions=[...localOnly.map(id=>supplied.get(id)),...sections];
    }
    for(const s of additions){
      if(ids.includes(s.id))continue;
      ids.push(s.id);
      text+=(text?'\n\n':'')+'【原文 '+ids.length+' · '+s.label+'】\n'+s.text;
    }
    const bytes=Buffer.from(text,'utf8'),digest=hash(bytes),oversize=bytes.length>limit;
    const root=memory?.folder?.(day)??join(profile,'原文附件',day);
    const path=join(root,oversize?'异常附件':'原文附件',kind+'-'+id+'-'+digest.slice(0,16)+'.txt');
    await atomicFile(path,bytes);
    const group={target,ids,path,bytes:bytes.length,oversize};
    if(oversize)return {group};
    if(prior?.hash===digest)return {group,head:prior};
    await upload(target,path,digest,bytes.length,signal);
    return {group,head:{hash:digest,ids}};
  }
  async function verify(plan,current,signal){
    if(!plan?.head)return;
    const {head,group}=plan;
    if(!Array.isArray(current?.ids)||head.ids.some((id,i)=>current.ids[i]!==id)||
        (current.ids.length===head.ids.length&&current.hash!==head.hash))
      throw Error('附件段号或版本回读不符，已保留待处理记录。');
    const get=()=>request('/api/memory/'+group.target+'/original',{method:'GET',signal});
    let res=await get();
    if(res.status===404&&current.hash===head.hash){
      const local=await readFile(group.path);
      if(local.length!==group.bytes||hash(local)!==head.hash)throw Error('附件回读失败，本地原件需核对。');
      await upload(group.target,group.path,head.hash,group.bytes,signal);
      res=await get();
    }
    if(!res.ok)throw Error('附件暂时无法回读，已保留待处理记录。');
    const bytes=Buffer.from(await res.arrayBuffer());
    if(hash(bytes)!==current.hash||bytes.length<group.bytes||hash(bytes.subarray(0,group.bytes))!==head.hash)
      throw Error('附件全文回读不符，已保留待处理记录。');
  }
  function confirm(group){
    if(!group)return;
    db.prepare('INSERT OR REPLACE INTO original_groups VALUES(?,?,?)').run(group.target,JSON.stringify(group.ids),group.path);
    if(group.oversize){
      db.prepare('DELETE FROM original_reports WHERE target=? AND sent=0 AND path<>?').run(group.target,group.path);
      db.prepare('INSERT OR IGNORE INTO original_reports(path,target,size) VALUES(?,?,?)').run(group.path,group.target,group.bytes);
    }
  }
  const displaying=new Set();
  async function notify(kind,id){
    if(!report)return;
    const entries=id?db.prepare('SELECT * FROM original_reports WHERE sent=0 AND target=? ORDER BY rowid').all(kind+'/'+id):
      db.prepare('SELECT * FROM original_reports WHERE sent=0 AND target LIKE ? ORDER BY rowid').all(kind+'/%');
    const pending=entries.filter(e=>!displaying.has(e.path));
    if(!pending.length)return;
    for(const e of pending)displaying.add(e.path);
    try{
      await report(pending.map(e=>e.target+' · '+e.size+' 字节\n'+e.path).join('\n\n'));
      for(const e of pending)db.prepare('UPDATE original_reports SET sent=1 WHERE path=?').run(e.path);
    }finally{for(const e of pending)displaying.delete(e.path);}
  }
  return {excerpt,prepare,verify,confirm,notify};
}
