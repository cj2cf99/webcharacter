import * as electron from 'electron';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {createPersonalityDiary} from '../desktop/personality-diary.mjs';
import {openTestDatabase} from '../agent/tests/sqlite-d1.mjs';
import {personalityMemory} from '../agent/assistant/personality-memory.mjs';
import {readFileSync} from 'node:fs';
import {desktopModelPath} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..');
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'feiyue-memory-model-')));
const schema={type:'object',properties:{review:{type:'string'}},required:['review'],additionalProperties:false};
async function run(){
await electron.app.whenReady();
const model=createBalancedLocalModel({utilityProcess:electron.utilityProcess,modelPath:desktopModelPath(electron.app,root)});
try{
  const result=await model.memory('老公说今天去书店，买了一本散文集。','你是绯月，以妻子的身份用一句中文写你的评价。',schema,new AbortController().signal);
  assert(result.review?.trim());assert.match(model.snapshot().model,/4B/);
  console.log('PASS',model.snapshot().model,model.snapshot().backend,result.review);
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(join(root,'agent/migrations/016-personality-memory.sql'),'utf8'));
  const at=Date.parse('2026-11-20T12:15:00+09:00');
  const store=createPersonalityDiary({profile:electron.app.getPath('userData'),model,now:()=>at,weather:()=>[],
    memory:{read:async day=>day==='2026-11-20'?[{id:'sample',at,state:'answer',question:'老公今天买了一本散文集。',text:'等你读完告诉我最喜欢哪篇。'}]:[],readTasks:async()=>[]},
    request:(path,options)=>personalityMemory(new Request('https://fixture.test'+path,options),{DB},'fixture')});
  try{
    await store.run('diary',new AbortController().signal);
    const p=store.pages().find(row=>row.day==='2026-11-20');
    assert(p.body.includes('你说：')&&p.body.includes('散文集')&&p.body.includes('绯月当时回复：'));
    assert(p.body.includes('当时的评价：')&&p.body.includes('绯月私语：')&&p.summary&&p.mood);
    console.log('PASS 本机 4B 取材、篇首、私语和 D1 写入：'+p.summary);
  }finally{store.close();close();}
  await model.close();electron.app.exit(0);
}catch(error){console.error(error);await model.close();electron.app.exit(1);}
}
void run();
