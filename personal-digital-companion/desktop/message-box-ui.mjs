const api=window.messageBox;
const data=await api.read();
const sheet=document.querySelector('#sheet'),actions=document.querySelector('#actions');
const kind={warning:'操作确认',error:'错误提示',question:'操作确认',info:'提示'};
sheet.dataset.type=data.type;
if(data.type==='warning'||data.type==='error')sheet.setAttribute('role','alertdialog');
document.querySelector('#context').textContent=data.title.replace(/^绯月[ ·]*/,'')||kind[data.type]||'提示';
document.querySelector('#message').textContent=data.message;
document.querySelector('#detail').textContent=data.detail;
let submitted=false;
function choose(index){
  if(submitted)return;
  submitted=true;
  api.choose(index);
}
const list=data.buttons.length>3||data.buttons.some(label=>label.length>14);
actions.classList.toggle('list',list);
data.buttons.forEach((label,index)=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=label;
  if(index===data.defaultId)button.className='primary';
  button.addEventListener('click',()=>choose(index));
  actions.append(button);
});
document.querySelector('#close').addEventListener('click',()=>choose(data.cancelId));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();choose(data.cancelId);}
});
actions.children[data.defaultId]?.focus({preventScroll:true});
const desiredHeight=sheet.getBoundingClientRect().height+2*parseFloat(getComputedStyle(document.body).paddingTop);
sheet.classList.add('sized');
const copy=document.querySelector('.copy');
function updateScrollFocus(){copy.tabIndex=copy.scrollHeight>copy.clientHeight?0:-1;}
new ResizeObserver(updateScrollFocus).observe(copy);
api.ready(desiredHeight);
