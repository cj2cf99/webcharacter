const api=window.feiyueMenu,box=document.getElementById('items'),menu=document.getElementById('menu');
function element(tag,className,text=''){const node=document.createElement(tag);node.className=className;node.textContent=text;return node;}
// path 是在可见条目中的下标路径，主进程据此找回原生 MenuItem。
function render(list,path=[]){
  const fragment=document.createDocumentFragment();
  list.forEach((item,index)=>{
    if(item.type==='separator'){fragment.append(element('div','sep'));return;}
    const button=element('button','item'),here=[...path,index];
    button.type='button';button.disabled=!item.enabled;
    button.title=item.label;button.append(element('span','icon',item.icon),element('span','label',item.label));
    if(item.tone)button.classList.add(item.tone);
    if(item.submenu){
      button.classList.add('group');button.setAttribute('aria-expanded','false');button.append(element('span','tail','›'));
      const sub=element('div','sub');sub.hidden=true;sub.append(render(item.submenu,here));
      button.onclick=()=>toggle(button,sub);
      fragment.append(button,sub);return;
    }
    if(item.type==='checkbox'){
      button.setAttribute('role','menuitemcheckbox');button.setAttribute('aria-checked',String(item.checked));
      button.append(element('span','check','✓'));
    }else{button.setAttribute('role','menuitem');button.append(element('span','tail'));}
    button.onclick=()=>api.choose(here);
    fragment.append(button);
  });
  return fragment;
}
// 同一层只展开一个分组，保持菜单短小。
function toggle(button,sub,open=sub.hidden){
  if(open)for(const other of button.parentElement.querySelectorAll(':scope > .group[aria-expanded=true]'))
    if(other!==button)toggle(other,other.nextElementSibling,false);
  sub.hidden=!open;button.setAttribute('aria-expanded',String(open));
}
const visible=()=>[...box.querySelectorAll('.item')].filter(item=>item.offsetParent&&!item.disabled);
function move(step){
  const items=visible(),index=items.indexOf(document.activeElement);
  items[(index+step+items.length)%items.length]?.focus();
}
document.addEventListener('keydown',event=>{
  const current=document.activeElement;
  if(event.key==='Escape')api.close();
  else if(event.key==='ArrowDown')move(1);
  else if(event.key==='ArrowUp')move(-1);
  else if(event.key==='ArrowRight'&&current?.classList.contains('group')){toggle(current,current.nextElementSibling,true);move(1);}
  else if(event.key==='ArrowLeft'){
    const sub=current?.closest('.sub');
    if(sub){const group=sub.previousElementSibling;toggle(group,sub,false);group.focus();}
  }else return;
  event.preventDefault();
});
new ResizeObserver(()=>api.size(menu.getBoundingClientRect().height)).observe(menu);
api.onShow(async()=>{
  document.body.classList.remove('show');
  box.replaceChildren(render(await api.read()));
  void document.body.offsetWidth;document.body.classList.add('show');
  api.size(menu.getBoundingClientRect().height);
});
