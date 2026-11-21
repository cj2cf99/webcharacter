const api=window.feiyueScene;
const images=document.querySelector('#images'),dialog=document.querySelector('dialog'),zoom=document.querySelector('#zoom');
const reply=document.querySelector('#reply'),status=document.querySelector('[role=status]');
let scene,submitting=false;
function picture(frame,large=false){
  const figure=document.createElement('figure'),btn=document.createElement('button'),img=document.createElement('img');
  btn.className='picture';btn.type='button';btn.setAttribute('aria-label',(large?'关闭大图':'放大')+' · '+frame.label);
  img.alt=frame.label;img.src=frame.url;btn.append(img);figure.append(btn);
  if(frame.box&&scene.kind==='ask'){
    const [x,y,w,h]=frame.box;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),oval=document.createElementNS(ns,'ellipse');
    svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
    // The model supplies the enclosing oval. Add clearance outside that boundary.
    for(const [k,v] of Object.entries({cx:x+w/2,cy:y+h/2,rx:w*.56+4,ry:h*.56+4,pathLength:1,class:'mark'}))oval.setAttribute(k,v);
    svg.append(oval);btn.append(svg);
  }
  const cap=document.createElement('figcaption');cap.textContent=frame.label;figure.append(cap);
  btn.onclick=()=>{if(large)dialog.close();else{zoom.replaceChildren(picture(frame,true));dialog.showModal();}};return figure;
}
document.querySelector('#back').onclick=()=>dialog.close();
async function finish(answer){
  if(submitting||!scene)return;submitting=true;
  try{await api.finish(scene.id,answer);status.textContent=answer?'已收到回应':'已收起';}
  catch{status.textContent='保存失败，可以重试。';}finally{submitting=false;}
}
document.querySelector('#skip').onclick=()=>finish('');
document.querySelector('form').onsubmit=e=>{e.preventDefault();if(reply.value.trim())void finish(reply.value);else reply.focus();};
async function render(){
  scene=await api.get();if(!scene)return;
  document.querySelector('#thought').textContent=scene.text;
  const stamp=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(scene.at);
  document.querySelector('time').textContent=stamp+' JST';
  images.replaceChildren(...scene.frames.slice(0,2).map(f=>picture(f)));reply.value='';status.textContent='';
}
render().catch(()=>{status.textContent='场景暂时无法读取。';});
