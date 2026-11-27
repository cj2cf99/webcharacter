import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {askOrderedJson} from '../../desktop/ai-gateway.mjs';
import {createBubbleVoice} from '../../desktop/bubble-voice.mjs';
import {generateDialogue} from '../../desktop/study-generate.mjs';
import {languageMaterial,sceneMaterial} from '../../desktop/study-materials.mjs';

const order=['AGY CLI','半岛','Gemini','DeepSeek'];
function providers(answers,calls){
  const run=name=>async()=>{
    calls.push(name);
    const value=answers[name];
    if(value===undefined)throw Object.assign(Error('访问失败'),{code:'DOWN'});
    return {content:value,finishReason:'stop'};
  };
  return {agyReady:()=>true,agyRun:async()=>{
    calls.push('AGY CLI');
    return answers['AGY CLI']===undefined?{success:false,error:'DOWN'}:{success:true,response:answers['AGY CLI']};
  },bandaoRequest:run('半岛'),geminiRequest:run('Gemini'),deepseekRequest:run('DeepSeek')};
}
const accept=value=>{if(value?.ok!==true)throw Error('不合格');return value;};

test('对练生成按 AGY CLI、半岛、Gemini、DeepSeek 顺序兜底，成功即停止',async()=>{
  for(const [index,winner] of order.entries()){
    const calls=[];
    const result=await askOrderedJson({instruction:'i',input:{},accept,...providers({[winner]:'{"ok":true}'},calls)});
    assert.equal(result.provider,winner);
    assert.deepEqual(calls,order.slice(0,index+1));
  }
});

test('内容不合格同样换下一家，全部失败报出各家原因且每家只试一次',async()=>{
  const calls=[];
  await assert.rejects(askOrderedJson({instruction:'i',input:{},accept,...providers({'AGY CLI':'{"ok":false}',半岛:'不是 JSON'},calls)}),
    error=>order.every(name=>error.message.includes(name)));
  assert.deepEqual(calls,order);
});

test('取消后不再尝试下一家',async()=>{
  const calls=[],controller=new AbortController(),fake=providers({},calls);
  await assert.rejects(askOrderedJson({instruction:'i',input:{},accept,signal:controller.signal,...fake,
    agyRun:async()=>{calls.push('AGY CLI');controller.abort();return {success:false};}}));
  assert.deepEqual(calls,['AGY CLI']);
});

function scripted(steps,change=value=>value){
  const requests=[];
  return {requests,ask:async request=>{
    requests.push(request);
    const {scene,topic}=request.input;
    const value=request.purpose.endsWith('脉络')?{background:'茶水间',sourceDirection:topic??scene.topics[0],resolvedTopic:'周末做饭',
      roles:{A:'同事',B:'我'},relationship:'同事',atmosphere:'轻松',beats:Array.from({length:steps},(_,i)=>({step:i+1,event:'事件'+i}))}
      :{style:'丁寧語',styleReason:'同事',closing:{ja:'また。',zh:'回见。'},
        turns:Array.from({length:steps},(_,i)=>({step:i+1,a:{ja:'質問'+i,zh:'问'},b:{ja:'返事をします。'+i,zh:'答'}}))};
    return {value:request.accept(change(value)),provider:'AGY CLI'};
  }};
}

test('生成结果可直接存为本机剧本材料，新场景和已缓存场景都能用',async()=>{
  const {ask}=scripted(3);
  const {script,providers:used}=await generateDialogue({title:' 茶水间 ',topic:'',level:'N2',ability:'standard',steps:3},ask);
  assert.deepEqual(used,['AGY CLI']);
  const material=languageMaterial(script);
  assert.equal(material.turns.length,3);
  assert.equal(material.turns[0].stem,'質問0');
  const saved=sceneMaterial(script.scene);
  assert.equal(saved.title,'茶水间');
  const again=scripted(2);
  const next=await generateDialogue({saved,topic:'新话题',level:'N3',ability:'business',steps:2},again.ask);
  assert.equal(next.script.scene.id,script.scene.id);
  assert.deepEqual(again.requests[0].input.scene.topics,['茶水间','新话题']);
  assert.equal(next.script.plan.sourceDirection,'新话题');
});

test('步数、名称和缺翻译的输出被拒绝',async()=>{
  const none=async()=>{throw Error('不应调用模型');};
  await assert.rejects(generateDialogue({title:'x',level:'N1',ability:'business',steps:31},none),/1～30/u);
  await assert.rejects(generateDialogue({title:' ',level:'N1',ability:'business',steps:2},none),/新场景名称/u);
  const {ask}=scripted(2,value=>{if(value.turns)delete value.turns[1].a.zh;return value;});
  await assert.rejects(generateDialogue({title:'x',level:'N1',ability:'business',steps:2},ask),/台词与翻译/u);
});

test('音色库列出一份 WAV 加一份 TXT 的目录，选择写回 voices.json 且不动其他用途',t=>{
  const root=mkdtempSync(join(tmpdir(),'feiyue-voices-'));
  const previous=process.env.FEIYUE_VOICE_ROOT;
  process.env.FEIYUE_VOICE_ROOT=root;
  t.after(()=>{if(previous===undefined)delete process.env.FEIYUE_VOICE_ROOT;else process.env.FEIYUE_VOICE_ROOT=previous;
    rmSync(root,{recursive:true,force:true});});
  const folder=(name,files)=>{mkdirSync(join(root,name));for(const file of files)writeFileSync(join(root,name,file),'x');};
  folder('甲',['a.wav','a.txt']);folder('乙',['B.WAV','p.txt']);folder('缺文本',['a.wav']);folder('两段',['a.wav','b.wav','a.txt']);
  writeFileSync(join(root,'voices.json'),'{"default":"甲","study":"甲"}');
  const voice=createBubbleVoice({root,profile:root});
  assert.deepEqual(voice.voices('study'),{list:['甲','乙'].sort(),current:'甲'});
  voice.chooseVoice('study','乙');
  assert.deepEqual(JSON.parse(readFileSync(join(root,'voices.json'),'utf8')),{default:'甲',study:'乙'});
  assert.throws(()=>voice.chooseVoice('study','缺文本'),/不可用/u);
  assert.throws(()=>voice.chooseVoice('study','../甲'),/不可用/u);
});
