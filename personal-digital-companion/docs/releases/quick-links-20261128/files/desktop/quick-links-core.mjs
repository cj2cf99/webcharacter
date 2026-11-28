// 常用链接核心模块（quick-links/DESIGN.md）：校验、规范化、10 条上限、原子落盘与排序。
// 不引用 Electron，供绯月桌面端薄宿主及本地测试共用。
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';

export const STORE_VERSION=1;
export const MAX_LINKS=10;
export const MAX_NAME_LENGTH=24;
export const MAX_NOTE_LENGTH=80;

const charLength=value=>[...value].length;

/** 仅允许 http:// 或 https:// 网址，返回规范化 href；不合法返回 null。 */
export function normalizeHttpUrl(raw){
  if(typeof raw!=='string')return null;
  const text=raw.trim();
  if(!text)return null;
  try{
    const parsed=new URL(text);
    if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return null;
    return parsed.href;
  }catch{
    return null;
  }
}

/** 校验并清洗登记/编辑输入。 */
export function validateLinkInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('链接参数格式无效');
  if(typeof input.name!=='string')throw Error('请填写中文名称');
  const name=input.name.trim();
  if(!name)throw Error('请填写中文名称');
  if(charLength(name)>MAX_NAME_LENGTH)throw Error(`中文名称最多 ${MAX_NAME_LENGTH} 个字`);
  if(typeof input.url!=='string')throw Error('请输入有效的 http:// 或 https:// 网址');
  const url=normalizeHttpUrl(input.url);
  if(!url)throw Error('请输入有效的 http:// 或 https:// 网址');
  if(input.note!==undefined&&typeof input.note!=='string')throw Error('备注格式无效');
  const note=(input.note??'').trim();
  if(charLength(note)>MAX_NOTE_LENGTH)throw Error(`备注最多 ${MAX_NOTE_LENGTH} 个字`);
  return {name,url,note};
}

function validateStoredLink(entry,seenIds){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('链接条目格式无效');
  const id=typeof entry.id==='string'?entry.id.trim():'';
  if(!id||seenIds.has(id))throw Error('链接条目 ID 无效或重复');
  seenIds.add(id);
  const valid=validateLinkInput({name:entry.name,url:entry.url,note:entry.note??''});
  return {id,...valid};
}

function writeAtomic(file,content){
  mkdirSync(dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.tmp`;
  try{
    writeFileSync(temp,content,'utf8');
    renameSync(temp,file);
  }finally{
    rmSync(temp,{force:true});
  }
}

/** 创建基于本地 JSON 文件的常用链接存储实例。 */
export function createQuickLinksStore({dataDir,file,generateId=randomUUID,onChange=()=>{}}={}){
  const targetFile=file??(dataDir?join(dataDir,'quick-links.json'):'');
  if(!targetFile)throw Error('缺少常用链接存储路径');

  let status='ready';
  let error='';
  let links=[];

  const cloneLinks=list=>list.map(item=>({...item}));
  const snapshot=()=>({status,error,links:cloneLinks(links),maxLinks:MAX_LINKS});
  const ensureReady=()=>{if(status!=='ready')throw Error('常用链接数据尚未就绪，请先重试加载');};

  function load(){
    try{
      const raw=readFileSync(targetFile,'utf8').replace(/^\uFEFF/,'');
      const data=JSON.parse(raw);
      if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==STORE_VERSION||!Array.isArray(data.links)){
        throw Error('常用链接配置文件格式无效');
      }
      if(data.links.length>MAX_LINKS)throw Error(`常用链接数量超过上限（${MAX_LINKS}）`);
      const seenIds=new Set();
      links=data.links.map(entry=>validateStoredLink(entry,seenIds));
      status='ready';
      error='';
    }catch(err){
      if(err?.code==='ENOENT'){
        links=[];
        status='ready';
        error='';
      }else{
        links=[];
        status='error';
        error=err?.message||'读取常用链接失败';
      }
    }
    return snapshot();
  }

  function commit(nextLinks){
    const payload=JSON.stringify({version:STORE_VERSION,links:nextLinks},null,2);
    writeAtomic(targetFile,payload);
    links=nextLinks;
    const snap=snapshot();
    onChange(snap);
    return snap;
  }

  function findDuplicate(url,excludeId=null){
    const hit=links.find(item=>item.url===url&&item.id!==excludeId);
    return hit?{id:hit.id,name:hit.name}:null;
  }

  load();

  return {
    file:targetFile,
    snapshot,
    reload(){
      const snap=load();
      onChange(snap);
      return snap;
    },
    menuItems(){
      if(status!=='ready')return [];
      return links.slice(0,MAX_LINKS).map(item=>({
        id:item.id,
        label:item.name,
        tooltip:item.note||item.url,
        url:item.url,
      }));
    },
    create(input){
      ensureReady();
      if(links.length>=MAX_LINKS)throw Error(`最多只能登记 ${MAX_LINKS} 条常用链接`);
      const valid=validateLinkInput(input);
      const duplicate=findDuplicate(valid.url);
      const id=String(generateId()||'').trim();
      if(!id||links.some(item=>item.id===id))throw Error('生成链接 ID 失败');
      const item={id,...valid};
      const snap=commit([...links,item]);
      return {snapshot:snap,item:{...item},duplicate};
    },
    update(id,input){
      ensureReady();
      const index=links.findIndex(item=>item.id===id);
      if(index===-1)throw Error('未找到要编辑的常用链接');
      const valid=validateLinkInput(input);
      const duplicate=findDuplicate(valid.url,id);
      const item={id,...valid};
      const next=links.map((entry,idx)=>idx===index?item:entry);
      const snap=commit(next);
      return {snapshot:snap,item:{...item},duplicate};
    },
    remove(id){
      ensureReady();
      const index=links.findIndex(item=>item.id===id);
      if(index===-1)throw Error('未找到要删除的常用链接');
      const removed={...links[index]};
      const snap=commit(links.filter(item=>item.id!==id));
      return {snapshot:snap,removed};
    },
    reorder(ids){
      ensureReady();
      if(!Array.isArray(ids)||ids.length!==links.length)throw Error('排序列表数量不匹配');
      const byId=new Map(links.map(item=>[item.id,item]));
      const seen=new Set();
      const next=[];
      for(const id of ids){
        if(typeof id!=='string'||!byId.has(id)||seen.has(id))throw Error('排序列表包含无效或重复条目');
        seen.add(id);
        next.push(byId.get(id));
      }
      const snap=commit(next);
      return {snapshot:snap};
    },
  };
}
