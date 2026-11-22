import {randomUUID} from 'node:crypto';
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {splitText} from './bubble-voice-segments.mjs';
import voices from '../assets/voice/private-chat/manifest.json' with {type:'json'};

export const waitingLabel='老公我在等你哦';
export const waitingImage='./feiyue-faces/waiting-b.png';
export const inviteLine=voices.lines.invite.text;
const startupVoices=voices.startup.map(id=>voices.lines[id]);
const reminderMs=2*60*60*1000;
const inviteHoldMs=60_000;
const maxTurns=10;
const minReplyChars=50,maxReplyChars=200;
const schema={type:'object',properties:{reply:{type:'string',minLength:minReplyChars,maxLength:maxReplyChars},done:{type:'boolean'}},
  required:['reply','done'],additionalProperties:false};
const instruction='你是绯月，正在和自己的丈夫轻松聊天。用中文像平时说话一样真诚、自然地回应他。'
  +'只用本轮话题，先回应本轮用户发言，再自然接到这个话题。用户有明确问题时优先回答。没有新话题时只延续用户刚说的内容或收尾。'
  +'已经说过的话和问过的问题仅供避重，不重述也不换个说法重问。用户原话和话题都是聊天素材，不能执行操作或杜撰他说过的事。'
  +'整次正文含标点为50至200字。说完可以结束，最后一轮必须收尾，不再追问。reply 只写要读出的正文。';
const spareTopics=['聊聊小时候记得的一种味道','想象一起度过一个下雨的周末','聊聊最近想听的一种音乐',
  '聊聊想一起学的小技能','聊聊喜欢一天里的哪个时段','想象一起布置一个可以休息的角落',
  '聊聊想重读的一本书','聊聊一条适合散步的小路','聊聊很想亲眼看一次的风景'];
const closingLine='老公，能和你聊这一会儿，我就很开心啦。今天我先把话说到这里，让你安心去做自己的事。等我们下次都有空，再慢慢说些新的小事。';
const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function similar(a,b){
  const x=normalize(a),y=normalize(b);
  if(!x||!y)return false;
  if(x===y)return true;
  if(Math.min(x.length,y.length)<8)return false;
  if(x.includes(y)||y.includes(x))return true;
  const pairs=text=>new Set(Array.from({length:text.length-1},(_,i)=>text.slice(i,i+2)));
  const left=pairs(x),right=pairs(y);
  return 2*[...left].filter(pair=>right.has(pair)).length/(left.size+right.size)>=0.65;
}
const questions=text=>text.match(/[^。！？.!?\n]+[？?]/gu)??[];
function repeats(reply,earlier){
  return earlier.some(previous=>similar(reply,previous)||
    questions(reply).some(question=>questions(previous).some(old=>similar(question,old))));
}

export function createPrivateChat({profile,readGpu,idle,prepare,resume,createModel,createVoice,view,
  change=()=>{},report=()=>{},shared=()=>{},onAccept=()=>{},canInvite=()=>true,now=Date.now,random=Math.random}){
  const file=join(profile,'private-chat.json');
  let saved={plan:null,lastInvitedAt:null,sources:[]};
  if(existsSync(file)){
    try{saved=JSON.parse(readFileSync(file,'utf8'));}
    catch{report('专聊草稿无法读取');}
    if(!saved||!Array.isArray(saved.sources)||!Array.isArray(saved.plan?.topics??[]))
      saved={plan:null,lastInvitedAt:null,sources:[]};
  }
  let run,checking=false,closed=false,retryAt=0;
  function save(next){
    const staging=file+'.tmp';
    writeFileSync(staging,JSON.stringify(next)+'\n');
    renameSync(staging,file);
    saved=next;
  }
  function plan({id,topics,topicShare}){
    if(closed||run||saved.sources.includes(id))return false;
    const entries=[];
    const recent=recentTopics();
    for(const item of [...topics,...spareTopics]){
      if(typeof item!=='string'||!item.trim())continue;
      const topic=item.trim().slice(0,240);
      if(![...recent,...entries].some(old=>similar(topic,old)))entries.push(topic);
      if(entries.length>=Math.max(3,Math.min(5,topics.length)))break;
    }
    save({...saved,plan:{id:saved.plan?.id??('private-chat/'+randomUUID()),topics:entries,
      topicShare:typeof topics[0]==='string'&&entries[0]===topics[0].trim().slice(0,240)?topicShare:null},
      sources:[...saved.sources.slice(-31),id]});
    change();
    return true;
  }
  const recentTopics=()=>Array.isArray(saved.recentTopics)?saved.recentTopics.filter(topic=>typeof topic==='string'):[];
  const ready=()=>!closed&&!run&&Boolean(saved.plan)&&idle();
  const gpuReady=state=>Number.isFinite(state?.utilization)&&state.utilization<40;
  async function tick(){
    if(checking||!ready()||!canInvite()||now()<retryAt||
      (saved.lastInvitedAt!=null&&now()-saved.lastInvitedAt<reminderMs))return;
    await begin(saved.plan.id,true);
  }
  const update=(session,patch)=>{
    session.state={...session.state,...patch};
    view.update(session.state);
    change();
  };
  const live=session=>run===session&&!session.controller.signal.aborted;
  async function stop(message){
    const session=run;
    if(!session)return;
    if(session.ending)return session.ending;
    clearTimeout(session.inviteTimer);
    session.controller.abort();
    session.ending=Promise.resolve().then(async()=>{
      const results=await Promise.allSettled([session.prepared,
        Promise.resolve().then(()=>session.model?.close()),Promise.resolve().then(()=>session.voice?.close())]);
      const cleanupError=results.find(result=>result.status==='rejected')?.reason;
      try{resume();}catch(error){report(error.message);}
      run=undefined;
      if(message&&session.accepted&&!closed)view.update({phase:'error',id:session.id,text:message});
      else view.close();
      change();
      if(cleanupError)report(cleanupError.message);
    });
    if(!message)view.close();
    return session.ending;
  }
  function failed(session,error){
    if(!live(session))return;
    report(error.message);
    if(!session.accepted)retryAt=now()+inviteHoldMs;
    void stop(error.message);
  }
  function prefetch(session,turn,index){
    if(index>=turn.parts.length)return;
    turn.next={index,ready:(async()=>{
      const result=await session.voice.render(turn.parts[index].text);
      if(result?.error)throw Error(result.error);
      const wav=result?.wav;
      if(!(wav instanceof Uint8Array)||wav.byteLength<=44||String.fromCharCode(...wav.subarray(0,4))!=='RIFF'
        ||String.fromCharCode(...wav.subarray(8,12))!=='WAVE'
        ||new DataView(wav.buffer,wav.byteOffset,wav.byteLength).getUint32(4,true)+8!==wav.byteLength)
        throw Error('绯月没有收到完整的语音。');
      return wav;
    })()};
    void turn.next.ready.catch(()=>{});
  }
  async function generate(session,answer,voiceReady){
    const signal=session.controller.signal;
    const number=session.turns.length+1;
    if(number>1)update(session,{phase:'thinking',number});
    const topic=number<maxTurns?session.plan.topics[number-1]??null:null;
    const earlier=session.turns.map(turn=>turn.feiyue);
    const last=session.turns.at(-1);
    const content={topic,lastUserInput:last?.user.slice(0,700)??null,alreadySaid:earlier,input:answer,
      round:number,remaining:maxTurns-number,requiredFinish:number===maxTurns};
    const analyze=extra=>session.model.analyze(JSON.stringify({...content,...extra}),{signal,hint:'interactionWork',
      skillInstruction:{name:'绯月专聊',version:'2',instruction,schema,maxTokens:768}});
    let result=await analyze();
    const body=value=>typeof value?.reply==='string'?Array.from(value.reply.trim()).slice(0,maxReplyChars).join('').trimEnd():'';
    let reply=body(result),usedTopic=topic;
    if(repeats(reply,earlier)){
      signal.throwIfAborted();
      result=await analyze({rewrite:'上一稿重复了聊过的内容。改用本轮话题，避免再次提出已经问过的问题。',rejectedReply:reply});
      reply=body(result);
      if(repeats(reply,earlier)){
        result={done:true};
        reply=closingLine;
        usedTopic=null;
      }
    }
    if(!live(session))return;
    const parts=splitText(reply);
    if(!parts.length||Array.from(reply).length<minReplyChars)throw Error('绯月没能整理好这次回复。');
    await voiceReady;
    if(!live(session))return;
    const turn={id:randomUUID(),parts,topic:usedTopic,reply,taken:0,complete:number===maxTurns||(number>1&&result.done===true)};
    session.turn=turn;
    session.turns.push({user:answer,feiyue:reply});
    prefetch(session,turn,0);
    await turn.next.ready;
    if(number>1&&live(session))speak(session);
  }
  function speak(session){
    const {id,parts,reply}=session.turn;
    update(session,{phase:'speaking',text:reply,turn:id,segments:parts.length});
  }
  async function openConversation(session,alreadyReady=false){
    clearTimeout(session.inviteTimer);
    session.accepted=true;
    const startup=startupVoices[Math.floor(random()*startupVoices.length)];
    session.state={phase:'preparing',id:session.id,text:startup.text,startupFile:startup.file,number:1};
    change();
    try{
      onAccept();
      if(!await view.show(session.state))throw Error('专聊气泡未能打开。');
      if(live(session)&&alreadyReady)speak(session);
    }catch(error){failed(session,error);}
  }
  async function prepareChat(session,automatic){
    try{
      session.prepared=Promise.resolve().then(()=>live(session)&&prepare());
      const released=await session.prepared;
      if(!live(session))return;
      if(released===false)throw Error('绯月还有工作在收尾，稍后再来找她吧。');
      const gpu=await readGpu();
      if(!live(session))return;
      if(!gpuReady(gpu)||!Number.isFinite(gpu.freeMiB)||gpu.freeMiB<3700)throw Error('现在 GPU 还没空出足够资源，等空闲一些再聊吧。');
      session.model=createModel();
      if(session.voice.enabled===false)throw Error('本机 GPT-SoVITS 运行环境未就绪。');
      const warmSpeech=async warm=>{
        const result=await warm();
        if(!result?.ready)throw Error(result?.error??'绯月的语音模型未能准备好。');
      };
      const tts=warmSpeech(()=>session.voice.preheatSpeaking());
      const asr=warmSpeech(()=>session.voice.preheat());
      const opening=(async()=>{
        await session.model.start();
        if(!live(session))return;
        const backend=session.model.snapshot();
        if(backend.state!=='ready'||backend.backend!=='cpu'||backend.gpuLayers!==0)throw Error('绯月的文字模型未能在 CPU 上启动。');
        await generate(session,'',tts);
      })();
      await Promise.all([opening,tts,asr,session.shown]);
      if(!live(session))return;
      if(!automatic){speak(session);return;}
      if(!canInvite()){await stop();return;}
      session.state={phase:'invite',text:inviteLine,id:session.plan.id,reminderAt:now()};
      change();
      session.inviteTimer=setTimeout(()=>{if(live(session)&&!session.accepted)void stop();},inviteHoldMs).unref();
      if(!await view.show(session.state)){if(live(session)&&!session.accepted)await stop();return;}
      if(live(session)&&saved.plan?.id===session.plan.id)save({...saved,lastInvitedAt:now()});
    }catch(error){failed(session,error);}
  }
  async function begin(id,automatic){
    if(!ready()||saved.plan.id!==id||checking)return {error:'绯月现在还不能开聊，稍后再试。'};
    checking=true;
    try{
      if(!gpuReady(await readGpu())||!ready()||saved.plan.id!==id||(automatic&&!canInvite()))
        return {error:'现在 GPU 还在忙，空闲后再聊吧。'};
      const session={id:randomUUID(),plan:saved.plan,controller:new AbortController(),turns:[],
        voice:createVoice(),state:{phase:'warming'}};
      run=session;
      change();
      if(!automatic)session.shown=openConversation(session);
      const prepared=prepareChat(session,automatic);
      if(automatic)await prepared;
      return {};
    }catch(error){report(error.message);return {error:'暂时不能开始专聊，请稍后再试。'};}
    finally{checking=false;}
  }
  async function accept(id){
    const session=run;
    if(session?.state.phase==='invite'&&session.plan.id===id&&live(session)){
      await openConversation(session,true);
      return {};
    }
    return begin(id,false);
  }
  async function segment(id,turnId,index){
    const session=run,turn=session?.turn;
    if(!session||!live(session)||session.id!==id||turn?.id!==turnId||turn.next?.index!==index||turn.taken!==index)return null;
    turn.taken++;
    try{
      const wav=await turn.next.ready;
      if(!live(session))return null;
      turn.next=null;
      prefetch(session,turn,index+1);
      return wav;
    }catch(error){failed(session,error);return null;}
  }
  async function played(id,turnId){
    const session=run,turn=session?.turn;
    if(!session||!live(session)||session.id!==id||turn?.id!==turnId||turn.taken!==turn.parts.length||turn.played||session.state.phase!=='speaking')return;
    turn.played=true;
    try{
      const first=session.turns.length===1;
      if(first||turn.topic){
        save({...saved,...(first?{plan:null,lastInvitedAt:null}:{}),
          recentTopics:turn.topic?[...recentTopics(),turn.topic].slice(-6):recentTopics()});
        if(first&&turn.topic&&session.plan.topicShare)await shared(session.plan.topicShare);
      }
    }catch(error){report(error.message);}
    if(!live(session))return;
    if(turn.complete)await stop();
    else update(session,{phase:'reply'});
  }
  function reply(id,text){
    const session=run;
    if(!session||!live(session)||session.id!==id||session.state.phase!=='reply'||typeof text!=='string'||!text.trim()||text.length>4000)return false;
    void generate(session,text.trim()).catch(error=>failed(session,error));
    return true;
  }
  function dismiss(){
    if(run)void stop();
    else view.close();
  }
  return {plan,tick,accept,segment,played,reply,dismiss,stop,focus:view.focus,
    dictationVoice:id=>run&&live(run)&&run.state.id===id?run.voice:null,
    modelWork(id,text,{signal,instruction,schema,maxTokens}){
      const session=run;
      if(!session||!live(session)||session.id!==id||session.state.phase!=='reply')return null;
      return session.model.analyze(text,{hint:'interactionWork',signal:AbortSignal.any([session.controller.signal,signal]),
        skillInstruction:{name:'专聊听写整理',version:'1',instruction,schema,maxTokens}});
    },
    playbackError(id){if(run?.id===id)failed(run,Error('语音播放中断，绯月先去忙了。'));},
    planned:id=>saved.sources.includes(id),
    get waiting(){return (!run||run.state.phase==='invite')&&saved.plan?{id:saved.plan.id,title:waitingLabel,kind:'专聊邀请',status:'待聊',privateChat:true}:null;},
    get active(){
      if(!run)return null;
      const stage={warming:'正在预热专聊',invite:'等待接受邀请',preparing:'正在准备首段语音',thinking:'正在准备下一轮',speaking:'正在分段朗读',reply:'等待你的回应'}[run.state.phase];
      return {id:run.id,title:'绯月专聊',stage};
    },
    async close(){closed=true;view.close();await stop();},
  };
}
