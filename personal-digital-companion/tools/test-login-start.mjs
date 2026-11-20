// 用真实 Windows 脚本宿主和一次性 Electron 应用验延迟，不注册系统启动项。
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFile, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

const desktop=resolve(import.meta.dirname,'../desktop');
const fixture=await mkdtemp(join(tmpdir(),'绯月 login '));
const script=join(fixture,'login-start.js'), receipt=join(fixture,'started.json');
await copyFile(join(desktop,'login-start.js'),script);
await writeFile(join(fixture,'package.json'),JSON.stringify({name:'feiyue-login-test',main:'probe.cjs'}));
await writeFile(join(fixture,'probe.cjs'),`
  const {app}=require('electron');
  app.setPath('userData',__dirname);
  require('node:fs').writeFileSync(require('node:path').join(__dirname,'started.json'),
    JSON.stringify({started:Date.now(),args:process.argv}));
  app.exit(0);
`);
const start=Date.now();
const child=spawn(join(process.env.SystemRoot,'System32','cscript.exe'),
  ['//NoLogo',script,join(desktop,'node_modules/electron/dist/electron.exe')],{windowsHide:true,stdio:'inherit'});
const exitCode=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',done);});
assert.equal(exitCode,0);
let result;
for(let i=0;i<100;i++){
  try{result=JSON.parse(await readFile(receipt,'utf8'));break;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await wait(100);
}
assert.ok(result,'测试应用应留下启动回执');
assert.ok(result.started-start>=60_000,'登录启动器必须等满一分钟');
assert.ok(result.args.includes('--feiyue-login'));
console.log('PASS：系统启动器实际等待 '+((result.started-start)/1000).toFixed(1)+' 秒后打开了隔离应用。');
