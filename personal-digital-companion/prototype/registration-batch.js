const byId=id=>document.getElementById(id);
const notes=[{title:'河边的晚霞',body:'河边的晚霞',photos:Array(3).fill(null)},
  {title:'新发现的咖啡店',body:'新发现的咖啡店',photos:Array(3).fill(null)}];
const tomorrow=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now()+86400000);
const reminder={title:'整理照片',body:'整理照片',date:tomorrow};
const tasks=[...notes,reminder];
const choices=['生活','探店','旅行','工作'];
let finished=false;
const photoCount=()=>notes.reduce((count,n)=>count+n.photos.filter(Boolean).length,0);
const category=note=>note.category||byId('shared').value;
function options(select,placeholder){
  select.add(new Option(placeholder,''));
  for(const name of choices)select.add(new Option(name,name));
}
options(byId('shared'),'请选择');
function status(){
  const missing=notes.filter(n=>!category(n)).length;
  byId('progress').textContent=missing?missing+' 项待补分类':'3 项已就绪';
  byId('confirm').disabled=!!missing;
  for(const note of notes){
    const inherited=byId('shared').value;
    note.select.options[0].text=inherited?'随统一 · '+inherited:'选择分类';
    note.select.setAttribute('aria-invalid',String(!category(note)));
    note.select.required=!inherited;
    note.row.querySelector('.pic-title span').textContent='整批 '+photoCount()+'/3';
  }
}
function expand(task,open){
  for(const item of tasks){
    const selected=open&&item===task;
    item.row.querySelector('.sub').hidden=!selected;
    item.row.querySelector('.title').setAttribute('aria-expanded',String(selected));
  }
}
function thumbnails(task){
  const slots=task.row.querySelector('.slots');
  const shortcut=task.row.querySelector('.row-photos');
  const attached=task.photos.filter(Boolean);
  shortcut.replaceChildren();
  shortcut.setAttribute('aria-label',task.title+'的附图，'+attached.length+' 张');
  shortcut.title=task.title+'的附图';
  if(!attached.length)shortcut.textContent='＋ 附图';
  for(const photo of attached){
    const thumb=document.createElement('img');thumb.src=photo.url;thumb.alt=photo.name;shortcut.append(thumb);
  }
  slots.replaceChildren();
  task.photos.forEach((photo,index)=>{
    const slot=document.createElement('div');slot.className='slot';slot.dataset.index=index;
    const button=document.createElement('button');button.className='pick';
    button.title=task.title+' · '+(photo?'替换':'添加')+'第 '+(index+1)+' 张图';
    button.setAttribute('aria-label',button.title);
    if(photo){
      const img=document.createElement('img');img.src=photo.url;img.alt=photo.name;button.append(img);
    }else button.textContent='＋';
    button.onclick=()=>{const input=task.row.querySelector('.pic-input');input.dataset.index=index;input.click();};
    slot.append(button);
    if(photo){
      const remove=document.createElement('button');remove.textContent='×';remove.className='remove';
      remove.setAttribute('aria-label','移除 '+photo.name);
      remove.onclick=()=>{URL.revokeObjectURL(photo.url);task.photos[index]=null;thumbnails(task);status();};slot.append(remove);
    }
    slots.append(slot);
  });
}
function addImages(task,files,index=null){
  if(finished||!files.length)return;
  const message=byId('message');
  if(!task?.photos){message.textContent='请在对应的随手记中添加图片。';return;}
  if(files.some(f=>!f.type.startsWith('image/'))){message.textContent='图片位只接受图片文件。';return;}
  const available=task.photos.flatMap((photo,i)=>!photo&&i!==index?[i]:[]);
  if(index!==null)available.unshift(index);
  if(files.length>available.length||photoCount()+files.length-Number(index!==null&&!!task.photos[index])>3){
    message.textContent='整批最多三张图片，请先移除一张。';return;
  }
  files.forEach((file,i)=>{
    const pos=available[i],old=task.photos[pos];
    if(old)URL.revokeObjectURL(old.url);
    task.photos[pos]={name:file.name,url:URL.createObjectURL(file)};
  });
  expand(task,true);thumbnails(task);status();message.textContent='已将 '+files.map(f=>f.name).join('、')+' 附到「'+task.title+'」。';
}
function buildRow(task){
  const row=byId('row').content.firstElementChild.cloneNode(true);
  task.row=row;
  row.querySelector('.name').textContent=task.title;
  const toggle=row.querySelector('.title');
  toggle.onclick=()=>expand(task,toggle.getAttribute('aria-expanded')!=='true');
  const text=row.querySelector('textarea'),label=row.querySelector('.text-label');
  text.id='body-'+tasks.indexOf(task);label.htmlFor=text.id;
  label.textContent=task.photos?'正文':'提醒内容';text.value=task.body;text.oninput=()=>{task.body=text.value;};
  const fileInput=row.querySelector('.text-input');
  row.querySelector('.text-file').onclick=()=>fileInput.click();
  fileInput.onchange=async()=>{
    const file=fileInput.files[0];fileInput.value='';if(!file)return;
    try{
      if(file.size>16000)throw Error('文本过长，请选取需要的片段。');
      const imported=await file.text();if(finished)return;
      task.body=text.value=[text.value,imported].filter(Boolean).join('\n');
    }catch(e){byId('message').textContent=e.message;}
  };
  const primary=row.querySelector('.primary');
  if(task.photos){
    const select=document.createElement('select');task.select=select;options(select,'选择分类');
    select.setAttribute('aria-label',task.title+'的分类');select.onchange=()=>{task.category=select.value;status();};
    row.querySelector('.pic-title strong').textContent='「'+task.title+'」的附图';
    const shortcut=row.querySelector('.row-photos');shortcut.hidden=false;
    shortcut.onclick=()=>{
      expand(task,true);
      const picks=row.querySelectorAll('.pick');
      picks[Math.max(0,task.photos.indexOf(null))].focus();
    };
    primary.append(select);thumbnails(task);
    const picker=row.querySelector('.pic-input');
    picker.onchange=()=>{const files=[...picker.files];picker.value='';addImages(task,files,Number(picker.dataset.index));};
    byId('notes').append(row);
  }else{
    const date=document.createElement('input');date.type='date';date.value=task.date;
    date.setAttribute('aria-label','提醒日期（东京时间，可留空）');date.title='提醒日期 · 东京时间（可留空）';
    date.oninput=()=>{task.date=date.value;};primary.append(date);
    row.querySelector('.pictures').hidden=true;byId('reminders').append(row);
  }
}
tasks.forEach(buildRow);byId('shared').onchange=status;status();
function receive(e,files){
  if(!files?.length||finished)return;
  e.preventDefault();
  const row=e.target.closest?.('article');
  const task=tasks.find(t=>t.row===row);
  const slot=e.target.closest?.('.slot');
  addImages(task,[...files],slot?Number(slot.dataset.index):null);
}
document.addEventListener('paste',e=>receive(e,e.clipboardData?.files));
function highlight(row){
  for(const note of notes)note.row.classList.toggle('receiving',note.row===row);
}
document.addEventListener('dragover',e=>{
  if(!e.dataTransfer.types.includes('Files'))return;
  e.preventDefault();highlight(e.target.closest?.('#notes article'));
});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)highlight(null);});
document.addEventListener('dragend',()=>highlight(null));
document.addEventListener('drop',e=>{highlight(null);receive(e,e.dataTransfer.files);});
byId('cancel').onclick=()=>window.close();
byId('confirm').onclick=()=>{
  if(finished){location.reload();return;}
  if(notes.some(n=>!category(n)))return;
  finished=true;expand(null,false);
  for(const input of document.querySelectorAll('main input,main textarea,main select,main button'))input.disabled=true;
  byId('progress').textContent='模拟登记完成';
  byId('message').textContent=tasks.map(t=>t.photos?t.title+' · '+category(t)+' · '+t.photos.filter(Boolean).length+' 张附图'+(t.photos.some(Boolean)?'（'+t.photos.filter(Boolean).map(p=>p.name).join('、')+'）':''):
    t.title+' · '+(t.date?t.date+'（东京时间）':'无日期')).join('\n');
  byId('confirm').textContent='重新体验';byId('cancel').textContent='关闭';
};
