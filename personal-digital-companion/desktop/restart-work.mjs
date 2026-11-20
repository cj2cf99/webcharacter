import {existsSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// 仅记录这次重启实际截停的、原先已经获得授权的操作。恢复使用各业务原有校验。
export function restartWork(profile){
  const file=join(profile,'restart-work.json');
  const rows=new Map(existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[]);
  function save(){writeFileSync(file+'.tmp',JSON.stringify([...rows]),{mode:0o600});renameSync(file+'.tmp',file);}
  return {
    add(kind,id,data){const key=kind+':'+id;rows.set(key,{kind,id,data});save();},
    entries:()=>[...rows],
    done(key){if(rows.delete(key))save();},
  };
}
