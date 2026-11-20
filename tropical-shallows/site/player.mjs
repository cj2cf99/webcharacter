const video=document.querySelector('#scene');
const loading=document.querySelector('#loading'),loadingText=document.querySelector('#loading-text'),retry=document.querySelector('#retry');
const state=document.querySelector('#state'),quality=document.querySelector('#quality'),dot=document.querySelector('#dot');
let mode='full',manifest;
const showLoading=text=>{loading.hidden=false;loadingText.textContent=text;retry.hidden=true;};
function update(){
  dot.classList.toggle('playing',!video.paused&&!video.ended);
  state.textContent=video.paused?'已暂停':video.currentTime%6<1.65?'冲滩':video.currentTime%6<5.1?'退水':'弱浪间歇';
  if(video.videoWidth)quality.textContent=`${video.videoWidth} × ${video.videoHeight} · 12 fps`;
}
async function loadMode(next=mode){
  mode=next;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  document.querySelector('.viewer').classList.toggle('shore',mode==='shore');
  showLoading(mode==='full'?'正在加载完整场景…':'正在加载岸边特写…');
  const entry=manifest?.[mode];
  if(!entry){loadingText.textContent='完整动画正在准备，请稍候';retry.hidden=false;return;}
  video.poster=mode==='full'?'assets/poster.png':'';
  video.src=entry.src;video.load();
  try{await video.play();}catch{state.textContent='点击播放';}
}
async function readManifest(){
  try{const response=await fetch('media.json',{cache:'no-store'});if(!response.ok)throw Error('media');manifest=await response.json();}
  catch{manifest={shore:{src:'assets/shore.mp4'}};}
}
video.addEventListener('loadeddata',()=>{loading.hidden=true;update();});
video.addEventListener('playing',()=>{loading.hidden=true;update();});
video.addEventListener('pause',update);video.addEventListener('timeupdate',update);
video.addEventListener('waiting',()=>{if(video.readyState<3)showLoading('正在缓冲…');});
video.addEventListener('error',()=>{loading.hidden=false;loadingText.textContent='动画暂时无法加载';retry.hidden=false;state.textContent='加载失败';});
retry.addEventListener('click',async()=>{await readManifest();await loadMode();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>loadMode(b.dataset.mode)));
await readManifest();await loadMode('full');
