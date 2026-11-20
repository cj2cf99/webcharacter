const list = document.querySelector('#companion-chains');
const status = document.querySelector('#companion-status');
const more = document.querySelector('#companion-more');
const base = '/api/companion';
const names = {ACTIVE: '进行中', COMPLETED: '已完成', STOPPED: '已停止', RUNNING: '等待回执',
  PENDING: '待领取', FAILED: '失败', CANCELLED: '已取消'};
const labels = {'hu-shi.food.create': '吃喝', 'hu-shi.exercise.create': '运动',
  'hu-shi.event.create': '一键事件', 'records.create': '随手记', 'diaries.create': '日记', 'reminders.create': '提醒'};
const date = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short'});
let after = '';

function elem(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}
async function api(path, body) {
  const response = await fetch(base + path, {cache: 'no-store',
    ...(body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})});
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) throw new Error(value?.error?.message || '暂时无法读取，请重试');
  return value;
}
const stamp = value => Number.isFinite(Date.parse(value)) ? date.format(new Date(value)) + ' JST' : '';
const key = value => encodeURIComponent(value);

function chainCard(chain) {
  const card = elem('details');
  const summary = elem('summary', chain.name);
  const caption = elem('small');
  summary.append(' ', caption);
  const body = elem('div');
  card.append(summary, body);
  const path = '/chains/' + key(chain.chain_id);
  const update = value => { caption.textContent = [names[value.status] || value.status, stamp(value.created_at)].filter(Boolean).join(' · '); };
  update(chain);

  function handle(label, work) {
    const button = elem('button', label);
    button.type = 'button';
    button.addEventListener('click', async () => {
      const buttons = body.querySelectorAll('button');
      for (const item of buttons) item.disabled = true;
      try { await work(); await refresh(); }
      catch (error) { status.textContent = error.message; }
      finally { for (const item of buttons) item.disabled = false; }
    });
    return button;
  }
  async function refresh() {
    body.replaceChildren(elem('p', '读取任务…'));
    try {
      const detail = await api(path);
      update(detail);
      const nodes = elem('ul');
      for (const node of detail.nodes) {
        const task = node.current_task;
        const row = elem('li', (labels[task.type] || task.type) + ' · ' + (node.skipped ? '已跳过' : names[task.status] || task.status));
        if (task.result?.record_id != null) row.append(elem('small', '回执 ' + task.result.record_id));
        if (detail.temporary_registration && detail.status === 'ACTIVE') {
          if (task.status === 'RUNNING') row.append(handle('查证回执', () => api('/tasks/' + key(task.task_id) + '/receipt', {})));
          if (task.status === 'FAILED' && !node.skipped && node.skipped_task_id !== task.task_id) {
            const decision = action => api(path + '/nodes/' + key(node.node_id) + '/decision', {
              action, expected_task_id: task.task_id, request_id: crypto.randomUUID(),
              ...(action === 'continue' ? {new_task_id: crypto.randomUUID()} : {}),
            });
            row.append(handle('继续', () => decision('continue')), handle('跳过', () => decision('skip')));
          }
        }
        nodes.append(row);
      }
      const actions = [handle('刷新', async () => {})];
      if (detail.temporary_registration && detail.status === 'ACTIVE') {
        const byId = new Map(detail.nodes.map(node => [node.node_id, node]));
        const next = detail.nodes.find(node => {
          if (node.skipped || node.current_task.status !== 'PENDING') return false;
          for (let parent = node.depends_on; parent;) {
            const prior = byId.get(parent);
            if (!prior || !prior.skipped && prior.current_task.status !== 'COMPLETED') return false;
            parent = prior.depends_on;
          }
          return true;
        });
        const blocked = detail.nodes.some(node => !node.skipped && ['RUNNING','FAILED'].includes(node.current_task.status));
        if (next && !blocked) actions.push(handle('执行下一项', () => api('/tasks/' + key(next.current_task.task_id) + '/execute', {})));
        actions.push(handle('停止任务链', () => api(path + '/stop', {request_id: crypto.randomUUID()})));
      }
      body.replaceChildren(nodes, ...actions);
    } catch (error) {
      body.replaceChildren(elem('p', error.message), handle('重试', async () => {}));
    }
  }
  card.addEventListener('toggle', () => { if (card.open) void refresh(); });
  return card;
}

async function load() {
  more.disabled = true;
  status.textContent = '读取任务链…';
  try {
    const page = await api('/chains' + (after ? '?after=' + key(after) : ''));
    list.append(...page.chains.map(chainCard));
    after = page.next_after;
    status.textContent = list.childElementCount ? '' : '还没有任务链';
    more.hidden = !after;
    more.textContent = '加载更多';
  } catch (error) {
    status.textContent = error.message;
    more.hidden = false;
    more.textContent = '重试';
  } finally { more.disabled = false; }
}
more.addEventListener('click', load);
void load();
