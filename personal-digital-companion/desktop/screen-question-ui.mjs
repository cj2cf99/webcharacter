const host=window.screenQuestion;
const form=document.querySelector('#questionForm'),question=document.querySelector('#question'),answer=document.querySelector('#answer'),reply=document.querySelector('#reply'),send=document.querySelector('#send'),retry=document.querySelector('#retry'),badge=document.querySelector('#badge');
let busy=false;
function render(value){
  if(!value||!['idle','waiting','answer','error'].includes(value.state))return;
  busy=value.state==='waiting';reply.dataset.state=value.state;reply.setAttribute('aria-busy',String(busy));
  answer.textContent=typeof value.text==='string'?value.text:'';
  question.disabled=busy;send.disabled=busy;retry.disabled=busy;retry.hidden=value.state!=='error'||!value.retryable;
  badge.textContent={idle:'看屏幕问答',waiting:'正在看…',answer:'我的回答',error:'暂时没答上来'}[value.state];
  reply.scrollTop=0;
  host.fit(Math.max(260,Math.min(420,Math.ceil(answer.scrollHeight+(busy?24:0)+195))));
}
const failure=()=>render({state:'error',text:'问答连接中断，请关闭后重新打开。',retryable:false});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const text=question.value.trim();if(!text||[...text].length>2000){render({state:'error',text:'请输入1至2000个字的问题。',retryable:false});return;}
  render({state:'waiting',text:'正在截取鼠标所在屏幕…'});
  try{render(await host.ask(text));}catch{failure();}
});
question.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}});
retry.addEventListener('click',async()=>{if(busy)return;render({state:'waiting',text:'正在用原图重试…'});try{render(await host.retry());}catch{failure();}});
document.querySelector('#close').addEventListener('click',()=>host.close());
document.addEventListener('keydown',event=>{if(event.key==='Escape')host.close();});
const off=[host.onState(render),host.onLayout(value=>{const bubble=document.querySelector('.bubble');bubble.dataset.tail=value.tail;bubble.style.setProperty('--tail-x',`${value.tailX}px`);})];
host.state().then(render).catch(failure);question.focus();
window.addEventListener('pagehide',()=>off.forEach(remove=>remove()));
