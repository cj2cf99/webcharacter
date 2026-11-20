import {app,safeStorage} from 'electron';
import {copyFileSync,mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createMemoryArchive} from '../desktop/memory-archive.mjs';
import {migrateMemory} from '../desktop/migrate-memory.mjs';

// 为正在使用旧主进程的用户预导入。隔离 Chromium 会话，只读取旧配置的系统加密上下文。
async function run(){
  const profile=resolve(import.meta.dirname,'../output/desktop-profile');
  const temp=mkdtempSync(join(tmpdir(),'feiyue-memory-import-'));
  const state=join(temp,'Local State');
  try{
    copyFileSync(join(profile,'Local State'),state);
    app.setPath('userData',temp);
    app.commandLine.appendSwitch('disable-background-networking');
    await app.whenReady();
    console.log(JSON.stringify(await migrateMemory(profile,createMemoryArchive(),safeStorage,{preview:true})));
  }finally{await rm(state,{force:true});}
}
run().then(()=>app.exit(0),error=>{console.error(error.message);app.exit(1);});
