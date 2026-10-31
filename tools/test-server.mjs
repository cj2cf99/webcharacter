import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {once} from 'node:events';
const port=18768,base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['tools/dev-server.mjs',String(port)],{stdio:['ignore','pipe','pipe']});
try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('服务启动失败');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('服务启动超时')),5000);timer.unref();})]);
 for(const route of ['/','/rigby-magic.html','/assets/white/character.json'])assert.equal((await fetch(base+route)).status,200,route);
 for(const route of ['/.git/config','/local-backup/pre-cleanup-2026-11-01.zip','/seethrough_output.psd'])assert.equal((await fetch(base+route)).status,400,route);
 assert.equal((await fetch(base+'/save?name=../escape.txt',{method:'POST',body:'test'})).status,400);
 console.log('PASS: 本地首页和模型可读取；Git/备份/PSD 和越界写入被拒绝。');
}finally{child.kill();}
