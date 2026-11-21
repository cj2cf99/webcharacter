import { microphoneWav, openMicrophone } from './bubble-voice-capture.mjs';

const api = window.feiyueDictation;
const available = api?.available().catch(()=>false);
let active;
export const dictating = () => Boolean(active);

function draftValue(run, addition) {
  if(!addition){run.input.value=run.original;return false;}
  const separator = run.input instanceof HTMLTextAreaElement ? '\n' : ' ';
  const before = addition && run.append && run.before && !/\s$/u.test(run.before) ? run.before+separator : run.before;
  const limit = run.input.maxLength;
  const room = limit < 0 ? Infinity : Math.max(0,limit-before.length-run.after.length);
  let inserted='';
  for(const character of addition){if(inserted.length+character.length>room)break;inserted+=character;}
  run.input.value = (inserted ? before+inserted : run.before)+run.after;
  return inserted.length < addition.length;
}

export function bindDictation(input, { button, status, changed = () => {}, blocked = () => false } = {}) {
  if (!api || !input || (input.maxLength>=0 && input.maxLength<=20)) return { update() {}, close() {} };
  if (!button) {
    const wrapper = document.createElement('span');
    wrapper.className = 'fy-dictation-field';
    input.before(wrapper);
    button = document.createElement('button');
    button.className = 'fy-dictation-button';
    button.type = 'button';
    status = document.createElement('small');
    status.className = 'fy-dictation-note';
    status.setAttribute('role','status');
    status.hidden = true;
    wrapper.append(input,button,status);
  }
  let enabled = false;
  function setStatus(text,error=false){
    status.textContent=text;
    status.hidden=!text;
    status.dataset.error=String(error);
  }
  function update(){
    const mine=active?.input===input, live=mine&&Boolean(active.capture)&&!active.stopping;
    const label=mine?(live?'停止语音录入':active.stopping?'正在整理语音':'正在打开麦克风'):'开始语音录入';
    button.hidden=!enabled;
    button.disabled=mine?!live:Boolean(active)||blocked()||input.disabled||input.readOnly;
    button.textContent=mine?(live?'■':'…'):'🎙';
    button.title=label;
    button.setAttribute('aria-label',label);
    button.setAttribute('aria-pressed',String(Boolean(live)));
    button.dataset.recording=String(Boolean(live));
  }
  function notify(){window.dispatchEvent(new Event('feiyue-dictation-change'));changed();}
  window.addEventListener('feiyue-dictation-change',update);
  available.then(value=>{enabled=value;update();});
  const observer=new MutationObserver(update);
  observer.observe(input,{attributes:true,attributeFilter:['disabled','readonly']});
  input.addEventListener('input',()=>{if(!active)setStatus('');});

  async function finish(run, interrupted=false){
    if(active!==run||run.stopping)return;
    run.stopping=true;
    setStatus('正在收尾…');notify();
    const tail=await run.capture.stop();
    await run.queue;
    if(active!==run)return;
    const source=run.parts.join(input instanceof HTMLTextAreaElement?'\n':' ');
    let final=source, corrected=true;
    if(source){
      setStatus('AI 校正中…');notify();
      try{
        const result=await api.correct(source);
        final=typeof result?.text==='string'?result.text:source;
        corrected=result?.corrected===true;
      }catch{corrected=false;}
    }
    if(active!==run)return;
    const shortened=draftValue(run,final);
    await api.end().catch(()=>{});
    if(active!==run)return;
    active=undefined;
    input.readOnly=false;
    if(source)input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:final}));
    const warnings=[interrupted?'麦克风中断':'',tail?'':'尾段未收齐',run.failed?`${run.failed} 段听写失败`:'',
      corrected?'':'AI 校正暂未完成，已保留听写文字',shortened?'已达到输入字数上限':''].filter(Boolean);
    setStatus(warnings.join(' · ') || (source?'已整理听写':'没有听到清晰语音。'), Boolean(warnings.length));
    notify();
    if(input.isConnected&&!input.disabled)input.focus();
  }

  button.addEventListener('pointerdown',event=>event.preventDefault());
  button.addEventListener('click',async()=>{
    if(active?.input===input){if(active.capture)void finish(active);return;}
    if(!enabled||active||blocked()||input.disabled||input.readOnly)return;
    const from=document.activeElement===input?input.selectionStart:input.value.length;
    const to=document.activeElement===input?input.selectionEnd:from;
    const run={input,original:input.value,before:input.value.slice(0,from),after:input.value.slice(to),append:from===to&&from===input.value.length,clear:()=>setStatus(''),
      queue:Promise.resolve(),parts:[],failed:0};
    active=run;
    input.readOnly=true;
    setStatus('正在打开麦克风…');notify();
    try {
      const permit=await api.start();
      if(permit.error)throw Error(permit.error);
      run.permitted=true;
      if(active!==run){await api.end(true);return;}
      run.capture=await openMicrophone((samples,rate)=>{
        run.queue=run.queue.then(async()=>{
          if(active!==run)return;
          const wav=await microphoneWav(samples,rate);
          if(active!==run)return;
          const result=await api.transcribe(wav);
          if(active!==run)return;
          if(result.error){run.failed++;return;}
          if(result.text){
            run.parts.push(result.text);
            draftValue(run,run.parts.join(input instanceof HTMLTextAreaElement?'\n':' '));
          }
        }).catch(()=>{run.failed++;});
      },()=>{if(active===run&&run.capture)void finish(run,true);});
      if(active!==run){run.capture.close();return;}
      setStatus('录音中 · 边说边转写');notify();
    } catch(error) {
      if(active!==run)return;
      if(run.permitted)await api.end(true).catch(()=>{});
      active=undefined;
      input.readOnly=false;
      setStatus(error.name==='NotAllowedError'?'麦克风未获准，请检查系统设置。':error.message,true);notify();
    }
  });
  update();
  return { update, close(){
    if(active?.input===input)cancelDictation();
    observer.disconnect();
    window.removeEventListener('feiyue-dictation-change',update);
  } };
}

export function cancelDictation(){
  if(!active)return;
  const run=active;
  active=undefined;
  run.capture?.close();
  run.input.readOnly=false;
  run.clear();
  if(run.permitted)void api.end(true).catch(()=>{});
  window.dispatchEvent(new Event('feiyue-dictation-change'));
}

window.addEventListener('pagehide',cancelDictation);
window.addEventListener('companion-page-update',event=>{if(active)event.preventDefault();});
document.addEventListener('submit',event=>{
  if(active&&event.target.contains(active.input)){event.preventDefault();event.stopImmediatePropagation();}
},true);
