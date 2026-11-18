import {SOUND_NODES,normalizeSound} from './sound.mjs';
const host=window.desktopHost,enabled=document.querySelector('#enabled'),volume=document.querySelector('#volume'),percent=document.querySelector('#percent'),status=document.querySelector('#status'),nodes=document.querySelector('#nodes');
let ready=false,settings=normalizeSound();const rows=new Map();
for(const node of SOUND_NODES){
  const row=document.createElement('div');row.className='node';
  row.innerHTML=`<label class="node-name" for="on-${node.id}">${node.label}<small>${node.text}</small></label><input id="on-${node.id}" type="checkbox" role="switch" aria-label="${node.label}声音"><input id="vol-${node.id}" type="range" min="0" max="100" step="1" aria-label="${node.label}音量"><output></output><button type="button" title="试听${node.label}" aria-label="试听${node.label}">▶</button>`;
  const [toggle,slider]=row.querySelectorAll('input'),output=row.querySelector('output'),preview=row.querySelector('button');
  toggle.addEventListener('change',()=>{settings.nodes[node.id].enabled=toggle.checked;save();});
  slider.addEventListener('input',()=>{settings.nodes[node.id].volume=Number(slider.value);save();});
  preview.addEventListener('click',()=>host.previewSound(node.id));
  rows.set(node.id,{row,toggle,slider,output,preview});nodes.append(row);
}
function draw(){
  enabled.disabled=volume.disabled=!ready;enabled.checked=settings.enabled;volume.value=settings.volume;percent.textContent=settings.volume+'%';
  for(const node of SOUND_NODES){const item=rows.get(node.id),value=settings.nodes[node.id];item.toggle.checked=value.enabled;item.slider.value=value.volume;item.output.textContent=value.volume+'%';item.toggle.disabled=item.slider.disabled=!ready||!node.file;item.preview.disabled=!node.file||!ready||!settings.enabled||!settings.volume||!value.enabled||!value.volume;item.row.classList.toggle('muted',!value.enabled);}
}
function save(){if(!ready)return;draw();status.textContent='保存中…';host.setSound(settings);}
const off=host.onSound(value=>{ready=true;settings=normalizeSound(value);status.textContent=value.error?'保存失败，请重试':'已保存';draw();});
enabled.addEventListener('change',()=>{settings.enabled=enabled.checked;save();});volume.addEventListener('input',()=>{settings.volume=Number(volume.value);save();});
window.addEventListener('pagehide',off);draw();host.soundReady();
