import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const algorithm='aes-256-gcm';
const identifier=/^[a-f0-9]{64}$/u;
export function knowledgeUnavailable(message){
  return Object.assign(Error(message??'知识库暂不可读写，请核对本机密钥或从备份恢复。'),{code:'KNOWLEDGE_UNAVAILABLE'});
}

const idFor=key=>createHash('sha256').update(key).digest('hex');
function readKey(file){
  if(statSync(file).size!==32)throw knowledgeUnavailable('请选用绯月知识库导出的密钥文件。');
  const key=readFileSync(file);
  if(key.length!==32)throw knowledgeUnavailable('密钥文件读取不完整。');
  return key;
}

export function createKnowledgeKeyring(profile){
  const file=join(profile,'knowledge.key');
  const legacy=id=>join(profile,'knowledge-keys',id+'.key');
  function currentId(){
    if(!existsSync(file))return null;
    const key=readKey(file);
    try{return idFor(key);}finally{key.fill(0);}
  }
  function persist(key){
    const id=idFor(key);
    if(has(id))return id;
    const stage=join(profile,randomUUID()+'.tmp');
    try{
      writeFileSync(stage,key,{mode:0o600,flag:'wx',flush:true});
      renameSync(stage,file);
    }finally{rmSync(stage,{force:true});}
    return id;
  }
  function load(id){
    if(typeof id!=='string'||!identifier.test(id))throw knowledgeUnavailable('知识库的密钥编号无效。');
    let key;
    const previous=!existsSync(file);
    try{key=readKey(previous?legacy(id):file);}
    catch{throw knowledgeUnavailable('缺少匹配的知识库密钥，请从「备份」导入原密钥文件。');}
    if(idFor(key)!==id){
      key.fill(0);
      throw knowledgeUnavailable('本机密钥文件与知识库编号不匹配。');
    }
    if(previous)try{persist(key);}catch(error){key.fill(0);throw error;}
    return key;
  }
  function create(){
    const existing=currentId();
    if(existing)return existing;
    const key=randomBytes(32);
    try{return persist(key);}finally{key.fill(0);}
  }
  function importKey(source,validate,commit){
    const key=readKey(source),id=idFor(key);
    try{
      validate(id);
      persist(key);
      commit();
      return id;
    }finally{key.fill(0);}
  }
  function exportKey(id,file){
    const key=load(id);
    try{writeFileSync(file,key,{mode:0o600,flag:'wx',flush:true});}finally{key.fill(0);}
  }
  function has(id){
    try{return currentId()===id;}catch{return false;}
  }
  return {file,create,load,currentId,importKey,exportKey,has};
}

export function sealKnowledge(key,value,associated){
  const nonce=randomBytes(12);
  const cipher=createCipheriv(algorithm,key,nonce);
  cipher.setAAD(Buffer.from(associated));
  return Buffer.concat([nonce,cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]);
}

export function openKnowledge(key,value,associated){
  try{
    const body=Buffer.from(value);
    if(body.length<29)throw Error('Truncated payload');
    const decipher=createDecipheriv(algorithm,key,body.subarray(0,12));
    decipher.setAAD(Buffer.from(associated));
    decipher.setAuthTag(body.subarray(-16));
    const plaintext=Buffer.concat([decipher.update(body.subarray(12,-16)),decipher.final()]);
    try{return JSON.parse(plaintext.toString('utf8'));}finally{plaintext.fill(0);}
  }catch{throw knowledgeUnavailable('知识库记录的密钥或完整性校验失败，请核对密钥和备份。');}
}

export const knowledgeIndex=(key,value)=>createHmac('sha256',key).update(JSON.stringify(value)).digest('hex');
