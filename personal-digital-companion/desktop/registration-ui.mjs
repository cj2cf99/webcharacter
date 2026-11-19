const byId = id => document.getElementById(id);
const entry = byId('entry');
const text = byId('text');
const submit = byId('submit');
const resume = byId('resume');
const status = byId('status');
const receipts = byId('receipts');
const pending = byId('pending');
const decisions = byId('decisions');
const actions = [...decisions.querySelectorAll('button')];
const labels = {
  'hu-shi.food.create': '吃喝', 'hu-shi.exercise.create': '运动', 'hu-shi.event.create': '一键事件',
  'records.create': '随手记', 'diaries.create': '日记', 'reminders.create': '提醒',
};
const nodeStatus = { PENDING: '待领取', RUNNING: '待回执', COMPLETED: '已登记', FAILED: '失败', CANCELLED: '已取消' };
const summary = { completed: '登记完成', stopped: '已停止后续登记', waiting: '等待执行回执，可稍后恢复原链',
  needs_decision: '遇到失败，请选择如何处理', needs_input: '需要补充信息', blocked: '当前没有可领取的登记',
  paused: '已暂停，可以恢复原链' };
let active = false;
let chainPending = false;

function setList(element, items) {
  element.replaceChildren(...items.map(item => {
    const row = document.createElement('li');
    row.textContent = item;
    return row;
  }));
  element.hidden = items.length === 0;
}

function render(result) {
  const chain = result?.chain;
  chainPending = chain?.status === 'ACTIVE';
  status.textContent = summary[result?.status] || '';
  const needsDecision = result?.status === 'needs_decision';
  decisions.hidden = !chainPending;
  for (const button of actions) button.hidden = !needsDecision && button.dataset.action !== 'stop';
  resume.hidden = !chainPending;
  setList(receipts, (chain?.nodes || []).map(({ current_task: task, skipped }) => {
    const state = skipped ? '已跳过' : nodeStatus[task.status] || task.status;
    const detail = task.result?.record_id ?? task.error ?? task.activity?.progress_message;
    return `${labels[task.type] || task.type} · ${state}${detail == null ? '' : ' · ' + detail}`;
  }));
  const questions = (result?.pending || []).map(item => `${labels[item.type] || item.type} · ${item.question}`);
  if (questions.length && chain) questions.push('补充时只提交仍待登记的事项。');
  setList(pending, questions);
  if (chain) text.value = '';
}

async function run(action) {
  if (active) return;
  active = true;
  const message = { submit: '正在理解并登记…', resume: '正在查询原链…', continue: '正在继续…', skip: '正在跳过…', stop: '正在停止…' };
  status.textContent = message[action];
  submit.disabled = true;
  resume.disabled = true;
  for (const button of actions) button.disabled = true;
  try { render(await window.registration.run(action, action === 'submit' ? text.value : undefined)); }
  catch (error) {
    status.textContent = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
    resume.hidden = false;
    if (action === 'submit') chainPending = true;
  } finally {
    active = false;
    submit.disabled = chainPending;
    resume.disabled = false;
    for (const button of actions) button.disabled = false;
  }
}

entry.addEventListener('submit', event => { event.preventDefault(); if (text.value.trim()) void run('submit'); });
resume.addEventListener('click', () => { void run('resume'); });
for (const button of actions) button.addEventListener('click', () => { void run(button.dataset.action); });
void run('resume');
