import {watch,writeSync} from 'node:fs';
import {basename, dirname} from 'node:path';

let warningLog;
export function setLiveWarningLog(write){warningLog=write;}
export function warnLiveUpdate(route,error,files){
  const message=String(error?.message??error);
  if(warningLog){
    void warningLog({direction:'local',route,error:message,...(files?{files}:{})});
    return;
  }
  // 独立工具没有桌面日志。直接写描述符，关闭的管道不会再异步抛出流错误。
  try{writeSync(2,route+'：'+message+'\n');}catch{/* 启动工具的终端可能已关闭。 */}
}

// 监听父目录，兼容编辑器先写临时文件再替换，也能在一次写入失败后继续监听。
export function watchChanges(directory, accept, apply, recursive = false) {
  const pending = new Set();
  let timer;
  const observer = watch(directory, {recursive, persistent:false}, (_event, name) => {
    if (!name || !accept(name)) return;
    pending.add(name);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const changed = [...pending];
      pending.clear();
      try { apply(changed); }
      catch (error) { warnLiveUpdate('绯月热加载',error,changed); }
    }, 100);
  });
  observer.on('error', error => warnLiveUpdate('绯月文件监听',error));
  return () => { clearTimeout(timer); observer.close(); };
}

export function watchFileChanges(file, apply) {
  return watchChanges(dirname(file), name => name === basename(file), apply);
}
