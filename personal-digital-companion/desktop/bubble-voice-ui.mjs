import { splitText } from './bubble-voice-segments.mjs';

export function bindReplyVoice(api,{button,status,changed,blocked}){
  let enabled=false,reply='',playing;
  function update(){
    button.hidden=!api||!enabled||!reply;
    button.disabled=playing?playing.cancelled:blocked();
    button.textContent=playing?'停止朗读':'朗读';
  }
  function show(text,error=false){
    status.textContent=text;status.hidden=!text;status.dataset.error=String(error);update();changed();
  }
  function stop(){
    if(!playing||playing.cancelled)return;
    playing.cancelled=true;
    playing.source?.stop();
    void api.stopReading().catch(()=>{});
    show('');
  }
  button.onclick=async()=>{
    if(playing){stop();return;}
    if(button.disabled||button.hidden)return;
    const parts=splitText(reply);
    if(!parts.length)return;
    const context=new AudioContext();
    const run=playing={context,cancelled:false};
    async function load(part){
      try{
        const result=await api.synthesize(part.text);
        if(run.cancelled)return {};
        if(result.error)return {error:result.error};
        const {wav}=result;
        const buffer=wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength);
        return {audio:await context.decodeAudioData(buffer)};
      }catch{return {error:'本机语音合成中断，请重试。'};}
    }
    try{
      show('正在生成朗读…');
      await context.resume();
      if(run.cancelled)return;
      let next=load(parts[0]);
      for(let index=0;index<parts.length&&!run.cancelled;index++){
        const result=await next;
        if(run.cancelled)break;
        if(result.error)throw Error(result.error);
        const source=run.source=context.createBufferSource();
        source.buffer=result.audio;
        source.connect(context.destination);
        const ended=new Promise(resolve=>{source.onended=()=>{source.disconnect();run.source=undefined;resolve();};});
        source.start();
        show(parts.length>1?`正在朗读 ${index+1}/${parts.length}`:'正在朗读…');
        if(index+1<parts.length)next=load(parts[index+1]);
        await ended;
      }
      show('');
    }catch(error){if(!run.cancelled)show(error.message,true);}
    finally{
      if(!run.cancelled)await api.stopReading().catch(()=>{});
      await context.close().catch(()=>{});
      playing=undefined;update();changed();
    }
  };
  window.addEventListener('pagehide',stop);
  return {update,stop,get active(){return Boolean(playing);},setReply(text,hasVoice){
    if(typeof hasVoice==='boolean')enabled=hasVoice;
    if(reply!==text){stop();reply=text;}
    update();
  }};
}
