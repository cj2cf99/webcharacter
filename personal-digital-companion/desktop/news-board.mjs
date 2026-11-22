import {newsHighlights} from './news-layout.mjs';

const day=86400000;
const tabs=['全部','社会','科技','市场'];
const groups=['hot','key'];
const family=topic=>topic.endsWith('社会')?'社会':topic.endsWith('股市')?'市场':'科技';

export function newsTopicAge(at,timeKind,now) {
  if(at>now)return Infinity;
  const dateOnly=timeKind==='事件日期'||timeKind==='报道日期';
  return now-(dateOnly?Math.min(now,at+day-1):at);
}

export function createNewsBoards(db) {
  db.exec('CREATE TABLE IF NOT EXISTS news_boards (tab TEXT PRIMARY KEY, members TEXT NOT NULL)');
  const get=db.prepare('SELECT members FROM news_boards WHERE tab=?');
  const put=db.prepare('INSERT INTO news_boards VALUES(?,?) ON CONFLICT(tab) DO UPDATE SET members=excluded.members');
  function previous(tab) {
    return JSON.parse(get.get(tab)?.members??'null')??{hot:[],key:[]};
  }
  function build(items,now,persist=false) {
    const live=new Set(items.filter(row=>newsTopicAge(row.at,row.timeKind,now)<7*day).map(row=>row.id));
    const quiet=new Set(items.filter(row=>newsTopicAge(row.at,row.timeKind,now)>=2*day).map(row=>row.id));
    return Object.fromEntries(tabs.map(tab=>{
      const candidates=items.filter(row=>live.has(row.id)&&(tab==='全部'||family(row.topic)===tab));
      const ranked=new Map(candidates.map(row=>[row.id,row]));
      const old=previous(tab);
      const held=Object.fromEntries(groups.map(group=>[group,old[group].map(id=>ranked.get(id)).filter(Boolean)]));
      const result=newsHighlights(candidates,held);
      const members=Object.fromEntries(groups.map(group=>[group,result[group].map(row=>row.id)]));
      if(persist)put.run(tab,JSON.stringify(members));
      return [tab,{...members,quiet:[...members.hot,...members.key].filter(id=>quiet.has(id))}];
    }));
  }
  function reconcile(to,from) {
    for(const tab of tabs) {
      const members=previous(tab);
      const all=[...members.hot,...members.key];
      if(!all.includes(from))continue;
      for(const group of groups)members[group]=members[group].flatMap(id=>id!==from?[id]:all.includes(to)?[]:[to]);
      put.run(tab,JSON.stringify(members));
    }
  }
  function holds(id) {
    return tabs.some(tab=>{const {hot,key}=previous(tab);return hot.includes(id)||key.includes(id);});
  }
  return {build,reconcile,holds};
}
