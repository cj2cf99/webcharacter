'use strict';
// 原型全部使用合成索引；阅读正文时才载入叙事样例。交互记录只存在这一页内。
const $ = id => document.getElementById(id);
const themes = [
  [20,2,'灯亮起来的时候','你记得上周那盏阅读灯，还给我留了一句晚安。','释然','阴转晴','阅读灯'],
  [20,1,'那笔游戏扣款，原来是礼物','我问起昨晚的花销，你说那是给朋友准备的生日礼物。','安心','小雨','消费'],
  [19,2,'雨停以后再出门','你把散步推迟到傍晚，让我记得提醒你带伞。','惦念','小雨','散步'],
  [19,1,'把周五的事情先记下','我们核对了提醒时间，等你回来再定地点。','期待','多云','提醒'],
  [18,1,'窗边多了一盏灯','你想给书桌挑一盏暖色的灯，说到货了让我看看。','好奇','晴','阅读灯'],
  [17,1,'无所事事的一天','','平静','无记录','空日记'],
  [16,1,'相册里的第一张照片','你给今天的散步挑了一张照片，想留作纪念。','开心','晴','散步'],
  [15,1,'晚饭留在便签上','你把晚饭要买的东西一项项念给我听。','温暖','阴','生活'],
  [14,1,'重排周末的清单','你想给上午留点空白，我们把一项提醒移到了下午。','轻松','晴','提醒'],
  [13,1,'一杯热茶的时间','你说今天忙了很久，想安安静静喝完一杯茶。','温暖','阴','生活'],
  [12,1,'等一个好天气','你想晴天出门拍照，我们约好再看预报。','期待','雨','散步'],
  [11,1,'一段没说完的配乐','你提起喜欢的游戏配乐，歌名还没想起来。','好奇','多云','游戏'],
  [10,1,'按时送到的提醒','你让我在晚饭前提醒取快递，后来告诉我拿到了。','开心','晴','提醒'],
  [9,1,'雨落在窗沿上','你在窗边听雨，问我今晚还会不会下。','平静','雨','生活'],
  [8,1,'书页里的便签','你说读到有趣的地方，会在页边夹一张纸。','好奇','晴','阅读'],
  [7,1,'留给周末的游戏','你把新游戏留到周末，说今天先早点睡。','释然','多云','游戏'],
  [6,1,'傍晚绕了一条路','你散步回来说，街角的树开始变色了。','开心','晴','散步'],
  [5,1,'清单上的小变化','你把下午的采购移到了明天。','平静','阴','提醒'],
  [4,1,'书桌上的位置','我们聊了桌面收纳，你想把书放到伸手够得到的地方。','温暖','晴','生活'],
  [3,1,'把票根留下','你说想留下电影票根，好记得一起看过的故事。','期待','多云','生活'],
  [2,1,'一笔小小的奖励','你完成了计划里的事，顺手给自己买了杯咖啡。','开心','晴','消费'],
  [1,1,'十一月的第一句早安','新的一月，你在对话里跟我打了声招呼。','温暖','晴','生活']
];
const dayOf = n => '2026-11-' + String(n).padStart(2,'0');
const diaries = themes.map(([d,part,title,summary,mood,weather,tag]) =>
  ({id:'d'+d+'-'+part,day:dayOf(d),part,title,summary,mood,weather,tag}));
const nags = [
  {id:'n1',day:dayOf(20),time:'09:15',title:'生日礼物的扣款',tag:'消费',reason:'游戏消费 · 4,200 日元',status:'已解释',mood:'释然',before:'有点担心',origin:'paylog/P-018',source:'Paylog · P-018',stats:'11/13–19 共 3 笔，11/06–12 共 1 笔'},
  {id:'n2',day:dayOf(19),time:'16:20',title:'周五要去哪里',tag:'悬念',reason:'日记里待补的地点',status:'用户结束',mood:'失落',before:'好奇',origin:'diary/d19-1/1',source:'11/19 第一篇 · 悬念 1',stats:''},
  {id:'n3',day:dayOf(18),time:'12:00',title:'书桌上的阅读灯',tag:'悬念',reason:'日记里待补的到货情况',status:'已解释',mood:'期待',before:'惦念',origin:'diary/d18-1/1',source:'11/18 第一篇 · 悬念 1',stats:''}
];
const state = {tab:'diary',date:'',filter:'',search:'',page:1};
const esc = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isDiary = () => state.tab==='diary';
const sourceRows = () => isDiary()?diaries:nags;
function render(){
  $('archiveSummary').textContent='十一月　·　'+diaries.length+' 篇日记　/　'+nags.length+' 条念叨';
  const needle=state.search.trim().toLowerCase().replace(/^@#/,'');
  const filtered=sourceRows().filter(r=>(!state.date||state.date===r.day)&&(!state.filter||r.tag===state.filter)&&
    [r.title,r.summary,r.tag,r.mood,r.day,r.reason,r.status,r.stats].filter(Boolean).join(' ').toLowerCase().includes(needle));
  const pages=Math.max(1,Math.ceil(filtered.length/20));
  state.page=Math.min(state.page,pages);
  $('listCaption').textContent=(state.date?state.date+' · ':'')+filtered.length+(isDiary()?' 篇手记':' 条念叨');
  $('rows').innerHTML=filtered.slice((state.page-1)*20,state.page*20).map(r=>{
    const meta=isDiary()?`第 ${r.part} 篇　·　${r.mood}　·　${r.weather}　 @#${r.tag}`:`${r.time}　·　${r.tag}　·　${r.status}　·　${r.mood}`;
    return `<a class="entry" href="#read-${r.id}" data-read="${r.id}"><span class="stamp"><b>${r.day.slice(-2)}</b><small>11 月</small></span><span><strong>${esc(r.title)}</strong><span class="meta">${esc(meta)}</span><span class="synopsis">${esc((isDiary()?r.summary:r.reason)||'当日无素材')}</span></span><span class="chevron">›</span></a>`;
  }).join('')||'<p class="empty">没有找到相符的记录。 <button id="clearAll">清除筛选</button></p>';
  $('prev').disabled=state.page===1;$('next').disabled=state.page===pages;
  $('pageInfo').textContent=state.page+' / '+pages;
  $('clearDate').disabled=!state.date;
  $('mobileDate').value=state.date;
  const available=new Set(sourceRows().map(r=>r.day));
  $('calendar').innerHTML='<i></i>'.repeat(6)+Array.from({length:30},(_,i)=>{
    const day=dayOf(i+1);
    return `<button class="cal-date" data-day="${day}" aria-label="${day}" aria-pressed="${state.date===day}" ${available.has(day)?'':'disabled'}>${i+1}</button>`;
  }).join('');
}
function clearFilters(){
  Object.assign(state,{search:'',filter:'',date:'',page:1});
  $('search').value='';$('filter').value='';
}
function navigate(){
  const hash=location.hash.slice(1);
  const overview=hash==='overview';
  $('overview').hidden=!overview;$('workspace').hidden=overview;
  state.tab=hash==='nag'?'nag':'diary';
  for(const [id,name] of [['diaryTab','diary'],['nagTab','nag']]){
    if(name===state.tab)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');
  }
  clearFilters();
  $('filter').innerHTML='<option value="">'+(isDiary()?'全部标签':'全部来源')+'</option>'+
    [...new Set(sourceRows().map(r=>r.tag))].map(tag=>'<option>'+esc(tag)+'</option>').join('');
  render();
}
let detailLoader;
function loadDetailView(){
  if(!detailLoader)detailLoader=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='reader.js';
    script.onload=resolve;script.onerror=()=>{detailLoader=null;script.remove();reject(Error('加载失败'));};document.head.append(script);
  });
  return detailLoader;
}
let readSequence=0;
async function read(id){
  const r=sourceRows().find(row=>row.id===id);if(!r)return;
  const sequence=++readSequence;
  $('readerLabel').textContent=r.day+' JST　 /　'+(isDiary()?'日记 · 第 '+r.part+' 篇':'念叨 · '+r.time);
  $('article').innerHTML='<p class="empty">正在翻页…</p>';
  if(!$('reader').open)$('reader').showModal();
  try{
    await loadDetailView();await new Promise(done=>setTimeout(done,150));
    if(sequence===readSequence&&$('reader').open)$('article').innerHTML=window.renderMemoryRecord(r);
  }catch{
    if(sequence===readSequence)$('article').innerHTML='<p class="empty">这页未能载入。 <button id="retryRead">重试</button></p>';
    if($('retryRead'))$('retryRead').onclick=()=>read(id);
  }
}
$('rows').onclick=e=>{
  const row=e.target.closest('[data-read]');
  if(row){e.preventDefault();read(row.dataset.read);}
  if(e.target.closest('#clearAll')){clearFilters();render();}
};
$('search').oninput=e=>{state.search=e.target.value;state.page=1;render();};
$('filter').onchange=e=>{state.filter=e.target.value;state.page=1;render();};
$('calendar').onclick=e=>{const b=e.target.closest('[data-day]');if(b){state.date=b.dataset.day===state.date?'':b.dataset.day;state.page=1;render();}};
$('clearDate').onclick=()=>{state.date='';state.page=1;render();};
$('mobileDate').onchange=e=>{state.date=e.target.value;state.page=1;render();};
for(const [id,delta] of [['prev',-1],['next',1]])$(id).onclick=()=>{state.page+=delta;render();$('listCaption').scrollIntoView({block:'nearest'});};
document.querySelector('.site-menu-toggle').onclick=()=>$('site-drawer').showModal();
document.addEventListener('click',e=>{
  const close=e.target.closest('[data-dismiss]');if(close)close.closest('dialog').close();
  if(e.target.closest('#site-drawer a'))$('site-drawer').close();
  if(e.target.closest('a[href^="#"]'))document.querySelector('.nav-group').open=false;
});
function originRoute(){return location.hash.startsWith('#origin/');}
async function showOrigin(){
  const hash=location.hash;
  $('originBody').textContent='正在打开原记录…';
  $('returnOrigin').textContent=$('reader').open?'返回这条念叨':'返回念叨列表';
  if(!$('origin').open)$('origin').showModal();
  try{
    await loadDetailView();
    if(location.hash===hash)window.renderMemoryOrigin(hash.slice('#origin/'.length),$('originBody'));
  }catch{
    if(location.hash===hash){
      $('originBody').innerHTML='<p>原记录未能载入。 <button>重试</button></p>';
      $('originBody').querySelector('button').onclick=showOrigin;
    }
  }
}
function leaveOrigin(){
  if($('reader').open)history.back();
  else location.replace('#nag');
}
$('returnOrigin').onclick=leaveOrigin;
$('origin').oncancel=e=>{e.preventDefault();leaveOrigin();};
window.addEventListener('hashchange',()=>{
  if(originRoute()){showOrigin();return;}
  if($('origin').open){
    $('origin').close();
    if($('reader').open&&location.hash==='#nag')return;
  }
  navigate();
});
navigate();
if(originRoute())showOrigin();

// 试演按钮推进模拟时间。返回档案只关闭预览窗口；气泡内的关闭按钮才表示主动结束。
const cases=[
  {id:'demo-pay',title:'游戏商店的 3,800 日元',tag:'消费',origin:'paylog/P-020',source:'Paylog · P-020',reason:'11 月 19 日 · 游戏消费 · 3,800 日元',
    stats:'11/13–19 游戏消费 3 笔，11/06–12 为 1 笔。',question:'昨晚游戏商店那笔 3,800 日元是买了什么呀？最近一周这里的游戏消费多了两笔，我有点惦记。',before:'担心'},
  {id:'demo-thread',title:'周末拍照的地点',tag:'悬念',origin:'diary/d16-1/1',source:'11/16 第一篇 · 悬念 1',reason:'七天内未解的日记悬念',
    stats:'',question:'你上次散步时说周末还想拍照，后来选好去哪里了吗？',before:'好奇'}
];
let active=null;
let ticks=0;
const startTime=Date.UTC(2026,10,20,1);
function clockText(){
  const time=new Date(startTime+ticks*7200000);
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
  const hour=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(time);
  return {day,hour};
}
function setControls(actions){
  $('labButtons').replaceChildren();
  for(const [label,run] of actions){
    const b=document.createElement('button');b.textContent=label;b.onclick=run;$('labButtons').append(b);
  }
}
function finish(status,mood,evaluation){
  active.status=status;active.mood=mood;active.evaluation=evaluation;
  if(status==='已解释')active.talk.push(['绯月',evaluation]);
  if(status==='用户结束')active.talk.push(['结束记录',evaluation]);
  active=null;render();showLab();
}
function poll(){
  ticks++;
  if(!active){
    const {day,hour}=clockText();
    const item=cases.find(c=>!nags.some(n=>n.id===c.id)&&(c.tag!=='消费'||day<=dayOf(20)));
    if(!item){showLab();return;}
    active={...item,day,time:hour,status:'提问中',mood:item.before,turns:0,turnLimit:6,interruptions:0,talk:[],evaluation:'等待听听你的解释。'};
    nags.unshift(active);
  }
  if(active.turns>=active.turnLimit){finish('回合结束',active.before,'这件事先留在手记里，等以后有下文。');return;}
  active.turns++;
  active.status='提问中';
  let prompt=active.question;
  if(active.turns>1)prompt=active.interruptions>=2?'上次聊到一半，如果你愿意，把这件事的缘由一次告诉我吧。':'接着刚才那件事聊，好吗？'+active.question;
  active.talk.push(['绯月',prompt]);render();showLab();
}
function suspend(status){
  active.status=status;
  if(status==='意外中断'&&++active.interruptions===2)active.turnLimit=Math.min(6,active.turns+3);
  if(active.turns>=active.turnLimit){finish('回合结束',active.before,'已经问到这一轮的上限，等以后自然有下文。');return;}
  active.evaluation=status==='等待回应'?'还没收到回应，留到下轮再聊。':'话说到一半，留在本机待续。';
  render();showLab();
}
function showLab(){
  const {day,hour}=clockText();
  $('labState').textContent=day+' '+hour+' JST　·　'+(active?active.status+' · 第 '+active.turns+' 回合':'空闲');
  if(active?.status==='提问中'){
    $('speech').innerHTML='<div class="modal-head"><b>绯月</b><button id="endNag" class="x" aria-label="结束这次追问">×</button></div><p>'+
      esc(active.talk.at(-1)[1])+'</p><form id="explain"><textarea id="explanation" rows="2" aria-label="你的解释" placeholder="跟绯月说说…" required></textarea><button>回应绯月</button></form>';
    $('endNag').onclick=()=>finish('用户结束','失落','老公闷闷的不理我了');
    $('explain').onsubmit=e=>{
      e.preventDefault();const value=$('explanation').value.trim();if(!value)return;
      active.talk.push(['你',value]);finish('已解释','安心','谢谢你告诉我缘由，我把你的原话记下了。');
    };
    setControls([['超时（模拟）',()=>suspend('等待回应')],['中断（模拟）',()=>suspend('意外中断')]]);
  }else{
    const latest=nags.find(n=>n.id.startsWith('demo-'));
    const line=active?active.evaluation:latest?latest.evaluation:'用模拟时钟触发一次轮询，看看绯月这次想问什么。';
    $('speech').innerHTML='<b>绯月</b><p>'+esc(line)+'</p>';
    const allDone=cases.every(c=>nags.some(n=>n.id===c.id));
    const actions=[];
    if(!allDone||active)actions.push(['下一次轮询（+2 小时）',poll]);
    if(latest)actions.push(['查看念叨记录',()=>{$('lab').close();location.hash='nag';navigate();read(latest.id);}]);
    if(allDone&&!active)actions.push(['重置试演',()=>{for(let i=nags.length-1;i>=0;i--)if(nags[i].id.startsWith('demo-'))nags.splice(i,1);ticks=0;render();showLab();}]);
    setControls(actions);
  }
}
$('launch').onclick=()=>{showLab();$('lab').showModal();};
