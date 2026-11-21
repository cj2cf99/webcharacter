// 固定转给随手记的图库接口，复用文件命名、图库凭据和返回值。
export const photoLimit=8*1024*1024;
const photoTypes=new Set(['image/jpeg','image/png','image/webp','image/gif']);
export async function forwardRecordPhoto(request,upload){
  if(request.method!=='POST')return new Response(null,{status:405});
  const type=request.headers.get('Content-Type'),name=request.headers.get('X-Photo-Name')??'image';
  if(!photoTypes.has(type)||name.length>8192)return new Response(null,{status:400});
  if(Number(request.headers.get('Content-Length'))>photoLimit)return new Response(null,{status:413});
  const reader=request.body?.getReader();
  if(!reader)return new Response(null,{status:400});
  const chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>photoLimit){await reader.cancel();return new Response(null,{status:413});}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  if(!size)return new Response(null,{status:400});
  const result=await upload(await new Blob(chunks).arrayBuffer(),type,name);
  return Response.json(result.payload,{status:result.status,headers:{'Cache-Control':'no-store'}});
}
export async function mainSiteRecordPhoto(records,env,bytes,type,name){
  if(!(bytes instanceof ArrayBuffer)||!bytes.byteLength||bytes.byteLength>photoLimit||!photoTypes.has(type))
    return {status:400,payload:{error:'图片无效'}};
  const req=new Request('https://companion.internal/api/records/photos',{method:'POST',
    headers:{'Content-Type':type,'X-Photo-Name':name,Origin:'https://companion.internal'},body:bytes});
  const response=await records(req,{...env,DB:env.mymaindb});
  return {status:response.status,payload:await response.json()};
}
