// 两个 X 视频页面共用的小工具。
export const $=selector=>document.querySelector(selector);
export function element(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
export function button(label,className,action,title){
  const node=element('button',className,label);
  node.type='button';
  if(title){node.title=title;node.setAttribute('aria-label',title);}
  node.onclick=action;
  return node;
}
// IPC 错误去掉 Electron 加的调用前缀。
export const message=error=>String(error?.message||'操作失败，请重试。').replace(/^Error invoking remote method '[^']*': (Error: )?/,'');
export const short=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function duration(seconds){
  const total=Math.round(seconds||0),h=Math.floor(total/3600),m=Math.floor(total/60)%60,s=total%60;
  return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
export function target(url){
  const match=/x\.com\/([^/]+)\/(?:web\/)?status\/(\d+)/.exec(url);
  return match?(match[1]==='i'?'帖子':'@'+match[1])+' · …'+match[2].slice(-6):url;
}
// 引擎或磁盘问题、记录读取失败、更新状态统一显示在横幅。
export function problem(snapshot){
  return snapshot.error||(!snapshot.engine.ready&&snapshot.engine.help)||(!snapshot.disk.ready&&snapshot.disk.help)||'';
}
