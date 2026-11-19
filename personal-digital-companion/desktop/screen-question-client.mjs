import {loadCloudConnection} from './cloud-connection.mjs';
const endpoint='/api/assistant/screen-question',limit=4*1024*1024;
const failure=(code,text,retryable=false)=>({state:'error',code,text,retryable});
const cancelled=()=>failure('REQUEST_CANCELLED','请求已取消');
const transport=()=>failure('TRANSPORT_ERROR','连接失败或响应无效，请稍后重试',true);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const contract={INVALID_JSON:[400,false],INVALID_REQUEST:[400,false],INVALID_IMAGE:[400,false],UNAUTHORIZED:[401,false],FORBIDDEN:[403,false],SAME_ORIGIN_REQUIRED:[403,false],METHOD_NOT_ALLOWED:[405,false],REQUEST_CANCELLED:[408,false],REQUEST_TOO_LARGE:[413,false],IMAGE_TOO_LARGE:[413,false],UNSUPPORTED_MEDIA_TYPE:[415,false],AI_RATE_LIMITED:[429,true],AI_UNAVAILABLE:[502,true],INVALID_AI_RESPONSE:[502,true],AUTH_NOT_CONFIGURED:[503,false],AI_NOT_CONFIGURED:[503,false],AI_TIMEOUT:[504,true],INTERNAL_ERROR:[500,false]};
const userMessages={UNAUTHORIZED:'认证失败，请检查本地配置',FORBIDDEN:'没有访问权限',SAME_ORIGIN_REQUIRED:'接口同源校验失败',AUTH_NOT_CONFIGURED:'服务端认证尚未配置',AI_NOT_CONFIGURED:'服务端AI尚未配置',AI_TIMEOUT:'AI响应超时，请稍后重试',AI_RATE_LIMITED:'AI暂时限流，请稍后重试',REQUEST_CANCELLED:'请求已取消'};
async function configuredRequest(profile){
  let connection;
  try { connection=await loadCloudConnection(profile); }
  catch { throw failure('CONFIG_INVALID','云端连接配置无效'); }
  if(!connection)throw failure('CONFIG_NOT_CONFIGURED','请先配置截图问答的云端连接');
  return connection.request;
}
async function abortable(work,signal){
  if(signal.aborted)throw cancelled();let onAbort;
  const stopped=new Promise((_,reject)=>{onAbort=()=>reject(cancelled());signal.addEventListener('abort',onAbort,{once:true});});
  try{return await Promise.race([Promise.resolve().then(()=>{if(signal.aborted)throw cancelled();return work();}),stopped]);}
  finally{signal.removeEventListener('abort',onAbort);}
}
function encodeImage(image){
  if(!image||image.isEmpty())throw failure('CAPTURE_EMPTY','未能获取屏幕图片');
  for(let step=0;step<8;step++){
    for(const quality of [85,65,45]){const bytes=image.toJPEG(quality);if(bytes.length&&bytes.length<=limit){if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw failure('CAPTURE_FAILED','截图编码失败');return {mime_type:'image/jpeg',data_base64:bytes.toString('base64')};}}
    const size=image.getSize();if(size.width<=1||size.height<=1)break;
    image=image.resize({width:Math.max(1,Math.floor(size.width*.75)),height:Math.max(1,Math.floor(size.height*.75)),quality:'good'});
    if(image.isEmpty())throw failure('CAPTURE_EMPTY','缩放后截图为空');
  }
  throw failure('IMAGE_TOO_LARGE','截图无法压缩到允许大小，请调整显示分辨率后重新提问');
}
async function call(request,payload,signal){
  const local=new AbortController();let timedOut=false;
  const abort=()=>local.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  const timer=setTimeout(()=>{timedOut=true;local.abort();},35000);
  try{return await abortable(async()=>{
    const response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:payload,signal:local.signal,redirect:'error'});
    let value;try{value=await response.json();}catch{
      if([400,401,403,405,408,413,415,503].includes(response.status))return failure('HTTP_ERROR',`请求被拒绝（HTTP ${response.status}），请检查配置或输入`);
      return transport();
    }
    if(response.status===200&&fields(value,['ok','answer'])&&value.ok===true&&typeof value.answer==='string'&&value.answer.trim()&&[...value.answer.trim()].length<=2000)return {state:'answer',text:value.answer.trim()};
    if(fields(value,['ok','error'])&&value.ok===false&&fields(value.error,['code','message','retryable'])&&typeof value.error.code==='string'&&Object.hasOwn(contract,value.error.code)
      &&typeof value.error.message==='string'&&contract[value.error.code][0]===response.status&&contract[value.error.code][1]===value.error.retryable){
      const code=value.error.code;return failure(code,Object.hasOwn(userMessages,code)?userMessages[code]:'截图问答失败，请检查输入或稍后重试',value.error.retryable);
    }
    return [400,401,403,405,408,413,415,503].includes(response.status)?failure('HTTP_ERROR',`请求被拒绝（HTTP ${response.status}），请检查配置或输入`):transport();
  },local.signal);}catch{return signal.aborted?cancelled():timedOut?failure('CLIENT_TIMEOUT','连接超时，请稍后重试',true):transport();}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
export async function createScreenQuestionClient({profile,screen,desktopCapturer,request}={}){
  let configurationError=null;
  if(request===undefined)try{request=await configuredRequest(profile);}catch(error){configurationError=error;}
  if(!configurationError&&typeof request!=='function')configurationError=failure('CONFIG_NOT_CONFIGURED','截图问答连接尚未配置');
  let active=null,last=null;
  async function run(question,{signal,onState}={},retry=false){
    if(active)return failure('BUSY','已有一个问题正在处理');
    const controller=new AbortController(),externalAbort=()=>controller.abort();active=controller;
    signal?.addEventListener('abort',externalAbort,{once:true});if(signal?.aborted)controller.abort();
    const emit=value=>{if(!controller.signal.aborted&&typeof onState==='function')try{onState(value);}catch{}};
    try{
      if(controller.signal.aborted)return cancelled();
      if(configurationError){emit(configurationError);return configurationError;}
      let payload;
      if(retry){if(!last){const value=failure('NO_CAPTURE','没有可重试的截图，请重新提问');emit(value);return value;}payload=last;}
      else{
        if(typeof question!=='string'||!question.trim()||[...question.trim()].length>2000){const value=failure('INVALID_QUESTION','请输入1至2000个字符的问题');emit(value);return value;}
        last=null;
        const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const size=display.size??display.bounds,scale=display.scaleFactor??1;
        if(!Number.isFinite(size?.width)||!Number.isFinite(size?.height)||size.width<=0||size.height<=0||!Number.isFinite(scale)||scale<=0)throw failure('CAPTURE_FAILED','无法确定鼠标所在屏幕');
        const sources=await abortable(()=>desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(size.width*scale),height:Math.round(size.height*scale)}}),controller.signal);
        const source=sources.find(item=>item.display_id===String(display.id));
        if(!source)throw failure('DISPLAY_NOT_FOUND','未找到鼠标所在屏幕，未截取其他屏幕');
        payload=JSON.stringify({question:question.trim(),image:encodeImage(source.thumbnail)});
        if(controller.signal.aborted)return cancelled();last=payload;
      }
      emit({state:'waiting',text:'正在查看屏幕…'});
      let value;
      for(let attempt=0;attempt<2;attempt++){value=await call(request,payload,controller.signal);if(controller.signal.aborted)return cancelled();if(value.state==='answer'||!value.retryable)break;}
      emit(value);return value;
    }catch(error){const value=controller.signal.aborted?cancelled():error?.state==='error'?error:failure('CAPTURE_FAILED','获取屏幕失败，请检查截图权限');emit(value);return value;}
    finally{signal?.removeEventListener('abort',externalAbort);if(active===controller)active=null;}
  }
  return {captureAndAsk:(question,options)=>run(question,options),retryLast:options=>run(null,options,true),forget(){last=null;active?.abort();}};
}
