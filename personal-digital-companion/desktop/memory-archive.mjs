import {mkdir,readFile,readdir,rename,writeFile,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {tokyoDay} from './conversation-history.mjs';

export const memoryRoot='F:/feiyuememory';
const idPattern=/^[a-z0-9_-]{1,128}$/i, dayPattern=/^\d{4}-\d\d-\d\d$/;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function atomicFile(file,bytes){
  await mkdir(dirname(file),{recursive:true});
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(tmp,bytes,{mode:0o600});
    for(let attempt=0;;attempt++){
      try{await rename(tmp,file);break;}
      catch(error){
        if(process.platform!=='win32'||!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=6)throw error;
        await delay(15*2**attempt);
      }
    }
  }
  catch(error){await optional(unlink(tmp));throw error;}
}
export const optional=async work=>{try{return await work;}catch(e){if(e.code!=='ENOENT')throw e;return null;}};

export function createMemoryArchive(root=memoryRoot){
  function folder(day){
    if(!dayPattern.test(day))throw Error('归档日期无效');
    return join(root,day.slice(0,4),day.slice(0,7),day);
  }
  function imageRef(turn){
    if(typeof turn.id!=='string'||!idPattern.test(turn.id))throw Error('归档编号无效');
    return {day:tokyoDay(turn.at),id:turn.id,original:'图片/'+turn.id+'.png',thumbnail:'缩略图/'+turn.id+'.jpg'};
  }
  async function save(turn,{index=true}={}){
    const ref=imageRef(turn),base=folder(ref.day);
    const record={...turn,time:new Date(turn.at+9*3600000).toISOString().replace('Z','+09:00')};
    await atomicFile(join(base,'对话',ref.id+'.json'),JSON.stringify(record,null,2)+'\n');
    if(turn.image){
      const page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>绯月图片问答</title>'
        +'<style>body{font:16px/1.6 system-ui;max-width:48rem;margin:2rem auto}p{white-space:pre-wrap}img{max-width:240px;height:auto}</style>'
        +'<time>'+esc(record.time)+'</time><h1>'+esc(turn.question)+'</h1><a href="../'+ref.original+'"><img alt="截图缩略图" src="../'+ref.thumbnail+'"></a>'
        +'<p>'+esc(turn.image.route??'处理中')+'</p><p>'+esc(turn.text)+'</p></html>';
      await atomicFile(join(base,'图片问答',ref.id+'.html'),page);
    }
    if(index)await refreshIndex(ref.day);
  }
  async function read(day){
    const dir=join(folder(day),'对话');
    const names=await optional(readdir(dir))??[];
    const rows=await Promise.all(names.filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(join(dir,name),'utf8'))));
    return rows.sort((a,b)=>b.at-a.at);
  }
  async function storeImage(turn,image){
    const ref=imageRef(turn),base=folder(ref.day),bytes=image.toPNG();
    if(!bytes.length)throw Error('原图为空');
    const {width}=image.getSize();
    const thumb=image.resize({width:Math.min(240,width)}).toJPEG(75);
    if(!thumb.length)throw Error('缩略图为空');
    await atomicFile(join(base,ref.original),bytes);
    await atomicFile(join(base,ref.thumbnail),thumb);
    await save({...turn,image:ref,state:'waiting',text:'图片已保存，等待本地处理。'});
    return ref;
  }
  async function thumbnail(day,id){
    if(typeof id!=='string'||!idPattern.test(id))throw Error('缩略图编号无效');
    const bytes=await optional(readFile(join(folder(day),'缩略图',id+'.jpg')));
    return bytes?'data:image/jpeg;base64,'+bytes.toString('base64'):null;
  }
  function original(day,id){
    if(typeof id!=='string'||!idPattern.test(id))throw Error('图片编号无效');
    return join(folder(day),'图片',id+'.png');
  }
  const readTasks=async day=>JSON.parse(await optional(readFile(join(folder(day),'任务','执行记录.json'),'utf8'))??'[]');
  const writing=new Map();
  function refreshIndex(day){
    // 同期回执可能同时落盘，最后一次重建总能看到已写完的记录。
    const work=(writing.get(day)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const base=folder(day),turns=await read(day),tasks=await readTasks(day);
      const logs=(await optional(readdir(join(base,'日志')))??[]).filter(f=>['任务通信.jsonl','历史通信.jsonl'].includes(f));
      const entries=turns.map(t=>{
        const ref=imageRef(t);
        const photo=t.image?'<a href="'+ref.original+'"><img loading="lazy" alt="截图缩略图" src="'+ref.thumbnail+'"></a>':'';
        return '<article><time>'+esc(t.time)+'</time><h3>'+esc(t.question)+'</h3>'+photo+'<p>'+esc(t.text)+'</p>'
          +(t.image?'<small>'+esc([t.image.route,t.image.reason].filter(Boolean).join(' · '))+'</small>':'')+'</article>';
      });
      const events=tasks.map(t=>'<p>'+esc(new Date(t.at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false}))+' · '+esc(t.title)+' · '+esc(t.action)+' '+esc(t.detail)+'</p>');
      await atomicFile(join(base,'复盘.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+day+' 绯月复盘</title>'
        +'<style>body{font:16px/1.55 system-ui;max-width:52rem;margin:2rem auto;padding:0 1rem}article{border-top:1px solid #aaa;padding:1rem 0}p{white-space:pre-wrap}img{max-width:240px;height:auto}time,small{color:#65545c}</style>'
        +'<h1>'+day+' · 绯月复盘</h1><small>东京时间 JST</small><p>'+logs.map(f=>'<a href="日志/'+f+'">'+f+'</a>').join(' · ')+'</p>'
        +(entries.length?'<h2>对话</h2>'+entries.join(''):'')+(events.length?'<h2>任务</h2>'+events.join(''):'')+'</html>');
    });
    writing.set(day,work);
    return work.finally(()=>{if(writing.get(day)===work)writing.delete(day);});
  }
  return {root,folder,save,read,latest:async day=>(await read(day))[0],storeImage,thumbnail,original,
    readTasks,refreshIndex,async saveTasks(day,rows,{index=true}={}){
      await atomicFile(join(folder(day),'任务','执行记录.json'),JSON.stringify(rows,null,2)+'\n');
      if(index)await refreshIndex(day);
    }};
}
