const errors={
  WEATHER_UNAVAILABLE:[502,true,'天气服务暂不可用，请稍后重试'],WEATHER_NOT_CONFIGURED:[503,false,'天气服务尚未配置'],
  INVALID_JSON:[400,false,'请求必须是有效JSON'],INVALID_REQUEST:[400,false,'问题或图片字段不符合接口要求'],
  INVALID_IMAGE:[400,false,'图片编码或类型无效'],UNAUTHORIZED:[401,false,'需要有效认证'],FORBIDDEN:[403,false,'没有访问权限'],
  SAME_ORIGIN_REQUIRED:[403,false,'仅允许同源写请求'],METHOD_NOT_ALLOWED:[405,false,'仅支持POST'],
  REQUEST_CANCELLED:[408,false,'请求已取消'],REQUEST_TOO_LARGE:[413,false,'请求体超过6 MiB'],IMAGE_TOO_LARGE:[413,false,'图片超过4 MiB'],
  UNSUPPORTED_MEDIA_TYPE:[415,false,'仅接受application/json'],AI_RATE_LIMITED:[429,true,'AI暂时限流，请稍后重试'],
  AI_UNAVAILABLE:[502,true,'AI暂时不可用，请稍后重试'],INVALID_AI_RESPONSE:[502,true,'AI回答格式无效，请重试'],
  AUTH_NOT_CONFIGURED:[503,false,'身份验证尚未配置'],AI_NOT_CONFIGURED:[503,false,'AI尚未配置'],
  AI_TIMEOUT:[504,true,'AI响应超时，请稍后重试'],INTERNAL_ERROR:[500,false,'接口处理失败'],
};
export const screenReply=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
export function screenError(code){const safeCode=typeof code==='string'&&Object.hasOwn(errors,code)?code:'INTERNAL_ERROR';const [status,retryable,message]=errors[safeCode];return screenReply({ok:false,error:{code:safeCode,message,retryable}},status,safeCode==='METHOD_NOT_ALLOWED'?{Allow:'POST'}:{});}
export const screenFault=code=>Object.assign(new Error(code),{screenCode:code});
