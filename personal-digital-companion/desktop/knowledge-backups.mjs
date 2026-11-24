import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {constants,copyFileSync,existsSync,mkdirSync,readdirSync,readFileSync,renameSync,rmSync,writeFileSync,statSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const suffixes=['','-wal','-shm','-journal'];
const snapshotName=/^(week|month)-(\d{4}-\d{2}(?:-\d{2})?)-(\d+)\.sqlite$/u;
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
const fingerprint=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const shortId=()=>randomBytes(8).toString('hex');

export function knowledgePeriods(at){
  const day=dateFormat.format(at);
  const date=new Date(day+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  return {week:date.toISOString().slice(0,10),month:day.slice(0,7)};
}

export function createKnowledgeBackups(profile,store,now=Date.now){
  const directory=join(profile,'knowledge-backups'),marker=join(directory,'restore-in-progress.json');
  const previews=new Map();
  function files(){
    mkdirSync(directory,{recursive:true});
    return readdirSync(directory).flatMap(name=>{
      const match=snapshotName.exec(name);
      return match?[{name,kind:match[1],period:match[2],at:Number(match[3])}]:[];
    }).sort((a,b)=>b.at-a.at);
  }
  function inspect(path,verify=true){
    const db=new DatabaseSync(path,{readOnly:true});
    try{return store.inspect(db,{verify});}finally{db.close();}
  }
  function counts(verify=true){return store.inspect(store.connection(),{verify});}
  function identical(a,b){
    if(JSON.stringify(a)!==JSON.stringify(b))throw Error('备份与当前知识库的记录数不同');
  }
  function snapshot(target){
    const original=counts(false);
    store.connection().prepare('VACUUM INTO ?').run(target);
    identical(inspect(target),original);
    return original;
  }
  function atomicCopy(from,to){
    const temporary=join(dirname(to),'tmp-'+shortId());
    try{copyFileSync(from,temporary);inspect(temporary);renameSync(temporary,to);}
    finally{rmSync(temporary,{force:true});}
  }
  function completeInterrupted(){
    if(!existsSync(marker))return;
    const {folder}=JSON.parse(readFileSync(marker,'utf8'));
    if(typeof folder!=='string'||!/^recovery-\d+-[a-f\d]{16}$/u.test(folder))throw Error('知识库恢复记录需要人工核对');
    const recovery=join(directory,folder),staged=join(recovery,'replacement.sqlite');
    store.close();
    inspect(staged);
    if(!existsSync(store.file)||fingerprint(store.file)!==fingerprint(staged)||suffixes.slice(1).some(suffix=>existsSync(store.file+suffix))){
      // 确认后已完整留存原件，恢复中断时继续使用同一份已验证副本。
      for(const suffix of [...suffixes.slice(1),''])if(existsSync(store.file+suffix)){
        const retired=join(recovery,'interrupted-'+shortId()+suffix);
        renameSync(store.file+suffix,retired);
      }
      atomicCopy(staged,store.file);
    }
    inspect(store.file);
    rmSync(marker,{force:true});
  }
  function rotate(){
    completeInterrupted();
    const at=now(),periods=knowledgePeriods(at),before=files();
    const activeKey=store.currentKey();
    let source;
    try{
      for(const [kind,period] of Object.entries(periods)){
        const candidates=before.filter(item=>item.kind===kind);
        let keep=candidates.find(item=>{
          if(item.period!==period)return false;
          try{return inspect(join(directory,item.name)).keyId===activeKey;}catch{return false;}
        })?.name;
        if(!keep){
          if(!source){
            source=join(directory,'pending-'+randomUUID()+'.sqlite');
            snapshot(source);
          }
          let instant=at;
          do{
            keep=kind+'-'+period+'-'+instant+'.sqlite';
            instant++;
          }while(existsSync(join(directory,keep)));
          atomicCopy(source,join(directory,keep));
        }
        for(const old of candidates)if(old.name!==keep)rmSync(join(directory,old.name),{force:true});
      }
    }finally{if(source)rmSync(source,{force:true});}
  }
  function list(){
    return files().map(item=>{
      try{
        const counts=inspect(join(directory,item.name),false);
        return {...item,counts,keyAvailable:store.keyring.has(counts.keyId)};
      }
      catch{return {...item,counts:null};}
    });
  }
  function catalog(){
    const rows=list(),groups=[];
    for(const row of rows){
      const other=groups.find(item=>item.at===row.at&&item.counts?.keyId===row.counts?.keyId&&row.counts&&
        fingerprint(join(directory,item.name))===fingerprint(join(directory,row.name)));
      if(other)other.kinds.push(row.kind);
      else groups.push({...row,kinds:[row.kind]});
    }
    return groups;
  }
  function protectedKey(){
    return list().find(row=>row.counts&&Object.values(row.counts).some(value=>typeof value==='number'&&value>0))?.counts.keyId;
  }
  function previewFile(source,item={name:basename(source),at:statSync(source).mtimeMs,kind:'external'}){
    const backup=inspect(source),digest=fingerprint(source);
    let current;
    try{completeInterrupted();current=counts();}catch{current=null;}
    const token=randomUUID();
    previews.clear();previews.set(token,{source,backup,digest,at:now()});
    const difference=current&&Object.fromEntries(Object.entries(backup).filter(([,value])=>typeof value==='number')
      .map(([key,value])=>[key,value-current[key]]));
    return {token,...item,backup,current,difference};
  }
  function snapshotPath(name){
    const item=files().find(row=>row.name===name);
    if(!item)throw Error('所选知识库备份已不存在');
    return [join(directory,item.name),item];
  }
  function preview(name){return previewFile(...snapshotPath(name));}
  function exportSnapshot(name,destination){
    const [source]=snapshotPath(name);
    inspect(source);
    copyFileSync(source,destination,constants.COPYFILE_EXCL);
    try{identical(inspect(destination),inspect(source));}catch(error){rmSync(destination,{force:true});throw error;}
  }
  function restore(token){
    const requested=previews.get(token);
    if(!requested||now()-requested.at>15*60_000)throw Error('请重新预览将要恢复的备份');
    if(fingerprint(requested.source)!==requested.digest)throw Error('所选备份已变更，请重新预览。');
    const verified=inspect(requested.source);
    identical(verified,requested.backup);
    if(existsSync(marker))completeInterrupted();
    const folder='recovery-'+now()+'-'+shortId(),recovery=join(directory,folder);
    mkdirSync(recovery,{recursive:true});
    const staged=join(recovery,'replacement.sqlite');
    atomicCopy(requested.source,staged);
    if(fingerprint(staged)!==requested.digest)throw Error('备份在复制期间发生变化，请重新预览。');
    let healthy=true;
    try{counts();}catch{healthy=false;}
    if(healthy)snapshot(join(recovery,'before.sqlite'));
    store.close();
    const original=join(recovery,'original-'+basename(store.file));
    // 对无法通过完整性检查的现库也保全原件和可取得的辅助页。
    for(const suffix of suffixes)if(existsSync(store.file+suffix))copyFileSync(store.file+suffix,original+suffix);
    writeFileSync(join(recovery,'manifest.json'),JSON.stringify({source:basename(requested.source),at:now(),healthy})+'\n');
    const mark=marker+'.tmp';
    writeFileSync(mark,JSON.stringify({folder})+'\n');
    renameSync(mark,marker);
    const moved=[];
    let replacement=false;
    try{
      for(const suffix of suffixes.slice(1).concat(''))if(existsSync(store.file+suffix)){
        renameSync(store.file+suffix,join(recovery,'retired'+suffix));
        moved.push(suffix);
      }
      atomicCopy(staged,store.file);replacement=true;
      identical(counts(),verified);
      rmSync(marker,{force:true});
      previews.delete(token);
      return {counts:verified,original:folder,healthy};
    }catch(error){
      store.close();
      if(replacement)rmSync(store.file,{force:true});
      for(const suffix of moved.reverse())renameSync(join(recovery,'retired'+suffix),store.file+suffix);
      rmSync(marker,{force:true});
      throw error;
    }
  }
  return {rotate,list,catalog,protectedKey,preview,previewFile,restore,exportSnapshot,completeInterrupted};
}
