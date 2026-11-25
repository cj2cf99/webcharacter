import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {readFile,unlink} from 'node:fs/promises';
import {atomicFile,optional} from './memory-archive.mjs';
import {tokyoDay} from './conversation-history.mjs';
import {captureAllDisplays,encodeImage} from './vision-client.mjs';
import {fields} from './emotion-service.mjs';

const word={type:'string',maxLength:320};
const impulse=fields({choice:{enum:['observe','reflect','wait']},idea:word});
const expression=fields({action:{enum:['ask','share','quiet']},record:{enum:['diary','nag','none']},text:word,
  focus:word,drawing:word});
const observeExpression=fields({seen:word,action:{enum:['ask','share','quiet']},record:{enum:['diary','nag','none']},text:word,
  focus:word,box:{type:'array',items:{type:'integer'},maxItems:4},drawing:word});
const philosophy='你是绯月，天生对哲学持续好奇。无具体念头时优先从一个日常哲学问题出发，也可以安静。';
const asText=v=>typeof v==='string'?v.trim().slice(0,320):'';
export function readBox(answer){
  let b=answer;
  if(typeof answer==='string'){try{b=JSON.parse(answer);}catch{return null;}}
  if(!Array.isArray(b)||b.length!==4||!b.every(Number.isInteger))return null;
  const [x,y,w,h]=b;
  return x>=0&&y>=0&&w>=8&&h>=8&&x+w<=1000&&y+h<=1000&&w*h<650000?b:null;
}
export function createSceneCuriosity({profile,memory,diary,model,vision,electron,show,draw,eligible,wake,context,queueQuestion,now=Date.now}){
  const pending=join(profile,'curiosity-pending.json'),recent=join(profile,'curiosity-last.json');
  const lifetime=new AbortController();
  let painting=null,closed=false;
  const read=async path=>JSON.parse(await optional(readFile(path,'utf8'))??'null');
  const write=(path,value)=>atomicFile(path,JSON.stringify(value,null,2));
  const dir=s=>join(memory.folder(tokyoDay(s.at)),'此刻所想',s.id);
  const file=s=>join(dir(s),'想法.json');
  const save=s=>write(file(s),s);
  async function finish(view,reply){
    const s=await read(file(view));
    if(!s||s.id!==view.id)throw Error('找不到这次想法');
    // The actual reply stays distinct from her observation and her interpretation.
    if(reply&&!s.reply){s.reply=reply;s.repliedAt=now();await save(s);}
    await diary.recordScene(s,lifetime.signal);
    await write(recent,{text:s.text,reply:s.reply??'',at:s.at});
    await optional(unlink(pending));
  }
  function startDrawing(s){
    if(painting||closed)return;
    painting=(async()=>{
      try{
        const out=await draw(s.drawing,s.id);
        const img=electron.nativeImage.createFromPath(out);
        const jpeg=encodeImage(img);
        await atomicFile(join(dir(s),'画作.jpg'),Buffer.from(jpeg.data_base64,'base64'));
        s.frames.push({name:'画作.jpg',label:'绯月画的'});
      }catch(error){if(closed||error?.code==='INTERRUPTED')return;s.drawingFailed=true;}
      s.drawn=true;await save(s);
    })().finally(()=>{painting=null;if(!closed)wake();});
    void painting.catch(()=>{});
  }
  async function deliver(s,signal){
    if(!eligible()||closed)return {detail:'等空闲时再继续'};
    if(s.action==='ask'&&queueQuestion){
      const outcome=await queueQuestion(s,signal);
      if(!outcome)return {detail:'场景质问等待加入待确认'};
      await write(recent,{text:s.text,reply:'',at:s.at});
      await optional(unlink(pending));
      return {detail:outcome==='resolved'?'场景疑点已用本机知识核对':'场景质问已加入待确认'};
    }
    if(s.drawing&&!s.drawn){startDrawing(s);return {detail:'后台绘图中'};}
    if(s.drawingFailed&&!s.frames.length&&s.action==='share')s.action='quiet';
    if(s.action==='quiet'||s.delivered){await finish(s,'');return {detail:'已整理这次想法'};}
    const frames=await Promise.all(s.frames.slice(0,2).map(async f=>({...f,url:'data:image/jpeg;base64,'+(await readFile(join(dir(s),f.name))).toString('base64')})));
    signal.throwIfAborted();if(!eligible())return {detail:'稍后展示'};
    s.delivered=true;await save(s);
    try{
      if(!await show({id:s.id,at:s.at,kind:s.action,text:s.text,frames})){s.delivered=false;await save(s);}
    }catch(error){s.delivered=false;await save(s);throw error;}
    return {detail:s.delivered?'已展示想法':'等待展示'};
  }
  async function run(signal){
    const pointer=await read(pending);
    if(pointer)return deliver(await read(file(pointer)),signal);
    if(!eligible())return {detail:'本轮略过'};
    const last=await read(recent);
    const data={心情:context(),最近的念头:last?.text,你的实际回答:last?.reply};
    const analyze=(input,instruction,schema)=>model.memory(JSON.stringify(input),philosophy+instruction,schema,signal,{name:'scene-curiosity',version:'1'});
    const first=await analyze(data,'自主决定是否想看一眼老公鼠标所在的屏幕、独自思考，或休息。idea写自己的好奇。',impulse);
    signal.throwIfAborted();
    if(first.choice==='wait'||!eligible())return {detail:'这次想安静一会儿'};
    let image,encoded,seen='',decision;
    if(first.choice==='observe'){
      const captured=await captureAllDisplays(electron.screen,electron.desktopCapturer,signal);
      image=captured[0];
      const allEncoded=captured.map(encodeImage);
      encoded=allEncoded[0];
      const observePrompt=[
        philosophy,
        `当前上下文：${JSON.stringify({...data,念头:asText(first.idea)})}`,
        '请一次完成看屏与判断：',
        '- seen：只描述画面中确实可见的主体和关系（不复述私密文字或数字，不推断人的目的；看不清写“无法辨认”）。',
        '- action：ask（凡希望他回答的都用 ask，只问一个真正想知道的问题，用你和老公平常说话的语气）、share（分享）、quiet（自己想）。',
        '- record：独立选择 diary、nag 或 none。',
        '- text：实际想说或记下的话；猜测用第一人称，不虚构他的回答；无其他灵感时从哲学找突破。',
        '- focus 与 box：仅当 action 为 ask 且针对某个可见细节提问时填 focus，同时给出能包住该目标的最紧椭圆外框 box（[左,上,宽,高]，相对图1按千分比，不确定填 []）；整图提问或非 ask 时 focus 留空、box 填 []。',
        '- drawing：想借自己的画表达时填独立绘图描述，否则留空。'
      ].join('\n');
      const result=await vision(observePrompt,allEncoded.length===1?allEncoded[0]:allEncoded,signal,{schema:observeExpression});
      signal.throwIfAborted();if(!eligible())return {detail:'本轮略过'};
      if(!result?.data)return {detail:'这次安静结束'};
      decision=result.data;
      seen=asText(decision.seen);
    }else{
      decision=await analyze({...data,念头:asText(first.idea),眼前可见:''},
        '根据这一刻决定：ask 时只问一个真正想知道的问题，用你和老公平常说话的语气；凡希望他回答的都用 ask。share 分享，quiet 自己想。record 独立选日记、念叨或不记。猜测用第一人称，不虚构他的回答。若无其他灵感从哲学找突破。text 写实际想说或记下的话。仅针对一个可见细节的提问才填 focus，整图留空。想借自己的画表达时 drawing 填独立绘图描述，否则留空。',expression);
      signal.throwIfAborted();if(!eligible())return {detail:'本轮略过'};
    }
    const {action,record}=decision,text=asText(decision.text),drawing=asText(decision.drawing);
    if(!text||!['ask','share','quiet'].includes(action)||!['diary','nag','none'].includes(record)||
        action==='quiet'&&record==='none'||last?.text===text)return {detail:'这次安静结束'};
    const s={id:randomUUID(),at:now(),action,record,text,seen,drawing,frames:[]};
    if(image&&encoded&&action!=='quiet'){
      const box=action==='ask'&&asText(decision.focus)?readBox(decision.box):null;
      await atomicFile(join(dir(s),'场景.jpg'),Buffer.from(encoded.data_base64,'base64'));
      s.frames.push({name:'场景.jpg',label:'刚才看到的',box});
    }
    await save(s);await write(pending,{id:s.id,at:s.at});return deliver(s,signal);
  }
  async function questionImage(id,at){
    if(!Number.isFinite(at)||!/^[-a-f0-9]{36}$/.test(id))return;
    const frame=await optional(readFile(join(dir({id,at}),'场景.jpg')));
    if(frame)return 'data:image/jpeg;base64,'+frame.toString('base64');
  }
  return {run,finish,questionImage,close(){closed=true;lifetime.abort();}};
}
