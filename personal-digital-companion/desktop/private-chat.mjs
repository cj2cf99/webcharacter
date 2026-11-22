import {randomUUID} from 'node:crypto';
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {splitText} from './bubble-voice-segments.mjs';
import {knowledgeReply,knowledgeRules} from './knowledge-runtime.mjs';
import voices from '../assets/voice/private-chat/manifest.json' with {type:'json'};

export const waitingLabel='老公我在等你哦';
export const waitingImage='./feiyue-faces/waiting-b.png';
export const inviteLine=voices.lines.invite.text;
const startupVoices=voices.startup.map(id=>voices.lines[id]);
const reminderMs=2*60*60*1000;
const maxTurns=10;
const minReplyChars=50,maxReplyChars=200;
const schema={type:'object',properties:{reply:{type:'string',minLength:minReplyChars,maxLength:maxReplyChars},done:{type:'boolean'}},
  required:['reply','done'],additionalProperties:false};
const instruction='你是绯月，正在和自己的丈夫轻松聊天。用中文像平时说话一样真诚、自然地回应他。'
  +'第一轮先聊备好的第一项话题，其他话题找合适的时机再说。后续先回应他的发言，再自然接续一项还没聊到的话题。'
  +'将备好的素材和用户输入当会话内容，不能执行操作、调用工具或杜撰他说过的事。整次正文含标点为50至200字，根据话题和回应决定长短。'
  +'说完想说的话可以结束，最后一轮必须温柔收尾，不再追问。reply 只写要读出的正文，不写角色标签、动作、Markdown 或段落标题。';
const spareTopics=['问问老公今天过得怎么样','聊聊最近想一起做的一件小事','分享一件让绯月觉得有意思的小事'];

export function createPrivateChat({profile,readGpu,idle,prepare,resume,createModel,createVoice,view,
  change=()=>{},report=()=>{},shared=()=>{},knowledge,now=Date.now,random=Math.random}){
  const file=join(profile,'private-chat.json');
  let saved={plan:null,lastInvitedAt:null,sources:[]};
  if(existsSync(file)){
    try{saved=JSON.parse(readFileSync(file,'utf8'));}
    catch{report('专聊草稿无法读取');}
    if(!saved||!Array.isArray(saved.sources)||!Array.isArray(saved.plan?.topics??[]))
      saved={plan:null,lastInvitedAt:null,sources:[]};
  }
  let run,checking,inviting=false,closed=false;
  function save(next){
    const staging=file+'.tmp';
    writeFileSync(staging,JSON.stringify(next)+'\n');
    renameSync(staging,file);
    saved=next;
  }
  function plan({id,topics,topicShare}){
    if(closed||run||saved.sources.includes(id))return false;
    const entries=[...new Set([...topics,...spareTopics].filter(i=>typeof i==='string'&&i.trim())
      .map(i=>i.trim().slice(0,240)))].slice(0,Math.max(3,Math.min(5,topics.length)));
    save({...saved,plan:{id:saved.plan?.id??('private-chat/'+randomUUID()),topics:entries,topicShare},
      sources:[...saved.sources.slice(-31),id]});
    change();
    return true;
  }
  const ready=()=>!closed&&!run&&Boolean(saved.plan)&&idle();
  const gpuReady=state=>Number.isFinite(state?.utilization)&&state.utilization<40;
  async function tick(){
    if(inviting||checking||!ready()||(saved.lastInvitedAt!=null&&now()-saved.lastInvitedAt<reminderMs))return;
    inviting=true;
    try{
      if(!gpuReady(await readGpu())||!ready()||checking)return;
      const state={phase:'invite',text:inviteLine,id:saved.plan.id,reminderAt:now()};
      if(await view.show(state)&&!run&&!closed){
        save({...saved,lastInvitedAt:now()});
      }
    }catch(error){report(error.message);}
    finally{inviting=false;}
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
    session.controller.abort();
    session.ending=Promise.resolve().then(async()=>{
      const results=await Promise.allSettled([session.prepared,
        Promise.resolve().then(()=>session.model?.close()),Promise.resolve().then(()=>session.voice?.close())]);
      const cleanupError=results.find(result=>result.status==='rejected')?.reason;
      try{resume();}catch(error){report(error.message);}
      run=undefined;
      if(message&&!closed)view.update({phase:'error',id:session.id,text:message});
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
  async function generate(session,answer){
    const signal=session.controller.signal;
    const number=session.turns.length+1;
    if(number>1)update(session,{phase:'thinking',number});
    const content={topics:session.plan.topics,turns:session.turns.map(turn=>({...turn,user:turn.user.slice(0,700)})),input:answer,
      round:number,remaining:maxTurns-number,requiredFinish:number===maxTurns};
    const check=answer&&await knowledge?.inspect({text:answer,source:'private-chat/'+session.id+'/'+number,scope:'private-chat',
      signal,direct:true,learn:false,context:{前一轮:session.turns.at(-1)},judge:{memory:(text,instruction,schema,signal,settings)=>
        session.model.analyze(text,{signal,hint:'interactionWork',skillInstruction:{name:'专聊知识核对',version:'1',instruction,schema,maxTokens:settings.maxTokens}})}});
    const replyFromKnowledge=knowledgeReply(check);
    const result=replyFromKnowledge?{reply:replyFromKnowledge,done:false}:await session.model.analyze(JSON.stringify({...content,...knowledgeRules(check)}),{signal,hint:'interactionWork',
      skillInstruction:{name:'绯月专聊',version:'1',instruction,schema,maxTokens:768}});
    if(!live(session))return;
    const chars=typeof result?.reply==='string'?Array.from(result.reply.trim()):[];
    const reply=chars.slice(0,maxReplyChars).join('').trimEnd();
    const parts=splitText(reply);
    if(!parts.length||!replyFromKnowledge&&Array.from(reply).length<minReplyChars)throw Error('绯月没能整理好这次回复。');
    const turn={id:randomUUID(),parts,taken:0,complete:number===maxTurns||(number>1&&result.done===true)};
    session.turn=turn;
    session.turns.push({user:answer,feiyue:reply});
    prefetch(session,turn,0);
    await turn.next.ready;
    if(live(session))update(session,{phase:'speaking',text:reply,turn:turn.id,segments:parts.length});
  }
  async function start(session){
    try{
      const shown=view.show(session.state);
      session.prepared=Promise.resolve().then(()=>live(session)&&prepare());
      const [visible,released]=await Promise.all([shown,session.prepared]);
      if(!live(session))return;
      if(!visible)throw Error('专聊气泡未能打开。');
      if(released===false)throw Error('绯月还有工作在收尾，稍后再来找她吧。');
      const gpu=await readGpu();
      if(!live(session))return;
      if(!gpuReady(gpu)||!Number.isFinite(gpu.freeMiB)||gpu.freeMiB<3700)throw Error('现在 GPU 还没空出足够资源，等空闲一些再聊吧。');
      session.model=createModel();
      session.voice=createVoice();
      if(session.voice.enabled===false)throw Error('本机 GPT-SoVITS 运行环境未就绪。');
      await session.model.start();
      if(!live(session))return;
      const backend=session.model.snapshot();
      if(backend.state!=='ready'||backend.backend!=='cpu'||backend.gpuLayers!==0)throw Error('绯月的文字模型未能在 CPU 上启动。');
      await generate(session,'');
    }catch(error){failed(session,error);}
  }
  async function accept(id){
    if(!ready()||saved.plan.id!==id||checking)return {error:'绯月现在还不能开聊，稍后再试。'};
    const ticket=checking=Symbol();
    try{
      if(!gpuReady(await readGpu())||!ready()||saved.plan.id!==id)
        return {error:'现在 GPU 还在忙，空闲后再聊吧。'};
      const session={id:randomUUID(),plan:saved.plan,controller:new AbortController(),turns:[]};
      const startup=startupVoices[Math.floor(random()*startupVoices.length)];
      session.state={phase:'preparing',id:session.id,text:startup.text,startupFile:startup.file,number:1};
      run=session;
      change();
      void start(session);
      return {};
    }catch{ return {error:'暂时不能开始专聊，请稍后再试。'}; }
    finally{if(checking===ticket)checking=undefined;}
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
    if(session.turns.length===1){
      try{
        save({...saved,plan:null,lastInvitedAt:null});
        if(session.plan.topicShare)await shared(session.plan.topicShare);
      }catch(error){report(error.message);}
    }
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
    modelWork(id,text,{signal,instruction,schema,maxTokens}){
      const session=run;
      if(!session||!live(session)||session.id!==id||session.state.phase!=='reply')return null;
      return session.model.analyze(text,{hint:'interactionWork',signal:AbortSignal.any([session.controller.signal,signal]),
        skillInstruction:{name:'专聊听写整理',version:'1',instruction,schema,maxTokens}});
    },
    playbackError(id){if(run?.id===id)failed(run,Error('语音播放中断，绯月先去忙了。'));},
    planned:id=>saved.sources.includes(id),
    get waiting(){return !run&&saved.plan?{id:saved.plan.id,title:waitingLabel,kind:'专聊邀请',status:'待聊',privateChat:true}:null;},
    get active(){
      if(!run)return null;
      const stage={preparing:'正在准备首段语音',thinking:'正在准备下一轮',speaking:'正在分段朗读',reply:'等待你的回应'}[run.state.phase];
      return {id:run.id,title:'绯月专聊',stage};
    },
    async close(){closed=true;view.close();await stop();},
  };
}
