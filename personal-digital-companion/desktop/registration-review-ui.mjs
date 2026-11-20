import {readAttachment} from './question-attachment.mjs';
const api=window.registration,el=id=>document.getElementById(id);
let draft,attachment=null,reading=false;
const inputs=()=>[...el('missing').querySelectorAll('input')];
function setFile(file){
  attachment=file;el('filename').textContent=file?.name??'';el('removeFile').hidden=!file;
  el('thumb').hidden=file?.kind!=='image';
  if(file?.kind==='image')el('thumb').src=file.data;else el('thumb').removeAttribute('src');
  el('file').value='';
}
function controls(){
  const pending=draft?.status==='pending'&&!reading,finished=['done','error'].includes(draft?.status);
  const fields=inputs(),filled=!!(el('answer').value.trim()||attachment||fields.some(i=>i.value.trim()));
  el('editor').hidden=finished;
  el('sendInput').disabled=!pending||!filled;
  const canAttach=draft?.targets.length&&(attachment?.kind==='image'||!attachment&&draft.photoName);
  el('photoLabel').hidden=!canAttach||finished;
  el('approveRecord').disabled=!pending||filled&&!(canAttach&&el('photoTarget').value!==''&&!el('answer').value.trim()&&!fields.length);
  el('approveRecord').textContent=canAttach&&el('photoTarget').value!==''?'确认登记并附图':'确认登记';
  if(canAttach&&el('photoTarget').value!=='')el('sendInput').disabled=true;
  el('approveRecord').hidden=!draft?.canConfirm||finished;
  el('discardRecord').disabled=!pending;
  el('discardRecord').hidden=el('sendInput').hidden=finished;
  el('closeReview').hidden=!finished;
  for(const element of el('editor').querySelectorAll('input,button,textarea,select'))element.disabled=!pending;
}
function field(parent,label){
  const wrap=document.createElement('label'),input=document.createElement('input');
  wrap.append(document.createTextNode(label),input);parent.append(wrap);input.maxLength=3500;return input;
}
function render(data){
  if(!data)return;
  if(draft?.id!==data.id){
    el('answer').value='';setFile(null);
    el('photoTarget').replaceChildren(new Option('仅本地参考',''),...data.targets.map(t=>new Option('附到 '+t.label,String(t.index))));
    if(data.photoName)el('filename').textContent='本地参考图：'+data.photoName;
    el('recordFields').textContent=data.fields;el('prompt').textContent=data.prompt;
    el('recordSource').textContent=data.source;el('recordSource').parentElement.hidden=!data.source;
    el('missing').replaceChildren();el('bulk').replaceChildren();
    const groups=new Map();
    for(const row of data.rows){
      const li=document.createElement('li');el('missing').append(li);
      const input=field(li,row.task+' · '+row.question);
      if(!row.group)continue;
      if(!groups.has(row.group))groups.set(row.group,{label:row.label,items:[]});
      groups.get(row.group).items.push(input);
    }
    for(const {label,items} of groups.values())if(items.length>1){
      const bulk=field(el('bulk'),'统一填写'+label+'（'+items.length+' 项）');
      let previous='';
      bulk.oninput=()=>{
        for(const i of items)if(!i.value||i.value===previous)i.value=bulk.value;
        previous=bulk.value;controls();
      };
    }
  }
  draft=data;el('recordStatus').textContent=data.message;controls();
}
api.onReviewChange(render);api.getReview().then(render).catch(()=>{el('recordStatus').textContent='无法读取询问，请重新打开。';});
el('editor').oninput=controls;
async function attach(files){
  if(!draft||reading||draft.status!=='pending'||!files.length)return;
  if(files.length!==1){el('recordStatus').textContent='每次回答可附一份图片或文本文件。';return;}
  const id=draft.id;reading=true;controls();
  try{const file=await readAttachment(files[0]);if(draft.id===id){setFile(file);el('recordStatus').textContent='';}}
  catch(e){el('recordStatus').textContent=e.message;}
  finally{reading=false;controls();}
}
el('chooseFile').onclick=()=>el('file').click();
el('file').onchange=e=>void attach([...e.target.files]);
el('removeFile').onclick=()=>{setFile(null);controls();};
document.addEventListener('paste',e=>{
  const files=[...(e.clipboardData?.files??[])];if(files.length){e.preventDefault();void attach(files);}
});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.addEventListener('drop',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();void attach([...e.dataTransfer.files]);}});
for(const [id,action] of [['approveRecord','confirm'],['discardRecord','cancel'],['sendInput','send']]){
  el(id).onclick=async()=>{
    if(!draft||el(id).disabled)return;
    const answer=action==='send'?{action,text:el('answer').value,values:inputs().map(i=>i.value),attachment}:
      action==='confirm'&&!el('photoLabel').hidden&&el('photoTarget').value!==''?{action,attachment,photoTarget:Number(el('photoTarget').value)}:{action};
    const token=draft.id;render({...draft,status:'working',message:'正在处理…'});
    try{await api.decideReview(token,answer);}
    catch(e){if(draft.id===token)render({...draft,status:'pending',message:e.message});}
  };
}
el('closeReview').onclick=()=>window.close();
window.addEventListener('companion-page-update',e=>{if(draft&&['pending','working'].includes(draft.status))e.preventDefault();});
