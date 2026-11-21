export const automaticLimit = 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), {status});
const response = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control':'private, no-store'}});
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export async function txtForm(request) {
  try {return await request.formData();}
  catch {throw fail(400,'TXT 文件表单不完整，请重新选择文件。');}
}

async function verifyRetry(row,file,bucket) {
  const conflict=()=>fail(409,'该次提交已保存另一份 TXT，请重新打开附件页面后选择文件。');
  if(!row||row.name!==file.name||row.bytes!==file.size)throw conflict();
  const object=await bucket.get(row.object_key);
  if(!object)throw fail(503,'已保存的 TXT 暂时无法读回，请稍后重试。');
  let offset=0;
  for await(const chunk of object.body){
    const bytes=new Uint8Array(await file.slice(offset,offset+chunk.length).arrayBuffer());
    if(bytes.length!==chunk.length||chunk.some((b,i)=>b!==bytes[i]))throw conflict();
    offset+=chunk.length;
  }
  if(offset!==file.size)throw conflict();
}

export async function validateTxt(file, automatic = false) {
  if (!(file instanceof Blob) || typeof file.name !== 'string' || !/\.txt$/iu.test(file.name) || /[\\/\r\n\0]/u.test(file.name))
    throw fail(400, '请选择实际的 TXT 文件。');
  if (automatic && file.size > automaticLimit) throw fail(413, '自动附件超过 1 MiB。');
  const [a,b,c,d] = new Uint8Array(await file.slice(0,4).arrayBuffer());
  if ((a===0xff && b===0xfe && c===0 && d===0) || (a===0 && b===0 && c===0xfe && d===0xff))
    throw fail(415, '请将 TXT 保存为 UTF-8 或带 BOM 的 UTF-16。');
  const encoding = a===0xff && b===0xfe ? 'utf-16le' : a===0xfe && b===0xff ? 'utf-16be' : 'utf-8';
  if (automatic && encoding!=='utf-8') throw fail(415,'自动附件必须使用 UTF-8。');
  const decoder = new TextDecoder(encoding, {fatal:true});
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      if (decoder.decode(value,{stream:true}).includes('\0')) throw Error();
    }
    decoder.decode();
  } catch {
    throw fail(415,'TXT 内容不是有效的 UTF-8 或带 BOM 的 UTF-16 文本。');
  } finally {reader.releaseLock();}
  return encoding;
}

// The caller checks the record owner's identity and the record's current write permission.
export async function manualTxt(request, {db,bucket,subject,editable=true}) {
  const url = new URL(request.url);
  const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if (!bucket) return response({error:'附件存储尚未连接。'},503);
  const stmt=(sql,...args)=>db.prepare(sql).bind(subject,...args);
  try {
    if(request.method==='POST') {
      if (!editable || request.headers.get('Origin')!==url.origin) throw fail(403,'没有此记录的附件写权限。');
      if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data')) throw fail(415,'请通过文件选择器提交 TXT。');
      const form=await txtForm(request),file=form.get('file'),id=form.get('uploadId');
      const charset=await validateTxt(file);
      if(typeof id!=='string'||!/^[-\da-f]{36}$/i.test(id))throw fail(400,'附件提交编号无效。');
      const lookup=()=>stmt('SELECT name,bytes,object_key FROM txt_record_files WHERE subject=? AND id=?',id).first();
      const prior=await lookup();
      if(prior)await verifyRetry(prior,file,bucket);
      else {
        const operation=new TextEncoder().encode(JSON.stringify([subject,id]));
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',operation));
        const objectKey='attachments/txt/manual/'+Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
        const stored=await bucket.put(objectKey,file.stream(),{
          onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'text/plain; charset='+charset},
          customMetadata:{name:encodeURIComponent(file.name)}
        });
        if(!stored){
          const head=await bucket.head(objectKey);
          if(!head)throw fail(503,'暂时无法核对 TXT，请重试。');
          await verifyRetry({name:decodeURIComponent(head.customMetadata.name),bytes:head.size,object_key:objectKey},file,bucket);
        }
        const saved=await stmt('INSERT INTO txt_record_files(subject,id,object_key,name,bytes,charset) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',id,objectKey,file.name,file.size,charset).run();
        if(!saved.meta.changes)await verifyRetry(await lookup(),file,bucket);
      }
      if(request.headers.get('Accept')?.includes('application/json'))return response({id,name:file.name,url:url.pathname+'?file='+encodeURIComponent(id)},201);
      return new Response(null,{status:303,headers:{...headers,Location:url.pathname}});
    }
    if(request.method!=='GET')throw fail(405,'附件接口不支持此方法。');
    if(url.searchParams.has('file')){
      const row=await stmt('SELECT object_key,name,charset FROM txt_record_files WHERE subject=? AND id=?',url.searchParams.get('file')).first();
      const obj=row && await bucket.get(row.object_key);
      if(!obj)throw fail(404,'附件不存在。');
      return new Response(obj.body,{headers:{...headers,'Content-Type':'text/plain; charset='+row.charset,'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(row.name),'Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    const {results}=await stmt('SELECT id,name,bytes FROM txt_record_files WHERE subject=? ORDER BY rowid').all();
    const links=results.map(r=>'<li><a href="?file='+encodeURIComponent(r.id)+'">'+esc(r.name)+'</a> · '+r.bytes+' 字节</li>').join('');
    const picker=editable?'<form method="post" enctype="multipart/form-data"><input type="hidden" name="uploadId" value="'+crypto.randomUUID()+'"><label>选择 TXT <input required type="file" name="file" accept=".txt"></label> <button>添加附件</button></form>':'';
    return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TXT 附件</title><main><h1>TXT 附件</h1>'+picker+(links?'<ul>'+links+'</ul>':'<p>暂无附件</p>')+'</main></html>',{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'"}});
  }catch(error){return response({error:error.status?error.message:'附件处理失败，可重试。'},error.status??500);}
}
