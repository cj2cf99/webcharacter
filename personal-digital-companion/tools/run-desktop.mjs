import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {existsSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
let binary;
try{
  // Electron45的包入口可能自动下载二进制；这里只定位已安装的exe，启动不触发安装。
  const packageFile=createRequire(resolve(root,'desktop/package.json')).resolve('electron/package.json');
  binary=resolve(dirname(packageFile),'dist/electron.exe');
  if(!existsSync(binary))throw Error('Electron运行包尚未下载完成');
}
catch{
  console.error('Electron软件包或Windows运行包尚未安装完整。请完成已获许可的依赖安装后再启动；启动器不会自动下载。');
  process.exit(2);
}
if(!existsSync(resolve(root,'output/desktop-bundle/index.html'))){console.error('先执行 node tools/build-desktop.mjs');process.exit(2);}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(binary,[resolve(root,'desktop')],{windowsHide:true,stdio:'inherit',env});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
