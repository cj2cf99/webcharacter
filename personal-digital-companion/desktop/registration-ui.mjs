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
  'hu-shi.food.create': '吃喝记录', 'hu-shi.exercise.create': '运动记录', 'hu-shi.event.create': '撸管记录',
  'records.create': '随手记', 'diaries.create': '日记', 'reminders.create': '提醒',
};
const nodeStatus = { PENDING: '待登记', RUNNING: '待确认', COMPLETED: '✓ 已登记', FAILED: '登记失败',
  CANCELLED: '已取消', SKIPPED: '已跳过' };
const summary = { needs_input: '本次未登记', stopped: '已停止后续登记', waiting: '等待确认登记结果',
  needs_decision: '请处理失败的项目', blocked: '当前没有可登记的项目', paused: '已暂停，可以恢复原链' };
const tokyoTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const receiptCharacters = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
let active = false;
let chainPending = false;
window.addEventListener('companion-page-update',event=>{
  if(active||chainPending||text.value||receipts.childElementCount||pending.childElementCount)event.preventDefault();
});

function element(tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

function setList(list, rows) {
  list.replaceChildren(...rows);
  list.hidden = rows.length === 0;
}

const labelFor = type => labels[type] || '登记';
const plainText = value => typeof value === 'string' ? value.trim() : '';

function setReceiptText(card, body) {
  if (!body) return;
  const excerpt = body.replace(/\s+/gu, ' ');
  const characters = Array.from(receiptCharacters.segment(excerpt), ({ segment }) => segment);
  const preview = characters.length <= 20 ? excerpt
    : characters.slice(0, 10).join('') + '…' + characters.slice(-10).join('');
  card.append(element('p', 'receipt-text', preview));
}

function receiptCard({ current_task: task, skipped }) {
  const state = skipped ? 'SKIPPED' : task.status;
  const { title, body, content, reflection, deadline } = task.params ?? {};
  const card = element('li', 'receipt', '');
  card.dataset.state = state;
  const header = element('div', 'receipt-header', '');
  header.append(element('span', 'receipt-kind', labelFor(task.type)),
    element('span', 'receipt-state', nodeStatus[state] || '待确认'));
  card.append(header);
  if (plainText(title)) card.append(element('p', 'receipt-title', title.trim()));
  const description = [plainText(body) || plainText(content), plainText(reflection) ? '感想：' + reflection.trim() : '']
    .filter(Boolean).join('\n');
  setReceiptText(card, description);
  if (task.type === 'reminders.create' && /^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    card.append(element('p', 'receipt-meta', `到期 ${deadline} · JST`));
  }
  const timestamp = task.result?.created_at;
  if (state === 'COMPLETED' && Number.isSafeInteger(timestamp) && Number.isFinite(new Date(timestamp).getTime())) {
    card.append(element('p', 'receipt-meta', `${tokyoTime.format(timestamp)} · JST`));
  }
  return card;
}

function statusMessage(status, nodes, pendingCount) {
  const registered = nodes.filter(node => !node.skipped && node.current_task.status === 'COMPLETED').length;
  const skipped = nodes.filter(node => node.skipped).length;
  return [summary[status], registered && `已登记 ${registered} 项`, skipped && `已跳过 ${skipped} 项`,
    pendingCount && `${pendingCount} 项待补充`].filter(Boolean).join(' · ');
}

function render(result) {
  const chain = result?.chain;
  const nodes = chain?.nodes || [];
  const questions = (result?.pending || []).map(item => `${labelFor(item.type)}：${item.question}`);
  chainPending = chain?.status === 'ACTIVE';
  status.textContent = statusMessage(result?.status, nodes, questions.length);
  const needsDecision = result?.status === 'needs_decision';
  decisions.hidden = !chainPending;
  for (const button of actions) button.hidden = !needsDecision && button.dataset.action !== 'stop';
  resume.hidden = !chainPending;
  setList(receipts, nodes.map(receiptCard));
  if (questions.length && chain) questions.push('补充时只提交仍待登记的事项。');
  setList(pending, questions.map(question => element('li', '', question)));
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
