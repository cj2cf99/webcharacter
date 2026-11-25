const hour=3600000;
const day=86400000;
const weekSpan=24*hour;
const daySpan=8*hour;
const interruptAge=120*hour;
const tabs=['全部','社会','科技','市场'];
const family=topic=>topic.endsWith('社会')?'社会':topic.endsWith('股市')?'市场':'科技';

export function newsTopicAge(at,timeKind,now) {
  if(at>now)return Infinity;
  const dateOnly=timeKind==='事件日期'||timeKind==='报道日期';
  return now-(dateOnly?Math.min(now,at+day-1):at);
}

function isSnapshot(value) {
  return Boolean(value&&Array.isArray(value.week)&&Array.isArray(value.day)&&
    Number.isFinite(value.weekAt)&&Number.isFinite(value.dayAt));
}

export function createNewsBoards(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS news_boards (tab TEXT PRIMARY KEY, members TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS news_topics (
      event_id TEXT PRIMARY KEY,
      basis TEXT NOT NULL DEFAULT '',
      day TEXT NOT NULL DEFAULT '',
      center TEXT NOT NULL DEFAULT '',
      reports TEXT NOT NULL DEFAULT '[]'
    );`);
  const get=db.prepare('SELECT members FROM news_boards WHERE tab=?');
  const put=db.prepare('INSERT INTO news_boards VALUES(?,?) ON CONFLICT(tab) DO UPDATE SET members=excluded.members');
  const ensureTopic=db.prepare("INSERT OR IGNORE INTO news_topics(event_id,basis,day,center,reports) VALUES(?,'','','','[]')");
  const getTopicStmt=db.prepare('SELECT * FROM news_topics WHERE event_id=?');
  const allTopicsStmt=db.prepare('SELECT * FROM news_topics');
  const putTopicStmt=db.prepare(`INSERT INTO news_topics(event_id,basis,day,center,reports) VALUES(?,?,?,?,?)
    ON CONFLICT(event_id) DO UPDATE SET basis=excluded.basis,day=excluded.day,center=excluded.center,reports=excluded.reports`);
  const deleteTopicStmt=db.prepare('DELETE FROM news_topics WHERE event_id=?');
  const moveTopicStmt=db.prepare('UPDATE news_topics SET event_id=? WHERE event_id=?');

  function previous(tab) {
    return JSON.parse(get.get(tab)?.members??'null');
  }
  function unpackTopic(row) {
    if(!row)return null;
    let reports=[];
    try{reports=JSON.parse(row.reports||'[]');}catch{reports=[];}
    return {...row,reports:Array.isArray(reports)?reports:[]};
  }
  function getTopic(id) {
    return unpackTopic(getTopicStmt.get(id));
  }
  function allTopics() {
    return new Map(allTopicsStmt.all().map(row=>[row.event_id,unpackTopic(row)]));
  }
  function saveTopic(id,patch) {
    const cur=getTopic(id)??{event_id:id,basis:'',day:'',center:'',reports:[]};
    const next={
      basis:patch.basis??cur.basis,
      day:patch.day??cur.day,
      center:patch.center??cur.center,
      reports:patch.reports??cur.reports
    };
    putTopicStmt.run(id,next.basis,next.day,next.center,JSON.stringify(next.reports.slice(0,2)));
    return unpackTopic(getTopicStmt.get(id));
  }
  function removeTopic(id) {
    deleteTopicStmt.run(id);
  }

  function build(items,now,persist=false) {
    const liveItems=items.filter(row=>newsTopicAge(row.at,row.timeKind,now)<7*day);
    const live=new Map(liveItems.map(row=>[row.id,row]));
    const listed=new Set();
    const result={};
    for(const tab of tabs) {
      const prev=previous(tab);
      const valid=isSnapshot(prev);
      const weekDue=!valid||now-prev.weekAt>=weekSpan;
      const dayDue=!valid||now-prev.dayAt>=daySpan;
      const candidates=liveItems.filter(row=>tab==='全部'||family(row.topic)===tab);
      const week=weekDue
        ?candidates.filter(row=>(row.weekHeat??row.reportCount??0)>0)
          .sort((a,b)=>(b.weekHeat??b.reportCount??0)-(a.weekHeat??a.reportCount??0)||b.at-a.at)
          .slice(0,5).map(row=>[row.id,row.weekHeat??row.reportCount??0])
        :prev.week.filter(([id])=>live.has(id));
      const dayList=dayDue
        ?candidates.filter(row=>(row.dayHeat??0)>0)
          .sort((a,b)=>(b.dayHeat??0)-(a.dayHeat??0)||b.at-a.at)
          .slice(0,5).map(row=>[row.id,row.dayHeat??0])
        :prev.day.filter(([id])=>live.has(id));
      const snap={
        week,
        weekAt:weekDue?now:prev.weekAt,
        day:dayList,
        dayAt:dayDue?now:prev.dayAt
      };
      for(const [id] of week)listed.add(id);
      for(const [id] of dayList)listed.add(id);
      if(persist&&(weekDue||dayDue||week.length!==prev?.week?.length||dayList.length!==prev?.day?.length)) {
        put.run(tab,JSON.stringify(snap));
      }
      result[tab]=snap;
    }
    if(persist) {
      for(const id of listed)ensureTopic.run(id);
      for(const row of allTopicsStmt.all()) {
        if(listed.has(row.event_id))continue;
        const item=live.get(row.event_id);
        if(!item||newsTopicAge(item.at,item.timeKind,now)>=interruptAge)deleteTopicStmt.run(row.event_id);
      }
    }
    return result;
  }

  function reconcile(to,from) {
    for(const tab of tabs) {
      const members=previous(tab);
      if(!isSnapshot(members))continue;
      let changed=false;
      for(const side of ['week','day']) {
        if(!members[side].some(([id])=>id===from))continue;
        const hasTo=members[side].some(([id])=>id===to);
        members[side]=members[side].flatMap(([id,heat])=>id!==from?[[id,heat]]:hasTo?[]:[[to,heat]]);
        changed=true;
      }
      if(changed)put.run(tab,JSON.stringify(members));
    }
    if(getTopicStmt.get(from)) {
      if(getTopicStmt.get(to))deleteTopicStmt.run(from);
      else moveTopicStmt.run(to,from);
    }
  }

  function holds(id) {
    return tabs.some(tab=>{
      const snap=previous(tab);
      return isSnapshot(snap)&&(snap.week.some(([rowId])=>rowId===id)||snap.day.some(([rowId])=>rowId===id));
    });
  }

  return {build,reconcile,holds,getTopic,allTopics,saveTopic,removeTopic};
}
