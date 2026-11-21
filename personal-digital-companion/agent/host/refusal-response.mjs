// 只处理供应商返回的内容。归档不接收请求体、地址或请求头。
export function refusalExcerpt(text, secrets = [], truncated = false) {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  let clean = text.trim();
  for (const secret of secrets) if (secret) clean = clean.replaceAll(secret, '[已遮盖]');
  clean = clean
    .replace(/("(?:[^"]*(?:api[_-]?key|token|secret|password)|authorization|cookie|set-cookie)"\s*:\s*)"(?:\\.|[^"\\])*(?:"|$)/gi, '$1"[已遮盖]"')
    .replace(/\b(Bearer|Basic)\s+[\w+/=.~-]+/gi, '$1 [已遮盖]')
    .replace(/\b(sk-[\w-]+|gsk_[\w-]+|AIza[\w-]{12,})/g,'[已遮盖]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*=\s*)[^&\s"'<>]+/gi,'$1[已遮盖]');
  return clean.length > 2048 || truncated ? clean.slice(0, 2048)+'…（已截断）' : clean;
}

// 有些上游返回 HTML 或很大的响应。诊断读取不能拖住正常换线。
export async function readRefusalExcerpt(response, secrets) {
  const reader = response?.body?.getReader();
  if (!reader) return undefined;
  let size=0, text='', timer, timedOut=false;
  const decoder=new TextDecoder();
  try {
    timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},300);
    while (size < 8192) {
      const {done,value}=await reader.read();
      if(done)return refusalExcerpt(text+decoder.decode(),secrets,timedOut);
      const portion=value.subarray(0,8192-size);
      text+=decoder.decode(portion,{stream:true});
      size+=portion.byteLength;
    }
    return refusalExcerpt(text+decoder.decode(),secrets,true);
  } catch { return refusalExcerpt(text,secrets,true); }
  finally {clearTimeout(timer); void reader.cancel().catch(()=>{}); reader.releaseLock();}
}
