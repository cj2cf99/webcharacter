import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateChat} from '../../desktop/private-chat.mjs';
import {createPrivateModel} from '../../desktop/ai-gateway.mjs';
import {createAgyCliModel} from '../../desktop/agy-local-model.mjs';

const fake=join(import.meta.dirname,'fixtures/fake-agy.mjs');
const wav=Uint8Array.from(readFileSync(new URL('../../assets/voice/private-chat/accepted.wav',import.meta.url)));

test('专聊走 AGY CLI 能生成首段，结束后主对话的备用进程仍在',{timeout:30000},async t=>{
  const profile=mkdtempSync(join(tmpdir(),'private-chat-agy-'));
  const previous=process.env.FEIYUE_AGY_PATH;
  process.env.FEIYUE_AGY_PATH=fake;
  const main=createAgyCliModel({});
  const speaking=Promise.withResolvers();
  const reports=[];
  const chat=createPrivateChat({profile,readGpu:async()=>({utilization:10,freeMiB:8000}),idle:()=>true,
    prepare:()=>true,resume(){},report:detail=>{reports.push(detail);speaking.reject(Error(detail));},
    view:{show:()=>true,update(data){if(data.phase==='speaking')speaking.resolve(data);},close(){},focus(){}},
    createModel:()=>createPrivateModel({modelPath:join(profile,'unused.gguf'),agyFallback:null}),
    createVoice:()=>({preheat:()=>({ready:true}),preheatSpeaking:()=>({ready:true}),render:async()=>({wav}),close(){}}),
  });
  t.after(async()=>{
    await chat.close();await main.close();
    if(previous===undefined)delete process.env.FEIYUE_AGY_PATH;else process.env.FEIYUE_AGY_PATH=previous;
    rmSync(profile,{recursive:true,force:true});
  });
  await main.start();
  chat.plan({id:'chat-agy',topics:['周末散步','茶','做饭']});
  assert.deepEqual(await chat.accept(chat.waiting.id),{});
  assert.match((await speaking.promise).text,/公园走走/);
  await chat.stop();
  assert.deepEqual(reports,[]);
  for(let i=0;i<100&&!main.standbyReady();i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(main.standbyReady(),true);
});
