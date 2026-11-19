import {reminderReviewActions} from '../agent/host/reminder-review.mjs';

const path = '/api/reminder-review';

export function createReminderReviewFlow({request, canStart = () => true, waitForStart = () => {}}) {
  let snapshot, loading = null, running = null, report = null;
  let pendingChecks = new Map();

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
      if (pendingChecks.size) {
        const results = await Promise.all(report.results.map(async item => {
          const check = pendingChecks.get(item.id);
          if (!check) return item;
          const result = await verify(check.row, item.action, check.tomorrow).catch(() => null);
          if (!result) return item;
          pendingChecks.delete(item.id);
          return {id: item.id, title: item.title, action: item.action, earlier: item.earlier, ...result};
        }));
        report = {...report, results};
      }
      snapshot = data;
      return {...data, report};
    })();
    try { return await loading; } finally { loading = null; }
  }

  async function verify(row, action, tomorrow) {
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
    const selected = new Map(choices.map(({id, action}) => [id, action]));
    const queue = items.filter(row => selected.has(row.id));
    if (selected.size !== choices.length || queue.length !== selected.size || queue.some(row => row.reason
      || !reminderReviewActions.includes(selected.get(row.id)))) throw Error('所选提醒不能执行，请刷新后重选。');

    async function process() {
      const results = [];
      const earlier = (report?.results ?? []).filter(item => pendingChecks.has(item.id) && !selected.has(item.id));
      const unresolved = new Map(earlier.map(item => [item.id, pendingChecks.get(item.id)]));
      for (const row of queue) {
        const action = selected.get(row.id);
        const receipt = {id: row.id, title: row.title, action};
        await waitForStart();
        if (!canStart()) {
          results.push({...receipt, result: 'not_run', message: '本次未执行'});
          continue;
        }
        try {
          await call(path + '/' + row.id, {action, today, version: row.version});
        } catch (error) {
          if (error.status >= 400 && error.status < 500) {
            results.push({...receipt, result: 'failed', message: error.message});
            continue;
          }
        }
        // A lost write response only allows a read. Never repeat a write to obtain its receipt.
        const result = await verify(row, action, tomorrow).catch(() => null);
        if (!result) unresolved.set(row.id, {row, tomorrow});
        results.push({...receipt, ...(result ?? {result: 'unknown', message: '暂时查不到预期结果，请刷新核对。'})});
      }
      report = {results: [...results, ...earlier.map(item => ({...item, earlier: true}))],
        unchanged: items.filter(row => !row.reason).length - queue.length};
      pendingChecks = unresolved;
      snapshot = null;
      return report;
    }
    running = process();
    try { return await running; } finally { running = null; }
  }

  return {load, apply, activeCount: () => running ? 1 : 0, waitForStop: () => running?.catch(() => {})};
}
