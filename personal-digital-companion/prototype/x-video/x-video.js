// X视频下载与管理简化版原型（纯本地内存演示；分离「登记下载小窗」与「视频管理窗口」）
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const PAGE_SIZE = 8;
const MAX_CONCURRENT = 3;
const ONE_HOUR_MS = 3600_000;

const fmtJstStamp = ts => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
}).format(ts);
const fmtJstFile = ts => fmtJstStamp(ts).replace(' ', '_').replaceAll(':', '');
const fmtJstDay = ts => fmtJstStamp(ts).slice(0, 10);
const fmtJstShort = ts => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(ts);
const fmtDur = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function makeThumb(seed, label, broken = false) {
  if (broken) return '';
  const h = (seed * 53) % 360, h2 = (h + 65) % 360;
  const safe = String(label).slice(0, 14).replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="hsl(${h},52%,24%)"/><stop offset="1" stop-color="hsl(${h2},68%,56%)"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#g)"/>
    <circle cx="${70 + (seed * 37) % 180}" cy="${45 + (seed * 19) % 50}" r="28" fill="#fff3d0" opacity=".82"/>
    <path d="M0 138Q95 ${95 + (seed % 32)} 190 132T320 120V180H0Z" fill="hsl(${h},38%,18%)" opacity=".88"/>
    <text x="14" y="164" fill="#fff" opacity=".85" font-size="13" font-family="sans-serif">${safe}</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function normalizeXUrl(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host)) return null;
  const m = /^\/([^/]+)\/status\/(\d+)/.exec(u.pathname);
  if (!m) return null;
  return { canonical: `https://x.com/${m[1]}/status/${m[2]}`, user: m[1], statusId: m[2] };
}

function targetMeta(url) {
  const m = /^https:\/\/x\.com\/([^/]+)\/status\/(\d+)/.exec(url);
  return m ? `@${m[1]} · …${m[2].slice(-6)}` : url;
}

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

let seq = 0;
function buildInitialState() {
  const now = Date.now();
  const titles = [
    '猫咪踩奶日常', '2026-11-28_184210', '东京夜雨航拍', 'Blender 流体模拟',
    '手冲咖啡慢动作', '机械键盘轴体对比', '2026-11-28_151004', '柴犬叼飞盘连拍',
    'Pixel 动画逐帧分解', '秋叶原街头霓虹', '木工榫卯合集'
  ];
  const library = titles.map((name, idx) => {
    const id = `vid-${++seq}`;
    const segs = idx === 1 ? 3 : idx === 4 ? 2 : 1;
    const finishedAt = now - (idx + 1) * 29 * 60_000;
    return {
      id, name,
      url: `https://x.com/demo_${idx + 1}/status/${1890000000000 + idx}`,
      finishedAt, missing: idx === 3,
      files: Array.from({ length: segs }, (_, s) => ({
        fileName: segs > 1 ? `${name}-${s + 1}.mp4` : `${name}.mp4`,
        durationSec: 18 + ((idx * 17 + s * 23) % 95),
        thumb: makeThumb(idx * 11 + s + 3, `${name}${segs > 1 ? ` #${s + 1}` : ''}`, idx === 6 && s === 0)
      }))
    };
  });

  const queue = [
    {
      id: `tsk-${++seq}`, name: '2026-11-28_201845', url: 'https://x.com/nasa/status/189100000001',
      state: 'downloading', priority: 0, progress: 64, stage: '⬇ 下载中 1080p', elapsedMs: 12 * 60_000, timeoutCount: 0, enqueuedAt: now - 80_000
    },
    {
      id: `tsk-${++seq}`, name: '独立游戏实机演示', url: 'https://x.com/indiedev/status/189100000002',
      state: 'downloading', priority: 0, progress: 86, stage: '🎞 合并音视频', elapsedMs: 49 * 60_000, timeoutCount: 0, enqueuedAt: now - 60_000
    },
    {
      id: `tsk-${++seq}`, name: '长讲座切片归档', url: 'https://x.com/archive_lab/status/189100000003',
      state: 'paused', priority: -1, progress: 51, stage: '已保留断点', elapsedMs: ONE_HOUR_MS, timeoutCount: 1, enqueuedAt: now - 40_000
    }
  ];

  const notices = [
    {
      id: 101, kind: 'x-download', targetId: library[1].id, at: library[1].finishedAt, seen: false,
      title: `X视频下载完成 · ${library[1].name}`, body: `已保存 3 段视频到 F:\\Xdownload\\`
    },
    {
      id: 102, kind: 'x-download-alert', targetId: queue[2].id, at: now - 180_000, seen: false,
      title: `下载超时已自动暂停 · ${queue[2].name}`, body: `单次下载超过 1 小时，已保留断点并降至最低优先级。`
    },
    {
      id: 103, kind: 'x-download', targetId: library[0].id, at: library[0].finishedAt, seen: true,
      title: `X视频下载完成 · ${library[0].name}`, body: `已保存 ${library[0].name}.mp4 到 F:\\Xdownload\\`
    }
  ];

  return {
    win: 'quick', // 'quick' 登记下载小窗 | 'manage' 视频管理窗口
    tab: 'library',
    page: 0,
    search: '',
    loadFailNext: false,
    ytDlpVersion: '2026.11.20',
    ytDlpLatest: '2026.11.20',
    ytDlpMissing: false,
    diskError: false,
    lastUpdateCheckDay: fmtJstDay(now),
    pendingUpdateTasks: [],
    updating: false,
    cookieSaved: true,
    cookieSavedAt: now - 3600_000 * 5,
    library,
    archived: {},
    queue,
    notices,
    noticeFilter: 'unread',
    activeNoticeId: 101,
    activeNoticeSeg: 0,
    quickMsg: '',
    toast: ''
  };
}

let S = buildInitialState();
let darkOverride = null;
const loadedThumbs = new Set();

const thumbObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const img = entry.target, src = img.dataset.src;
    if (src) {
      img.src = src;
      loadedThumbs.add(src);
      img.closest('.thumb-box')?.classList.remove('skeleton');
    }
    thumbObserver.unobserve(img);
  }
}, { root: $('#main'), rootMargin: '80px' });

function toast(msg) {
  S.toast = msg;
  $('#toast').textContent = msg;
}

function uniqueBaseName(rawName) {
  const existing = new Set([
    ...S.library.flatMap(it => it.files.map(f => f.fileName.replace(/\.mp4$/i, '').replace(/-\d+$/, ''))),
    ...S.queue.map(q => q.name)
  ]);
  const clean = sanitizeName(rawName) || fmtJstFile(Date.now());
  if (!existing.has(clean)) return clean;
  let n = 2;
  while (existing.has(`${clean} (${n})`)) n++;
  return `${clean} (${n})`;
}

// 排队排序：普通优先级 (0) 在前，超 1h 降级 (-1) 在队尾
function sortedPending() {
  return S.queue
    .filter(t => t.state !== 'downloading')
    .sort((a, b) => (b.priority - a.priority) || (a.enqueuedAt - b.enqueuedAt));
}

function pumpQueue() {
  if (S.updating || S.ytDlpMissing || S.diskError) return;
  let running = S.queue.filter(t => t.state === 'downloading').length;
  if (running >= MAX_CONCURRENT) return;
  const candidates = S.queue
    .filter(t => t.state === 'queued')
    .sort((a, b) => (b.priority - a.priority) || (a.enqueuedAt - b.enqueuedAt));
  for (const task of candidates) {
    if (running >= MAX_CONCURRENT) break;
    task.state = 'downloading';
    task.elapsedMs = 0; // 继续下载清零重计 1 小时
    task.stage = task.progress > 0 ? `⬇ 续传 ${Math.round(task.progress)}%` : '⬇ 解析媒体流';
    running++;
  }
}

function addNotice({ kind, targetId, title, body }) {
  const id = Math.max(100, ...S.notices.map(n => n.id)) + 1;
  S.notices.unshift({ id, kind, targetId, at: Date.now(), seen: false, title, body });
  S.activeNoticeId = id;
  S.activeNoticeSeg = 0;
}

function completeTask(task) {
  S.queue = S.queue.filter(q => q.id !== task.id);
  const id = `vid-${++seq}`, segs = task.name.includes('多段') ? 2 : 1, now = Date.now();
  const item = {
    id, name: task.name, url: task.url, finishedAt: now, missing: false,
    files: Array.from({ length: segs }, (_, s) => ({
      fileName: segs > 1 ? `${task.name}-${s + 1}.mp4` : `${task.name}.mp4`,
      durationSec: 25 + ((seq * 13 + s * 19) % 80),
      thumb: makeThumb(seq * 9 + s, `${task.name}${segs > 1 ? ` #${s + 1}` : ''}`)
    }))
  };
  S.library.unshift(item);
  addNotice({
    kind: 'x-download', targetId: id,
    title: `X视频下载完成 · ${item.name}`,
    body: segs > 1 ? `已保存 ${segs} 段视频到 F:\\Xdownload\\` : `已保存 ${item.files[0].fileName} 到 F:\\Xdownload\\`
  });
  pumpQueue();
  renderAll();
}

function triggerTimeoutOnTask(task) {
  if (!task || task.state !== 'downloading') return;
  task.state = 'paused';
  task.priority = -1;
  task.timeoutCount = (task.timeoutCount || 0) + 1;
  task.elapsedMs = ONE_HOUR_MS;
  task.stage = '已保留断点';
  addNotice({
    kind: 'x-download-alert', targetId: task.id,
    title: `下载超时已自动暂停 · ${task.name}`,
    body: `单次运行超过 1 小时，已自动暂停并降至最低优先级，继续处理其他任务。`
  });
  pumpQueue();
  toast(`⏱ 「${task.name}」超时 1h 已暂停并降到队尾，已推进下一任务`);
  renderAll();
}

function showBanner(text) {
  for (const [box, txt] of [['#banner', '#bannerText'], ['#quickBanner', '#quickBannerText']]) {
    $(box).hidden = !text;
    if (text) $(txt).textContent = text;
  }
}

function switchWindow(win) {
  S.win = win;
  $('#quickWin').hidden = win !== 'quick';
  $('#manageWin').hidden = win !== 'manage';
  for (const b of $$('[data-win]')) b.setAttribute('aria-pressed', String(b.dataset.win === win));
  renderAll();
}

function switchTab(tab) {
  S.tab = tab;
  for (const b of $$('[role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const s of $$('[data-view]')) s.hidden = s.dataset.view !== tab;
  $('#searchWrap').hidden = tab !== 'library';
  renderManageBody();
}

function enqueueTask(rawUrl, rawName) {
  if (S.ytDlpMissing) { showBanner('未检测到 yt-dlp.exe，请先在 .local-tools.json 配置路径。'); return; }
  if (S.diskError) { showBanner('F:\\Xdownload 不可用，请确认 F 盘连接正常。'); return; }
  const parsed = normalizeXUrl(rawUrl);
  if (!parsed) {
    $('#quickToast').textContent = '请输入有效的 x.com / twitter.com 视频帖子链接。';
    $('#urlInput').focus();
    return;
  }
  const dupActive = S.queue.find(t => normalizeXUrl(t.url)?.canonical === parsed.canonical);
  if (dupActive) {
    $('#quickToast').textContent = `该链接已在队列中（${dupActive.name}），不重复占用通道。`;
    return;
  }
  const dupLib = S.library.find(it => normalizeXUrl(it.url)?.canonical === parsed.canonical);
  const name = uniqueBaseName(rawName);
  const task = {
    id: `tsk-${++seq}`, name, url: parsed.canonical, state: 'queued', priority: 0,
    progress: 0, stage: '等待调度', enqueuedAt: Date.now(), elapsedMs: 0, timeoutCount: 0
  };

  const today = fmtJstDay(Date.now());
  if (S.lastUpdateCheckDay !== today) {
    S.lastUpdateCheckDay = today;
    if (S.ytDlpLatest !== S.ytDlpVersion) {
      S.pendingUpdateTasks.push(task);
      openUpdateDialog(true);
      renderChrome();
      return;
    }
  }

  S.queue.push(task);
  pumpQueue();
  $('#urlInput').value = '';
  $('#nameInput').value = '';
  $('#quickToast').textContent = dupLib
    ? `✓ 已开始「${name}」（曾下载过「${dupLib.name}」，将按新序号保存）`
    : `✓ 已交给绯月启动下载：${name}`;
  $('#quickJumpWrap').hidden = false;
  toast(`已添加任务：${name}`);
  renderChrome();
  if (S.win === 'manage') renderManageBody();
}

function openUpdateDialog(fromDownload = false) {
  const runningN = S.queue.filter(t => t.state === 'downloading').length;
  $('#updateDesc').textContent = `当前 yt-dlp 版本：${S.ytDlpVersion} → 最新版本：${S.ytDlpLatest}。是否更新后再${fromDownload ? '启动下载' : '继续'}？`;
  const lock = $('#updateLockNote');
  lock.hidden = runningN === 0;
  if (runningN > 0) lock.textContent = `注意：当前有 ${runningN} 路下载正在运行，同意更新后将等待在途任务结束释放文件锁再执行更新。`;
  $('#updSkip').hidden = !fromDownload;
  $('#updateDialog').showModal();
}

function renderChrome() {
  const unread = S.notices.filter(n => !n.seen).length;
  $('#noticeBadge').textContent = unread;
  $('#noticeBadge').hidden = unread === 0;

  const runningN = S.queue.filter(t => t.state === 'downloading').length;
  $('#quickRunNum').textContent = `${runningN}/${MAX_CONCURRENT}`;
  $$('.slot-dots i').forEach((d, i) => d.classList.toggle('on', i < runningN));

  $('#cookieDot').dataset.tone = S.cookieSaved ? '' : 'warn';
  $('#cookieChip').title = S.cookieSaved
    ? `Cookie 已导入（${fmtJstShort(S.cookieSavedAt)}）`
    : '尚未导入 Cookie（仅公开视频）';

  const hasUpd = S.ytDlpLatest !== S.ytDlpVersion || S.ytDlpMissing;
  $('#updateDot').hidden = !hasUpd && !S.updating;
  $('#updateDot').dataset.tone = S.updating ? 'accent' : 'warn';
  $('#updateChip').title = S.ytDlpMissing
    ? '未检测到 yt-dlp.exe'
    : `yt-dlp ${S.ytDlpVersion}（点击手动检查更新）`;

  $('#libCount').textContent = S.library.length;
  $('#queueCount').textContent = S.queue.length;
  $('#queueDot').hidden = runningN === 0;
}

function renderPager(total) {
  const pager = $('#libPager');
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  S.page = Math.min(S.page, pages - 1);
  pager.hidden = pages < 2;
  pager.innerHTML = `<button type="button" aria-label="较新">‹</button><span>${S.page + 1} / ${pages}</span><button type="button" aria-label="较早">›</button>`;
  const [prev, next] = pager.querySelectorAll('button');
  prev.disabled = S.page === 0;
  next.disabled = S.page >= pages - 1;
  prev.onclick = () => { S.page--; renderLibrary(true); };
  next.onclick = () => { S.page++; renderLibrary(true); };
}

function renderLibrary(withLoadDelay = false) {
  const ul = $('#libList');
  const q = S.search.trim().toLowerCase();
  const filtered = q ? S.library.filter(it => it.name.toLowerCase().includes(q)) : S.library;
  renderPager(filtered.length);
  const pageItems = filtered.slice(S.page * PAGE_SIZE, (S.page + 1) * PAGE_SIZE);

  if (withLoadDelay) {
    ul.innerHTML = '<li class="skeleton-card skeleton-grid"></li>';
    setTimeout(() => {
      if (S.loadFailNext) {
        S.loadFailNext = false;
        const li = document.createElement('li');
        li.className = 'fy-empty';
        li.textContent = '读取记录失败，请重试';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '↻ 重试';
        btn.onclick = () => renderLibrary(true);
        li.append(btn);
        ul.replaceChildren(li);
        return;
      }
      paintLibrary(pageItems, q);
    }, 240);
    return;
  }
  paintLibrary(pageItems, q);
}

function paintLibrary(items, q) {
  const ul = $('#libList');
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'fy-empty';
    li.textContent = q ? `没有名称包含“${q}”的已下载视频` : '还没有在管的 X 视频';
    ul.replaceChildren(li);
    return;
  }
  const nodes = items.map((item, i) => {
    const li = document.createElement('li');
    li.className = 'vcard';
    li.style.setProperty('--i', i);
    li.dataset.tone = item.missing ? 'warn' : 'ok';

    const first = item.files[0];
    const totalDur = item.files.reduce((a, f) => a + f.durationSec, 0);
    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className = 'thumb-box';
    thumbBtn.title = item.missing ? '文件已缺失' : `播放 ${first.fileName}`;
    if (first.thumb) {
      const img = document.createElement('img');
      img.alt = `${item.name} 第一帧缩略图`;
      if (loadedThumbs.has(first.thumb)) img.src = first.thumb;
      else { thumbBtn.classList.add('skeleton'); img.dataset.src = first.thumb; thumbObserver.observe(img); }
      thumbBtn.append(img);
    } else {
      thumbBtn.innerHTML = '<span class="thumb-placeholder">🎞</span>';
    }
    const playFab = document.createElement('span'); playFab.className = 'play-fab'; playFab.textContent = '▶';
    const dur = document.createElement('span'); dur.className = 'thumb-dur'; dur.textContent = fmtDur(totalDur);
    thumbBtn.append(playFab, dur);
    if (item.files.length > 1) {
      const segs = document.createElement('span'); segs.className = 'thumb-segs'; segs.textContent = `${item.files.length} 段`;
      thumbBtn.append(segs);
    }
    thumbBtn.onclick = () => playItem(item.id, 0);

    const h3 = document.createElement('h3'); h3.className = 'vcard-title'; h3.textContent = item.name; h3.title = item.name;
    const meta = document.createElement('div'); meta.className = 'vcard-meta';
    const time = document.createElement('time'); time.textContent = fmtJstShort(item.finishedAt);
    meta.append(time);
    if (item.missing) {
      const chip = document.createElement('span'); chip.className = 'fy-chip'; chip.dataset.tone = 'warn'; chip.textContent = '⚠ 缺失';
      meta.append(chip);
    }

    const actions = document.createElement('div'); actions.className = 'vcard-actions';
    const bPlay = document.createElement('button'); bPlay.type = 'button'; bPlay.className = 'btn-play'; bPlay.textContent = '▶ 播放';
    bPlay.onclick = () => playItem(item.id, 0);
    const bDir = document.createElement('button'); bDir.type = 'button'; bDir.textContent = '📂'; bDir.title = '打开所在文件夹';
    bDir.onclick = () => toast(item.missing ? `F:\\Xdownload\\${first.fileName} 已被外部移走` : `已打开并选中：F:\\Xdownload\\${first.fileName}`);
    const bArc = document.createElement('button'); bArc.type = 'button'; bArc.className = 'btn-archive'; bArc.textContent = '📦 归档';
    bArc.title = '移入 F:\\Xdownload\\archive 并脱离管理';
    bArc.onclick = () => archiveItem(item.id, li);
    actions.append(bPlay, bDir, bArc);

    li.append(thumbBtn, h3, meta, actions);
    return li;
  });
  ul.replaceChildren(...nodes);
}

function renderQueue() {
  const running = S.queue.filter(t => t.state === 'downloading');
  const pending = sortedPending();
  $('#secRunChip').textContent = `${running.length}/${MAX_CONCURRENT}`;
  $('#secPendingChip').textContent = pending.length;

  // 3 个直观通道槽位 #1 #2 #3
  const lanes = Array.from({ length: MAX_CONCURRENT }, (_, idx) => {
    const t = running[idx];
    const div = document.createElement('div');
    if (!t) {
      div.className = 'lane idle';
      div.innerHTML = `<b>#${idx + 1} 空闲通道</b><span>可立即并行下载</span>`;
      return div;
    }
    div.className = 'lane busy';
    const mins = Math.floor((t.elapsedMs || 0) / 60_000);
    const pct = Math.round(t.progress);

    const head = document.createElement('div');
    head.className = 'lane-head';
    head.innerHTML = `<span class="lane-no">#${idx + 1} 并行</span><strong class="lane-pct">${pct}%</strong>`;

    const target = document.createElement('div');
    target.className = 'lane-target';
    const nameEl = document.createElement('strong'); nameEl.textContent = t.name; nameEl.title = t.name;
    const subEl = document.createElement('small'); subEl.textContent = targetMeta(t.url);
    target.append(nameEl, subEl);

    const pbar = document.createElement('div');
    pbar.className = 'pbar';
    pbar.innerHTML = `<div class="pbar-fill" style="--pct:${pct}%"></div>`;

    const foot = document.createElement('div');
    foot.className = 'lane-foot';
    const st = document.createElement('span'); st.className = 'lane-stage'; st.textContent = t.stage;
    const tm = document.createElement('span'); tm.className = `lane-time${mins >= 45 ? ' warn' : ''}`; tm.textContent = `${mins}m/60m`;
    const bPause = document.createElement('button'); bPause.type = 'button'; bPause.textContent = '⏸'; bPause.title = '暂停（保留断点）';
    bPause.onclick = () => { t.state = 'paused'; t.stage = '已手动暂停'; pumpQueue(); renderAll(); };
    const bCancel = document.createElement('button'); bCancel.type = 'button'; bCancel.textContent = '✕'; bCancel.title = '取消任务';
    bCancel.onclick = () => { S.queue = S.queue.filter(q => q.id !== t.id); pumpQueue(); toast(`已取消：${t.name}`); renderAll(); };

    foot.append(st, tm, bPause, bCancel);
    div.append(head, target, pbar, foot);
    return div;
  });
  $('#lanesGrid').replaceChildren(...lanes);

  // 下方清晰目标队列（顺位编号 + 超 1h 降级标低优）
  const ul = $('#pendingList');
  if (!pending.length) {
    ul.innerHTML = '<li class="fy-empty">没有等待或暂停的目标</li>';
    return;
  }
  const rows = pending.map((t, idx) => {
    const li = document.createElement('li');
    li.className = 'fy-card';
    li.style.setProperty('--i', idx);
    li.dataset.tone = t.priority < 0 ? 'warn' : 'accent';

    const row = document.createElement('div'); row.className = 'pending-row';
    const ord = document.createElement('span');
    ord.className = `order-num${t.priority < 0 ? ' low' : ''}`;
    ord.textContent = t.priority < 0 ? '低' : String(idx + 1);
    ord.title = t.priority < 0 ? '已降至最低优先级' : `排队第 ${idx + 1} 顺位`;

    const main = document.createElement('div'); main.className = 'pending-main';
    const title = document.createElement('div'); title.className = 'pending-title';
    const strong = document.createElement('strong'); strong.textContent = t.name;
    const chip = document.createElement('span'); chip.className = 'fy-chip';
    chip.textContent = t.priority < 0
      ? (t.state === 'paused' ? '⏱ 超1h暂停 · 最低优先级' : '⬇ 队尾 · 最低优先级')
      : (t.state === 'paused' ? '⏸ 已暂停' : '⏳ 普通顺位');
    title.append(strong, chip);

    const sub = document.createElement('div'); sub.className = 'pending-sub';
    const author = document.createElement('span'); author.textContent = targetMeta(t.url);
    sub.append(author);
    if (t.progress > 0) {
      const mb = document.createElement('span'); mb.className = 'mini-bar';
      mb.innerHTML = `<i style="--pct:${Math.round(t.progress)}%"></i>`;
      const pt = document.createElement('span'); pt.textContent = `断点 ${Math.round(t.progress)}%`;
      sub.append(mb, pt);
    }
    main.append(title, sub);

    const actions = document.createElement('div'); actions.className = 'pending-actions';
    if (t.state === 'paused' || t.state === 'failed') {
      const bRes = document.createElement('button'); bRes.type = 'button'; bRes.textContent = '▶ 继续';
      bRes.title = t.priority < 0 ? '以最低优先级继续（重计 1h）' : '继续下载';
      bRes.onclick = () => { t.state = 'queued'; t.enqueuedAt = Date.now(); pumpQueue(); renderAll(); };
      actions.append(bRes);
    }
    const bCan = document.createElement('button'); bCan.type = 'button'; bCan.textContent = '✕'; bCan.title = '取消并清理断点';
    bCan.onclick = () => { S.queue = S.queue.filter(q => q.id !== t.id); pumpQueue(); renderAll(); };
    actions.append(bCan);

    row.append(ord, main, actions);
    li.append(row);
    return li;
  });
  ul.replaceChildren(...rows);
}

function renderManageBody() {
  if (S.win !== 'manage') return;
  if (S.tab === 'library') renderLibrary(false);
  else renderQueue();
}

function renderAll() {
  renderChrome();
  renderManageBody();
  if ($('#noticeDialog').open) renderNotices();
}

function playItem(targetId, segIdx = 0) {
  if (S.archived[targetId]) {
    toast(`「${S.archived[targetId].name}」已归档至 F:\\Xdownload\\archive`);
    return;
  }
  const item = S.library.find(it => it.id === targetId);
  if (!item || item.missing) { toast('文件不存在或已被从 F:\\Xdownload 移走。'); return; }
  const file = item.files[segIdx] || item.files[0];
  $('#playerPreview').innerHTML = file.thumb ? `<img src="${file.thumb}" alt="${file.fileName}">` : '<p class="fy-empty">无首帧预览图</p>';
  $('#playerMeta').textContent = `调用系统默认本地播放器打开：F:\\Xdownload\\${file.fileName}（时长 ${fmtDur(file.durationSec)}）`;
  $('#playerDialog').showModal();
}

function archiveItem(id, cardNode) {
  const item = S.library.find(it => it.id === id);
  if (!item) return;
  const finish = () => {
    S.library = S.library.filter(it => it.id !== id);
    S.archived[id] = { name: item.name, archivedAt: Date.now() };
    toast(item.missing ? `「${item.name}」原文件已缺失，已脱离管理列表` : `已归档 ${item.files.length} 个文件到 F:\\Xdownload\\archive\\`);
    renderAll();
  };
  if (cardNode) { cardNode.classList.add('archiving'); setTimeout(finish, 320); }
  else finish();
}

function renderNotices() {
  const list = S.notices.filter(n => S.noticeFilter === 'all' || !n.seen);
  const ul = $('#noticeList');
  if (!list.length) {
    ul.innerHTML = '<li class="fy-empty">当前筛选下没有提醒记录</li>';
  } else {
    ul.replaceChildren(...list.map((n, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'fy-card notice-item'; btn.style.setProperty('--i', i);
      btn.dataset.tone = n.seen ? 'muted' : n.kind === 'x-download-alert' ? 'warn' : 'accent';
      btn.dataset.active = String(n.id === S.activeNoticeId);
      if (!n.seen) { const dot = document.createElement('span'); dot.className = 'fy-dot'; btn.append(dot); }
      const title = document.createElement('span'); title.className = 'n-title'; title.textContent = n.title;
      const t = document.createElement('time'); t.className = 'fy-meta'; t.textContent = fmtJstShort(n.at);
      btn.append(title, t);
      btn.onclick = () => { n.seen = true; S.activeNoticeId = n.id; S.activeNoticeSeg = 0; renderChrome(); renderNotices(); };
      li.append(btn);
      return li;
    }));
  }

  const detail = $('#noticeDetail');
  const active = S.notices.find(n => n.id === S.activeNoticeId);
  if (!active) { detail.innerHTML = '<p class="fy-empty">点选一条提醒查看详情</p>'; return; }
  detail.innerHTML = '';
  const h = document.createElement('strong'); h.textContent = active.title;
  const p = document.createElement('p'); p.className = 'fy-meta'; p.textContent = `${fmtJstStamp(active.at)} JST · ${active.body}`;
  detail.append(h, p);

  if (active.kind === 'x-download') {
    if (S.archived[active.targetId]) {
      const note = document.createElement('p'); note.className = 'dlg-warn';
      note.textContent = `📦 「${S.archived[active.targetId].name}」已归档至 F:\\Xdownload\\archive`;
      detail.append(note); return;
    }
    const item = S.library.find(it => it.id === active.targetId);
    if (!item || item.missing) {
      const note = document.createElement('p'); note.className = 'dlg-warn';
      note.textContent = '⚠ 文件不存在（可能已被手工移走）';
      detail.append(note); return;
    }
    const segIdx = Math.min(S.activeNoticeSeg, item.files.length - 1), file = item.files[segIdx];
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'notice-player-card'; card.title = `点击播放 ${file.fileName}`;
    card.innerHTML = `${file.thumb ? `<img src="${file.thumb}" alt="第一帧缩略图">` : '<span class="thumb-placeholder">🎞</span>'}<span class="play-fab">▶</span><span class="thumb-dur">${fmtDur(file.durationSec)}</span>`;
    card.onclick = () => playItem(item.id, segIdx);
    detail.append(card);
    if (item.files.length > 1) {
      const pills = document.createElement('div'); pills.className = 'seg-pills';
      item.files.forEach((_, idx) => {
        const sb = document.createElement('button'); sb.type = 'button'; sb.textContent = `第 ${idx + 1}/${item.files.length} 段`;
        sb.setAttribute('aria-pressed', String(idx === segIdx));
        sb.onclick = () => { S.activeNoticeSeg = idx; renderNotices(); };
        pills.append(sb);
      });
      detail.append(pills);
    }
  }
}

const SAMPLE_NETSCAPE_COOKIE = [
  '# Netscape HTTP Cookie File',
  '.x.com\tTRUE\t/\tTRUE\t1796000000\tauth_token\tproto_demo_auth_token_placeholder',
  '.x.com\tTRUE\t/\tTRUE\t1796000000\tct0\tproto_demo_ct0_placeholder',
  '.twitter.com\tTRUE\t/\tTRUE\t1796000000\tguest_id\tv1%3A1700000000'
].join('\n');

function refreshExtView() {
  const ok = $('#extLoggedIn').checked;
  $('#extCookieStatus').textContent = ok
    ? '✓ 已检测到 x.com 登录态（auth_token、ct0 就绪）'
    : '⚠ 未检测到有效登录 Cookie，请先在 Chrome 登录 X。';
  $('#extCopyBtn').disabled = !ok;
  $('#extDownloadBtn').disabled = !ok;
  $('#extMsg').hidden = true;
}

// 事件绑定
for (const b of $$('[data-win]')) b.onclick = () => switchWindow(b.dataset.win);
for (const b of $$('[role="tab"]')) b.onclick = () => switchTab(b.dataset.tab);

$('#quickForm').addEventListener('submit', e => {
  e.preventDefault();
  enqueueTask($('#urlInput').value, $('#nameInput').value);
});
$('#clipBtn').onclick = () => {
  $('#urlInput').value = 'https://x.com/feiyue_demo/status/1899999999999';
  $('#quickToast').textContent = '已填入剪贴板示例链接（点击开始下载才启动）';
};
$('#jumpToQueue').onclick = () => { switchWindow('manage'); switchTab('queue'); };
$('#bannerDismiss').onclick = $('#quickBannerDismiss').onclick = () => showBanner('');

$('#searchInput').addEventListener('input', e => {
  S.search = e.target.value; $('#searchClear').hidden = !S.search; S.page = 0; renderLibrary(false);
});
$('#searchClear').onclick = () => {
  $('#searchInput').value = ''; S.search = ''; $('#searchClear').hidden = true; S.page = 0; renderLibrary(false);
};

// 更新强同意门禁
$('#updateChip').onclick = () => {
  if (S.ytDlpMissing) { showBanner('未检测到 yt-dlp.exe，请先在 .local-tools.json 配置路径。'); return; }
  if (S.ytDlpLatest === S.ytDlpVersion) S.ytDlpLatest = '2026.11.28';
  openUpdateDialog(false);
  renderChrome();
};
$('#updCancel').onclick = () => { S.pendingUpdateTasks = []; $('#updateDialog').close(); toast('已取消更新。'); };
$('#updSkip').onclick = () => {
  $('#updateDialog').close();
  for (const t of S.pendingUpdateTasks.splice(0)) S.queue.push(t);
  pumpQueue();
  $('#quickToast').textContent = '✓ 已跳过更新，按当前版本开始下载。';
  renderAll();
};
$('#updAgree').onclick = () => {
  $('#updateDialog').close();
  S.updating = true;
  renderChrome();
  toast('已同意更新：等待在途下载释放文件锁后执行 yt-dlp -U…');
  setTimeout(() => {
    S.ytDlpVersion = S.ytDlpLatest;
    S.updating = false;
    for (const t of S.pendingUpdateTasks.splice(0)) S.queue.push(t);
    pumpQueue();
    toast(`yt-dlp 已更新至 ${S.ytDlpVersion}`);
    $('#quickToast').textContent = `✓ yt-dlp 已更新至 ${S.ytDlpVersion}，已启动下载。`;
    renderAll();
  }, 550);
};

// Cookie 弹层
$('#cookieChip').onclick = () => {
  $('#cookieStatusDesc').textContent = S.cookieSaved
    ? `当前状态：已加密保存于本机（导入时间：${fmtJstStamp(S.cookieSavedAt)} JST）`
    : '当前状态：尚未导入（仅可下载公开视频）';
  $('#cookieMsg').hidden = true;
  $('#cookieDialog').showModal();
};
$('#cookieClose').onclick = () => $('#cookieDialog').close();
$('#cookiePickFile').onclick = () => $('#cookieFile').click();
$('#cookieFile').onchange = async e => { const f = e.target.files[0]; if (f) $('#cookieInput').value = await f.text(); e.target.value = ''; };
$('#cookieOpenExt').onclick = () => { $('#cookieDialog').close(); refreshExtView(); $('#extDialog').showModal(); };
$('#cookieClearBtn').onclick = () => {
  S.cookieSaved = false; S.cookieSavedAt = 0; $('#cookieInput').value = '';
  $('#cookieStatusDesc').textContent = '当前状态：已清空';
  $('#cookieMsg').hidden = false; $('#cookieMsg').dataset.tone = 'ok'; $('#cookieMsg').textContent = '已清除本地加密 Cookie。';
  renderChrome();
};
$('#cookieSave').onclick = () => {
  const txt = $('#cookieInput').value.trim(), msg = $('#cookieMsg'); msg.hidden = false;
  if (!txt.includes('auth_token') || !txt.includes('ct0') || (!txt.includes('x.com') && !txt.includes('twitter.com'))) {
    msg.dataset.tone = 'danger'; msg.textContent = '校验失败：需要包含 x.com / twitter.com 的 auth_token 与 ct0。'; return;
  }
  S.cookieSaved = true; S.cookieSavedAt = Date.now(); $('#cookieInput').value = '';
  msg.dataset.tone = 'ok'; msg.textContent = '校验通过，已系统加密保存（不回显明文）。';
  renderChrome();
};

// 提醒与插件弹窗
$('#protoNotices').onclick = () => { renderNotices(); $('#noticeDialog').showModal(); };
$('#noticeClose').onclick = () => $('#noticeDialog').close();
for (const b of $$('[data-nfilter]')) {
  b.onclick = () => {
    S.noticeFilter = b.dataset.nfilter;
    for (const x of $$('[data-nfilter]')) x.setAttribute('aria-pressed', String(x === b));
    renderNotices();
  };
}
$('#noticeReadAll').onclick = () => { for (const n of S.notices) n.seen = true; renderChrome(); renderNotices(); };

$('#protoExt').onclick = () => { refreshExtView(); $('#extDialog').showModal(); };
$('#extLoggedIn').onchange = refreshExtView;
$('#extClose').onclick = () => $('#extDialog').close();
$('#extCopyBtn').onclick = async () => {
  try { await navigator.clipboard?.writeText(SAMPLE_NETSCAPE_COOKIE); } catch {}
  $('#extMsg').hidden = false; $('#extMsg').dataset.tone = 'ok'; $('#extMsg').textContent = '✓ 已复制 Cookie 到剪贴板。';
};
$('#extDownloadBtn').onclick = () => {
  $('#extMsg').hidden = false; $('#extMsg').dataset.tone = 'ok'; $('#extMsg').textContent = '✓ 已生成 cookies.txt（原型仅提示）。';
};
$('#extPasteToFeiyue').onclick = () => {
  $('#extDialog').close();
  switchWindow('manage');
  $('#cookieChip').click();
  $('#cookieInput').value = SAMPLE_NETSCAPE_COOKIE;
};
$('#playerClose').onclick = () => $('#playerDialog').close();

// 调试抽屉
$('#labBatch').onclick = () => {
  ['海边日落多段', '猫猫滚筒', '2026-11-28_204612', '太空发射现场'].forEach((n, i) => {
    S.queue.push({
      id: `tsk-${++seq}`, name: uniqueBaseName(n), url: `https://x.com/batch_user/status/${190000000000 + seq + i}`,
      state: 'queued', priority: 0, progress: 0, stage: '等待调度', enqueuedAt: Date.now() + i, elapsedMs: 0, timeoutCount: 0
    });
  });
  pumpQueue(); switchWindow('manage'); switchTab('queue');
};
$('#labTimeout').onclick = () => {
  const firstRun = S.queue.find(t => t.state === 'downloading');
  if (!firstRun) { toast('没有正在下载的通道，先点「塞入 4 条演示」。'); return; }
  triggerTimeoutOnTask(firstRun);
  switchWindow('manage'); switchTab('queue');
};
$('#labUpdate').onclick = () => {
  S.ytDlpLatest = '2026.11.29'; S.lastUpdateCheckDay = ''; openUpdateDialog(false); renderChrome();
};
$('#labMissingDisk').onclick = () => {
  if (!S.ytDlpMissing && !S.diskError) { S.ytDlpMissing = true; showBanner('未检测到 yt-dlp.exe，请在 .local-tools.json 配置路径。'); }
  else if (S.ytDlpMissing) { S.ytDlpMissing = false; S.diskError = true; showBanner('F:\\Xdownload 不可用，请确认 F 盘连接正常。'); }
  else { S.diskError = false; showBanner(''); pumpQueue(); }
  renderAll();
};
$('#labLoadFail').onclick = () => { S.loadFailNext = true; switchWindow('manage'); switchTab('library'); renderLibrary(true); };
$('#labEmpty').onclick = () => {
  if (S.library.length) { S.library = []; S.queue = []; S.notices = []; S.archived = {}; }
  else S = buildInitialState();
  showBanner(''); renderAll();
};
$('#labTheme').onclick = () => {
  const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  darkOverride = darkOverride === null ? !sysDark : !darkOverride;
  document.documentElement.style.colorScheme = darkOverride ? 'dark' : 'light';
};

setInterval(() => {
  if (S.updating) return;
  let changed = false; const completed = [];
  for (const t of S.queue) {
    if (t.state !== 'downloading') continue;
    t.elapsedMs = (t.elapsedMs || 0) + 1000;
    t.progress = Math.min(100, t.progress + 3.2);
    t.stage = t.progress > 84 ? '🖼 提首帧中' : t.progress > 68 ? '🎞 合并音视频' : '⬇ 下载中 1080p';
    changed = true;
    if (t.progress >= 100) completed.push(t);
  }
  if (completed.length) { completed.forEach(completeTask); return; }
  if (changed && S.win === 'manage' && S.tab === 'queue') { renderChrome(); renderQueue(); }
}, 1000);

renderAll();
