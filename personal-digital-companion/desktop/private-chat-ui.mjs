import {bindDictation,dictating} from './dictation-ui.mjs';

const api=window.feiyuePrivateChat;
const get=id=>document.getElementById(id);
const draft=get('draft'),form=get('reply'),send=get('send'),accept=get('accept'),dismiss=get('dismiss');
const status=get('status'),line=get('line');
let state,clip,token,accepting=false;
bindDictation(draft,{button:get('mic'),status:get('mic-status'),changed:updateSend});
draft.addEventListener('input',updateSend);
function updateSend(){send.disabled=!draft.value.trim()||dictating();}

function cancelAudio(){
  clip?.stop();
  clip=undefined;
  token=undefined;
}
function play(src){
  const audio=new Audio(src);
  audio.loop=false;
  let finish;
  const done=new Promise(resolve=>{
    finish=resolve;
    audio.onended=()=>resolve(true);
    audio.onerror=()=>resolve(false);
    audio.play().catch(()=>resolve(false));
  });
  const playback={done,stop(){audio.pause();finish(false);}};
  clip=playback;
  void done.then(()=>{if(clip===playback)clip=undefined;});
  return done;
}
async function speak(next,previous){
  token=next.turn;
  try{
    if(previous)await previous;
    for(let index=0;index<next.segments;index++){
      if(token!==next.turn)return;
      const wav=await api.segment(next.id,next.turn,index);
      if(token!==next.turn||!wav)return;
      const url=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
      let played;
      try{played=await play(url);}finally{URL.revokeObjectURL(url);}
      if(token!==next.turn)return;
      if(!played)throw Error('playback');
    }
    if(token===next.turn)await api.played(next.id,next.turn);
  }catch{if(token===next.turn)void api.playbackError(next.id);}
}
api.onState(next=>{
  const previous=state;
  if(previous?.id!==next.id)cancelAudio();
  state=next;
  document.querySelector('main').dataset.phase=next.phase;
  line.textContent=next.text;
  accept.hidden=next.phase!=='invite';
  dismiss.textContent=next.phase==='invite'||next.phase==='error'?'关闭':'我要忙，你先去自己玩';
  form.hidden=next.phase!=='reply';
  draft.disabled=form.hidden;
  get('round').textContent=next.number?`第 ${next.number} / 10 轮`:'';
  status.textContent={preparing:'正在准备首段语音…',speaking:'正在说话',thinking:'正在想怎么回答…'}[next.phase]??'';
  if(next.phase==='invite'&&(previous?.phase!=='invite'||previous.reminderAt!==next.reminderAt)){
    cancelAudio();
    void play('./voice/private-chat/invite.wav');
  }
  if(next.phase==='preparing'&&previous?.id!==next.id)void play('./voice/private-chat/'+next.startupFile);
  if(next.phase==='speaking'&&token!==next.turn)void speak(next,clip?.done);
  if(next.phase==='error')cancelAudio();
  updateSend();
});
accept.addEventListener('click',async()=>{
  if(accepting)return;
  accepting=true;
  accept.disabled=true;
  try{
    const result=await api.accept(state.id);
    if(result?.error)status.textContent=result.error;
  }finally{accepting=false;accept.disabled=false;}
});
dismiss.addEventListener('click',()=>void api.dismiss(state.id));
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(send.disabled)return;
  send.disabled=true;
  if(await api.reply(state.id,draft.value))draft.value='';
  updateSend();
});
