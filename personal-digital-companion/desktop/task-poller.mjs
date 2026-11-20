// 空闲时读取完整候选清单，由桌面按本机能力自动领取。
export function createTaskPoller({ request, identity, canStart, onTasks = () => {},
  intervalMs = 15 * 60_000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let started = false, stopped = false, scanning = false, registered = false, timer = null;
  async function read(path, options) {
    const response = await request(path, options);
    if (!response.ok) throw new Error('获取任务失败');
    return response.json();
  }
  async function scan(managed=false) {
    if (stopped || scanning || (!managed&&!started)) return {deferred:true};
    scanning = true;
    try {
      if (!canStart()) return {deferred:true};
      if (!registered) {
        const registeredDevice = await read(`/api/devices/${identity.device_id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ computer_name: identity.computer_name }),
        });
        if (registeredDevice?.device?.device_id !== identity.device_id) throw new Error('登记回执不一致');
        registered = true;
      }
      let after = null;
      const tasks = [];
      do {
        if (stopped || !canStart()) return {deferred:true};
        const page = await read(`/api/devices/${identity.device_id}/pending${after ? `?after=${encodeURIComponent(after)}` : ''}`,
          { method: 'GET', cache: 'no-store' });
        if (stopped || !canStart()) return {deferred:true};
        if (!Array.isArray(page.tasks) || page.tasks.length > 50 || !Object.hasOwn(page, 'next_after')) throw new Error('任务清单无效');
        for (const task of page.tasks) {
          if (!task || typeof task.task_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(task.task_id) || typeof task.type !== 'string') throw new Error('任务清单无效');
          tasks.push(task);
        }
        const next = page.next_after;
        if (next !== null && (typeof next !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(next)
            || (after !== null && next <= after) || next !== page.tasks.at(-1)?.task_id)) throw new Error('任务游标无效');
        after = next;
      } while (after !== null);
      if(stopped||!canStart())return {deferred:true};
      await onTasks(tasks);
      return '云端候选任务 '+tasks.length+' 项';
    } catch(error) {
      if(managed)throw error;
      // 断网不改任务状态，下一个普通周期再获取；不创建退避/重放队列。
    } finally {
      scanning = false;
      if (!managed && !stopped && started) timer = setTimer(() => { timer = null; void scan(); }, intervalMs);
    }
  }
  return {
    scanOnce:()=>scan(true),
    start() { if (started || stopped) return; started = true; void scan(); },
    stop() { stopped = true; if (timer !== null) clearTimer(timer); timer = null; },
  };
}
