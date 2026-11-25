// 周 / 日热点版面原型：几何与标题适配用 heatmap.js（桌面版 news-heatmap.mjs 的副本）。
// 默认加载真实数据快照 real-data.js；地址加 ?data=demo 切换为虚构演示数据。

const hour=3600000;
let now=Date.parse('2026-11-25T10:00:00+09:00');
const start=now;
const fmt=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const md=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'});
const hm=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false});

const extra={"e1": ["首家实验室公开权重", ["社区复现跑通", "两家云厂商上架"]], "e2": ["北段率先恢复", ["首班车准点发出", "沿线限速 80"]], "e3": ["央行意外加息 25 基点", ["日元早盘回升", "国债收益率走高"]], "e4": ["试产线通过验收", ["首批交付工厂", "订单排到明年"]], "e5": ["救援力量全部到位", ["新增 6 处安置点", "余震减弱"]], "e6": ["芯片股三连跌", ["午后翻红", "成交额放大"]], "e7": ["测试版先行关闭", ["正式版默认关闭", "广告商发声明"]], "e8": ["试点线路运营满月", ["新增 6 条线路", "票价不变"]], "e9": ["首日大涨 80%", ["次日回吐三成", "机构下调评级"]], "e10": ["远洋航线首测", ["试运行延期", "资费公布"]], "e11": ["蓝色预警发布", ["升级橙色预警", "12 条高速封闭"]], "e12": ["库存连增三周", ["库存意外下降", "油价回落"]]};
// 虚构事件。age = 距最新实质进展的小时数；topic 为 AGY 文案（null 表示待概括）。
let events=[
  ['e1','科技',38,9,6,'开源大模型权重全量公开','开源模型掀起权重公开潮','三家厂商跟进，社区复现完成','多家实验室宣布公开新一代模型权重'],
  ['e2','社会',31,12,3,'沿海铁路暴雨停运后全线恢复','暴雨断线到全线复通','今晨首班准点，限速仍在','沿海铁路恢复全线运行'],
  ['e3','市场',27,4,30,'央行意外加息后股汇双震','意外加息冲击股汇两市','汇率回稳，债市仍承压','央行宣布上调政策利率'],
  ['e4','科技',22,14,2,'人形机器人首批量产交付','人形机器人迈入量产','首批 200 台交付工厂','首批人形机器人交付'],
  ['e5','社会',19,0,52,'地震救援转入安置阶段','强震救援转入重建','临时安置点扩至 40 处','余震监测持续'],
  ['e6','市场',16,7,10,'芯片股连跌三日后反弹','芯片股暴跌后的拉锯','今日反弹 4%，成交放大','半导体板块午后翻红'],
  ['e7','科技',12,11,1,'新一代浏览器默认关闭第三方 Cookie',null,null,'浏览器发布新隐私默认设置'],
  ['e8','社会',11,6,7,'城市夜间公交试点扩容','夜间公交试点扩容','新增 6 条线路下周运营','市交通局公布夜间公交方案'],
  ['e9','市场',9,8,4,'新股首日大涨 80% 次日回落','明星新股过山车','次日回吐三成涨幅','某科技公司挂牌首日'],
  ['e10','科技',8,2,60,'卫星互联网覆盖海上航线','卫星网络覆盖远洋','海事试运行延至月底','卫星互联网海事服务'],
  ['e11','社会',7,5,20,'暴雪预警升级至橙色','北方暴雪预警升级','高速封闭 12 条','气象台发布暴雪预警'],
  ['e12','市场',6,1,80,'原油库存意外下降','原油库存意外下滑','油价随后回落','能源署周度数据'],
  ['e13','科技',5,3,26,'量子纠错实验突破',null,null,'研究团队发表量子纠错论文'],
  ['e14','社会',4,4,14,'博物馆夜场开放延长','博物馆夜场延长','周末预约已满','多家博物馆延长开放'],
  ['e15','科技',3,0,70,'旧款手机停止安全更新','旧机型停更','厂商公布替换补贴','厂商公告'],
  ['e16','市场',3,3,40,'日元跌至年内低点','日元年内新低','财务省口头干预','外汇市场'],
  ['e17','社会',2,2,5,'跨海大桥夜间限行','跨海大桥夜间限行','明晚起执行两周','交通部门通告'],
  ['e18','科技',2,0,90,'开发者大会议程公布','开发者大会定档','议程公布','大会官网'],
  ['e19','社会',9,0,50,'医保目录调整落地','医保目录调整','新增 90 种药品','医保局公告'],
  ['e20','市场',8,0,66,'稀土出口新规生效','稀土出口收紧','首批许可已发放','商务部公告'],
  ['e21','科技',6,0,44,'开源基金会治理改选','基金会改选','新董事会就任','基金会公告'],
  ['e22','社会',5,0,100,'高校招生规则调整','招生新规','细则月底公布','教育部'],
  ['e23','市场',4,0,58,'航运运价连涨四周','运价连涨','涨势放缓','运价指数'],
  ['e24','科技',3,0,75,'旧版操作系统退役','旧系统退役','迁移工具上线','厂商公告'],
  ['e25','社会',3,0,30,'图书馆延长寒假开放','图书馆延时','下周起执行','市图书馆'],
  ['e26','市场',3,0,34,'黄金价格高位震荡','金价高位震荡','央行购金放缓','贵金属行情'],
  ['e27','科技',2,0,40,'云服务区域故障复盘','云故障复盘','根因为配置变更','服务商公告'],
  ['e28','社会',2,1,12,'快递旺季提前到来','快递旺季提前','日均量破 5 亿','邮政局'],
  ['e29','市场',2,1,9,'港股科技指数反弹','港股科技反弹','南向资金回流','港交所'],
  ['e30','科技',1,1,6,'开源编辑器发布 2.0','编辑器 2.0','插件生态迁移','项目公告']
].map(([id,family,week,day,age,dayText,center,progress,origin])=>({id,family,week,day,age,dayText:center===null?null:dayText,center,progress,origin,
  prev:extra[id]?.[0]??'此前进展简述',briefs:extra[id]?.[1]??['最新报道简述','前一篇报道简述']}));

let tab='全部';
const snap={weekAt:start,dayAt:start,week:{},day:{}};
const topics=new Set();
const fold=10, batch=20;          // 默认前 10：5 行 × 2 列
const base=()=>fold;
const shown={'rest-week':fold,'rest-day':fold};
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const inTab=row=>tab==='全部'||row.family===tab;
const tabs=['全部','社会','科技','市场'];

function rank(key){
  return Object.fromEntries(tabs.map(t=>[t,events.filter(r=>(t==='全部'||r.family===t)&&r[key]>0)
    .sort((a,b)=>b[key]-a[key]||a.age-b.age).slice(0,5).map(r=>[r.id,r[key]])]));
}
function recompute(which){
  if(which.includes('week')){snap.week=rank('week');snap.weekAt=now;}
  if(which.includes('day')){snap.day=rank('day');snap.dayAt=now;}
  for(const t of tabs)for(const [id] of [...snap.week[t],...snap.day[t]])topics.add(id);
  // 中断：120h 无新内容且不在任何前 5
  const listed=new Set(tabs.flatMap(t=>[...snap.week[t],...snap.day[t]].map(([id])=>id)));
  for(const r of events)if(r.age>=120&&!listed.has(r.id))topics.delete(r.id);
}

function tile(row,heat,side){
  const art=el('article','event '+side), head=el('div','event-heading');
  art.dataset.reports=heat;
  const btn=el('button','event-toggle');btn.type='button';
  const pending=side==='week'?!row.center:!row.dayText;
  const title=el('span','event-title',pending?row.origin:side==='week'?row.center:row.dayText);
  const lead=el('span','event-lead');
  if(!pending){
    // 周：最近 2 个实质进展（定稿简述 + MM/DD）；日：最新 2 篇报道的极简述（+ 发布时刻）
    // 真实数据直接带时间戳；虚构数据按 age 推算
    const lines=side==='week'
      ?row.weekLines??[[row.progress,now-row.age*hour],[row.prev,now-(row.age+30)*hour]]
      :row.dayLines??[[row.briefs[0],now-Math.min(row.age,3)*hour],[row.briefs[1],now-(Math.min(row.age,3)+5)*hour]];
    for(const [i,[text,at]] of lines.entries()){
      const line=el('span','tile-line'+(i?' older':''));
      line.append(el('time','',side==='week'?md.format(at):hm.format(at)),document.createTextNode(text));
      lead.append(line);
    }
    if(side==='week'&&row.age<36)art.classList.add('is-fresh');
  }else lead.hidden=true;
  const count=el('span','heat-count',(side==='week'?'周 ':'日 ')+heat+' 篇');
  if(pending)count.append(el('b','pending','待概括'));
  btn.title=row.origin+' · '+heat+' 篇报道';
  btn.append(el('span','event-meta'),title,el('span','disclosure','查看'),lead,count);
  head.append(btn);art.append(head);
  return art;
}

function drawTop(){
  for(const side of ['week','day']){
    const map=$(side+'-map');
    const old=new Map([...map.children].map(n=>[n.dataset.id,n.getBoundingClientRect()]));
    map.replaceChildren(...snap[side][tab].map(([id,heat],i)=>{
      const n=tile(events.find(r=>r.id===id),heat,side);
      n.dataset.id=id;n.style.setProperty('--i',i);
      n.querySelector('.event-toggle').prepend(el('span','tile-rank',String(i+1)));
      if(!old.has(id))n.classList.add('is-new');
      return n;
    }));
    drawHeatmap(map);
  }
  for(const [side,at,span] of [['week',snap.weekAt,24],['day',snap.dayAt,8]]){
    const left=Math.max(0,span-(now-at)/hour);
    const chip=$(side+'-at');
    chip.style.setProperty('--done',((span-left)/span*100).toFixed(0)+'%');
    chip.replaceChildren(el('i','ring'),document.createTextNode(fmt.format(at)+' · '+(left?Math.ceil(left)+'h 后重排':'待重排')));
  }
}

function row(r,key,rank,max){
  // 紧凑单行：名次 · 话题标记 · 标题 · 热度 · 时间；话题进展放进悬停提示
  const art=el('article','event rest'), btn=el('button','rest-row');btn.type='button';
  const isTopic=topics.has(r.id), folded=isTopic&&r.age>=48;
  if(folded)art.classList.add('is-folded');
  const mark=el('span','mark'+(isTopic?folded?' fold':' topic':''));
  mark.title=isTopic?folded?'折叠话题':'话题':'';
  const title=el('span','rest-title',isTopic&&r.center?r.center:r.origin);
  btn.title=r.origin+(isTopic&&r.progress?' ▸ '+r.progress:'');
  btn.append(el('span','rank',String(rank)),mark,title,el('b','heat-chip',String(r[key])),
    el('time','',r.age<24?r.age+'h':Math.floor(r.age/24)+'d'));
  art.style.setProperty('--bar',(r[key]/max*100).toFixed(0)+'%');
  if(rank<=3)art.classList.add('is-podium');
  art.append(btn);
  return art;
}

function drawRest(){
  const top=new Set([...snap.week[tab],...snap.day[tab]].map(([id])=>id));
  const rest=events.filter(r=>inTab(r)&&!top.has(r.id));
  const dayCol=rest.filter(r=>r.day>0).sort((a,b)=>b.day-a.day);
  let weekCol=rest.filter(r=>r.day===0).sort((a,b)=>b.week-a.week);
  // 折叠话题每栏目最多显示 30 个（原型数据量小，规则同正式版）
  let folded=0;weekCol=weekCol.filter(r=>!(topics.has(r.id)&&r.age>=48)||++folded<=30);
  for(const [id,list,key] of [['rest-week',weekCol,'week'],['rest-day',dayCol,'day']]){
    const items=list.slice(0,shown[id]);
    $(id).replaceChildren(...items.map((r,i)=>{const n=row(r,key,i+1,Math.max(1,...list.map(x=>x[key])));n.style.setProperty('--i',i);return n;}));
    $(id).style.setProperty('--rows',Math.max(1,Math.ceil(items.length/2)));
    const more=document.querySelector(`.more[data-for=${id}]`), less=document.querySelector(`.less[data-for=${id}]`);
    const left=list.length-shown[id];
    more.hidden=left<=0; more.textContent='展开 '+Math.min(left,batch)+(left>batch?' / '+left:'')+' 条 ▾';
    less.hidden=shown[id]===base();
    if(!list.length)$(id).append(el('p','empty','暂无'));
  }
}

function render(){drawTop();drawRest();$('clock').textContent='模拟时钟 '+fmt.format(now)+' JST';}

$('filters').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  tab=b.textContent;
  for(const x of $('filters').children)x.setAttribute('aria-pressed',String(x===b));
  shown['rest-week']=shown['rest-day']=base();
  render();
});
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>{
  document.body.classList.remove('v-a','v-b','v-c');document.body.classList.add(b.dataset.variant);
  document.querySelectorAll('[data-variant]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  drawTop();
}));
$('theme').addEventListener('click',e=>{
  const dark=e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed',String(dark));
  document.documentElement.style.colorScheme=dark?'dark':'light';
});
$('narrow').addEventListener('click',e=>{
  const on=e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed',String(on));
  document.body.classList.toggle('is-narrow',on);
  requestAnimationFrame(drawTop);
});
// 推进时钟：热度随机漂移，但顶部只在快照到期时重排
$('tick8').addEventListener('click',()=>{
  now+=8*hour;
  for(const r of events){
    r.age+=8;
    if(Math.random()<.35){r.age=Math.floor(Math.random()*6);r.day+=2+Math.floor(Math.random()*8);r.week+=r.day>4?3:1;}
    else r.day=Math.max(0,r.day-2-Math.floor(Math.random()*3));
  }
  const due=[];
  if(now-snap.dayAt>=8*hour)due.push('day');
  if(now-snap.weekAt>=24*hour)due.push('week');
  recompute(due);
  render();
});
document.querySelectorAll('.more').forEach(b=>b.addEventListener('click',()=>{shown[b.dataset.for]+=batch;drawRest();}));
document.querySelectorAll('.less').forEach(b=>b.addEventListener('click',()=>{shown[b.dataset.for]=base();drawRest();}));

new ResizeObserver(()=>drawTop()).observe(document.querySelector('.hot-top'));

if(new URLSearchParams(location.search).get('data')!=='demo'&&window.NEWS_REAL){
  const real=window.NEWS_REAL;
  events=real.events;now=real.now;snap.weekAt=snap.dayAt=now;
  document.querySelector('.proto-note').textContent='真实数据快照：正式库只读副本经一次性重并后于 '+fmt.format(now)+' JST 导出，共 '+events.length+' 个七日内事件。话题文案暂用现有标题（AGY 未接入）；周块两行为最近两个节点的首条具体报道，日块两行为最新两篇报道标题。加 ?data=demo 查看虚构数据。';
}
recompute(['week','day']);
render();
