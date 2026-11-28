// 「登记下载」小窗：支持「视频」与「文章」两种提交，不读下载列表与缩略图。
import {$,message,problem} from './x-video-shared.mjs';

const api=window.xVideo,form=$('#form'),url=$('#url'),name=$('#name'),replies=$('#replies'),submit=$('#download'),toast=$('#toast'),dialog=$('#updateDialog');
let kind='video',jumpTab='queue',lastData=null,reading=0,busy=false,asking=false,submitted='';

function resetOverwrite(){
  $('#overwriteBtn').hidden=true;
  jumpTab='queue';$('#jumpQueue').textContent='查看进度 →';
}
function setKind(next){
  kind=next==='article'?'article':'video';
  for(const btn of document.querySelectorAll('[data-kind]'))btn.setAttribute('aria-pressed',String(btn.dataset.kind===kind));
  $('#repliesWrap').hidden=kind!=='article';
  $('#urlLabel').textContent=kind==='article'?'X 文章 / 帖子链接':'X 视频链接';
  $('#nameHint').textContent=kind==='article'?'选填，留空自动用文章标题或东京时间':'选填，留空按东京时间命名';
  submit.textContent=kind==='article'?'📄 归档文章':'⬇ 开始下载';
  resetOverwrite();
  if(lastData)paintBanner(lastData);
}

function paintBanner(data){
  const failure=kind==='article'?(data.error||(!data.disk.ready&&data.disk.help)||''):problem(data);
  const progress=kind==='video'?(data.update.applying?'正在更新 yt-dlp…':data.update.waiting?'等待在途下载结束后更新 yt-dlp。':''):'';
  const cookieTip=kind==='article'&&!failure&&!data.cookie?.savedAt?'长文归档需登录态，请先在「X视频管理 → 🍪」导入 X Cookie。':'';
  const text=failure||progress||(kind==='video'?data.update.error:'')||cookieTip;
  const banner=$('#banner');
  banner.hidden=!text;
  banner.dataset.tone=failure?'danger':progress?'info':'warn';
  if(banner.textContent!==text)banner.textContent=text;
}

async function refresh(){
  const token=++reading;
  try{
    const data=await api.snapshot();
    if(token!==reading)return;
    lastData=data;
    $('#slotNum').textContent=data.occupied+'/'+data.max;
    document.querySelectorAll('.slot-dots i').forEach((dot,i)=>dot.classList.toggle('on',i<data.occupied));
    $('#where').textContent='📁 '+data.root;
    paintBanner(data);
  }catch(error){toast.textContent=message(error);}
}
function syncKindFromUrl(raw){
  if(/\/article\/\d+/.test(raw)&&kind!=='article')setKind('article');
}
async function paste(manual){
  try{
    const found=await api.clipboard();
    if(found&&(manual||!url.value.trim()&&found!==submitted)){
      url.value=found;resetOverwrite();syncKindFromUrl(found);
      toast.textContent='已填入剪贴板链接，点按钮才会启动。';
    }else if(manual)toast.textContent='剪贴板里没有 X 链接。';
  }catch(error){if(manual)toast.textContent=message(error);}
}
function ask(result){
  $('#updateText').textContent=`当前 ${result.current} → 最新 ${result.latest}。只有同意后才会更新。`;
  const lock=$('#updateLock');
  lock.hidden=!result.running;
  lock.textContent=result.running?`有 ${result.running} 个下载正在进行，同意后会等它们结束再更新。`:'';
  asking=true;dialog.showModal();
  return new Promise(done=>{
    const finish=choice=>{
      if(!asking)return;
      asking=false;dialog.close();done(choice);
    };
    for(const node of dialog.querySelectorAll('[data-choice]'))node.onclick=()=>finish(node.dataset.choice);
    dialog.oncancel=event=>{event.preventDefault();finish('');};
  });
}

async function submitTask(overwrite=false){
  if(busy)return;
  busy=true;submit.disabled=true;submit.setAttribute('aria-busy','true');
  $('#overwriteBtn').hidden=true;
  const input={url:url.value,name:name.value,kind,...(kind==='article'&&{replies:replies.value,overwrite})};
  toast.textContent=kind==='article'?'正在提交文章抓取任务…':'正在登记…当天首次下载会先检查引擎版本。';
  try{
    let result=await api.submit(input);
    if(result.status==='update'){
      const decision=await ask(result);
      if(!decision){toast.textContent='已取消，没有开始下载。';return;}
      result=await api.submit({...input,decision});
    }
    toast.textContent=result.message+(result.warning?'\n'+result.warning:'');
    if(result.status==='exists'){
      jumpTab='library';$('#jumpQueue').textContent='查看已下载 →';
      $('#overwriteBtn').hidden=false;
      $('#jump').hidden=false;
      return;
    }
    jumpTab='queue';$('#jumpQueue').textContent='查看进度 →';
    if(result.status==='queued'||result.status==='retried'){
      submitted=result.url||'';
      url.value='';name.value='';
      form.classList.remove('sent');void form.offsetWidth;form.classList.add('sent');
    }
    $('#jump').hidden=result.status==='invalid';
    if(result.status==='invalid')url.focus();
  }catch(error){toast.textContent=message(error);}
  finally{busy=false;submit.disabled=false;submit.removeAttribute('aria-busy');void refresh();}
}

for(const btn of document.querySelectorAll('[data-kind]'))btn.onclick=()=>setKind(btn.dataset.kind);
url.oninput=()=>{resetOverwrite();syncKindFromUrl(url.value);};
form.onsubmit=event=>{event.preventDefault();void submitTask(false);};
$('#overwriteBtn').onclick=()=>void submitTask(true);
$('#paste').onclick=()=>void paste(true);
$('#jumpQueue').onclick=()=>void api.openManage(jumpTab).catch(error=>{toast.textContent=message(error);});
api.onChanged(()=>void refresh());
window.addEventListener('focus',()=>{void paste(false);void refresh();});
void refresh();void paste(false);url.focus();
