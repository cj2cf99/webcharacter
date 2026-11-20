import {reminderReviewActions,recordPlannerHours,validPlannerHours} from '../agent/host/reminder-review.mjs';
import {isSubmissionId} from '../agent/tasks/submissions.mjs';
import {plannerHoursType} from '../agent/tasks/planner-hours.mjs';

const path = '/api/reminder-review';
function allowed(row,choice) {
  if(choice.action===recordPlannerHours)return Boolean(row.plannerWork?.dispatchId||row.resolvePlannerWork)&&validPlannerHours(choice.actualHours);
  return !row.reason&&!row.plannerWork&&reminderReviewActions.includes(choice.action);
}

export function createReminderReviewFlow({request, canStart = () => true, waitForStart = () => {}, pauseItem=()=>false, record = () => {}}) {
  let snapshot, loading = null, running = null, report = null;
  let pendingChecks = new Map();
  function note(key,row,action,result,detail='') {
    const verb=action===recordPlannerHours?'登记实际投入':action==='tomorrow'?'顺延提醒':'完成提醒';
    const state={start:'已发起',recorded:'已核实工时',moved:'已核实顺延',completed:'已核实完成',failed:'请求被拒绝',unknown:'结果待核对'};
    record({key:key+':'+result,taskId:String(row.id),title:row.title,action:verb+' · '+state[result],detail});
  }
  const outcomeDetail=result=>result.result==='recorded'?result.actualHours+' 小时':result.deadline?'新到期时间：'+result.deadline+' JST':result.next?'下次到期：'+result.next+' JST':result.message??'';

  async function call(route, body) {
    if (!request) throw Error('请先接通绯月的云端连接。');
    const response = await request(route, body ? {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)} : {method: 'GET', cache: 'no-store'});
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw Object.assign(Error(payload?.error?.message ?? '云端提醒结果暂时无法读取。'),
      {status: response.status});
    return payload;
  }

  async function load() {
    if (running) throw Error('正在逐条处理，请稍后刷新。');
    if (!canStart()) throw Error('绯月正在退出。');
    if (loading) return loading;
    snapshot = null;
    loading = (async () => {
      const data = await call(path);
      if (!Array.isArray(data.items) || !/^\d{4}-\d{2}-\d{2}$/.test(data.today)
        || !/^\d{4}-\d{2}-\d{2}$/.test(data.tomorrow)) throw Error('云端返回的提醒列表无效。');
      await reconcile();
      // 旧列表只给出归属。提交时再按编号从主站取受版本保护的当日派发。
      snapshot = {...data,items:data.items.map(row=>row.reason==='由长期计划管理'&&!row.plannerWork&&!row.plannerUnavailable
        && row.deadline?.slice(0,10)===data.today && row.identity && row.version?{...row,resolvePlannerWork:true}:row)};
      return {...snapshot, report};
    })();
    try { return await loading; } finally { loading = null; }
  }

  async function reconcile() {
    if (!pendingChecks.size) return;
    const results = await Promise.all(report.results.map(async item => {
      const check = pendingChecks.get(item.id);
      if (!check) return item;
      const result = await verify(check.row, item.action, check.tomorrow, item.actualHours, check.taskId).catch(() => null);
      if (!result) return item;
      note(check.key, check.row, item.action, result.result, outcomeDetail(result));
      pendingChecks.delete(item.id);
      return {...item, ...result};
    }));
    report = {...report, results};
  }

  function plannerResult(task, row, actualHours) {
    if (task?.status === 'FAILED') return {result:'failed', message:task.error || '主站拒绝了工时登记。'};
    if (task?.status === 'COMPLETED' && task.result?.record_id === row.plannerWork.dispatchId
      && task.result.actualHours === actualHours && Number.isFinite(Date.parse(task.result.recordedAt))) {
      return {result:'recorded', actualHours};
    }
    return null;
  }

  async function createPlannerTask(row, today, actualHours) {
    const issued = await call('/api/task-submissions', {});
    if (!isSubmissionId(issued.submission_id)) throw Error('未取得有效的工时任务提交号。');
    const params = {reminderId:row.id, dispatchId:row.plannerWork.dispatchId, today, version:row.version, actualHours};
    const task = await call('/api/tasks', {type:plannerHoursType, submission_id:issued.submission_id, params});
    if (!isSubmissionId(task.task_id)) throw Error('未取得有效的工时任务编号。');
    return task.task_id;
  }

  async function verify(row, action, tomorrow, actualHours, taskId) {
    if (action === recordPlannerHours) {
      return plannerResult(await call('/api/tasks/' + taskId + '/receipt', {}), row, actualHours);
    }
    const result = await call(path + '/' + row.id);
    if (!row.identity || result.identity !== row.identity) return null;
    if (action === 'tomorrow' && result.finished === false && result.deadline === tomorrow + row.deadline.slice(10)) {
      return {result: 'moved', deadline: result.deadline};
    }
    const nextConfirmed = Number.isSafeInteger(result.next?.id) && result.next.id > 0
      && typeof row.nextDeadline === 'string' && result.next.deadline === row.nextDeadline;
    if (action === 'complete' && result.finished === true && (!row.recurrence || nextConfirmed)) {
      return {result: 'completed', next: row.recurrence ? result.next.deadline : null};
    }
    return null;
  }

  async function apply(choices) {
    if (running || loading || !canStart() || !snapshot) throw Error('现在无法执行，请刷新后再试。');
    if (!Array.isArray(choices) || !choices.length) throw Error('请先选择要处理的提醒。');
    const {today, tomorrow, items} = snapshot;
    const selected = new Map(choices.map(choice => [choice.id, choice]));
    const queue = items.filter(row => selected.has(row.id));
    if (selected.size !== choices.length || queue.length !== selected.size || queue.some(row => !allowed(row,selected.get(row.id))))
      throw Error('所选操作无效，请检查实际投入小时数并刷新核对。');

    async function process() {
      const results = [];
      const earlier = (report?.results ?? []).filter(item => pendingChecks.has(item.id) && !selected.has(item.id));
      const unresolved = new Map(earlier.map(item => [item.id, pendingChecks.get(item.id)]));
      for (const listed of queue) {
        let row=listed;
        const {action,actualHours} = selected.get(row.id);
        const fields=action===recordPlannerHours?{actualHours}:{};
        const receipt = {id: row.id, title: row.title, action,...fields};
        await waitForStart();
        if(pauseItem({id:row.id,action,today,version:row.version,identity:row.identity,...fields})){
          results.push({...receipt,result:'not_run',message:'已排入重启后的任务'});
          continue;
        }
        if (!canStart()) {
          results.push({...receipt, result: 'not_run', message: '本次未执行'});
          continue;
        }
        const key='reminder:'+crypto.randomUUID();
        if(action===recordPlannerHours && row.resolvePlannerWork){
          try{
            const status=await call(path+'/'+row.id);
            if(status.plannerUnavailable)throw Error(status.plannerUnavailable);
            if(!status.plannerWork?.dispatchId||!status.version)throw Error('主站工时接口尚未返回当天的派发信息，请更新服务后再试。');
            if(status.today!==today||status.id!==row.id||status.identity!==row.identity||status.finished!==false||
              ![status.reminderVersion,status.version].includes(row.version))throw Error('主站计划已变化，请刷新后重新登记。');
            row={...row,plannerWork:status.plannerWork,version:status.version};
          }catch(error){
            note(key,row,action,'failed',error.message);
            results.push({...receipt,result:'failed',message:error.message});continue;
          }
        }
        note(key,row,action,'start',action===recordPlannerHours?actualHours+' 小时':'');
        let taskId, result;
        try {
          if (action === recordPlannerHours) {
            taskId = await createPlannerTask(row, today, actualHours);
            const task = await call('/api/tasks/' + taskId + '/execute', {});
            result = plannerResult(task, row, actualHours);
          } else {
            await call(path + '/' + row.id, {action, today, version: row.version});
          }
        } catch (error) {
          if (action === recordPlannerHours && !taskId || error.status >= 400 && error.status < 500) {
            note(key,row,action,'failed',error.message);
            results.push({...receipt, result: 'failed', message: error.message});
            continue;
          }
        }
        // A lost write response only allows a read. Never repeat a write to obtain its receipt.
        result ??= await verify(row, action, tomorrow, actualHours, taskId).catch(() => null);
        if (!result) unresolved.set(row.id, {row, tomorrow,key,taskId});
        note(key,row,action,result?.result??'unknown',result?outcomeDetail(result):'尚未核实云端是否已执行。');
        results.push({...receipt, ...(result ?? {result: 'unknown', message: '暂时查不到预期结果，请刷新核对。'})});
      }
      report = {results: [...results, ...earlier.map(item => ({...item, earlier: true}))],
        unchanged: items.filter(row => !row.reason||row.plannerWork||row.resolvePlannerWork).length - queue.length};
      pendingChecks = unresolved;
      snapshot = null;
      return report;
    }
    running = process();
    try { return await running; } finally { running = null; }
  }

  return {load, apply, reconcile, hasUnknown:()=>pendingChecks.size>0, current:()=>running,
    async resume(item){
      const data=await load();
      const row=data.items.find(row=>row.id===item.id);
      if(data.today!==item.today||!row||row.version!==item.version||row.identity!==item.identity||!allowed(row,item))
        throw Error('待恢复提醒已变化，请在今日任务重新核对。');
      return apply([item]);
    },
    activeCount: () => running ? 1 : 0, waitForStop: () => running?.catch(() => {})};
}
