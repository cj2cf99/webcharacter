import {app} from 'electron';
import {registerHooks} from 'node:module';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// 巡检入口先启动，再加载受测模块，让静态依赖的解析错误也能正常回报退出码。
export async function runElectronCheck(entry){
  const loaded=new Set();
  const hooks=registerHooks({load(url,context,nextLoad){
    if(url.startsWith('file:')&&/\.(?:mjs|cjs|js)$/i.test(new URL(url).pathname))loaded.add(fileURLToPath(url));
    return nextLoad(url,context);
  }});
  try{
    await import(entry.href);
  }catch(error){
    console.error('Electron 巡检加载失败',fileURLToPath(entry),error);
    // Electron 的 ESM 解析异常有时只列内部堆栈。用同一运行时定位具体文件、行号。
    if(error.name==='SyntaxError'){
      for(const file of [...loaded].reverse()){
        const check=spawnSync(process.execPath,['--check',file],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true});
        if(check.status===1&&check.stderr){console.error(check.stderr);break;}
      }
    }
    app.exit(1);
  }finally{hooks.deregister();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const target=process.argv[2];
  if(target){
    process.argv.splice(1,1);
    void runElectronCheck(pathToFileURL(resolve(target)));
  }else{
    console.error('请提供 Electron 巡检脚本的路径。');app.exit(1);
  }
}
