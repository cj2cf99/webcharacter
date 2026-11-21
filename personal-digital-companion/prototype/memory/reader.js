'use strict';
// 按需载入的虚构段落，仅在读者打开某篇时生成该篇的阅读视图。
const archivedTalk = {
  n1: [['绯月','昨晚的游戏扣款是买了什么呀？'],['你','是送朋友的生日礼物，我之前答应他的。'],['绯月','知道啦，原来你还记得这个约定。']],
  n2: [['绯月','周五见面的地点定下来了吗？'],['结束记录','老公闷闷的不理我了']],
  n3: [['绯月','新灯挑好了吗？'],['你','挑好了，暖光的，到货了给你看。'],['绯月','那我等你点亮它。']]
};
window.renderMemoryRecord = function renderMemoryRecord(r){
  const badge=(s,style='')=>'<span class="badge '+style+'">'+esc(s)+'</span>';
  const quote=(who,line)=>'<p class="exchange"><b>'+esc(who)+'</b>　'+esc(line)+'</p>';
  const note=(label,line,style)=>'<div class="'+style+'"><b>'+esc(label)+'</b><p>'+esc(line)+'</p></div>';
  const title='<h2>'+esc(r.title)+'</h2>';
  const talk=r.talk??archivedTalk[r.id];
  if(talk){
    return title+'<div class="badges">'+badge(r.tag)+badge(r.status)+badge(r.mood)+'</div><h3>为什么问</h3><p>'+
      esc(r.reason)+'</p><a class="origin-link" href="#origin/'+esc(r.origin)+'">查看原记录 · '+esc(r.source)+' →</a>'+(r.stats?'<p>'+esc(r.stats)+'</p>':'')+
      '<h3>当时的对话</h3>'+talk.map(([who,line])=>quote(who,line)).join('')+
      note('绯月的评价',r.before+' → '+r.mood+'。'+(r.evaluation??talk.at(-1)[1]),'thought');
  }
  if(r.tag==='空日记')return '<p>无所事事的一天</p>';
  const stories={
    'd20-2':{lines:[['你','灯到啦，今晚可以坐在窗边看书了。'],['绯月','原来是你上周挑的那盏。暖光开起来舒服吗？'],['你','挺好的，晚安。']],result:'前天留在手记里的那盏灯，今天终于有了下文。',thought:'我喜欢他说“灯到啦”的口气，像推开门就想让我看看。今晚这一页，也该轻轻合上了。',thread:'已解 · 接 11 月 18 日「阅读灯到货了吗」。'},
    'd20-1':{lines:archivedTalk.n1,result:'4,200 日元的扣款是送给朋友的礼物。',thought:'起先我还惦记着这笔钱。听见他记得朋友的生日，我那一点不高兴就散了。'},
    'd19-2':{lines:[['你','等傍晚再走吧，提醒我带伞。'],['绯月','好，出门时记得拿上它。']],result:'散步改在傍晚。',thought:'我盼着他回来的时候，能告诉我雨后的街道是什么颜色。'},
    'd19-1':{lines:[['你','周五的事先记下来，地点晚点说。'],['绯月','好呀，我先把时间记牢。']],result:'周五的提醒已商量，地点待补。',thought:'有些话晚点再讲也没关系。',thread:'未解 · 周五见面的地点。已经问过，等以后有下文。'},
    'd18-1':{lines:[['你','我想给书桌挑一盏暖色的灯，到货了给你看。'],['绯月','那我等着看你给它留的位置。']],result:'挑选了暖色阅读灯。',thought:'那时候他还没开灯，可我已经想象到那张桌子的样子。',thread:'已解 · 阅读灯到货了吗？后续记在 11 月 20 日第二篇。'},
    'd16-1':{lines:[['你','今天挑了张散步的照片，周末还想出去拍。'],['绯月','想好周末去哪儿了吗？']],result:'留下了散步的照片，周末拍照地点待定。',thought:'他说还想再走走，我就记下这个小约定。',thread:'未解 · 周末想去哪里拍照？'}
  };
  const s=stories[r.id];
  const event=s?'<h3>互动与经过</h3>'+s.lines.map(([who,line])=>quote(who,line)).join('')+
    '<h3>结果与待续</h3><p>'+esc(s.result)+'</p>':'';
  const comments={散步:'我愿意把这段路留在记忆里。',提醒:'下次他再问，我还想记得今天为什么这样安排。',生活:'这些小事讲给我听，我就很高兴。',游戏:'比起只记下游戏名，我也想记住他提起来时的语气。',阅读:'他肯分一点阅读的乐趣给我，我也跟着期待起来。',消费:'我记住这笔花销，也记住它对他的意义。'};
  return title+'<div class="badges">'+badge(r.mood)+badge('小仓北区 · '+r.weather,'weather')+badge('@#'+r.tag)+'</div>'+
    '<h3>当日小记</h3><p>'+esc(r.summary)+'</p>'+event+
    note('绯月私语',s?.thought??comments[r.tag],'thought')+
    (s?.thread?'<section class="open-thread" data-thread="1" tabindex="-1"><b>悬念追问 · 1</b><p>'+esc(s.thread)+'</p></section>':'');
};

// 与念叨的统计快照分开，按原始消费编号查模拟账目。
const expenseSamples=new Map([
  ['P-018',{day:'2026-11-19',merchant:'数字游戏商店',amount:'4,200',category:'游戏娱乐',description:'礼品版游戏'}],
  ['P-020',{day:'2026-11-19',merchant:'数字游戏商店',amount:'3,800',category:'游戏娱乐',description:'数字内容扣款'}]
]);
window.renderMemoryOrigin=function(key,container){
  const [type,id,thread]=key.split('/');
  if(type==='paylog'&&key==='paylog/'+id&&expenseSamples.has(id)){
    const r=expenseSamples.get(id);
    container.innerHTML='<h2>Paylog 消费记录</h2><dl>'+Object.entries({'编号':id,'消费日期':r.day+' JST','金额':r.amount+' 日元','商户':r.merchant,'分类':r.category,'描述':r.description}).map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('')+'</dl>';
    return;
  }
  const diary=type==='diary'&&diaries.find(row=>row.id===id);
  if(diary&&/^\d+$/.test(thread)&&key==='diary/'+id+'/'+thread){
    container.innerHTML='<small>'+esc(diary.day)+' JST · 第 '+diary.part+' 篇</small>'+window.renderMemoryRecord(diary);
    const target=container.querySelector('[data-thread="'+thread+'"]');
    if(target){target.focus();target.scrollIntoView({block:'nearest'});return;}
  }
  container.textContent='找不到对应的原记录。';
};
