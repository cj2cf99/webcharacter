// 仅用于预览：记录、错误与时间都是样例。
const params = new URLSearchParams(location.search);
const view = params.get('view') || 'page', v = params.get('v') || 'a';
document.documentElement.style.colorScheme = params.get('theme') || 'light';
const styles = view === 'popup' ? ['feiyue-surface', 'message-box'] : ['feiyue-surface'];
for (const href of [...styles.map(name => `/assets/desk/${name}.css`), '/desk.css']) {
  document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${href}">`);
}
const body = document.body;
const records = [
  {title: '发现一个好用的截图工具', note: '回来试一下能不能替换现在的截屏流程', left: 46, state: 'wait'},
  {title: '周末要看的 D1 迁移文章', note: '看看批量写入的限制', left: 5, state: 'wait'},
  {title: '桌面收纳的新点子', note: '找一种抽屉分隔办法', feedback: '已经试过，抽屉分隔板可行', left: 0, state: 'done', when: '11/25 21:08'},
  {title: '某个字体打包方案', note: '', left: 0, state: 'expired', when: '11/24 09:30'},
];
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
const titlebar = title => `<header class="fy-titlebar"><div class="fy-caption"><h1>${title}</h1></div><button class="fy-icon" aria-label="刷新" title="刷新">↻</button></header>`;

function card(record, index) {
  const tone = record.state === 'done' ? 'ok' : record.state === 'expired' ? 'info' : record.left <= 6 ? 'warn' : 'accent';
  const node = el('article', 'fy-card'); node.dataset.tone = tone; node.style.setProperty('--i', index);
  const head = el('div', 'fy-head');
  head.append(el('h2', '', record.title), el('span', 'fy-chip', record.state === 'done' ? '✓ 已反馈' : record.state === 'expired' ? '⌛ 已过期' : '✎ 待反馈'));
  node.append(head);
  if (record.note) node.append(el('p', 'cn-note fy-clamp', record.note));
  if (record.feedback) node.append(el('p', 'cn-feedback fy-clamp', '↳ ' + record.feedback));
  if (record.state !== 'wait') { node.append(el('div', 'fy-meta', record.when)); return node; }
  const time = el('div', 'cn-time'), bar = el('div', 'cn-bar'), fill = el('i');
  fill.style.width = Math.round(record.left / 48 * 100) + '%'; bar.append(fill); time.append(bar, el('span', 'fy-meta', `剩 ${record.left} 小时`));
  const actions = el('div', 'cn-actions'), write = el('button', '', '写反馈');
  actions.append(write); node.append(time, actions);
  write.onclick = () => {
    const form = el('form', 'cn-form'), area = el('textarea'), row = el('div', 'cn-actions'), count = el('span', 'fy-meta', '0 / 1000 · 只能提交一次');
    area.maxLength = 1000; area.required = true; area.placeholder = '处理结果'; area.setAttribute('aria-label', '反馈内容');
    area.oninput = () => { count.textContent = `${area.value.length} / 1000 · 只能提交一次`; };
    const cancel = el('button', '', '收起'); cancel.type = 'button'; cancel.onclick = () => { form.remove(); actions.hidden = false; };
    row.append(count, cancel, el('button', 'primary', '提交')); form.append(area, row); node.append(form); actions.hidden = true; area.focus();
    form.onsubmit = event => { event.preventDefault(); Object.assign(record, {state: 'done', feedback: area.value, when: '刚刚'}); draw(); };
  };
  return node;
}
let tab = 'wait', draw = () => {};

if (view === 'page') {
  document.documentElement.className = 'fy-panel';
  body.innerHTML = titlebar('云端提醒') + (v === 'b' ? '<nav class="fy-bar"><div class="fy-seg"><button data-tab="wait" data-icon="✎"><span>待反馈</span></button><button data-tab="end" data-icon="✓"><span>已结束</span></button></div></nav>' : '')
    + '<main class="fy-scroll"><div class="fy-list" id="list" style="padding:10px 12px"></div></main><footer class="fy-foot"><div class="fy-pager"><button disabled aria-label="较新一页" title="较新">‹</button><span>1 / 1</span><button disabled aria-label="较早一页" title="较早">›</button></div></footer>';
  draw = () => {
    const rows = v === 'b' ? records.filter(r => (r.state === 'wait') === (tab === 'wait')) : records;
    body.querySelector('#list').replaceChildren(...(rows.length ? rows.map(card) : [el('p', 'fy-empty', '这里没有记录')]));
    body.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  };
  body.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
  draw();
} else if (view === 'popup') {
  const three = records.slice(0, 3);
  body.innerHTML = `<main id="sheet" role="dialog"><header class="fy-titlebar fy-compact"><div class="fy-caption"><strong class="fy-caption-title">绯月</strong></div><span id="context">云端登记提醒</span><button id="close" aria-label="关闭">×</button></header>
    <section class="copy"><h1>有 3 条提醒等你看</h1><div id="detail"></div></section><footer id="actions"><button class="primary" type="button">全部确认</button></footer></main>`;
  const detail = body.querySelector('#detail');
  if (v === 'a') detail.textContent = three.map(r => '· ' + r.title).join('\n');
  else {
    const list = el('ul', 'cn-pop-list');
    list.append(...three.map((r, i) => { const li = el('li'); li.style.setProperty('--i', i); const text = el('span', '', r.title); text.append(el('small', '', r.note || '没有说明')); li.append(el('b', '', '🔖'), text); return li; }));
    detail.append(list);
  }
  const close = () => { body.querySelector('#sheet').innerHTML = '<section class="copy"><h1>✓ 已确认</h1><p id="detail">点按钮或关窗结果相同。刷新可重看。</p></section>'; };
  body.querySelector('#actions button').onclick = close; body.querySelector('#close').onclick = close;
} else if (view === 'pending') {
  document.documentElement.className = 'fy-panel';
  body.innerHTML = titlebar('本地复盘') + '<nav class="fy-bar"><div class="fy-seg"><button data-icon="💬"><span>对话</span></button><button data-icon="🔔"><span>提醒</span></button><button data-icon="✋" aria-pressed="true"><span>待确认</span></button></div></nav><main class="fy-scroll"><div class="fy-list" id="list" style="padding:10px 12px"></div></main>';
  const list = body.querySelector('#list'), box = el('section', 'fy-card'); box.dataset.tone = 'accent';
  const head = el('div', 'fy-head'); head.append(el('h2', '', '云端登记提醒'), el('span', 'cn-count', '2'));
  const items = el('ul', 'cn-note'); items.append(...records.slice(0, 2).map(r => el('li', '', r.title)));
  const actions = el('div', 'cn-actions'), all = el('button', 'primary', '全部确认'); actions.append(all); box.append(head, items, actions); list.append(box);
  all.onclick = () => list.replaceChildren(el('p', 'fy-empty', '没有待确认的事项'));
} else if (view === 'notice') {
  document.documentElement.className = 'fy-panel';
  body.innerHTML = titlebar('本地复盘') + '<nav class="fy-bar"><div class="fy-seg"><button data-icon="🔔" aria-pressed="true"><span>提醒</span></button></div></nav><main class="fy-scroll"><div class="fy-list" id="list" style="padding:10px 12px"></div></main>';
  const box = el('article', 'fy-card'); box.dataset.tone = 'danger';
  const head = el('div', 'fy-head'); head.append(el('span', 'fy-dot'), el('h2', '', '云端登记提醒 · 收尾失败'), el('time', 'fy-meta', '21:14'));
  box.append(head, el('p', 'cn-note', '发现一个好用的截图工具'),
    el('pre', 'cn-error', '事项提醒：连接超时，记录仍保留\n鱼与熊掌：HTTP 500 · D1_ERROR: database is locked'));
  const actions = el('div', 'cn-actions');
  for (const name of ['打开事项提醒 ↗', '打开鱼与熊掌 ↗']) actions.append(el('button', '', name));
  box.append(actions); body.querySelector('#list').append(box);
} else {
  document.documentElement.className = 'fy-panel';
  body.style.cssText = 'height:auto;overflow:auto';
  const picks = el('div', 'cn-picks');
  for (const [key, icon, name] of [['甲', '🔖', '云端提醒'], ['乙', '📮', '登记回访'], ['丙', '🪶', '待反馈']]) {
    const figure = el('figure'), menu = el('div', 'menu-mock');
    for (const [i, label, mine] of [['💬', '问绯月'], ['✋', '待确认（2）'], [icon, name, true], ['📋', '今日任务'], ['🗂', '本地复盘']]) {
      const item = el('button', 'item' + (mine ? ' mine' : '')); item.append(el('span', '', i), el('span', '', label)); menu.append(item);
    }
    figure.append(el('figcaption', '', key), menu); picks.append(figure);
  }
  body.append(picks);
}
