import {readFile,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {atomicFile,optional} from './memory-archive.mjs';

const statuses=new Set(['pending','unknown','confirmed','organize','preference','web']);
const checksum=s=>createHash('sha256').update(s).digest('hex');
function body(d){
  const lines=['# '+d.title,'',d.summary||'待确认','',...d.evidence.map(e=>'- '+e.text+'（'+e.ref+'）')];
  if(d.salvagedText)lines.push('','## 恢复的旧摘记',d.salvagedText);
  return lines.join('\n')+'\n';
}
function encode(d){
  const json=JSON.stringify(d).replaceAll('-->','--\\u003e');
  return '<!-- '+json+' -->\n<!-- sha256 '+checksum(json)+' -->\n'+body(d);
}
function inspect(bytes,id){
  if(!bytes)return {};
  const raw=bytes.toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
  const line=raw.split('\n',1)[0],start=line.indexOf('{'),end=line.lastIndexOf('}');
  if(start<0||end<start)return {};
  const json=line.slice(start,end+1);
  let d;try{d=JSON.parse(json);}catch{return {};}
  if(d?.id!==id||typeof d.title!=='string'||!d.title.trim()||!statuses.has(d.status)||
    !Number.isSafeInteger(d.revision)||d.revision<1||!Number.isFinite(d.updated)||
    !Array.isArray(d.evidence)||!d.evidence.every(e=>typeof e?.ref==='string'&&typeof e.text==='string')||
    (d.summary!=null&&typeof d.summary!=='string')||
    (d.revisionFloor!=null&&!Number.isSafeInteger(d.revisionFloor))||
    (d.scanGaps!=null&&!Array.isArray(d.scanGaps))||(d.history!=null&&!Array.isArray(d.history))||
    (d.versions!=null&&(!Array.isArray(d.versions)||!d.versions.every(v=>Number.isSafeInteger(v?.revision)&&Number.isFinite(v.at)&&typeof v.summary==='string')))||
    (d.status==='pending'&&(!Number.isInteger(d.tries)||d.tries<0)))return {};
  const rest=raw.slice(line.length+1),stamp=/^<!-- sha256 ([a-f0-9]{64}) -->\n/.exec(rest);
  if(stamp&&stamp[1]!==checksum(json))return {};
  const intact=line==='<!-- '+json+' -->'&&(stamp?rest.slice(stamp[0].length):rest)===body(d);
  return {data:d,intact};
}
const copyPath=(file,i)=>file+'.bak'+i;

// 所有写操作由专题模块的同一写队列串行调用。先保存可读旧版，再原子替换正文。
export async function writeTopic(dir,d,old){
  const file=join(dir,d.id+'.md'),previous=encode(old??d);
  const first=await optional(readFile(copyPath(file,1)));
  if(first?.toString('utf8')!==previous){
    const limit=await optional(stat(file+'.bad'))?2:3;
    const copies=[];
    for(let i=1;i<limit;i++){
      const bytes=i===1?first:await optional(readFile(copyPath(file,i)));
      const {data}=inspect(bytes,d.id);
      if(data&&data.revision!==(old??d).revision&&!copies.some(v=>v.revision===data.revision))copies.push(data);
    }
    for(let i=copies.length-1;i>=0;i--)await atomicFile(copyPath(file,i+2),encode(copies[i]));
    await atomicFile(copyPath(file,1),previous);
  }
  await atomicFile(file,encode(d));
}
export async function loadTopic(dir,id,indexTitle,now){
  const file=join(dir,id+'.md'),original=await optional(readFile(file));
  const primary=inspect(original,id);
  if(primary.intact){
    if(!await optional(stat(copyPath(file,1)))&&!await optional(stat(file+'.bad')))await atomicFile(copyPath(file,1),original);
    return primary.data;
  }
  const copies=[];
  for(let i=1;i<=3;i++){
    const bytes=await optional(readFile(copyPath(file,i)));
    if(bytes)copies.push({bytes,...inspect(bytes,id)});
  }
  const replacement=copies.find(v=>v.intact)?.data??primary.data??copies.find(v=>v.data)?.data;
  if(replacement){
    // 后续新结论的版本必须越过回滚前可能已经发出的展示回执。
    const restored={...replacement,revisionFloor:Math.max(replacement.revisionFloor??0,now())};
    if(!copies.some(v=>v.intact))await atomicFile(copyPath(file,1),encode(restored));
    await atomicFile(file,encode(restored));
    return restored;
  }
  const broken=original??copies[0]?.bytes??await optional(readFile(file+'.bad'));
  if(!broken&&!indexTitle)return null;
  const heading=/^# ([^\r\n]{1,120})\r?$/m.exec(broken?.toString('utf8')??'')?.[1]?.trim();
  const title=indexTitle||heading;
  const t=now();
  const rebuilt={id,title:title||'待辨认专题 '+id.slice(0,8),status:'pending',revision:Math.max(1,t),updated:t,
    tries:0,cursor:0,evidence:[],queued:Boolean(title),needsTitle:!title,recoveryHelp:'pending'};
  // 元数据不可用，但带来源的完整 Markdown 段落仍能抢救为未核实的本机摘记。
  for(const bytes of [original,...copies.map(c=>c.bytes)]){
    const readable=bytes?.toString('utf8').replaceAll('\r\n','\n');
    const section=readable?.match(/^# ([^\n]+)\n\n([\s\S]*)$/m);
    if(section&&(!indexTitle||section[1]===indexTitle)&&!section[0].includes('\uFFFD')&&/^- .+（[a-z][\w-]*[/:][^（）\n]+）$/mu.test(section[2])){
      const repaired={...rebuilt,title:indexTitle||section[1],needsTitle:false,queued:true,salvagedText:section[2].trim()};
      delete repaired.recoveryHelp;
      await atomicFile(copyPath(file,1),encode(repaired));
      await atomicFile(file,encode(repaired));
      return repaired;
    }
  }
  // 隔离原始字节后才能清理。保留单一坏样本，其余槽位用于之后的健康版本。
  if(broken)await atomicFile(file+'.bad',broken);
  for(let i=1;i<=3;i++)await optional(unlink(copyPath(file,i)));
  await atomicFile(file,encode(rebuilt));
  return rebuilt;
}
