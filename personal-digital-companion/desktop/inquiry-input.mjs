import {createHash} from 'node:crypto';
import {registrationTypes} from './conversation-routing.mjs';

export function missingRows(pending=[]){
  const fields={deadline:'到期日',category_id:'分类',title:'标题',body:'正文',content:'内容',level:'等级',reflection:'感想'};
  return pending.map((item,index)=>{
    const key=item.field??Object.keys(fields).find(k=>item.question.includes(fields[k]))
      ??(/日期|哪一天/u.test(item.question)?'deadline':null);
    return {task:item.task||((registrationTypes[item.type]??'任务')+' '+(index+1)),question:item.question,
      // 分类、等级等字段在不同模板中可拥有不同的取值域。
      group:key?(key==='category_id'?item.type+'/'+key:key):null,label:fields[key]??key??''};
  });
}

export async function uploadInquiryPhoto(file,request,cache){
  if(!request)throw Error('随手记图片上传未连接。');
  let bytes=Buffer.from(file.data.slice(file.data.indexOf(',')+1),'base64'),type='image/jpeg';
  if(file.originalBytes instanceof Uint8Array&&file.originalBytes.byteLength<=8*1024*1024){
    const original=Buffer.from(file.originalBytes);
    const detected=original.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'image/png':
      original[0]===255&&original[1]===216?'image/jpeg':
      original.toString('ascii',0,4)==='RIFF'&&original.toString('ascii',8,12)==='WEBP'?'image/webp':
      /^GIF8[79]a$/.test(original.toString('ascii',0,6))?'image/gif':null;
    if(detected){bytes=original;type=detected;}
  }
  const key=createHash('sha256').update(bytes).digest('hex');
  if(cache?.has(key))return cache.get(key);
  const response=await request('/api/records/photos',{method:'POST',headers:{'Content-Type':type,'X-Photo-Name':encodeURIComponent(file.name)},body:bytes});
  const data=await response.json().catch(()=>null);
  if(response.status!==201||typeof data?.url!=='string'||!/^https:\/\//i.test(data.url))
    throw Error('随手记图片上传未取得回执（HTTP '+response.status+'）。');
  cache?.set(key,data.url);return data.url;
}
