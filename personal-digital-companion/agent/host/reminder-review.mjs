const columns = 'r.seq,r.title,r.content,r.deadline,r.level,r.regDatetime,r.isFinished,r.recurrence,r.recurrenceNextSeq,r.planner_dispatch_id';
const lockedBilling = 'EXISTS(SELECT 1 FROM reminder_links l WHERE l.target_todo_id=CAST(r.seq AS TEXT))';
const source = `SELECT ${columns},${lockedBilling} AS billing FROM reminders r`;
const day = value => typeof value === 'string' ? value.slice(0, 10) : '';
const fail = (status, message) => Object.assign(new Error(message), {status});
export const reminderReviewActions = ['tomorrow', 'complete'];
export const reminderReviewBatchLimit = 7;
export const recordPlannerHours = 'record-hours';
export const validPlannerHours = value => Number.isFinite(value) && value >= 0 && value <= 24;

async function stamp(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createReminderReview({db, visible, getDates, present, memberDays, mutate, planner}) {
  const get = seq => visible(getDates().today).prepare(source + ' WHERE r.seq=?').bind(seq).first();
  const reason = row => row.planner_dispatch_id ? '由长期计划管理' : row.billing ? '由缴费计划管理' : null;
  const identity = row => stamp([row.seq, row.regDatetime, row.title]);
  const plannerEntry = (row, today) => row.planner_dispatch_id && planner?.lookup(row, today);
  const version = (row, entry) => stamp([...Object.values(row), ...(entry ? [entry.revision] : [])]);
  function plannerFields(row,entry,today) {
    if(!row.planner_dispatch_id)return {};
    if(entry?.recordable)return {plannerWork:{dispatchId:entry.id,plannedHours:entry.plannedHours}};
    if(entry?.recordedAt&&validPlannerHours(entry.actualHours))return {plannerRecord:{
      dispatchId:entry.id,actualHours:entry.actualHours,recordedAt:entry.recordedAt}};
    const plannerUnavailable=!entry?'主站未找到可关联的计划派发。':entry.kind==='milestone'?'里程碑无需登记工时。':
      entry.business_date!==today?'此项不是今天的计划派发。':entry.status!=='active'?'计划目前未执行。':'此项已经处理，请刷新。';
    return {plannerUnavailable};
  }
  async function list() {
    const {today, tomorrow} = getDates();
    const result = await visible(today).prepare(source + " WHERE (r.isFinished=0 AND r.deadline IS NOT NULL AND r.deadline<>'' AND substr(r.deadline,1,10)<=?)"
      + " OR (r.isFinished=1 AND substr(r.deadline,1,10)=? AND (r.planner_dispatch_id IS NOT NULL OR r.title LIKE '%多邻国%' OR r.title LIKE '%多鄰國%' OR r.title LIKE '%duolingo%')) ORDER BY substr(r.deadline,1,10), CASE r.level WHEN '高' THEN 0 WHEN '低' THEN 2 ELSE 1 END,"
      + ' r.deadline,r.seq').bind(today,today).all();
    const language=result.results.filter(row=>day(row.deadline)===today&&!row.planner_dispatch_id&&/多邻国|多鄰國|duolingo/iu.test(row.title));
    const dailyPlan=[];
    const rows = await Promise.all(result.results.map(async row => {
      if(row.isFinished&&!row.planner_dispatch_id)return null;
      const locked = reason(row), shown = present(row, today);
      const entry = await plannerEntry(row, today);
      const fields=plannerFields(row,entry,today);
      if(row.planner_dispatch_id&&day(row.deadline)===today&&(!entry||entry.kind==='task'&&entry.business_date===today)){
        dailyPlan.push(Boolean(row.isFinished&&fields.plannerRecord));
      }
      if(row.isFinished)return fields.plannerRecord && entry.business_date===today
        ? {id:row.seq,title:row.title,deadline:row.deadline,...fields}:null;
      return {id: row.seq, title: row.title, deadline: row.deadline, level: row.level, recurrence: shown.recurrenceText,
        nextDeadline: shown.recurrenceNext, group: locked ? 'locked' : day(row.deadline) < today ? 'overdue' : 'today',
        reason: locked, identity: await identity(row), version: await version(row, entry),
        ...fields};
    }));
    const items=rows.filter(row=>row&&!row.plannerRecord),recordedHours=rows.filter(row=>row?.plannerRecord);
    const readonly = await memberDays(today);
    items.push(...readonly.map(row => ({id: row.id, title: row.name, deadline: today, group: 'locked', reason: '超市会员日'})));
    const dailyStudyComplete=language.length>0&&language.every(row=>row.isFinished===1)&&dailyPlan.length>0&&dailyPlan.every(Boolean);
    return {today, tomorrow, items,recordedHours,dailyStudyComplete};
  }
  async function status(seq) {
    const row = await get(seq);
    if (!row) throw fail(404, '提醒已不存在或不可访问。');
    const next = row.recurrenceNextSeq == null ? null : await get(row.recurrenceNextSeq);
    const matchingNext = next && next.seq !== row.seq && next.title === row.title && next.recurrence === row.recurrence;
    const today=getDates().today,entry=await plannerEntry(row,today);
    return {id: row.seq, identity: await identity(row), deadline: row.deadline, finished: row.isFinished === 1,
      next: matchingNext ? {id: next.seq, deadline: next.deadline} : null,
      ...(row.planner_dispatch_id?{today,version:await version(row,entry),reminderVersion:await version(row),
        ...plannerFields(row,entry,today)}:{})};
  }
  async function change(seq, {action, today, version: expected, actualHours}) {
    const recording = action === recordPlannerHours;
    if (!(recording ? validPlannerHours(actualHours) : reminderReviewActions.includes(action))
      || !/^[a-f0-9]{64}$/.test(expected ?? '')) throw fail(400, '操作无效。');
    if (today !== getDates().today) throw fail(409, '日期已变化，请刷新后重试。');
    const row = await get(seq);
    if (!row) throw fail(404, '提醒已不存在或不可访问。');
    if (recording) {
      const entry = await plannerEntry(row, today);
      if (!entry?.recordable || row.isFinished !== 0 || await version(row, entry) !== expected) {
        throw fail(409, '计划提醒已变化或不能登记工时，请刷新后重试。');
      }
      await planner.record(entry, actualHours, 'feiyue-hours:' + expected + ':' + actualHours);
      return {accepted: true};
    }
    if (reason(row)) throw fail(409, '该提醒由来源模块管理。');
    if (row.isFinished !== 0 || !row.deadline || day(row.deadline) > today || await version(row) !== expected) {
      throw fail(409, '提醒已变更，请刷新后重试。');
    }
    const response = await mutate({action, today, row, db});
    if (!response.ok) {
      const payload = await response.json();
      throw fail(response.status, typeof payload.error === 'string' ? payload.error : '提醒更新失败。');
    }
    return {accepted: true};
  }
  async function batchStatus(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > reminderReviewBatchLimit) {
      throw fail(400, `每批最多查询 ${reminderReviewBatchLimit} 条提醒。`);
    }
    const unique = [...new Set(ids)];
    if (unique.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      throw fail(400, '提醒编号无效。');
    }
    const items = await Promise.all(unique.map(async id => {
      try {
        return await status(id);
      } catch (error) {
        return {id, error: {status: error.status ?? 503, message: error.message}};
      }
    }));
    return {items};
  }
  return {list, status, batchStatus, change};
}

const reviewPath = /^\/api\/reminder-review(?:\/(batch|[1-9]\d*))?$/;
export async function handleReminderReview(request, host, pathname) {
  const route = reviewPath.exec(pathname);
  if (!route) return null;
  const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
  if (route[1] === 'batch') {
    if (request.method !== 'POST') return reply({error: {message: '不支持此方法。'}}, 405);
    const input = await request.json().catch(() => null);
    const ids = input?.ids;
    if (!input || Object.keys(input).length !== 1 || !Array.isArray(ids) || !ids.length || ids.length > reminderReviewBatchLimit
      || ids.some(item => !Number.isSafeInteger(item) || item <= 0)) {
      return reply({error: {message: `请提供 1 到 ${reminderReviewBatchLimit} 个有效提醒编号。`}}, 400);
    }
    try {
      if (host.reviewReminderStatuses) {
        const result = await host.reviewReminderStatuses(ids);
        return result.error ? reply({error: {message: result.error}}, result.status) : reply(result);
      }
      const unique = [...new Set(ids)];
      const items = await Promise.all(unique.map(async itemId => {
        try {
          const result = await host.reviewReminderStatus(itemId);
          return result?.error ? {id: itemId, error: {status: result.status ?? 503, message: result.error}} : result;
        } catch (error) {
          return {id: itemId, error: {status: error.status ?? 503, message: error.message}};
        }
      }));
      return reply({items});
    } catch {
      return reply({error: {message: '提醒服务暂不可用，请稍后核对。'}}, 503);
    }
  }
  const id = route[1] ? Number(route[1]) : null;
  if (id !== null && !Number.isSafeInteger(id)) return reply({error: {message: '提醒编号无效。'}}, 400);
  try {
    if (request.method === 'GET') {
      const result = id === null ? await host.reviewReminders() : await host.reviewReminderStatus(id);
      return result.error ? reply({error: {message: result.error}}, result.status) : reply(result);
    }
    if (request.method !== 'POST' || id === null) return reply({error: {message: '不支持此方法。'}}, 405);
    const input = await request.json().catch(() => null);
    const recording = input?.action === recordPlannerHours;
    if (!input || !(recording ? validPlannerHours(input.actualHours) : reminderReviewActions.includes(input.action))
      || typeof input.today !== 'string' || typeof input.version !== 'string'
      || Object.keys(input).length !== (recording ? 4 : 3)) return reply({error: {message: '操作无效。'}}, 400);
    const result = await host.changeReviewReminder(id, input);
    if (result.error) return reply({error: {message: result.error}}, result.status);
    return reply(result);
  } catch {
    return reply({error: {message: '提醒服务暂不可用，请稍后核对。'}}, 503);
  }
}
