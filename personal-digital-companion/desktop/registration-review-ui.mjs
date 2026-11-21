import {readAttachment} from './question-attachment.mjs';
import {bindDictation,cancelDictation,dictating} from './dictation-ui.mjs';
const api=window.registration,el=id=>document.getElementById(id);
let draft,attachment=null,reading=false;
const photos=Array(3).fill(null);
let pickIndex=null;
const fieldVoice=[];
const answerVoice=bindDictation(el('answer'),{blocked:()=>draft?.status!=='pending'||reading});
const inputs=()=>[...el('missing').querySelectorAll('input')];
function setFile(file){
  attachment=file;el('filename').textContent=file?.name??'';el('removeFile').hidden=!file;
  el('file').value='';
}
function paintPhotos(){
  const slots=el('slots');slots.replaceChildren();
  photos.forEach((photo,index)=>{
    const box=document.createElement('div'),pick=document.createElement('button');
    box.className='photo-slot';box.dataset.index=index;pick.className='photo-pick';pick.type='button';
    pick.title=photo?'替换 '+photo.name:'添加第 '+(index+1)+' 张图片';pick.setAttribute('aria-label',pick.title);
    if(photo){
      const image=document.createElement('img');image.src=photo.data;image.alt=photo.name;pick.append(image);
    }else pick.textContent='＋';
    pick.onclick=()=>{pickIndex=index;el('imageFiles').click();};
    box.append(pick);slots.append(box);
    if(photo){
      const remove=document.createElement('button');remove.type='button';remove.className='photo-remove';
      remove.textContent='×';remove.setAttribute('aria-label','移除 '+photo.name);
      remove.onclick=()=>{photos[index]=null;paintPhotos();controls();};box.append(remove);
    }
  });
}
function controls(){
  const pending=draft?.status==='pending'&&!reading,finished=['done','error'].includes(draft?.status);
  const hasText=!!(el('answer').value.trim()||attachment||inputs().some(i=>i.value.trim()));
  const localPhotos=!draft?.targets.length&&photos.some(Boolean);
  el('editor').hidden=finished;
  el('sendInput').disabled=!pending||!(hasText||localPhotos);
  el('approveRecord').disabled=!pending||hasText||localPhotos;
  el('approveRecord').textContent=draft?.confirmLabel??'确认';
  el('approveRecord').hidden=!draft?.canConfirm||finished;
  el('discardRecord').disabled=!pending;
  el('discardRecord').hidden=el('sendInput').hidden=finished;
  el('closeReview').hidden=!finished;
  for(const element of el('editor').querySelectorAll('input,button,textarea,select')){
    if(!element.classList.contains('fy-dictation-button'))element.disabled=!pending;
  }
  answerVoice.update();fieldVoice.forEach(field=>field.update());
}
function field(parent,label){
  const wrap=document.createElement('label'),input=document.createElement('input');
  wrap.append(document.createTextNode(label),input);parent.append(wrap);input.maxLength=3500;
  fieldVoice.push(bindDictation(input,{blocked:()=>draft?.status!=='pending'||reading}));return input;
}
function render(data){
  if(!data)return;
  if(draft?.id!==data.id){
    cancelDictation();fieldVoice.splice(0).forEach(field=>field.close());
    el('answer').value='';setFile(null);
    const lastTarget=el('photoTarget').selectedOptions[0]?.textContent;
    const sameTarget=data.parentId===draft?.id&&data.targets.find(t=>t.label===lastTarget);
    if(!sameTarget)photos.fill(null);
    paintPhotos();
    el('photoTarget').replaceChildren(...data.targets.map(t=>new Option(t.label,String(t.index))));
    if(sameTarget)el('photoTarget').value=String(sameTarget.index);
    el('targetLabel').hidden=data.targets.length<2;
    el('photos').querySelector('legend').textContent=data.targets.length?'随手记附图':'本地参考图';
    el('sourcePhoto').hidden=!(data.sourcePhoto&&data.targets.length);
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
async function attach(files,index=null){
  if(!draft||reading||draft.status!=='pending'||!files.length)return;
  const id=draft.id;reading=true;controls();
  try{
    const isImage=file=>file.type.startsWith('image/')||/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
    const pictures=files.filter(isImage),texts=files.filter(file=>!isImage(file));
    const free=photos.flatMap((photo,i)=>!photo&&i!==index?[i]:[]);
    if(index!==null)free.unshift(index);
    if(pictures.length>free.length)throw Error('最多添加 3 张图片，请先移除已有图片。');
    if(texts.length>1||index!==null&&texts.length)throw Error('图片位只接收图片，文本文件请单独添加。');
    const images=await Promise.all(pictures.map(readAttachment));
    const doc=texts.length?await readAttachment(texts[0]):null;
    if(draft.id!==id)return;
    images.forEach((file,i)=>{photos[free[i]]=file;});
    if(doc)setFile(doc);
    paintPhotos();el('recordStatus').textContent='';
  }catch(e){if(draft.id===id)el('recordStatus').textContent=e.message;}
  finally{reading=false;controls();}
}
el('sourcePhoto').onclick=()=>{
  const index=photos.indexOf(null);
  if(index<0){el('recordStatus').textContent='最多添加 3 张图片。';return;}
  photos[index]={...draft.sourcePhoto,source:true};paintPhotos();controls();
};
el('imageFiles').onchange=e=>{const files=[...e.target.files];e.target.value='';void attach(files,pickIndex);};
el('chooseFile').onclick=()=>el('file').click();
el('file').onchange=e=>void attach([...e.target.files]);
el('removeFile').onclick=()=>{setFile(null);controls();};
function acceptFiles(e,files){
  if(!files.length)return;
  e.preventDefault();
  const slot=e.target.closest?.('.photo-slot');
  void attach([...files],slot?Number(slot.dataset.index):null);
}
document.addEventListener('paste',e=>acceptFiles(e,e.clipboardData?.files??[]));
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.addEventListener('drop',e=>acceptFiles(e,e.dataTransfer.files));
for(const [id,action] of [['approveRecord','confirm'],['discardRecord','cancel'],['sendInput','send']]){
  el(id).onclick=async()=>{
    if(!draft||el(id).disabled||dictating())return;
    const selected=photos.filter(Boolean).map(file=>file.source?'source':file);
    const answer={action};
    if(action==='send')Object.assign(answer,{text:el('answer').value,values:inputs().map(i=>i.value),attachment,
      images:draft.targets.length?[]:selected});
    if(action==='confirm'&&selected.length&&draft.targets.length)Object.assign(answer,{images:selected,photoTarget:Number(el('photoTarget').value)});
    const token=draft.id;render({...draft,status:'working',message:'正在处理…'});
    try{await api.decideReview(token,answer);}
    catch(e){if(draft.id===token)render({...draft,status:'pending',message:e.message});}
  };
}
el('closeReview').onclick=()=>window.close();
window.addEventListener('companion-page-update',e=>{if(draft&&['pending','working'].includes(draft.status))e.preventDefault();});
