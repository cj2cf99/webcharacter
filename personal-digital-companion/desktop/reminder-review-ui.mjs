const byId = id => document.getElementById(id);
const groups = byId('groups'), report = byId('report'), status = byId('status');
const apply = byId('apply'), refresh = byId('refresh');
const selected = new Map();
let busy = false;

function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}

const labels = {overdue: '逾期', today: '今天', locked: '不可改动'};
const actions = {tomorrow: '移到明天', complete: '完成'};
const messages = {moved: '已移到明天', completed: '已完成', failed: '失败', unknown: '待核对', not_run: '未执行'};
const deadline = value => value?.replace('T', ' ').replace(/\+09:00$/, '') ?? '';
const errorMessage = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');

function updateButtons() {
  refresh.disabled = busy;
  apply.disabled = busy || !selected.size;
  byId('selected').textContent = selected.size ? `已选 ${selected.size} 项` : '未选择操作';
  for (const button of groups.querySelectorAll('button')) button.disabled = busy;
}

function row(item) {
  const line = node('li', '', 'row'), info = node('div', '', 'row-main');
  info.append(node('strong', item.title),
    node('div', [deadline(item.deadline), item.reason, item.recurrence && '循环'].filter(Boolean).join(' · '), 'meta'));
  line.append(info);
  if (item.reason) { line.dataset.locked = ''; return line; }
  const tools = node('div', '', 'row-actions');
  for (const [action, label] of Object.entries(actions)) {
    const button = node('button', label);
    button.type = 'button';
    button.dataset.action = action;
    button.setAttribute('aria-label', label + '：' + item.title);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (selected.get(item.id) === action) selected.delete(item.id);
      else selected.set(item.id, action);
      for (const other of tools.children) other.setAttribute('aria-pressed', String(selected.get(item.id) === other.dataset.action));
      updateButtons();
    });
    tools.append(button);
  }
  line.append(tools);
  return line;
}

function renderReport(value) {
  report.hidden = !value;
  report.replaceChildren();
  if (!value) return;
  const current = value.results.filter(item => !item.earlier);
  const counts = Object.fromEntries(Object.keys(messages).map(key => [key, current.filter(item => item.result === key).length]));
  const summary = Object.entries(counts).filter(([, count]) => count).map(([key, count]) => messages[key] + ' ' + count);
  if (value.unchanged) summary.push('不处理 ' + value.unchanged);
  if (current.length !== value.results.length) summary.push('前批复核 ' + (value.results.length - current.length) + ' 项');
  const list = node('ul');
  for (const item of value.results) {
    const detail = item.next ? '下一期 ' + deadline(item.next) : item.deadline ? deadline(item.deadline) : item.message;
    const entry = node('li', [item.earlier && '前批', messages[item.result], item.title, detail].filter(Boolean).join(' · '));
    entry.dataset.result = item.result;
    list.append(entry);
  }
  report.append(node('p', summary.join(' · ')), list);
}

function render(data) {
  selected.clear();
  byId('date').textContent = data.today + ' · JST';
  groups.replaceChildren();
  for (const [group, label] of Object.entries(labels)) {
    const items = data.items.filter(item => item.group === group);
    if (!items.length) continue;
    const section = node('section'), list = node('ul');
    section.dataset.group = group;
    list.append(...items.map(row));
    section.append(node('h2', label + ' ' + items.length), list);
    groups.append(section);
  }
  status.textContent = data.items.length ? '' : '今天没有到期事项。';
  renderReport(data.report);
}

async function load() {
  if (busy) return;
  busy = true; status.textContent = '正在查询提醒…'; updateButtons();
  try { render(await window.reminderReview.load()); }
  catch (error) {
    selected.clear(); groups.replaceChildren();
    status.textContent = errorMessage(error);
  } finally { busy = false; updateButtons(); }
}

refresh.addEventListener('click', () => void load());
apply.addEventListener('click', async () => {
  if (busy || !selected.size) return;
  busy = true; status.textContent = '正在逐条处理并核对…'; updateButtons();
  try {
    const result = await window.reminderReview.apply([...selected].map(([id, action]) => ({id, action})));
    // Use a fresh list before the next batch so old rows cannot be submitted again.
    selected.clear();
    renderReport(result);
    try { render(await window.reminderReview.load()); }
    catch { groups.replaceChildren(); status.textContent = '任务列表刷新失败，操作结果见上方。'; }
    report.focus({preventScroll: true});
    report.scrollIntoView({block: 'start'});
  } catch (error) { status.textContent = errorMessage(error); }
  finally { busy = false; updateButtons(); }
});
void load();
