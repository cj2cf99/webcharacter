import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {tokyoDay} from './conversation-history.mjs';

import {createPollScheduler} from './poll-scheduler.mjs';
import {createAutonomousAudit} from './autonomous-audit.mjs';
import {createNewsBriefing} from './news-briefing.mjs';

export async function checkDueItems(request,signal,onStudyComplete){
  if(!request)throw Object.assign(Error('云端连接未配置'),{code:'NO_CONNECTION'});
  const response=await request('/api/reminder-review',{method:'GET',cache:'no-store',signal});
  if(!response.ok)throw Error('云端查询失败（HTTP '+response.status+'）');
  const data=await response.json().catch(()=>null);
  if(!Array.isArray(data?.items)||!/^\d{4}-\d\d-\d\d$/.test(data.today))throw Error('提醒清单格式异常');
  const due=data.items.filter(row=>row.reason!=='超市会员日');
  if(due.some(row=>typeof row.deadline!=='string'||typeof row.title!=='string'))throw Error('事项资料不完整');
  const overdue=due.filter(row=>row.deadline.slice(0,10)<data.today).length;
  const titles=due.slice(0,5).map(row=>row.title).join('、');
  if(data.dailyStudyComplete===true)onStudyComplete?.(data.today);
  return due.length?'今日 '+(due.length-overdue)+' 项，逾期 '+overdue+' 项 · '+titles+(due.length>5?' 等':''):'没有到期未完成事项';
}

// 复盘窗口多数只看最新几条：检查记录和提醒每页 8 条，由新到旧。
const PAGE=8;
export function createReminderChecks({profile,check,handlers={},lastRun,isBusy,log,notifyNews,changed=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
  const db=new DatabaseSync(join(profile,'reminder-checks.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS checks(
    id INTEGER PRIMARY KEY, day TEXT NOT NULL, at INTEGER NOT NULL, due INTEGER NOT NULL,
    project TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, misses INTEGER);
    CREATE INDEX IF NOT EXISTS checks_day ON checks(day,id);
    CREATE TABLE IF NOT EXISTS weather_state(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,seen INTEGER NOT NULL DEFAULT 0);
    UPDATE checks SET status='中断',detail='检查过程中绯月已退出，结果未知' WHERE status='检查中';`);
  const insert=db.prepare('INSERT INTO checks(day,at,due,project,status,detail,misses) VALUES(?,?,?,?,?,?,?)');
  let closed=false;
  function add(name,status,detail,at,due,count=null){
    return insert.run(tokyoDay(at),at,due,name,status,detail,count).lastInsertRowid;
  }
  function record(name,status,detail,at=now()){
    if(closed)return;
    add(name,status,detail,at,at);
    changed();
  }
  const due=check&&((signal)=>check(AbortSignal.any([signal,AbortSignal.timeout(30_000)])));
  const audit=log&&createAutonomousAudit(db,log,now);
  const news=notifyNews&&createNewsBriefing(db,now,notifyNews);
  const scheduler=createPollScheduler({db,handlers:{due,...handlers,news:news&&(signal=>news.poll(signal,()=>scheduler.get('news').enabled))},isBusy,changed,now,setTimer,clearTimer,add,audit,
    lastRun:id=>id==='news'?news?.last():lastRun?.(id),weatherLastAt:()=>{const row=db.prepare('SELECT value FROM weather_state WHERE id=1').get();return row&&JSON.parse(row.value).lastCheck;}});
  return {
    start:scheduler.start,enqueue:scheduler.enqueue,polls:scheduler.snapshot,configure:scheduler.configure,
    latestNews:()=>news?.latest()??{state:'answer',text:'当前未启用新闻关注。'},
    newsEdition:()=>news?.edition()??{at:null,items:[]},
    saveNewsChinese:(...args)=>news?.saveChinese(...args),
    get pending(){return scheduler.pending;},
    get unread(){return db.prepare('SELECT count(*) AS n FROM notices WHERE seen=0').get().n;},
    weatherDiary(day){
      const start=Date.parse(day+'T00:00:00+09:00');
      return db.prepare('SELECT id,at,body FROM notices WHERE at>=? AND at<? ORDER BY at,id').all(start,start+86400000);
    },
    weatherState(){const row=db.prepare('SELECT value FROM weather_state WHERE id=1').get();return row&&JSON.parse(row.value);},
    saveWeather(value,brief,at){
      db.exec('BEGIN');
      try{
        if(brief.body)db.prepare('INSERT INTO notices(at,title,body) VALUES(?,?,?)').run(at,brief.title,brief.body);
        db.prepare('INSERT OR REPLACE INTO weather_state VALUES(1,?)').run(JSON.stringify(value));
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if(brief.body)changed();
    },
    notices(filter='unread',page=0){
      const where=filter==='all'?'':filter==='read'?' WHERE seen=1':' WHERE seen=0';
      const total=db.prepare('SELECT count(*) AS n FROM notices'+where).get().n,pages=Math.max(1,Math.ceil(total/PAGE));
      page=Math.min(pages-1,Math.max(0,Number.isSafeInteger(page)?page:0));
      return {page,pages,filter,unread:this.unread,events:db.prepare('SELECT * FROM notices'+where+' ORDER BY id DESC LIMIT ? OFFSET ?').all(PAGE,page*PAGE)};
    },
    markRead(id){
      if(id==='all')db.exec('UPDATE notices SET seen=1 WHERE seen=0');
      else if(Number.isSafeInteger(id))db.prepare('UPDATE notices SET seen=1 WHERE id=?').run(id);
      changed();
    },
    record,
    takeEveningPraise(day){
      const at=now();
      if(closed||day!==tokyoDay(at)||new Date(at+9*3600000).getUTCHours()<21)return false;
      const project='晚间学习核对';
      const result=db.prepare('INSERT INTO checks(day,at,due,project,status,detail) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM checks WHERE day=? AND project=?)')
        .run(day,at,at,project,'已检查','多邻国和当天长期任务均已完成',day,project);
      return result.changes===1;
    },
    read(day,page=0){
      if(!/^\d{4}-\d\d-\d\d$/.test(day))throw Error('东京日期无效');
      const total=db.prepare('SELECT count(*) AS n FROM checks WHERE day=?').get(day).n;
      const pages=Math.max(1,Math.ceil(total/PAGE));
      page=Math.min(pages-1,Math.max(0,Number.isSafeInteger(page)?page:0));
      const events=db.prepare('SELECT at,due,project,status,detail FROM checks WHERE day=? ORDER BY id DESC LIMIT ? OFFSET ?').all(day,PAGE,page*PAGE);
      const due=scheduler.get('due');
      return {nextAt:due?.nextAt,nextWeatherAt:scheduler.get('weather')?.nextAt,nextTaskAt:scheduler.get('tasks')?.nextAt,
        first:due?.first,running:due?.running,pending:scheduler.pending,events,page,pages};
    },
    close(){
      closed=true;scheduler.close();audit?.close();db.close();
    },
  };
}
