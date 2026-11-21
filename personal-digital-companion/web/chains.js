const list = document.querySelector('#companion-chains');
const status = document.querySelector('#companion-status');
const more = document.querySelector('#companion-more');
const chainFeedback = document.querySelector('#chain-feedback');
const base = '/api/companion';
const names = {ACTIVE: '进行中', COMPLETED: '已完成', STOPPED: '已停止', RUNNING: '等待回执',
  PENDING: '待领取', FAILED: '失败', CANCELLED: '已取消', EXPIRED: '已过期'};
const labels = {'hu-shi.food.create': '吃喝', 'hu-shi.exercise.create': '运动',
  'hu-shi.event.create': '一键事件', 'records.create': '随手记', 'diaries.create': '日记', 'reminders.create': '提醒'};
const date = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short'});
const taskNames = {...names, RUNNING: '执行中'};

function elem(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}
async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, {cache: 'no-store',
    method,...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})});
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) {
    const error = new Error(value?.error?.message || (typeof value?.error === 'string' ? value.error : '暂时无法读取，请重试'));
    error.status = response.status;
    throw error;
  }
  return value;
}
const stamp = value => Number.isFinite(Date.parse(value)) ? date.format(new Date(value)) + ' JST' : '';
const key = value => encodeURIComponent(value);

function action(label, run) {
  const button = elem('button', label);
  button.type = 'button';
  button.addEventListener('click', run);
  return button;
}

function summaryRow(label, state, meta, dictionary = taskNames) {
  const summary = elem('summary');
  const copy = elem('span');
  copy.append(elem('strong', label));
  if (meta) copy.append(elem('small', meta));
  summary.append(copy);
  if (state) {
    const badge = elem('span');
    badge.className = 'companion-badge';
    summary.append(badge);
    updateBadge(summary, state, dictionary);
  }
  return summary;
}

function updateBadge(summary, state, dictionary = taskNames) {
  const badge = summary.querySelector('.companion-badge');
  badge.textContent = dictionary[state] ?? state;
  badge.dataset.state = state;
}

function chainCard(chain) {
  const card = elem('details');
  const body = elem('div');
  const summary = summaryRow(chain.name, chain.status, stamp(chain.created_at), names);
  card.append(summary, body);
  const path = '/chains/' + key(chain.chain_id);

  function handle(label, work) {
    return action(label, async () => {
      const buttons = body.querySelectorAll('button');
      for (const item of buttons) item.disabled = true;
      try {
        if (await work()) templatesDirty = tasksDirty = true;
        const current = await refresh();
        if (current && chainScope.value && chainScope.value !== current) {
          chainFeedback.textContent = '任务链状态 · ' + names[current];
          void chains.load(true);
        }
      }
      catch (error) { chainFeedback.textContent = error.message; }
      finally { for (const item of buttons) item.disabled = false; }
    });
  }
  let refreshId = 0;
  async function refresh() {
    const current = ++refreshId;
    body.replaceChildren(elem('p', '读取任务…'));
    try {
      const detail = await api(path);
      if (current !== refreshId) return;
      updateBadge(summary, detail.status, names);
      const nodes = elem('ul');
      for (const node of detail.nodes) {
        const task = node.current_task;
        const row = elem('li', (task.definition?.name || labels[task.type] || task.type) + ' · ' + (node.skipped ? '已跳过' : names[task.status] || task.status));
        if (task.result?.record_id != null) row.append(elem('small', '回执 ' + task.result.record_id));
        if (task.error || task.activity?.progress_message) row.append(elem('small',task.error || task.activity.progress_message));
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
      }
      if (detail.status === 'ACTIVE') actions.push(handle('停止任务链', () => window.confirm('停止任务链？已开始的任务仍会继续。') ?
        api(path + '/stop', {request_id: crypto.randomUUID()}) : undefined));
      body.replaceChildren(nodes, ...actions);
      return detail.status;
    } catch (error) {
      if (current !== refreshId) return;
      body.replaceChildren(elem('p', error.message), handle('重试', async () => {}));
    }
  }
  card.addEventListener('toggle', () => { if (card.open) void refresh(); });
  return card;
}

function pagedList({list, status, more, path, field, card, empty}) {
  let after = '';
  let requestId = 0;
  async function load(reset = false) {
    const current = ++requestId;
    if (reset) {
      after = '';
      list.replaceChildren();
    }
    more.disabled = true;
    status.textContent = '读取中…';
    const url = new URL(base + path(), location.origin);
    if (after) url.searchParams.set('after', after);
    try {
      const page = await api(url.pathname.slice(base.length) + url.search);
      if (current !== requestId) return;
      list.append(...page[field].map(card));
      after = page.next_after;
      status.textContent = list.childElementCount ? (after ? '已加载 ' + list.childElementCount + ' 项' : '') : empty;
      more.hidden = !after;
      more.textContent = '加载更多';
    } catch (error) {
      if (current !== requestId) return;
      status.textContent = error.message;
      more.hidden = false;
      more.textContent = '重试';
    } finally {
      if (current === requestId) more.disabled = false;
    }
  }
  more.addEventListener('click', () => void load());
  return {load, get started() { return requestId > 0; }};
}

const parameterNames = {
  body:'正文', content:'内容', title:'标题', text:'文字', prompt:'提示词', reflection:'补充说明',
  deadline:'日期（JST）', level:'等级', category:'分类名称', category_id:'分类编号', actualHours:'投入小时',
  tag_ids:'标签编号', photos:'图片链接', project_name:'计划名称',
};
const parameterLabel = name => parameterNames[name] ?? name;
const executorLabel = executor => executor === 'pc' ? '电脑执行' : '绯月自动登记';
const rawValue = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);

function valuesSection(title, data) {
  const section = elem('details');
  section.className = 'companion-values';
  section.append(elem('summary', title));
  const fields = elem('dl');
  for (const [label, value] of Object.entries(data)) {
    if (value == null || value === '') continue;
    fields.append(elem('dt', parameterLabel(label)), elem('dd', rawValue(value)));
  }
  section.append(fields.childElementCount ? fields : elem('p', '无'));
  return section;
}

const taskList = document.querySelector('#task-list');
const taskStatus = document.querySelector('#task-status');
const taskFeedback = document.querySelector('#task-feedback');
const taskUrl = row => '/tasks/' + key(row.task_id);
const shownTaskStatus = (status, stopped) => status === 'PENDING' && stopped ? 'STOPPED' : status;
function taskCard(row) {
  const card = elem('details');
  const device = row.target_device_id === 'all' ? '任一电脑' : row.device_name || executorLabel(row.executor);
  const meta = target => [stamp(row.created_at), target, row.chain_name].filter(Boolean).join(' · ');
  const summary = summaryRow(row.name, shownTaskStatus(row.status,row.chain_stopped), meta(device));
  const body = elem('div');
  card.append(summary, body);
  async function read() {
    body.replaceChildren(elem('p', '读取详情…'));
    try {
      const detail = await api(taskUrl(row));
      const currentStatus = shownTaskStatus(detail.status,detail.chain?.stopped);
      updateBadge(summary, currentStatus);
      const actualDevice = detail.target_device?.alias || detail.target_device?.computer_name || detail.target_device?.device_id;
      if (actualDevice) summary.querySelector('small').textContent = meta(actualDevice);
      const info = elem('div');
      if (detail.activity?.progress_message) info.append(elem('p', detail.activity.progress_message));
      if (detail.deadline_at) info.append(elem('p', '截止 ' + stamp(detail.deadline_at)));
      if (detail.error) info.append(elem('p', detail.error));
      if (detail.result?.record_id != null) info.append(elem('p', '登记回执 ' + detail.result.record_id));
      info.append(valuesSection('提交参数', detail.params || {}));
      if (detail.result != null) info.append(valuesSection('执行结果', {结果:detail.result}));
      if (detail.executions?.length) {
        const attempts = detail.executions.map(item => [taskNames[item.status] || item.status, stamp(item.finished_at), item.error].filter(Boolean).join(' · '));
        info.append(valuesSection('执行记录', Object.fromEntries(attempts.map((item, index) => ['第 ' + (index + 1) + ' 次', item]))));
      }
      const tools = elem('div');
      tools.className = 'companion-tools';
      tools.append(action('刷新详情', () => void read()));
      const feedback = elem('p');
      feedback.className = 'companion-status';
      feedback.setAttribute('role', 'status');
      function mutate(label, endpoint, confirmation) {
        tools.append(action(label, async () => {
          if (confirmation && !window.confirm(confirmation)) return;
          const buttons = [...tools.querySelectorAll('button')];
          buttons.forEach(button => { button.disabled = true; });
          try {
            await api(taskUrl(row) + endpoint, {});
            templatesDirty = true;
            const confirmed = await read();
            taskFeedback.textContent = confirmed ? '当前状态 · ' + taskNames[confirmed] : '操作已返回，请刷新详情确认状态';
            if (confirmed && taskScope.value && taskScope.value !== taskCategory(confirmed)) void tasks.load(true);
          } catch (error) {
            feedback.textContent = error.message;
            buttons.forEach(button => { button.disabled = false; });
          }
        }));
      }
      if (!detail.chain && detail.status === 'PENDING') {
        mutate('取消任务', '/cancel', '取消这项待领取任务？');
      }
      body.replaceChildren(info, tools, feedback);
      return currentStatus;
    } catch (error) {
      body.replaceChildren(elem('p', error.message), action('重试', () => void read()));
    }
  }
  card.addEventListener('toggle', () => { if (card.open && !body.childElementCount) void read(); });
  return card;
}

function scope(id, change) {
  const group = document.getElementById(id);
  const buttons = [...group.querySelectorAll('button')];
  let value = '';
  function set(next) {
    value = next;
    buttons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.scope === value)));
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    if (button.dataset.scope === value) return;
    set(button.dataset.scope);
    change();
  }));
  return {get value() { return value; }, set};
}
const withStatus = (path, filter) => path + (filter.value ? '?status=' + key(filter.value) : '');
const taskCategory = value => ['PENDING','RUNNING'].includes(value) ? 'ACTIVE' : value;
const chainScope = scope('chain-state', () => void chains.load(true));
const taskScope = scope('task-state', () => void tasks.load(true));
const templateScope = scope('template-state', () => void templates.load(true));
const chains = pagedList({list, status, more, path:() => withStatus('/chains',chainScope), field:'chains', card:chainCard, empty:'没有符合条件的任务链'});
const tasks = pagedList({list:taskList, status:taskStatus, more:document.querySelector('#task-more'),
  path:() => withStatus('/task-overview',taskScope),
  field:'tasks', card:taskCard, empty:'没有符合条件的任务'});
document.querySelector('#chain-refresh').addEventListener('click', () => void chains.load(true));
document.querySelector('#task-refresh').addEventListener('click', () => void tasks.load(true));
document.querySelector('#template-refresh').addEventListener('click', () => void templates.load(true));

let templateRequest;
function templateList() {
  if (!templateRequest) templateRequest = api('/tasklist').then(result => result.tasklist).catch(error => {
    templateRequest = undefined;
    throw error;
  });
  return templateRequest;
}
function templateCard(row) {
  const card = elem('details');
  const body = elem('div');
  body.append(elem('p', row.description));
  const fields = Object.entries(row.parameter_spec).map(([name, field]) =>
    parameterLabel(name) + (field.required ? '（必填）' : ''));
  body.append(elem('p', fields.length ? fields.join(' · ') : '无需参数'));
  if (row.standalone) body.append(action('使用此模板', () => void openCreate(row.type)));
  const meta = [executorLabel(row.executor), row.standalone ? '' : '用于任务链'];
  if (row.active_count) meta.push('执行中 ' + row.active_count);
  if (row.completed_count) meta.push('已完成 ' + row.completed_count);
  card.append(summaryRow(row.name, null, meta.filter(Boolean).join(' · ')), body);
  return card;
}
let templatesDirty = false;
let tasksDirty = false;
const templates = pagedList({list:document.querySelector('#task-templates'), status:document.querySelector('#template-status'),
  more:document.querySelector('#template-more'), path:() => withStatus('/task-template-overview',templateScope),
  field:'tasklist', card:templateCard, empty:'没有符合条件的任务模板'});

const terminalList = document.querySelector('#terminal-list');
const terminalStatus = document.querySelector('#terminal-status');
const terminalBinding = document.querySelector('#terminal-binding');
const terminalRefresh = document.querySelector('#terminal-refresh');
const isComputer = device => /^pc-/i.test(device.device_id);
const terminalName = device => device.alias || device.computer_name || device.device_id;
let terminalsLoaded = false;
let terminalLoading = false;
let restoringBrowser = false;

function showBinding(terminal) {
  terminalBinding.textContent = terminal ? '当前浏览器关联 · ' + terminalName(terminal) : '当前浏览器尚未关联终端';
}

function downloadBinding(device) {
  const binding = new Blob([JSON.stringify({device_id:device.device_id}) + '\n'],{type:'application/json'});
  const url = URL.createObjectURL(binding);
  const link = elem('a');
  link.href = url;
  link.download = 'feiyue-' + device.device_id + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1500);
}

function terminalCard(device) {
  const card = elem('details');
  const pc = isComputer(device);
  const summary = summaryRow(terminalName(device),null,pc ? '电脑终端' : '网页终端');
  const body = elem('div');
  const identity = elem('p','固定 ID · ' + device.device_id);
  identity.className = 'companion-terminal-id';
  const hardware = elem('p','系统名称 · ' + device.computer_name);
  const editor = elem('form');
  editor.className = 'companion-terminal-editor';
  const name = elem('input');
  name.type = 'text';
  name.value = device.alias || '';
  name.maxLength = 128;
  name.placeholder = '留空恢复系统名称';
  name.setAttribute('aria-label','指定名称');
  const save = elem('button','保存名称');
  save.type = 'submit';
  save.dataset.staticAction = 'save';
  editor.append(labelled('指定名称',name),save);
  const restore = action(pc ? '恢复本地 ID' : '恢复此浏览器绑定',async () => {
    if (pc) {
      downloadBinding(device);
      terminalStatus.textContent = '已准备绑定文件。在绯月托盘打开「任务 → 恢复本机任务终端 ID」，选择下载的文件。';
      return;
    }
    if (restoringBrowser) return;
    restoringBrowser = restore.disabled = true;
    try {
      const value = await api('/terminal/claim',{device_id:device.device_id});
      const current = await api('/terminal');
      if (current.terminal?.device_id !== value.terminal.device_id) throw new Error('浏览器关联尚未读回，请重试');
      showBinding(current.terminal);
      terminalStatus.textContent = '已恢复「' + terminalName(current.terminal) + '」的浏览器绑定';
    } catch (error) { terminalStatus.textContent = error.message; }
    finally { restoringBrowser = restore.disabled = false; }
  });
  restore.dataset.staticAction = 'restore';
  editor.addEventListener('submit',async event => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = name.disabled = true;
    try {
      const saved = await api('/devices/' + key(device.device_id),{alias:name.value.trim() || null},'PATCH');
      name.value = saved.device.alias || '';
      summary.querySelector('strong').textContent = terminalName(saved.device);
      tasksDirty = true;
      const current = await api('/terminal').catch(() => null);
      if (current) showBinding(current.terminal);
      terminalStatus.textContent = '已保存「' + terminalName(saved.device) + '」';
    } catch (error) { terminalStatus.textContent = error.message; }
    finally { save.disabled = name.disabled = false; }
  });
  body.append(identity,hardware,editor,restore);
  card.append(summary,body);
  return card;
}

async function loadTerminals() {
  if (terminalLoading) return;
  terminalLoading = terminalRefresh.disabled = true;
  terminalStatus.textContent = '读取终端…';
  try {
    const [list,current] = await Promise.all([api('/devices'),api('/terminal').catch(() => null)]);
    terminalList.replaceChildren(...list.devices.map(terminalCard));
    if (current) showBinding(current.terminal);
    terminalStatus.textContent = list.devices.length ? '' : '暂无已登记的任务终端';
    terminalsLoaded = true;
  } catch (error) { terminalStatus.textContent = error.message; }
  finally { terminalLoading = terminalRefresh.disabled = false; }
}
terminalRefresh.addEventListener('click',() => void loadTerminals());

const switches = [...document.querySelectorAll('[data-companion-view]')];
function selectView(view, updateUrl = true) {
  for (const tab of switches) {
    const selected = tab.dataset.companionView === view;
    tab.setAttribute('aria-pressed', String(selected));
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  }
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('view', view);
    history.replaceState(null, '', url);
  }
  if (view === 'chains' && !chains.started) void chains.load();
  if (view === 'tasks' && (!tasks.started || tasksDirty)) {
    tasksDirty = false;
    void tasks.load(true);
  }
  if (view === 'templates' && (!templates.started || templatesDirty)) {
    templatesDirty = false;
    void templates.load(true);
  }
  if (view === 'terminals' && !terminalsLoaded) void loadTerminals();
}
switches.forEach(tab => tab.addEventListener('click', () => selectView(tab.dataset.companionView)));
const defaultView = location.pathname.startsWith('/companion/chains') ? 'chains' : 'tasks';
const initialView = new URLSearchParams(location.search).get('view');
selectView(switches.some(tab => tab.dataset.companionView === initialView) ? initialView : defaultView, false);

const dialog = document.querySelector('#task-create');
const form = document.querySelector('#task-form');
const typeSelect = document.querySelector('#task-type');
const targetSelect = document.querySelector('#task-target');
const targetField = document.querySelector('#task-target-field');
const targetMessage = document.querySelector('#task-target-message');
const fields = document.querySelector('#task-fields');
const createStatus = document.querySelector('#task-create-status');
const submit = document.querySelector('#task-create-submit');
const close = document.querySelector('#task-create-close');
let formTemplates = [];
let controls = [];
const submission = {};
let formLoad = 0;
function option(value, label) {
  const node = elem('option', label);
  node.value = value;
  return node;
}

function parameterFields(container,spec) {
  const entries = Object.entries(spec).map(([name, rule]) => {
    const label = elem('label', parameterLabel(name));
    const input = elem(rule.type === 'boolean' ? 'select' : rule.type === 'number' ? 'input' : 'textarea');
    if (rule.type === 'boolean') input.append(option('', '请选择'), option('true', '是'), option('false', '否'));
    if (rule.type === 'number') {
      input.type = 'number';
      input.step = 'any';
      if (rule.min != null) input.min = rule.min;
      if (rule.max != null) input.max = rule.max;
    }
    if (input.tagName === 'TEXTAREA') {
      input.rows = 2;
      if (rule.type === 'string_array') input.placeholder = '每行一项，最多 ' + rule.max_items + ' 项';
    }
    input.required = Boolean(rule.required);
    label.append(input);
    return {name, rule, input, label};
  });
  container.replaceChildren(...entries.map(entry => entry.label));
  return entries;
}

function readParameters(entries) {
  return Object.fromEntries(entries.flatMap(({name, rule, input}) => {
    const text = input.value;
    if (!text && !rule.required) return [];
    const value = rule.type === 'boolean' ? text === 'true' : rule.type === 'number' ? input.valueAsNumber :
      rule.type === 'string_array' ? text.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : text;
    const pattern = rule.pattern ? new RegExp(rule.pattern) : null;
    if (Array.isArray(value) ? value.length > rule.max_items || (rule.required && !value.length) || value.some(item => pattern && !pattern.test(item)) :
      pattern && !pattern.test(value)) throw new Error(parameterLabel(name) + '的格式不符合模板要求');
    return [[name,value]];
  }));
}

function setDeviceOptions(select,message,result) {
  const devices = (result?.devices || []).filter(isComputer);
  const placeholder = option('',devices.length ? '选择电脑' : result ? '暂无已登记电脑' : '设备名单暂不可用');
  placeholder.disabled = true;
  placeholder.hidden = true;
  select.replaceChildren(placeholder,option('all','任一电脑'),
    ...devices.map(device => option(device.device_id,terminalName(device))));
  select.value = '';
  message.textContent = devices.length ? '' : result ?
    '选择任一电脑后，任务会等待已登记的电脑领取。' : '请关闭后重开以重试，或选择任一电脑。';
  message.hidden = Boolean(devices.length);
}

function renderFields() {
  const template = formTemplates.find(row => row.type === typeSelect.value);
  const pc = template?.executor === 'pc';
  targetField.hidden = !pc;
  targetSelect.required = pc;
  controls = parameterFields(fields, template?.parameter_spec || {});
  submit.disabled = !template;
}
typeSelect.addEventListener('change', renderFields);

async function openCreate(selected) {
  if (dialog.open) return;
  // 关闭再打开时保留上次没有确认到结果的表单，使用原提交号重试。
  if (submission.id) {
    dialog.showModal();
    return;
  }
  const loading = ++formLoad;
  dialog.showModal();
  submit.disabled = true;
  typeSelect.disabled = true;
  targetField.hidden = true;
  fields.replaceChildren();
  createStatus.textContent = '读取模板与设备…';
  try {
    const [available, deviceResult] = await Promise.all([templateList(), api('/devices').catch(() => null)]);
    if (loading !== formLoad || !dialog.open) return;
    formTemplates = available.filter(row => row.standalone);
    typeSelect.replaceChildren(option('', '选择模板'),
      ...formTemplates.map(row => option(row.type,row.name)));
    setDeviceOptions(targetSelect,targetMessage,deviceResult);
    typeSelect.disabled = false;
    if (selected) typeSelect.value = selected;
    createStatus.textContent = formTemplates.length ? '' : '没有可单独创建的模板';
    renderFields();
  } catch (error) {
    if (loading === formLoad) createStatus.textContent = error.message + '，请关闭后重试';
  }
}
document.querySelector('#task-new').addEventListener('click', () => void openCreate());
close.addEventListener('click', () => dialog.close());
let creating = false;
dialog.addEventListener('cancel', event => { if (creating) event.preventDefault(); });
function lockForm(locked) {
  for (const field of [typeSelect, targetSelect, ...controls.map(item => item.input)]) field.disabled = locked;
}

async function submitWithReceipt(path, body, pending) {
  if (!pending.id) {
    const result = await api('/task-submissions', {});
    pending.id = result.submission_id;
    pending.uncertain = false;
  }
  try {
    const result = await api(path, {...body, submission_id:pending.id});
    pending.id = null;
    return result;
  } catch (error) {
    if (!pending.uncertain && error.status >= 400 && error.status < 500) pending.id = null;
    else pending.uncertain = true;
    throw error;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (creating) return;
  try {
    const template = formTemplates.find(row => row.type === typeSelect.value);
    if (!template) return;
    const body = {type:template.type, target_device_id:template.executor === 'pc' ? targetSelect.value : null, params:readParameters(controls)};
    creating = true;
    close.disabled = submit.disabled = true;
    lockForm(true);
    createStatus.textContent = '提交中…';
    await submitWithReceipt('/tasks',body,submission);
    dialog.close();
    taskScope.set('ACTIVE');
    const started = tasks.started;
    selectView('tasks');
    taskFeedback.textContent = '已创建「' + template.name + '」';
    templatesDirty = true;
    if (started) await tasks.load(true);
  } catch (error) {
    createStatus.textContent = error.message + (submission.id ? ' 可使用同一表单重试。' : '');
  } finally {
    creating = false;
    close.disabled = submit.disabled = false;
    lockForm(Boolean(submission.id));
  }
});

const chainDialog = document.querySelector('#chain-create');
const chainForm = document.querySelector('#chain-form');
const chainFields = document.querySelector('#chain-create-fields');
const chainName = document.querySelector('#chain-name');
const chainSteps = document.querySelector('#chain-steps');
const chainAdd = document.querySelector('#chain-add-step');
const chainCount = document.querySelector('#chain-step-count');
const chainSubmit = document.querySelector('#chain-create-submit');
const chainClose = document.querySelector('#chain-create-close');
const chainStatus = document.querySelector('#chain-create-status');
const chainPending = {};
const maxChainSteps = 5;
let steps = [];
let nextStep = 0;
let chainTemplates = [];
let chainDevices;
let chainFormLoad = 0;
let chainCreating = false;

function labelled(text, field) {
  const label = elem('label',text);
  label.append(field);
  return label;
}

function updateSteps() {
  steps.forEach((step, index) => {
    step.title.textContent = '第 ' + (index + 1) + ' 项';
    step.remove.disabled = steps.length === 1;
    step.remove.setAttribute('aria-label','移除第 ' + (index + 1) + ' 项');
    const chosen = step.before.value;
    step.before.replaceChildren(option('','无前置'), ...steps.slice(0,index)
      .map((prior,position) => option(prior.key,'第 ' + (position + 1) + ' 项')));
    if (steps.slice(0,index).some(prior => prior.key === chosen)) step.before.value = chosen;
  });
  chainAdd.disabled = steps.length >= maxChainSteps;
  chainCount.textContent = steps.length + ' / ' + maxChainSteps + ' 项';
}

function addStep() {
  if (steps.length >= maxChainSteps) return;
  const row = elem('div');
  row.className = 'companion-chain-step';
  const title = elem('strong');
  const type = elem('select');
  type.required = true;
  type.append(option('','选择模板'), ...chainTemplates.map(template => option(template.type,template.name)));
  const before = elem('select');
  const target = elem('select');
  const targetMessage = elem('small');
  targetMessage.className = 'companion-field-message';
  targetMessage.id = 'chain-device-message-' + (nextStep + 1);
  target.required = true;
  target.setAttribute('aria-describedby',targetMessage.id);
  setDeviceOptions(target,targetMessage,chainDevices);
  const inputs = elem('div');
  inputs.className = 'companion-fields';
  const step = {key:'step-' + (++nextStep), title, type, before, target, controls:[]};
  step.remove = action('移除', () => {
    steps = steps.filter(item => item !== step);
    row.remove();
    updateSteps();
    chainAdd.focus();
  });
  const top = elem('div');
  top.className = 'companion-heading';
  top.append(title,step.remove);
  row.append(top,labelled('任务模板',type),labelled('前置任务',before));
  const deviceField = elem('div');
  deviceField.append(labelled('目标设备',target),targetMessage);
  row.append(deviceField);
  row.append(inputs);
  type.addEventListener('change',() => {
    const template = chainTemplates.find(item => item.type === type.value);
    step.controls = parameterFields(inputs,template?.parameter_spec || {});
  });
  chainSteps.append(row);
  steps.push(step);
  updateSteps();
}

function resetSteps() {
  steps = [];
  nextStep = 0;
  chainSteps.replaceChildren();
  addStep();
}

chainAdd.addEventListener('click',() => { addStep(); steps.at(-1)?.type.focus(); });

async function openChainCreate() {
  if (chainDialog.open) return;
  chainDialog.showModal();
  if (chainPending.id) return;
  const loading = ++chainFormLoad;
  chainForm.reset();
  chainFields.disabled = chainSubmit.disabled = true;
  chainSteps.replaceChildren();
  chainCount.textContent = '';
  chainStatus.textContent = '读取模板与设备…';
  try {
    const [available,devices] = await Promise.all([templateList(),api('/devices').catch(() => null)]);
    if (loading !== chainFormLoad || !chainDialog.open) return;
    chainTemplates = available.filter(row => row.standalone);
    chainDevices = devices;
    resetSteps();
    chainFields.disabled = chainSubmit.disabled = false;
    chainStatus.textContent = '';
    chainName.focus();
  } catch (error) {
    if (loading === chainFormLoad) chainStatus.textContent = error.message + '，请关闭后重试';
  }
}

document.querySelector('#chain-new').addEventListener('click',() => void openChainCreate());
chainClose.addEventListener('click',() => chainDialog.close());
chainDialog.addEventListener('cancel',event => { if (chainCreating) event.preventDefault(); });
chainForm.addEventListener('submit',async event => {
  event.preventDefault();
  if (chainCreating) return;
  try {
    const name = chainName.value.trim();
    if (!name) throw new Error('请填写任务链名称');
    const nodes = steps.map(step => ({
      key:step.key,type:step.type.value,depends_on:step.before.value || null,
      target_device_id:step.target.value,params:readParameters(step.controls),
    }));
    chainCreating = true;
    chainClose.disabled = chainSubmit.disabled = chainFields.disabled = true;
    chainStatus.textContent = '提交中…';
    await submitWithReceipt('/chains',{name,nodes},chainPending);
    chainDialog.close();
    templatesDirty = tasksDirty = true;
    chainScope.set('ACTIVE');
    chainFeedback.textContent = '已创建「' + name + '」';
    await chains.load(true);
  } catch (error) {
    chainStatus.textContent = error.message + (chainPending.id ? ' 可使用同一表单重试。' : '');
  } finally {
    chainCreating = false;
    chainClose.disabled = chainSubmit.disabled = false;
    chainFields.disabled = Boolean(chainPending.id);
  }
});
