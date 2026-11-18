import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
// 常驻只读Win32观察器，无窗口激活、内容读取或外部依赖。
export function watchWindows({onSnapshot,onError,excludePid=process.pid}){
 let stopped=false,last=Date.now();
 const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./watch-windows.ps1',import.meta.url)),'-ParentProcessId',String(process.pid),'-ExcludeProcessId',String(excludePid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const lines=createInterface({input:child.stdout});
 lines.on('line',line=>{try{const data=JSON.parse(line);if(Array.isArray(data.windows)){last=Date.now();onSnapshot(data);}}catch{}});
 let reported=false;const fail=()=>{if(!stopped&&!reported){reported=true;onError(new Error('窗口观察服务不可用'));}};
 child.on('error',fail);child.on('exit',fail);child.stderr.on('data',()=>{});
 const timer=setInterval(()=>{if(Date.now()-last>5000)fail();},1000);
 return ()=>{stopped=true;clearInterval(timer);lines.close();child.kill();};
}
