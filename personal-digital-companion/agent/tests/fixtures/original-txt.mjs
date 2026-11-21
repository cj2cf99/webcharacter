import {automaticLimit,validateTxt,txtForm} from './txt-files.mjs';

const objectKey=(owner,kind,id,hash)=>'attachments/txt/auto/'+[owner,kind,id,hash].map(encodeURIComponent).join('/');
const digest=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
const fail=(status,message)=>Response.json({error:{message}},{status});

export async function stageOriginal(request,env,owner,kind,id){
  if(!env.myMainStorage)return fail(503,'TXT 存储未连接。');
  if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data'))return fail(415,'请上传 TXT 文件。');
  if(Number(request.headers.get('Content-Length'))>automaticLimit+65536)return fail(413,'自动附件超限。');
  let file;
  try{
    file=(await txtForm(request)).get('file');
    await validateTxt(file,true);
  }catch(error){return fail(error.status??400,error.message);}
  const hash=await digest(file);
  const key=objectKey(owner,kind,id,hash);
  if(!await env.myMainStorage.head(key))await env.myMainStorage.put(key,file.stream(),{httpMetadata:{contentType:'text/plain; charset=utf-8'}});
  return Response.json({hash,bytes:file.size});
}

export async function retireOriginal(env,owner,kind,id,previous,next){
  if(previous&&next&&previous.hash!==next.hash){
    // The revision already committed. A cleanup failure must not roll back its receipt.
    try{await env.myMainStorage.delete(objectKey(owner,kind,id,previous.hash));}
    catch{console.warn('无法清理已替换的 TXT 对象');}
  }
}

export async function validOriginal(env,owner,kind,id,head){
  if(!head||!/^[a-f0-9]{64}$/u.test(head.hash)||!Array.isArray(head.ids)||!head.ids.length||
      !head.ids.every(v=>typeof v==='string'&&/^[a-f0-9]{32}$/u.test(v))||new Set(head.ids).size!==head.ids.length)return false;
  const object=await env.myMainStorage?.head(objectKey(owner,kind,id,head.hash));
  return !!object && object.size<=automaticLimit;
}

export async function readOriginal(env,owner,kind,id,head){
  if(!head)return fail(404,'本记录没有自动附件。');
  const object=await env.myMainStorage?.get(objectKey(owner,kind,id,head.hash));
  if(!object)return fail(404,'未找到归档文件。');
  return new Response(object.body,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'inline; filename="original.txt"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
