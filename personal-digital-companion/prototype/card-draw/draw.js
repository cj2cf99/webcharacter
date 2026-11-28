// 抽卡原型：全部数据只在内存中，不发任何网络请求，图片是本地生成的示意画。
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PAGE = 20, UNDO = 5000, PRICE = {draw: .006, hd: .4}; // 示意价
const jst = t => new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(t);

// 示意画：由种子决定配色与布局
function art(seed, hd) {
  const h = (seed * 47) % 360, x = 90 + (seed * 29) % 220, k = (seed * 13) % 60;
  const stars = Array.from({length: hd ? 40 : 10}, (_, i) => `<circle cx="${(seed * 31 + i * 97) % 400}" cy="${(seed * 17 + i * 53) % 210}" r="${hd ? 1.4 : 2.6}" fill="#fff" opacity=".7"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop stop-color="hsl(${h},55%,24%)"/><stop offset="1" stop-color="hsl(${(h + 70) % 360},75%,70%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#s)"/>${stars}<circle cx="${400 - x}" cy="${90 + k}" r="${34 + k / 3}" fill="#fff3d0"/><path d="M0 300Q110 ${230 + k} 220 305T400 285V400H0Z" fill="hsl(${h},35%,22%)"/><g transform="translate(${x},0)"><path d="M0 195Q-62 262 -70 400H70Q62 262 0 195Z" fill="hsl(${(h + 200) % 360},50%,38%)"/><circle cy="170" r="40" fill="#f6d9c8"/><path d="M-48 188Q-56 112 0 115Q56 112 48 188Q30 140 0 142Q-30 140 -48 188Z" fill="hsl(${(h + 320) % 360},40%,${20 + k / 2}%)"/>${hd ? '<circle cx="-14" cy="172" r="4" fill="#432"/><circle cx="14" cy="172" r="4" fill="#432"/><path d="M-10 190q10 8 20 0" stroke="#a45" stroke-width="3" fill="none"/><path d="M-28 262L0 232L28 262" stroke="#fff8" stroke-width="3" fill="none"/>' : ''}</g></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

let serial = 0;
const makeCard = t => ({id: ++serial, seed: serial * 7 + (Math.random() * 90 | 0), t, sel: false, st: 'none', until: 0, order: 0});
function samples() {
  const now = Date.now();
  return {
    cards: Array.from({length: 47}, (_, i) => makeCard(now - (46 - i) * 60000)).reverse(), // 新的在前，编号大
    hd: [3, 11, 25].map((seed, i) => ({seed, t: now - (i + 1) * 3600000})),
  };
}
const S = {...samples(), on: false, key: '', saved: false, busy: null, nextAt: 0, now: 0, all: 0, paused: '', page: {pool: 0, hd: 0}, tab: 'setup', failNext: '', loadFail: false, top: 0};
S.top = serial;
S.cards[2].sel = true; S.cards[2].st = 'done';

const cycle = () => $('#fast').checked ? 6000 : 60000;
const queued = () => S.cards.filter(c => c.st === 'queued').sort((a, b) => a.order - b.order);
const nextJob = () => S.paused ? null : queued().length ? 'hd' : S.on ? 'draw' : null;

/* ---------- 配置 ---------- */
// 三个图片槽的值是缩小后的图片本身，提示词是文字
const pics = {who: '', wear: '', act: ''};
const values = () => ({...pics, free: $('.slot textarea').value.trim()});
function drawSetup() {
  const v = values();
  for (const slot of $$('.slot')) {
    const k = slot.dataset.slot, chip = slot.querySelector('em');
    const [text, tone] = v[k] ? ['📌 固定', 'accent'] : k === 'free' ? ['可空', 'muted'] : v.free ? ['🕊 模型发挥', 'muted'] : ['🎲 随机', 'info'];
    chip.textContent = text; chip.dataset.tone = slot.dataset.tone = tone;
  }
}
let saveTimer, fails = 0; // fails：连续失败次数
function remember() {
  $('#saved').classList.remove('on');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => $('#saved').classList.add('on'), 700);
}
$('.slot textarea').addEventListener('input', () => { drawSetup(); remember(); });

/* ---------- 参考图 ---------- */
const MAX_SIDE = 1024; // 发送前缩到长边 1024，少花输入费用
function setPic(slot, url) {
  pics[slot.dataset.slot] = url;
  const img = slot.querySelector('img');
  img.hidden = !url;
  if (url) img.src = url;
  slot.querySelector('.hint').hidden = !!url;
  slot.querySelector('.clear').hidden = !url;
  drawSetup(); remember();
}
async function loadPic(slot, file) {
  if (!file) return;
  const frame = slot.querySelector('.frame');
  frame.classList.remove('bad'); frame.classList.add('loading');
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Error('type');
    const bmp = await createImageBitmap(file), k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    setPic(slot, canvas.toDataURL('image/png'));
  } catch { // 原来的图保留，提示后可重新选
    drawSetup();
    void frame.offsetWidth; frame.classList.add('bad');
    const chip = slot.querySelector('em'); chip.textContent = '✕ 读不了'; chip.dataset.tone = 'danger';
  } finally { frame.classList.remove('loading'); }
}
let hovered = null;
for (const slot of $$('.pic')) {
  const input = slot.querySelector('input');
  slot.querySelector('.drop').onclick = () => input.click();
  input.onchange = () => { loadPic(slot, input.files[0]); input.value = ''; };
  slot.querySelector('.clear').onclick = () => setPic(slot, '');
  slot.onmouseenter = () => hovered = slot; slot.onmouseleave = () => hovered = null;
  slot.ondragover = () => slot.classList.add('over');
  slot.ondragleave = e => { if (!slot.contains(e.relatedTarget)) slot.classList.remove('over'); };
  slot.ondrop = e => { slot.classList.remove('over'); loadPic(slot, e.dataTransfer.files[0]); };
}
// 允许拖放，同时拖偏了不让浏览器直接打开图片
for (const type of ['dragover', 'drop']) addEventListener(type, e => e.preventDefault());
// 粘贴到：当前聚焦的槽 → 鼠标所在的槽 → 第一个空槽
addEventListener('paste', e => {
  const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
  if (!file || S.tab !== 'setup' || $('dialog[open]')) return;
  const slot = document.activeElement.closest('.pic') || hovered || $$('.pic').find(s => !pics[s.dataset.slot]);
  if (slot) { e.preventDefault(); loadPic(slot, file); }
});

/* ---------- 网格 ---------- */
const BADGE = {queued: ['⏳ 排队', 'warn'], running: ['✨ 生成中', 'info'], done: ['✓ 已高清', 'ok'], fail: ['✕ 失败', 'danger'], wait: ['可撤回', 'warn']};
function cardEl(c, i) {
  const li = document.createElement('li'), [label, tone] = BADGE[c.st] || [];
  li.className = `card${c.sel ? ' sel' : ''}${c.st === 'running' ? ' running' : ''}`;
  li.dataset.id = c.id; li.style.setProperty('--i', i);
  li.dataset.tone = tone || (c.sel ? 'accent' : 'muted');
  li.innerHTML = `<img loading="lazy" alt="抽卡图 ${c.id}" src="${art(c.seed)}"><label class="pick"><input type="checkbox" aria-label="勾选高清化"${c.sel ? ' checked' : ''}${c.st === 'running' ? ' disabled' : ''}></label>${label ? `<span class="badge">${label}</span>` : ''}${c.st === 'wait' ? '<span class="count"></span>' : ''}${c.st === 'fail' ? '<button class="retry">↻ 重试</button>' : ''}<time>${jst(c.t)}</time>`;
  return li;
}
function pager(el, key, total, redraw) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  S.page[key] = Math.min(S.page[key], pages - 1);
  el.hidden = pages < 2;
  el.innerHTML = `<button aria-label="较新">‹</button><span>${S.page[key] + 1} / ${pages}</span><button aria-label="较早">›</button>`;
  const [a, b] = el.querySelectorAll('button');
  a.disabled = !S.page[key]; b.disabled = S.page[key] >= pages - 1;
  a.onclick = () => { S.page[key]--; redraw(true); }; b.onclick = () => { S.page[key]++; redraw(true); };
}
const empty = text => { const li = document.createElement('li'); li.className = 'fy-empty'; li.textContent = text; return li; };
let loadTimer;
function fill(box, items, make, none, loading) {
  if (!loading && box.dataset.busy) return; // 加载中或加载失败时，后台刷新不覆盖
  clearTimeout(loadTimer);
  box.classList.toggle('still', !loading); // 状态刷新时不重播入场动画
  const paint = () => { delete box.dataset.busy; box.replaceChildren(...(items.length ? items.map(make) : [empty(none)])); };
  if (!loading) return paint();
  box.dataset.busy = '1';
  box.replaceChildren(...items.map(() => { const li = document.createElement('li'); li.className = 'skeleton'; return li; }));
  loadTimer = setTimeout(() => {
    if (!S.loadFail) return paint();
    S.loadFail = false;
    const li = empty('加载失败'), retry = document.createElement('button');
    retry.textContent = '↻ 重试'; retry.onclick = () => (S.tab === 'hd' ? drawHd : drawPool)(true);
    li.append(retry); box.replaceChildren(li);
  }, 350);
}
function drawPool(loading) {
  // 翻看期间新抽到的卡不插进当前页，避免卡片挪位造成误勾
  const list = S.cards.filter(c => c.id <= S.top);
  pager($('#poolPager'), 'pool', list.length, drawPool);
  fill($('#pool'), list.slice(S.page.pool * PAGE, (S.page.pool + 1) * PAGE), cardEl, '还没有卡，打开开关抽起来', loading);
  if (loading) $('#main').scrollTop = 0;
}
function drawHd(loading) {
  pager($('#hdPager'), 'hd', S.hd.length, drawHd);
  fill($('#hdGrid'), S.hd.slice(S.page.hd * PAGE, (S.page.hd + 1) * PAGE), (r, i) => {
    const li = document.createElement('li'); li.className = 'card'; li.style.setProperty('--i', i); li.dataset.tone = 'accent';
    li.innerHTML = `<img loading="lazy" alt="高清图" src="${art(r.seed, true)}"><time>${jst(r.t)}</time>`;
    return li;
  }, '还没有高清图，去“挑卡”勾几张', loading);
}
const redraw = () => { if (S.tab === 'pool') drawPool(); if (S.tab === 'hd') drawHd(); counts(); };
function counts() {
  $('#poolCount').textContent = S.cards.length; $('#hdCount').textContent = S.hd.length;
  const n = S.cards.filter(c => !c.sel).length;
  $('#cleanNum').textContent = n; $('#clean').disabled = !n;
  const added = S.cards.filter(c => c.id > S.top).length;
  $('#fresh').hidden = !added; $('#fresh').textContent = `▲ ${added} 张新卡`;
}

function showNewest() { S.top = serial; S.page.pool = 0; }
$('#fresh').onclick = () => { showNewest(); drawPool(true); counts(); };

// 勾选与撤销：网格和大图共用
function pick(c, on) {
  c.sel = on;
  if (on && c.st === 'none') { c.st = 'wait'; c.until = Date.now() + UNDO; if (!S.key) askKey(); }
  if (!on && c.st !== 'done') c.st = 'none';
  redraw();
}
const cardOf = el => S.cards.find(x => x.id === +el.closest('.card').dataset.id);
$('#pool').addEventListener('change', e => pick(cardOf(e.target), e.target.checked));
$('#pool').addEventListener('click', e => {
  if (e.target.matches('.retry')) { const c = cardOf(e.target); c.st = 'queued'; c.order = Date.now(); resume(); if (!S.key) askKey(); redraw(); }
  if (e.target.tagName === 'IMG') { const c = cardOf(e.target); view(e.target.src, jst(c.t), c); }
});
$('#hdGrid').addEventListener('click', e => { if (e.target.tagName === 'IMG') view(e.target.src, e.target.nextElementSibling.textContent); });
let viewing = null;
function view(src, text, card) {
  viewing = card || null; $('#viewer img').src = src; $('#viewer p').textContent = text; paintPick(); $('#viewer').showModal();
}
function paintPick() {
  const b = $('#viewPick'); b.hidden = !viewing; if (!viewing) return;
  b.textContent = viewing.sel ? '✓ 已勾选' : '✨ 勾选高清';
  b.setAttribute('aria-pressed', viewing.sel); b.disabled = viewing.st === 'running';
}
$('#viewPick').onclick = () => { pick(viewing, !viewing.sel); paintPick(); };

$('#clean').onclick = () => {
  const ids = new Set(S.cards.filter(c => !c.sel).map(c => c.id)); // 只清确认时清点到的这批
  $('#confirmNum').textContent = ids.size;
  const box = $('#confirmBox'); box.returnValue = ''; box.showModal();
  box.onclose = () => {
    if (box.returnValue !== 'ok') return;
    const gone = c => ids.has(c.id) && !c.sel;
    for (const li of $$('#pool .card')) if (S.cards.some(c => c.id === +li.dataset.id && gone(c))) li.classList.add('gone');
    setTimeout(() => { S.cards = S.cards.filter(c => !gone(c)); showNewest(); redraw(); }, 450);
  };
};

/* ---------- 密钥与开关 ---------- */
function askKey() {
  const box = $('#keyBox'); if (box.open) return;
  box.returnValue = ''; $('#keyInput').value = ''; box.showModal();
  box.onclose = () => {
    if (box.returnValue === 'ok' && $('#keyInput').value.trim()) S.key = 'demo';
    else S.on = false; // 已勾选的保留，填好密钥后照常执行
    $('#keyInput').value = ''; redraw();
  };
}
function clearPause() { S.paused = ''; fails = 0; $('#banner').hidden = true; }
// 继续：恢复暂停前的抽卡开关状态
function resume() { S.on = S.on || !!S.wasOn; S.wasOn = false; clearPause(); }
$('#power').onclick = () => {
  S.on = !S.on; S.wasOn = false;
  if (S.on) { clearPause(); if (!S.key) askKey(); }
};
$('#resume').onclick = () => { resume(); if (!S.key) askKey(); };

/* ---------- 每轮一个请求 ---------- */
function stop(reason) {
  S.wasOn = S.on || S.wasOn; S.paused = reason; S.on = false;
  $('#bannerText').textContent = `⛔ ${reason}，已暂停`; $('#banner').hidden = false;
}
function dropKey() { S.key = ''; S.saved = false; stop('密钥无效'); }
function run(job) {
  const card = job === 'hd' ? queued()[0] : null;
  if (card) card.st = 'running';
  S.busy = job; S.nextAt = Date.now() + cycle(); redraw();
  setTimeout(() => {
    S.busy = null;
    const fail = S.failNext; S.failNext = '';
    if (fail) {
      if (card) card.st = 'fail';
      if (fail === 'quota') stop('额度不足');
      else if (fail === 'auth') dropKey();
      else if (++fails >= 3) stop('连续失败 3 次');
    } else {
      fails = 0; S.saved = true;
      S.now += PRICE[job]; S.all += PRICE[job];
      bump($('.money'));
      if (card) { card.st = 'done'; S.hd.unshift({seed: card.seed, t: Date.now()}); bump($('[data-tab=hd]')); }
      else {
        S.cards.unshift(makeCard(Date.now()));
        bump($('[data-tab=pool]'));
      }
    }
    redraw();
  }, job === 'hd' ? 2600 : 1400);
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function tick() {
  const now = Date.now();
  let changed = false;
  for (const c of S.cards) if (c.st === 'wait') {
    const left = c.until - now;
    if (left <= 0) { c.st = 'queued'; c.order = c.until; changed = true; }
    else {
      const el = $(`#pool .card[data-id="${c.id}"] .count`);
      if (el) { el.textContent = Math.max(0, Math.ceil(left / 1000)); el.style.setProperty('--p', Math.max(0, left / UNDO * 100)); }
    }
  }
  if (changed) redraw();
  if ($('#viewer').open) paintPick();
  const job = S.key ? nextJob() : null;
  if (job && !S.busy && now >= S.nextAt) run(job);
  const ring = $('#ring'), left = Math.max(0, S.nextAt - now), show = S.busy || job;
  ring.classList.toggle('busy', !!S.busy);
  ring.dataset.job = S.busy || job || ''; // 金色 = 本轮或下轮做高清
  ring.title = S.busy ? (S.busy === 'hd' ? '高清重绘中' : '抽卡中') : job === 'hd' ? '下一轮：高清' : job ? '下一轮：抽卡' : '';
  ring.style.setProperty('--p', S.busy ? 28 : show ? 100 - left / cycle() * 100 : 0);
  $('#ringText').textContent = S.busy ? (S.busy === 'hd' ? '✨' : '🎴') : show ? Math.ceil(left / 1000) : '—';
  $('#stateText').textContent = S.paused ? '已暂停' : !S.key && (S.on || queued().length) ? '等待密钥' : S.on ? '自动抽卡中' : queued().length || S.busy === 'hd' ? '只做高清' : '已停止';
  $('#power').setAttribute('aria-checked', S.on);
  $('#queueNum').textContent = queued().length + (S.busy === 'hd' ? 1 : 0);
  $('#costNow').textContent = '$' + S.now.toFixed(3); $('#costAll').textContent = '/ $' + S.all.toFixed(3);
  const chip = $('#keyChip');
  chip.textContent = S.saved ? '🔐 密钥已保存' : S.key ? '🔑 待首次验证' : '🔑 未填密钥';
  chip.dataset.ok = S.saved;
}
$('#keyChip').onclick = () => { if (!S.key) askKey(); };

/* ---------- 页签与演示控制 ---------- */
$$('[data-tab]').forEach(b => b.onclick = () => {
  S.tab = b.dataset.tab;
  $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  $$('[data-view]').forEach(v => v.hidden = v.dataset.view !== S.tab);
  $('#foot').hidden = S.tab !== 'pool'; $('#saved').hidden = S.tab !== 'setup';
  $('#main').scrollTop = 0;
  if (S.tab === 'pool') { showNewest(); drawPool(true); }
  if (S.tab === 'hd') drawHd(true);
  counts();
});
function simulate(type) {
  if (S.key && nextJob()) { S.failNext = type; S.nextAt = 0; }
  else if (type === 'auth') dropKey();
  else stop('额度不足');
}
$('#simPics').onclick = () => {
  const fill = !Object.values(pics).some(Boolean);
  $$('.pic').forEach((s, i) => setPic(s, fill ? art(5 + i * 9, true) : ''));
};
$('#simQuota').onclick = () => simulate('quota');
$('#simAuth').onclick = () => simulate('auth');
$('#simFail').onclick = () => { S.failNext = 'one'; S.nextAt = 0; };
$('#simLoad').onclick = () => { S.loadFail = true; };
$('#simEmpty').onclick = () => { Object.assign(S, S.cards.length || S.hd.length ? {cards: [], hd: []} : samples()); showNewest(); redraw(); };
$('#fast').onchange = () => { S.nextAt = Math.min(S.nextAt, Date.now() + cycle()); };
$('#theme').onclick = () => {
  const r = document.documentElement, dark = r.style.colorScheme ? r.style.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.style.colorScheme = dark ? 'light' : 'dark';
  $$('header.fy-titlebar').forEach(h => h.style.colorScheme = r.style.colorScheme);
};
drawSetup(); counts(); tick(); setInterval(tick, 200);
