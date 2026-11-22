import {readAttachment} from './question-attachment.mjs';
import {bindDictation,dictating} from './dictation-ui.mjs';
import {bindReplyVoice} from './bubble-voice-ui.mjs';
const host=window.screenQuestion;
const byId=id=>document.getElementById(id);
const form=byId('questionForm'),question=byId('question'),answer=byId('answer'),reply=byId('reply');
const mode=byId('mode'),withScreen=byId('withScreen'),send=byId('send'),retry=byId('retry'),decisions=byId('decisions');
const badge=byId('badge'),pending=byId('pending'),replyContent=byId('replyContent');
const directChat=byId('directChat');
const warmButton=byId('warmModels'),warmStatus=byId('warmStatus');
directChat.checked=localStorage.getItem('feiyue.directChat')==='on';
const directActive=()=>directChat.checked&&!directChat.disabled&&!byId('directOption').hidden;
directChat.onchange=()=>{localStorage.setItem('feiyue.directChat',directChat.checked?'on':'off');updateMode();retry.hidden=true;decisions.hidden=directActive()||!decisions.childElementCount;};
const segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'});
const labels={resume:'恢复原链',continue:'继续',skip:'跳过',stop:'停止后续',supplement:'补充登记'};
const recordingInput=['输入登记内容，可按 Win + H 听写','登记 ↗'];
const modes={
  auto:['问绯月，或拖入图片、文本，粘贴图片…','发送 ↗'],
  tour:['输入目的地，留空由绯月选一站','出发 ↗'],
  registration:recordingInput,
  supplement:recordingInput,
  web:['输入想确认的公开问题','查询 ↗'],
  memory:['记忆查询暂未开放','暂未开放'],
};
const webMode=mode.querySelector('option[value="web"]');
let busy=false,warming=false,composing=false,idleTimer,draftReady=false;
let attachment=null,reading=false,attachmentReady=false;
let references=[],audit=false;
let imageJob=null,imageRequest=0;
let displayed='',expanded=false,lastView=null;
let sending=false,messageId,ending=null,cloudPreview=null;
const cloudForm=byId('cloudForm'),cloudText=byId('cloudText');

const resetIdle=()=>{
  clearTimeout(idleTimer);
  if(lastView?.finished){
    const key=lastView.endMessageId??lastView.text;
    if(ending?.key!==key)ending={key,left:Math.max(5000,Math.min(24000,Array.from(lastView.text??'').length*100)),started:0};
    if(ending.started)ending.left=Math.max(0,ending.left-(performance.now()-ending.started));
    ending.started=0;
    if(!speech?.active){
      ending.started=performance.now();
      idleTimer=setTimeout(()=>host.close('finished',lastView.endMessageId),ending.left);
    }
    return;
  }
  ending=null;
  if(busy&&!lastView?.threadInput||sending||warming||composing||reading||expanded||audit&&!lastView?.threadInput||dictating()||speech?.active||!cloudForm.hidden)return;
  idleTimer=setTimeout(()=>{
    if(lastView?.threadInput&&host.idleClose)host.idleClose();
    else if(draftReady&&host.idleClose){
      host.idleClose({text:question.value,mode:mode.value,withScreen:withScreen.checked,attachment,references});
    }else if(!question.value)host.close();
  },90_000);
};
const updatePending=value=>{pending.hidden=!host.pending||value!==true;};
function allowSupplement(){
  if(!mode.querySelector('[value=supplement]'))mode.add(new Option('补充登记','supplement'));
}
function updateMode(value){
  if(attachment)value='auto';
  if (value)mode.value=Object.hasOwn(modes,value)&&mode.querySelector('option[value="'+value+'"]')?value:'auto';
  const selected=mode.value;
  directChat.disabled=busy||reading||selected!=='auto'||audit||Boolean(attachment)||withScreen.checked;
  if(selected!=='auto'||audit)withScreen.checked=false;
  withScreen.disabled=directActive()||audit||busy||reading||Boolean(attachment)||selected!=='auto';
  mode.disabled=directActive()||audit||busy||warming||reading||Boolean(attachment);
  byId('removeAttachment').disabled=busy||reading;
  const [placeholder, label]=modes[selected]??modes.auto;
  question.placeholder=audit?'写下你对这件事的解释…':placeholder;
  send.textContent=label;
  send.disabled=sending||busy&&!lastView?.threadInput||warming||reading||dictating()||selected==='memory'||(selected==='web'&&webMode.disabled);
  warmButton.disabled=busy||warming||reading||dictating()||speech.active;
  microphone.update();speech.update();
}
function fitBubble(){
  const requiredHeight=Math.ceil(innerHeight-reply.getBoundingClientRect().height+replyContent.getBoundingClientRect().height);
  host.fit(Math.min(640,Math.max(260,requiredHeight)));
}
const voiceChanged=()=>{updateMode();resetIdle();fitBubble();};
let speech;
const microphone=bindDictation(question,{button:byId('recordVoice'),status:byId('voiceStatus'),changed:voiceChanged,blocked:()=>busy&&!lastView?.threadInput||lastView?.finished||warming||reading||speech?.active});
speech=bindReplyVoice(host.voice,{button:byId('speakReply'),status:byId('speakStatus'),changed:voiceChanged,blocked:()=>busy||warming||dictating()});
warmButton.onclick=async()=>{
  const direct=directActive();
  warming=true;
  warmButton.setAttribute('aria-busy','true');
  warmStatus.hidden=false;
  warmStatus.dataset.error='false';
  warmStatus.textContent='正在预热听写和 GPU 对话模型…';
  voiceChanged();
  try{
    const {speech,model,error}=await host.preheatModels(direct);
    warmStatus.dataset.error=String(!speech?.ready||!model?.ready);
    warmStatus.textContent=error??[
      speech.ready?'听写预热完成':speech.error,
      model.ready?`${model.size}B 对话模型已加载到 GPU`:model.error,
    ].join(' · ');
  }catch{
    warmStatus.dataset.error='true';
    warmStatus.textContent='预热中断，请重试。';
  }finally{
    warming=false;
    warmButton.removeAttribute('aria-busy');
    voiceChanged();
  }
};
function showAttachment(value,extra=[]){
  attachment=value;
  references=extra;
  byId('attachment').hidden=!value;
  byId('attachmentName').textContent=extra.length?[value,...extra].map((a,i)=>'图'+(i+1)+' '+a.name).join(' · '):value?.name??'';
  byId('attachmentName').title=byId('attachmentName').textContent;
  const thumb=byId('attachmentImage');
  thumb.hidden=value?.kind!=='image';
  if(!thumb.hidden)thumb.src=value.data;else thumb.removeAttribute('src');
  if(value)withScreen.checked=false;
  updateMode();
}
function attachmentError(message=''){
  byId('attachmentError').textContent=message;
  byId('attachmentError').hidden=!message;
}
async function attachFiles(files){
  if(busy||warming||reading||audit||lastView?.finished)return;
  attachmentError();
  if(directActive())return attachmentError('直连仅支持文字；关闭直连后可以添加附件。');
  if(mode.value==='tour')return attachmentError('旅行参考图由绯月挑选，直接选目的地即可。');
  if(!host.attachmentInput||!attachmentReady)return attachmentError('请重新启动绯月以启用附件。');
  if(!files.length||files.length+references.length+Number(Boolean(attachment))>16)return attachmentError('每次最多 16 张图片。');
  reading=true;updateMode();resetIdle();
  try{
    const items=attachment?[attachment,...references]:[];
    for(const file of files)items.push(await readAttachment(file));
    if(items.length>1&&items.some(a=>a.kind!=='image'))throw Error('文本请单独提问，图像任务可添加多张图片。');
    showAttachment(items[0],items.slice(1));retry.hidden=true;
  }
  catch(error){attachmentError(error.message||'附件读取失败。');}
  finally{reading=false;updateMode();resetIdle();question.focus();}
}
document.addEventListener('dragover',event=>{
  if(!event.dataTransfer.types.includes('Files'))return;
  event.preventDefault();form.classList.add('dragging');
  event.dataTransfer.dropEffect=busy||reading?'none':'copy';
  resetIdle();
});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)form.classList.remove('dragging');});
document.addEventListener('drop',event=>{
  form.classList.remove('dragging');
  if(!event.dataTransfer.types.includes('Files'))return;
  event.preventDefault();void attachFiles([...event.dataTransfer.files]);
});
document.addEventListener('paste',event=>{
  const files=[...(event.clipboardData?.items??[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
  if(files.length){event.preventDefault();void attachFiles(files);}
});
byId('removeAttachment').onclick=()=>{showAttachment(null);attachmentError();retry.hidden=true;question.focus();};
function render(value){
  if(!value||!['idle','waiting','answer','error'].includes(value.state))return;
  if(typeof value.canPreheat==='boolean')warmButton.hidden=!value.canPreheat||!host.preheatModels;
  const job=value.imageJob??null;
  if(job!==imageJob){
    imageJob=job;
    imageRequest++;
    const list=byId('imageResults');
    list.hidden=true;
    list.replaceChildren();
    if(job)void refreshImages();
  }
  const waiting=value.state==='waiting';
  if(waiting!==busy){busy=waiting;resetIdle();}
  reply.dataset.state=value.state;reply.setAttribute('aria-busy',String(busy));
  const asked=byId('asked');
  asked.hidden=!value.openingSource&&!value.question;
  asked.dataset.source=String(Boolean(value.openingSource));
  asked.textContent=value.openingSource??value.question??'';
  const scene=byId('nagContext');
  scene.hidden=!value.sceneImage;
  if(value.sceneImage){
    if(scene.getAttribute('src')!==value.sceneImage)scene.src=value.sceneImage;
  }else scene.removeAttribute('src');
  const full=value.text??'';
  const wasFinished=lastView?.finished;
  speech.setReply(value.state==='answer'?full:'',value.voiceReply);
  lastView=value;
  if(value.threadsEnabled!==undefined)byId('newThread').hidden=!value.threadsEnabled;
  if(displayed!==full){displayed=full;expanded=false;}
  const chars=[];
  for(const {segment} of segmenter.segment(full)){chars.push(segment);if(chars.length===201)break;}
  if(!waiting){
    audit=Boolean(value.audit);byId('auditActions').hidden=!audit;
    if(audit)mode.value='auto';
    reply.dataset.nag=String(Boolean(value.nagReply));
    const close=byId('close');close.dataset.nag=String(Boolean(value.nag));
    close.textContent=value.nag&&!audit?'结束追问':'×';close.setAttribute('aria-label',value.nag&&!audit?'结束这次追问':'关闭问答');
  }
  answer.textContent=!expanded&&chars.length>200?chars.slice(0,200).join(''):full;
  form.hidden=value.finished===true;
  byId('finishThread').hidden=!value.finished||!value.threadInput;
  byId('threadDraft').hidden=!value.transcriptId;
  byId('cloudFallback').hidden=!value.canCloud;
  byId('threadActions').hidden=!value.canCloud&&!value.transcriptId&&byId('finishThread').hidden;
  if(!value.canCloud&&!cloudForm.hidden)resetCloud();
  if(wasFinished||value.finished)resetIdle();
  byId('unsaved').hidden=!value.unsaved;
  question.disabled=busy&&!value.threadInput;mode.disabled=busy&&!value.threadInput;retry.disabled=busy;
  retry.hidden=value.state!=='error'||!value.retryable;
  const more=byId('full');
  more.hidden=chars.length<=200;
  more.textContent=expanded?'收起':'展开全文';
  more.setAttribute('aria-expanded',String(expanded));
  byId('sources').hidden=!value.sources?.length;
  byId('knowledge-card').hidden=!value.knowledgeCard;
  badge.textContent=value.finished?'已收尾':{idle:'对话',waiting:'处理中',answer:'回复',error:'未完成'}[value.state];
  badge.hidden=value.state==='error'&&!(typeof value.question==='string'&&value.question.trim()&&full.trim());
  if(Object.hasOwn(value,'hasPending'))updatePending(value.hasPending);
  if(value.directInput===true)byId('directOption').hidden=false;
  if(value.webSearch===true&&webMode.disabled){
    webMode.textContent='查询网络';
    webMode.disabled=false;
  }
  if(value.mode==='supplement'&&value.canSupplement)allowSupplement();
  updateMode(value.mode);
  if(!draftReady&&Object.hasOwn(value,'idleDraft')){
    draftReady=true;
    attachmentReady=value.attachmentInput===true;
    if(value.idleDraft&&!question.value){
      question.value=value.idleDraft.text;
      withScreen.checked=mode.value==='auto'&&value.idleDraft.withScreen===true;
      showAttachment(value.idleDraft.attachment??null,value.idleDraft.references??[]);
    }
  }
  if(value.attachmentInput===true)attachmentReady=true;
  const actions=[...(value.actions??[])];
  if(value.canSupplement)actions.push('supplement');
  decisions.hidden=directActive()||busy||!actions.length;
  decisions.replaceChildren(...actions.map(action=>{
    const button=document.createElement('button');button.textContent=labels[action];
    button.onclick=()=>{
      if(action==='supplement'){
        allowSupplement();
        mode.value='supplement';updateMode();question.focus();
      }else void invoke(()=>host.decide(action));
    };
    return button;
  }));
  fitBubble();
}
async function invoke(run){
  if(busy||warming)return;
  render({state:'waiting',text:'正在处理…'});
  try{const value=await run();render(value);return value;}
  catch{render({state:'error',text:'问答连接中断，请重新打开气泡。'});}
}
mode.onchange=()=>{updateMode();retry.hidden=true;};
withScreen.onchange=()=>{updateMode();retry.hidden=true;};
question.oninput=()=>{retry.hidden=true;messageId=undefined;};
form.onsubmit=async event=>{
  event.preventDefault();
  if(lastView?.finished)return;
  const text=question.value;if((!text.trim()&&!attachment&&mode.value!=='tour')||send.disabled)return;
  const direct=directActive();
  const activeMode=direct?'direct':mode.value;
  let value;
  if(lastView?.threadInput){
    if(sending)return;
    sending=true;send.disabled=true;
    try{
      value=await host.ask(text,withScreen.checked,activeMode,attachment,references,messageId??=crypto.randomUUID(),lastView.threadId);
      if(value?.inputError){attachmentError(value.inputError);return;}
      if(!value?.accepted)render(value);
    }catch{attachmentError('发言提交未确认，请重试。');return;}
    finally{sending=false;send.disabled=false;resetIdle();}
  }else value=await invoke(()=>host.ask(text,withScreen.checked,activeMode,attachment,references));
  if(value?.accepted||value?.state==='answer'&&!value.invalid){
    question.value='';showAttachment(null);attachmentError();updateMode(value.keepRegistrationMode?'registration':'auto');
    messageId=undefined;
    if(!value.finished)question.focus();
  }
};
question.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}};
for(const event of ['keydown','input','pointerdown','change']){
  document.addEventListener(event,resetIdle,{capture:true,passive:true});
}
document.addEventListener('wheel',event=>{if(!event.target.closest?.('#imageResults,#reply,#question'))event.preventDefault();},{capture:true,passive:false});
question.addEventListener('compositionstart',()=>{composing=true;resetIdle();});
question.addEventListener('compositionend',()=>{composing=false;resetIdle();});
retry.onclick=async()=>{const value=await invoke(()=>host.retry());if(attachment&&value?.state==='answer'){question.value='';showAttachment(null);attachmentError();}};
for(const [id,full] of [['sources',true],['history',false]])byId(id).onclick=()=>host.details(full).catch(()=>render({state:'error',text:'对话记录窗口未能打开。'}));
byId('knowledge-card').onclick=()=>host.openKnowledge().catch(()=>render({state:'error',text:'知识条目暂时无法打开。'}));
byId('full').onclick=()=>{expanded=!expanded;render(lastView);resetIdle();};
for(const action of ['later','refuse'])byId(action).onclick=()=>host.close(action);
byId('close').onclick=()=>host.close('button');
byId('newThread').onclick=()=>host.newThread().catch(()=>attachmentError('新对话未能打开。'));
byId('finishThread').onclick=()=>host.close('finished',lastView?.endMessageId);
byId('threadDraft').onclick=()=>host.openThreadDraft(lastView?.transcriptId).catch(()=>attachmentError('待确认卡未能打开。'));
function resetCloud(){
  cloudForm.hidden=true;cloudText.value='';cloudPreview=null;
  byId('cloudPreview').hidden=true;byId('cloudPreview').textContent='';byId('cloudSend').textContent='预览外发文字';
}
byId('cloudFallback').onclick=()=>{cloudForm.hidden=false;cloudText.focus();resetIdle();fitBubble();};
byId('cloudCancel').onclick=()=>{void host.cancelCloud().catch(()=>{});resetCloud();resetIdle();fitBubble();};
cloudText.oninput=()=>{
  if(cloudPreview)void host.cancelCloud().catch(()=>{});
  cloudPreview=null;byId('cloudPreview').hidden=true;byId('cloudSend').textContent='预览外发文字';
};
cloudForm.onsubmit=async event=>{
  event.preventDefault();
  try{
    if(cloudPreview){await host.confirmCloud(cloudPreview.id);resetCloud();}
    else{
      cloudPreview=await host.previewCloud(cloudText.value);
      if(!cloudPreview)return;
      byId('cloudPreview').textContent=cloudPreview.text;byId('cloudPreview').hidden=false;
      byId('cloudSend').textContent='确认发送';
    }
  }catch(error){cloudPreview=null;byId('cloudPreview').textContent=error.message;byId('cloudPreview').hidden=false;byId('cloudSend').textContent='重新预览';}
  fitBubble();
};
pending.onclick=()=>host.pending(!question.value&&!attachment&&!reading).catch(()=>render({state:'error',text:'待确认窗口未能打开。'}));
document.onkeydown=event=>{if(event.key==='Escape')host.close();};
window.addEventListener('companion-page-update',event=>{if(busy||warming||reading||attachment||question.value||withScreen.checked||reply.dataset.state!=='idle')event.preventDefault();});
const off=[host.onState(render),host.onMode?.(updateMode),host.onPending?.(updatePending),host.onLayout(value=>{
  const bubble=document.querySelector('.bubble');bubble.dataset.tail=value.tail;bubble.style.setProperty('--tail-x',value.tailX+'px');
})];
if(!host.details){
  form.inert=true;
  byId('history').hidden=true;
  render({state:'error',text:'请从设置与维护重启绯月，以启用统一对话。'});
}else host.state().then(render).catch(()=>render({state:'error',text:'气泡连接失败。'}));question.focus();
resetIdle();
window.addEventListener('pagehide',()=>{clearTimeout(idleTimer);off.forEach(remove=>remove?.());});

async function refreshImages(){
  if(!imageJob||!host.imageList)return;
  const current=++imageRequest;
  let rows;
  try{rows=await host.imageList();}
  catch{if(current===imageRequest)attachmentError('图像任务记录暂时无法读取。');return;}
  if(current!==imageRequest)return;
  rows=rows.filter(row=>row.job===imageJob);
  const list=byId('imageResults');
  list.hidden=!rows.length;
  list.replaceChildren(...rows.map(row=>{
    const item=document.createElement('button');
    item.type='button';item.disabled=!row.canOpen;
    if(row.preview){const image=document.createElement('img');image.alt='任务结果';image.src=row.preview;item.append(image);}
    item.append(document.createTextNode(row.original+' · '+row.text));
    item.onclick=()=>host.openImage(row.job).catch(()=>attachmentError('无法打开图片，请检查本地文件。'));
    return item;
  }));
  if(rows.length)host.fit(Math.min(420,Math.max(320,innerHeight)));
}
if(host.onImages)off.push(host.onImages(refreshImages));
