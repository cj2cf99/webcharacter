const summaries = [
  {id:'rain', kind:'pending', title:'下次一起听雨', source:'手记 · 11/21 第 4 篇', at:'2026-11-22 16:42', days:['2026-11-21','2026-11-22'], state:'等你回', latest:'绯月：你想听童话，还是想听我念你喜欢的那本书？'},
  {id:'tea', kind:'ongoing', title:'给窗台留个读书角', source:'旧对话 · 周末收拾房间', at:'2026-11-22 15:18', days:['2026-11-22'], state:'等绯月回', latest:'你：可以挪到窗台，下午不用开灯。'},
  {id:'walk', title:'上次散步发现的小路', source:'散步随记 · 11/20', at:'2026-11-22 13:05', days:['2026-11-22'], state:'已结束', latest:'绯月：记住啦，下次陪你走。你先忙，我去玩啦。'},
  {id:'older', title:'那本还没读完的书', source:'来源未保存', at:'2026-11-22 11:04', days:['2026-11-22'], state:'已结束', latest:'绯月：那就等你看完，再跟我讲结局。'}
];
const details = {
  rain:{origin:'你提到雨天适合窝在床边看书，她想问下次要不要一起听雨。', turns:[
    {speaker:'绯月', at:'2026-11-21 22:14', text:'你手记里说，听着雨声看书特别安静。下次下雨，我们要不要一起听？'},
    {speaker:'你', at:'2026-11-22 16:41', text:'当然好，我最喜欢听你说话了。'},
    {speaker:'绯月', at:'2026-11-22 16:42', text:'那我要提前挑个故事。你想听童话，还是想听我念你喜欢的那本书？'},
  ]},
  tea:{origin:'上一次聊天提到了房间里少一个安静的阅读位置。', turns:[
    {speaker:'你', at:'2026-11-22 15:15', text:'想给自己留个读书角。'},
    {speaker:'绯月', at:'2026-11-22 15:16', text:'给你留个随手能翻书的地方怎么样？靠窗还是靠床？'},
    {speaker:'你', at:'2026-11-22 15:18', text:'可以挪到窗台，下午不用开灯。'},
  ]},
  walk:{origin:'你在随记里提过河边那段小路，她想知道从哪里拐进去。', turns:[
    {speaker:'绯月', at:'2026-11-22 13:02', text:'你说的那条小路，要从桥底下拐进去吗？'},
    {speaker:'你', at:'2026-11-22 13:04', text:'对，过了第二个路灯就能看到。'},
    {speaker:'绯月', at:'2026-11-22 13:05', text:'记住啦，下次陪你走。你先忙，我去玩啦。'},
  ]},
  older:{origin:'这条旧记录只有已保存的发言。', turns:[
    {speaker:'你', at:'2026-11-22 11:03', text:'还有最后两章。'},
    {speaker:'绯月', at:'2026-11-22 11:04', text:'那就等你看完，再跟我讲结局。'},
  ]}
};
const sources = {
  rain:['11 月 21 日 · 第 4 篇手记','晚间手记 · 22:03 JST','外面下雨了。看了几页书，窗边的雨声很安静。想到下次也许可以和绯月一起听。'],
  tea:['周末收拾房间','旧对话 · 11/21 18:10 JST','你：收拾完房间想留个读书的地方。\n绯月：那等你空下来，我们挑一个舒服的角落。'],
  walk:['11 月 20 日 · 散步随记','随记 · 17:35 JST','今天在河边发现一条小路，入口不太显眼。']
};
const tones = {'等你回':'accent','等绯月回':'info','已结束':'ok'};
const byId = id => document.getElementById(id);
const tabs = document.querySelectorAll('[data-view]');
const loaded = new Set();
const openedSources = new Set();
const delay = () => new Promise(resolve => setTimeout(resolve, 210));
let view = 'pending';
let selected = null;
let chatThread = null;
let request = 0;
let mockMinute = 45;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action) {
  const node = element('button', text);
  node.type = 'button';
  node.onclick = action;
  return node;
}
function badge(state) {
  const node = element('span', state, 'fy-chip');
  node.dataset.tone = tones[state];
  return node;
}
function loading(text) {
  const node = element('p', text, 'preview-loading');
  node.setAttribute('role', 'status');
  const dot = element('span', '', 'fy-dot');
  dot.setAttribute('aria-hidden', 'true');
  node.prepend(dot);
  return node;
}
function visibleThreads(category = view) {
  return summaries.filter(thread => category === 'history'
    ? thread.days.includes(byId('day').value)
    : thread.kind === category && thread.state !== '已结束');
}
function renderList() {
  const rows = visibleThreads().sort((a,b) => b.at.localeCompare(a.at));
  byId('pendingCount').textContent = visibleThreads('pending').length;
  byId('ongoingCount').textContent = visibleThreads('ongoing').length;
  byId('listSummary').textContent = view === 'pending' ? `${rows.length} 条待续` : `${rows.length} 条对话`;
  byId('dateFilter').hidden = view !== 'history';
  const cards = rows.map(thread => {
    const card = button('', () => openThread(thread, true));
    card.className = 'fy-card';
    card.dataset.thread = thread.id;
    card.dataset.tone = tones[thread.state];
    if (selected?.id === thread.id) card.setAttribute('aria-current', 'true');
    const head = element('span', '', 'fy-head');
    head.append(element('strong', thread.title), badge(thread.state));
    const [latestDay, time] = thread.at.split(' ');
    const crossDay = view === 'history' && latestDay !== byId('day').value;
    const stamp = crossDay ? `最新 ${latestDay.slice(5).replace('-', '/')} ${time}` : time;
    card.append(head, element('span', `${thread.source} · ${stamp}`, 'fy-meta card-source'), element('span', thread.latest, 'card-preview'));
    return card;
  });
  byId('threads').replaceChildren(...(cards.length ? cards : [element('p', view === 'history' ? '这天没有对话。' : '暂无开放对话。', 'fy-empty')]));
}
function turnView({speaker, at, text, note}) {
  const item = element('li', '', 'turn');
  item.dataset.role = speaker === '你' ? 'you' : 'feiyue';
  item.append(element('strong', speaker), element('time', at.slice(5), 'fy-meta'));
  if (note) item.append(element('span', ' · 留言', 'fy-meta'));
  item.append(element('p', text));
  return item;
}
function detailActions(thread, receipt) {
  const actions = element('div', '', 'detail-actions');
  const buttons = element('div', '', 'detail-buttons');
  const form = element('form', '', 'note-form');
  form.hidden = true;
  const input = element('input');
  input.placeholder = '留一句话…';
  input.setAttribute('aria-label', '给绯月留一句话');
  input.required = true;
  input.maxLength = 180;
  const send = element('button', '发送留言');
  send.type = 'submit';
  form.append(input, send, element('p', '发完可以离开。下次打开这条线查看后续。', 'fy-meta'));
  const quick = button('简单回复', () => {
    form.hidden = !form.hidden;
    quick.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) input.focus();
  });
  quick.setAttribute('aria-expanded', 'false');
  const resume = button('继续聊天', () => openChat(thread));
  resume.className = 'primary';
  buttons.append(quick, resume);
  form.onsubmit = event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendMessage(thread, text, true);
    renderList();
    renderDetail(thread, '已留言');
    document.querySelector('.detail-buttons button')?.focus();
  };
  const feedback = element('p', receipt, 'fy-meta note-receipt');
  feedback.setAttribute('role', 'status');
  actions.append(buttons, form, feedback);
  return actions;
}
function renderDetail(thread, receipt = '') {
  const data = details[thread.id];
  const head = element('div', '', 'fy-head');
  const title = element('h2', thread.title);
  title.id = 'threadTitle';
  title.tabIndex = -1;
  head.append(title, badge(thread.state));
  const origin = element('div', '', 'source-box');
  const sourceTitle = element('div', '', 'fy-head');
  sourceTitle.append(element('strong', thread.source));
  if (sources[thread.id]) sourceTitle.append(button('查看来源', () => openSource(thread)));
  origin.append(sourceTitle, element('p', data.origin));
  const actions = thread.state === '已结束' ? [] : [detailActions(thread, receipt)];
  const messages = element('ol', '', 'messages');
  messages.append(...data.turns.map(turnView));
  byId('detailContent').replaceChildren(head, origin, messages, ...actions);
}
async function openThread(thread, showOnNarrow = false) {
  const token = ++request;
  selected = thread;
  byId('layout').dataset.detail = String(Boolean(thread && showOnNarrow));
  renderList();
  byId('detail').setAttribute('aria-busy', 'false');
  if (!thread) {
    byId('detailContent').replaceChildren(element('p', '选择一条对话查看来龙去脉。', 'fy-empty'));
    return;
  }
  if (!loaded.has(thread.id)) {
    byId('detail').setAttribute('aria-busy', 'true');
    byId('detailContent').replaceChildren(loading('正在读取这条对话…'));
    await delay();
    if (token !== request) return;
    loaded.add(thread.id);
    byId('detail').setAttribute('aria-busy', 'false');
  }
  renderDetail(thread);
  byId('detail').scrollTop = 0;
  if (showOnNarrow) byId('threadTitle').focus({preventScroll:true});
}
async function openSource(thread) {
  const dialog = byId('source');
  const [title, meta, body] = sources[thread.id];
  byId('sourceTitle').textContent = title;
  byId('sourceMeta').textContent = meta;
  byId('sourceContent').replaceChildren(loading('正在读取来源…'));
  if (!dialog.open) dialog.showModal();
  const token = String(Number(dialog.dataset.request ?? 0) + 1);
  dialog.dataset.request = token;
  await delay();
  if (!dialog.open || dialog.dataset.request !== token) return;
  if (thread.id === 'walk' && !openedSources.has(thread.id)) {
    openedSources.add(thread.id);
    byId('sourceContent').replaceChildren(element('p','来源暂时无法读取。'), button('重试', () => openSource(thread)));
    return;
  }
  byId('sourceContent').replaceChildren(element('blockquote', body));
}
function openChat(thread) {
  chatThread = thread;
  startReply(thread);
  byId('review').hidden = true;
  byId('chat').hidden = false;
  renderChat(thread);
  byId('reply').focus();
}
function renderChat(thread) {
  byId('chatTitle').textContent = thread.title;
  const recent = details[thread.id].turns.slice(-6);
  const messages = byId('chatMessages');
  messages.replaceChildren(...recent.map(turnView));
  messages.scrollTop = messages.scrollHeight;
}
function closeChat() {
  const thread = chatThread;
  chatThread = null;
  byId('chat').hidden = true;
  byId('chatForm').reset();
  byId('review').hidden = false;
  openThread(thread, true);
}
function appendTurn(thread, speaker, text, note, repliesTo = []) {
  const stamp = new Date(Date.UTC(2026, 10, 22, 16, mockMinute++)).toISOString();
  const day = stamp.slice(0,10);
  const time = stamp.slice(11,16);
  const at = day + ' ' + time;
  const turns = details[thread.id].turns;
  const index = turns.length;
  turns.push({speaker, at, text, note, repliesTo});
  thread.latest = `${speaker}：${text}`;
  thread.at = at;
  if (!thread.days.includes(day)) thread.days.push(day);
  return index;
}

function startReply(thread) {
  if (thread.responding || !thread.pending?.length) return;
  clearTimeout(thread.wakeup);
  thread.wakeup = null;
  const group = thread.pending.splice(0);
  thread.responding = true;
  // 定时器模拟一次模型调用。开工后新发言留给下一轮。
  setTimeout(() => {
    const reply = group.length > 1
      ? `我把你刚说的 ${group.length} 句放在一起看啦。`
      : thread.id === 'rain' ? '我记下啦。等下雨了，再一起挑个故事吧。' : '我记下啦。下次一起看看那个角落。';
    const byNote = group.every(index => details[thread.id].turns[index].note);
    appendTurn(thread, '绯月', reply, byNote, group);
    thread.responding = false;
    thread.state = thread.pending.length ? '等绯月回' : '等你回';
    if (chatThread === thread) renderChat(thread);
    startReply(thread);
  }, 500);
}

function sendMessage(thread, text, note = false) {
  const index = appendTurn(thread, '你', text, note);
  thread.state = '等绯月回';
  (thread.pending ??= []).push(index);
  if (!note) startReply(thread);
  else if (!thread.responding && !thread.wakeup) thread.wakeup = setTimeout(() => startReply(thread), 4000);
}
byId('chatHistory').onclick = () => {
  byId('day').value = chatThread.at.slice(0,10);
  document.querySelector('[data-view="history"]').click();
  closeChat();
};
byId('close').onclick = closeChat;
byId('chatForm').onsubmit = event => {
  event.preventDefault();
  const text = byId('reply').value.trim();
  if (!text || !chatThread) return;
  sendMessage(chatThread, text);
  byId('chatForm').reset();
  renderChat(chatThread);
};
for (const tab of tabs) tab.onclick = () => {
  view = tab.dataset.view;
  for (const item of tabs) item.setAttribute('aria-pressed', String(item === tab));
  const rows = visibleThreads();
  openThread(rows.includes(selected) ? selected : rows[0]);
};
byId('day').onchange = () => openThread(visibleThreads()[0]);
byId('back').onclick = () => {
  byId('layout').dataset.detail = 'false';
  byId('threads').querySelector('[aria-current]')?.focus();
};
byId('theme').onclick = () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  byId('theme').textContent = root.dataset.theme === 'dark' ? '切换浅色' : '切换深色';
};
const readingThread = summaries.find(thread => thread.id === 'tea');
readingThread.pending = [details.tea.turns.length - 1];
readingThread.wakeup = setTimeout(() => startReply(readingThread), 4000);
openThread(summaries[0]);
