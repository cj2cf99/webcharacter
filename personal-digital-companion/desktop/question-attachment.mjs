// 气泡只读取用户实际放下或粘贴的 File，不接收本机路径。
export const textLimit=3500;
const maxImageBytes=4*1024*1024;
export function validAttachment(value){
  if(!value||typeof value.name!=='string'||!value.name.length||value.name.length>255)return false;
  if(value.kind==='image')return typeof value.data==='string'&&value.data.length<=Math.ceil(maxImageBytes/3)*4+23
    &&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/u.test(value.data);
  return value.kind==='text'&&typeof value.data==='string'&&value.data.length<=2*textLimit
    &&Boolean(value.data.trim())&&[...value.data].length<=textLimit&&!/[\x00-\x08\x0e-\x1f]/u.test(value.data);
}
export async function readAttachment(file){
  const name=file.name||'粘贴的图片';
  if(file.type.startsWith('image/')||/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)){
    if(file.size>20*1024*1024)throw Error('图片超过 20 MB，请缩小后再添加。');
    let bitmap;
    try{
      bitmap=await createImageBitmap(file);
      const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const attachment={kind:'image',name,data:canvas.toDataURL('image/jpeg',0.88)};
      if(validAttachment(attachment)){
        if(['image/png','image/jpeg','image/webp'].includes(file.type)){
          attachment.originalBytes=new Uint8Array(await file.arrayBuffer());
        }
        return attachment;
      }
    }catch{}finally{bitmap?.close();}
    throw Error('无法读取这张图片，请使用 PNG、JPEG 或 WebP。');
  }
  if(file.type&&!file.type.startsWith('text/')&&!/\.(txt|md|log|csv|json|ya?ml|xml|js|mjs|ts|css|html|py|ini|toml|sql)$/i.test(name))
    throw Error('支持图片和纯文本文件。');
  if(file.size>textLimit*4+3)throw Error('文本附件最多 '+textLimit+' 字，请选取需要的片段。');
  let data;
  try{data=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
  catch{throw Error('请使用 UTF-8 编码的纯文本文件。');}
  if([...data].length>textLimit)throw Error('文本附件最多 '+textLimit+' 字，请选取需要的片段。');
  const attachment={kind:'text',name,data};
  if(!validAttachment(attachment))throw Error('文件为空或不是可读取的纯文本。');
  return attachment;
}
