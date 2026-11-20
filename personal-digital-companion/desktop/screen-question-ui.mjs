import {readAttachment} from './question-attachment.mjs';
const host=window.screenQuestion;
const byId=id=>document.getElementById(id);
const form=byId('questionForm'),question=byId('question'),answer=byId('answer'),reply=byId('reply');
const mode=byId('mode'),withScreen=byId('withScreen'),send=byId('send'),retry=byId('retry'),decisions=byId('decisions');
const badge=byId('badge'),pending=byId('pending'),replyContent=byId('replyContent');
const segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'});
const labels={resume:'恢复原链',continue:'继续',skip:'跳过',stop:'停止后续',supplement:'补充登记'};
const recordingInput=['输入登记内容，可按 Win + H 听写','登记 ↗'];
const modes={
  auto:['问绯月，或拖入图片、文本，粘贴图片…','发送 ↗'],
  registration:recordingInput,
  supplement:recordingInput,
  web:['输入想确认的公开问题','查询 ↗'],
  memory:['记忆查询暂未开放','暂未开放'],
};
const webMode=mode.querySelector('option[value="web"]');
let busy=false,composing=false,idleTimer,draftReady=false;
let attachment=null,reading=false,attachmentReady=false;
let references=[],audit=false;

const resetIdle=()=>{
  clearTimeout(idleTimer);
  if(busy||composing||reading||audit&&question.value.trim())return;
  idleTimer=setTimeout(()=>{
    if(draftReady&&host.idleClose){
      host.idleClose({text:question.value,mode:mode.value,withScreen:withScreen.checked,attachment,references});
    }else if(!question.value)host.close();
  },30_000);
};
const updatePending=value=>{pending.hidden=!host.pending||value!==true;};
function allowSupplement(){
  if(!mode.querySelector('[value=supplement]'))mode.add(new Option('补充登记','supplement'));
}
function updateMode(value){
  if(attachment)value='auto';
  if (value)mode.value=Object.hasOwn(modes,value)&&mode.querySelector('option[value="'+value+'"]')?value:'auto';
  const selected=mode.value;
  if(selected!=='auto'||audit)withScreen.checked=false;
  withScreen.disabled=audit||busy||reading||Boolean(attachment)||selected!=='auto';
  mode.disabled=audit||busy||reading||Boolean(attachment);
  byId('removeAttachment').disabled=busy||reading;
  const [placeholder, label]=modes[selected]??modes.auto;
  question.placeholder=audit?'写下你对这件事的解释…':placeholder;
  send.textContent=label;
  send.disabled=busy||reading||selected==='memory'||(selected==='web'&&webMode.disabled);
}
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
  if(busy||reading||audit)return;
  attachmentError();
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
  const waiting=value.state==='waiting';
  if(waiting!==busy){busy=waiting;resetIdle();}
  reply.dataset.state=value.state;reply.setAttribute('aria-busy',String(busy));
  byId('asked').hidden=!value.question;
  byId('asked').textContent=value.question??'';
  const full=value.text??'';
  const chars=[];
  for(const {segment} of segmenter.segment(full)){chars.push(segment);if(chars.length===51)break;}
  if(!waiting){
    audit=Boolean(value.audit);byId('auditActions').hidden=!audit;
    if(audit)mode.value='auto';
    reply.dataset.nag=String(Boolean(value.nagReply));
    const close=byId('close');close.dataset.nag=String(Boolean(value.nag));
    close.textContent=value.nag&&!audit?'结束追问':'×';close.setAttribute('aria-label',value.nag&&!audit?'结束这次追问':'关闭问答');
  }
  answer.textContent=!value.nagReply&&chars.length>50?chars.slice(0,49).join('')+'…':full;
  byId('unsaved').hidden=!value.unsaved;
  question.disabled=busy;mode.disabled=busy;retry.disabled=busy;
  retry.hidden=value.state!=='error'||!value.retryable;
  const clipped=answer.scrollHeight>answer.clientHeight+1;
  byId('full').hidden=value.nagReply||busy||value.state==='idle'||(chars.length<=50&&!clipped&&!value.sources?.length);
  badge.textContent={idle:'对话',waiting:'处理中',answer:'回复',error:'未完成'}[value.state];
  badge.hidden=value.state==='error'&&!(typeof value.question==='string'&&value.question.trim()&&full.trim());
  if(Object.hasOwn(value,'hasPending'))updatePending(value.hasPending);
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
  const actions=[...(value.actions??[])];
  if(value.canSupplement)actions.push('supplement');
  decisions.hidden=busy||!actions.length;
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
  const requiredHeight=Math.ceil(innerHeight-reply.getBoundingClientRect().height+replyContent.getBoundingClientRect().height);
  host.fit(Math.min(420,Math.max(260,requiredHeight)));
}
async function invoke(run){
  if(busy)return;
  render({state:'waiting',text:'正在处理…'});
  try{const value=await run();render(value);return value;}
  catch{render({state:'error',text:'问答连接中断，请重新打开气泡。'});}
}
mode.onchange=()=>{updateMode();retry.hidden=true;};
withScreen.onchange=()=>{retry.hidden=true;};
question.oninput=()=>{retry.hidden=true;};
form.onsubmit=async event=>{
  event.preventDefault();
  const text=question.value;if((!text.trim()&&!attachment)||send.disabled)return;
  const value=await invoke(()=>host.ask(text,withScreen.checked,mode.value,attachment,references));
  if(value?.state==='answer'&&!value.invalid){question.value='';showAttachment(null);attachmentError();updateMode('auto');question.focus();}
};
question.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}};
for(const event of ['keydown','input','pointerdown','change']){
  document.addEventListener(event,resetIdle,{capture:true,passive:true});
}
document.addEventListener('wheel',event=>{if(!event.target.closest?.('#imageResults,#reply[data-nag=true]'))event.preventDefault();},{capture:true,passive:false});
question.addEventListener('compositionstart',()=>{composing=true;resetIdle();});
question.addEventListener('compositionend',()=>{composing=false;resetIdle();});
retry.onclick=async()=>{const value=await invoke(()=>host.retry());if(attachment&&value?.state==='answer'){question.value='';showAttachment(null);attachmentError();}};
for(const [id,full] of [['full',true],['history',false]])byId(id).onclick=()=>host.details(full).catch(()=>render({state:'error',text:'对话记录窗口未能打开。'}));
for(const action of ['later','refuse'])byId(action).onclick=()=>host.close(action);
byId('close').onclick=()=>host.close('button');
pending.onclick=()=>host.pending(!question.value&&!attachment&&!reading).catch(()=>render({state:'error',text:'待确认窗口未能打开。'}));
document.onkeydown=event=>{if(event.key==='Escape')host.close();};
window.addEventListener('companion-page-update',event=>{if(busy||reading||attachment||question.value||withScreen.checked||reply.dataset.state!=='idle')event.preventDefault();});
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

let listRequest=0;
async function refreshImages(){
  if(!host.imageList)return;
  const current=++listRequest;
  const rows=await host.imageList();
  if(current!==listRequest)return;
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
const refresh=()=>{void refreshImages().catch(()=>attachmentError('图像任务记录暂时无法读取。'));};
if(host.onImages)off.push(host.onImages(refresh));
refresh();
