'use strict';

const edition = Date.parse('2026-11-21T16:20:00+09:00');
const firstDay = Date.parse('2026-11-21T00:00:00+09:00') - 6 * 86400000;
const tokyo = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const samples = [
  ['rail', '社会', '交通', '沿海铁路恢复通车', '11-21T09:00', '沿海铁路全线恢复，周末增开两班列车。'],
  ['robot', '科技', '机器人', '巡检机器人完成夜间试跑', '11-20T18:30', '第二轮夜间试跑完成，公开了覆盖范围与尚待改进的路段。'],
  ['market', '市场', '美国股市', '芯片板块回落，多家媒体跟进', '11-20T06:00', '芯片板块收盘回落约 4%。部分报道采用不同市值统计口径。'],
  ['river', '社会', '公共服务', '河滨防汛工程开放临时步道', '11-19T15:15', '临时步道开放，靠近施工区的支路仍封闭。'],
  ['model', '科技', '人工智能', '端侧开源模型补齐评测说明', '11-18T13:10', '维护团队补发延迟与功耗评测方法。'],
  ['bridge', '社会', '交通', '山谷大桥恢复单车道通行', '11-17T11:20', '应急维修完成，轻型车辆可单向交替通行。'],
  ['grain', '市场', '国内股市', '农业板块放量反弹', '11-16T15:00', '收盘涨幅为 2.8%，种业与农机板块成交活跃。'],
  ['clinic', '社会', '公共服务', '夜间门诊试点增加服务点', '11-15T08:40', '夜间门诊试点增设两个服务点。'],
  ['archived-ferry', '社会', '交通', '渡轮临时航线恢复', '11-14T15:30', '临时航线恢复周末班次。']
];
const toTime = short => '2026-' + short + ':00+09:00';
const brief = samples.map(([id, family, topic, title, at, latest]) =>
  ({id, family, topic, title, at: toTime(at), latest}));
const update = {
  at: toTime('11-21T15:40'),
  latest: '团队公布潮湿坡道复测结果，人工复核仍保留。'
};

const main = document.querySelector('main');
const reader = document.querySelector('#reader');
const detail = document.querySelector('#event-detail');
const content = document.querySelector('#detail-content');
const closeButton = document.querySelector('#close-detail');
const backdrop = document.querySelector('#detail-backdrop');
const compact = matchMedia('(max-width:700px)');
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
const behindDrawer = document.querySelectorAll('.mast, .folio, .overview');
const overview = document.querySelector('.overview');
const overviewTitle = document.querySelector('#overview-title');
const overviewTop = document.querySelector('#overview-top');
const detailTop = document.querySelector('#detail-top');
const board = document.querySelector('#event-list');
const count = document.querySelector('#count');
const status = document.querySelector('#status');
const filters = document.querySelector('#filters');
const refresh = document.querySelector('#refresh');
const archive = document.querySelector('#archive-panel');
const archiveFiles = document.querySelector('#archive-files');
const photoPanel = document.querySelector('#photo-panel');
const fullPhoto = document.querySelector('#photo-full');
const photoCredit = document.querySelector('#photo-credit');
const demo = new URLSearchParams(location.search).get('demo');
const cards = new Map();
const loadedScripts = new Map();
let active = '全部';
let ready = false;
let updated = false;
let selected = null;
let overviewScroll = 0;
let firstFailure = demo === 'feed-error';
let detailFailure = demo === 'timeline-error';
let archiveFailure = demo === 'archive-error';

function element(tag, cls, content) {
  const result = document.createElement(tag);
  if (cls) result.className = cls;
  if (content) result.textContent = content;
  return result;
}

function button(label, action, cls) {
  const result = element('button', cls, label);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}

function time(iso) {
  const printed = tokyo.format(Date.parse(iso)).replace(',', '');
  const el = element('time', '', printed + ' JST');
  el.dateTime = iso;
  return el;
}

function notice(message, retry) {
  status.replaceChildren(message);
  status.hidden = !message;
  if (retry) status.append(button('重试', retry, 'paper-button'));
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadSamples(name) {
  if (!loadedScripts.has(name)) {
    loadedScripts.set(name, new Promise((resolve, reject) => {
      const script = element('script');
      script.src = name + '.js';
      script.onload = resolve;
      script.onerror = () => {
        loadedScripts.delete(name);
        script.remove();
        reject(new Error('样例读取失败'));
      };
      document.head.append(script);
    }));
  }
  return loadedScripts.get(name);
}

function sourceGroup(reports) {
  const group = element('details');
  group.append(element('summary', '', reports.length + ' 篇来源'));
  group.addEventListener('toggle', () => {
    if (!group.open || group.childElementCount > 1) return;
    for (const [name, published, translated, original] of reports) {
      const source = element('div', 'source');
      const title = element('p', '', translated);
      const byline = element('span', '', name + ' · ' + time(toTime(published)).textContent);
      source.append(byline, title);
      if (original) {
        const toggle = button('显示原文', () => {
          const visible = toggle.getAttribute('aria-pressed') === 'true';
          title.textContent = visible ? translated : original;
          toggle.textContent = visible ? '显示原文' : '显示中文';
          toggle.setAttribute('aria-pressed', String(!visible));
        }, 'paper-button');
        toggle.setAttribute('aria-pressed', 'false');
        source.append(toggle);
      }
      group.append(source);
    }
  });
  return group;
}

function sourceLinks(event, reports) {
  const section = element('details', 'source-links');
  const list = element('ul');
  const seen = new Set();
  const byPublished = [...reports.entries()].sort(([, a], [, b]) => b[1].localeCompare(a[1]));
  for (const [index, [publisher, published, title]] of byPublished) {
    const key = JSON.stringify([publisher, published, title]);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = element('li');
    const link = element('a', '', title);
    link.href = 'source.html?' + new URLSearchParams({event, report:String(index)});
    link.target = '_blank';
    link.rel = 'noopener';
    const arrow = element('span', 'source-arrow', ' ↗');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(arrow);
    const byline = element('span', 'source-byline');
    byline.append(publisher + ' · ', time(toTime(published)));
    item.append(link, byline);
    list.append(item);
  }
  const heading = element('summary');
  heading.append(element('span', '', '情报来源'), element('span', 'source-count', seen.size + ' 篇'));
  section.append(heading, list);
  return section;
}

function newsPhoto(photo) {
  const figure = element('figure', 'news-photo');
  const thumbnail = element('img');
  thumbnail.alt = photo.alt;
  thumbnail.width = 192;
  thumbnail.height = 128;
  thumbnail.loading = 'lazy';
  thumbnail.decoding = 'async';
  thumbnail.addEventListener('error', () => figure.remove(), {once:true});
  thumbnail.src = photo.src;
  const enlarge = button('', () => {
    fullPhoto.alt = photo.alt;
    fullPhoto.src = photo.src;
    photoCredit.textContent = photo.credit;
    photoPanel.showModal();
  }, 'news-photo-button');
  enlarge.setAttribute('aria-label', '放大新闻配图');
  enlarge.setAttribute('aria-haspopup', 'dialog');
  const cue = element('span', 'photo-zoom', '放大');
  cue.setAttribute('aria-hidden', 'true');
  enlarge.append(thumbnail, cue);
  figure.append(enlarge, element('figcaption', '', photo.credit));
  return figure;
}

function renderStatus(section, row, hasUpdate) {
  const paragraphs = hasUpdate ? window.weeklyRobotSummary : window.weeklySummaries[row.id];
  const copy = element('div', 'status-copy');
  copy.append(element('h4', '', '现状'), ...paragraphs.map(text => element('p', '', text)));
  section.replaceChildren(copy);
  const photo = window.weeklyNewsPhotos[row.id];
  if (photo) section.append(newsPhoto(photo));
  section.hidden = false;
}

async function showTimeline(row, panel, summary) {
  if (panel.getAttribute('aria-busy') === 'true') return;
  panel.setAttribute('aria-busy', 'true');
  panel.replaceChildren(element('p', 'queued', '正在读取时间线…'));
  try {
    await pause(160);
    if (detailFailure) {
      detailFailure = false;
      throw new Error('演示读取失败');
    }
    await loadSamples('timelines');
    if (!panel.isConnected) return;
    const nodes = [...window.weeklyTimelines[row.id]];
    const hasUpdate = row.id === 'robot' && updated;
    if (hasUpdate) nodes.push(window.weeklyRobotUpdate);
    renderStatus(summary, row, hasUpdate);
    const sources = sourceLinks(row.id, nodes.flatMap(node => node[3]));
    const timeline = element('ol', 'timeline');
    nodes.sort((a, b) => Date.parse(toTime(a[0])) - Date.parse(toTime(b[0])));
    for (const [at, title, detail, reports, timeKind] of nodes) {
      const node = element('li');
      const label = time(toTime(at));
      if (timeKind) label.append(' · ' + timeKind);
      node.append(label, element('strong', '', title), element('p', '', detail), sourceGroup(reports));
      timeline.append(node);
    }
    panel.replaceChildren(element('h4', '', '发展时间线'), timeline, sources);
  } catch {
    panel.replaceChildren(element('p', 'queued', '时间线读取失败。'),
      button('重试', () => showTimeline(row, panel, summary), 'paper-button'));
  } finally {
    panel.setAttribute('aria-busy', 'false');
  }
}

function createCard(row) {
  const article = element('article', 'event');
  article.dataset.event = row.id;
  const heading = element('h4');
  const meta = element('span', 'event-meta');
  const disclosure = element('span', 'disclosure', '查看');
  const latest = element('span', 'event-lead', row.latest);
  const toggle = button('', () => selectCard(card), 'event-toggle');
  toggle.setAttribute('aria-controls', detail.id);
  toggle.setAttribute('aria-expanded', 'false');
  disclosure.setAttribute('aria-hidden', 'true');
  toggle.append(meta, element('span', 'event-title', row.title), disclosure, latest);
  heading.append(toggle);
  article.append(heading);
  const card = {
    row, article, toggle, disclosure,
    update() {
      meta.replaceChildren(element('small', '', row.topic), time(row.at));
      latest.textContent = row.latest;
    }
  };
  card.update();
  return card;
}

function overviewScroller() {
  return selected && !compact.matches ? overview : main;
}

function syncTopButtons() {
  overviewTop.hidden = Boolean(selected && compact.matches) || overviewScroller().scrollTop <= 24;
  detailTop.hidden = !selected || detail.scrollTop <= 24;
}

function scrollToTop(scroller, heading) {
  heading.focus({preventScroll:true});
  scroller.scrollTo({top:0, behavior:reducedMotion.matches ? 'instant' : 'smooth'});
}

function syncDrawer() {
  const drawer = selected !== null && compact.matches;
  for (const part of behindDrawer) part.inert = drawer;
  backdrop.hidden = !drawer;
  if (drawer && !detail.contains(document.activeElement)) closeButton.focus({preventScroll:true});
  syncTopButtons();
}

function renderDetail(row) {
  const meta = element('div', 'event-meta');
  meta.append(element('small', '', row.topic), time(row.at));
  const title = element('h3', '', row.title);
  title.id = 'detail-title';
  title.tabIndex = -1;
  const latest = element('p', 'latest');
  latest.append(element('b', '', '最新进展'), row.latest);
  const summary = element('section', 'event-summary');
  summary.hidden = true;
  const timeline = element('section', 'timeline-panel');
  timeline.id = 'timeline-' + row.id;
  timeline.setAttribute('aria-live', 'polite');
  content.replaceChildren(meta, title, latest, summary, timeline);
  detail.scrollTop = 0;
  syncTopButtons();
  return showTimeline(row, timeline, summary);
}

function setSelected(card, isSelected) {
  card.toggle.setAttribute('aria-expanded', String(isSelected));
  card.disclosure.textContent = isSelected ? '已选' : '查看';
}

function selectCard(card) {
  if (selected === card) {
    closeDetail();
    return;
  }
  if (selected) setSelected(selected, false);
  else overviewScroll = main.scrollTop;
  selected = card;
  setSelected(card, true);
  main.classList.add('reading');
  reader.classList.add('is-reading');
  detail.hidden = false;
  renderDetail(card.row);
  syncDrawer();
  if (!compact.matches) card.article.scrollIntoView({block:'nearest'});
}

function closeDetail(restoreFocus = true) {
  if (!selected) return;
  const card = selected;
  selected = null;
  setSelected(card, false);
  detail.hidden = true;
  content.replaceChildren();
  main.classList.remove('reading');
  reader.classList.remove('is-reading');
  syncDrawer();
  main.scrollTop = overviewScroll;
  if (restoreFocus && card.toggle.isConnected) {
    card.toggle.focus({preventScroll:true});
    card.article.scrollIntoView({block:'nearest'});
  }
}

function render() {
  const rows = (demo === 'empty' ? [] : brief).filter(row => {
    const at = Date.parse(row.at);
    return at >= firstDay && at <= edition && (active === '全部' || row.family === active);
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (selected && !rows.includes(selected.row)) closeDetail(false);
  board.replaceChildren(...rows.map(row => {
    if (!cards.has(row.id)) cards.set(row.id, createCard(row));
    return cards.get(row.id).article;
  }));
  count.textContent = rows.length + ' 件事';
  if (!rows.length) notice(active === '全部' ? '近七天还没有已收录的新闻。' : '这个栏目近七天没有事件。');
}

async function loadFeed(shouldRefresh) {
  refresh.disabled = true;
  notice(shouldRefresh ? '正在读取新进展…' : '正在读取近七天事件…');
  await pause(180);
  if (firstFailure) {
    firstFailure = false;
    notice('简报暂时无法读取。', () => loadFeed(false));
    refresh.disabled = false;
    return;
  }
  ready = true;
  if (shouldRefresh && !updated && demo !== 'empty') {
    updated = true;
    const robot = brief.find(row => row.id === 'robot');
    Object.assign(robot, update);
    cards.get(robot.id)?.update();
    if (selected?.row === robot) renderDetail(robot);
    notice('已更新 1 件事件。');
  } else {
    notice(shouldRefresh ? '暂无新的进展。' : '');
  }
  render();
  refresh.disabled = false;
}

async function renderArchive() {
  archiveFiles.replaceChildren(element('p', 'queued', '正在读取归档样例…'));
  try {
    await pause(130);
    if (archiveFailure) {
      archiveFailure = false;
      throw new Error('演示读取失败');
    }
    await loadSamples('archive');
    archiveFiles.replaceChildren(...window.weeklyArchives.map(item => {
      const file = element('details');
      const path = 'news-archive/' + item.date + '/' + item.id + '.md';
      file.append(element('summary', '', item.date + ' · ' + item.title));
      file.addEventListener('toggle', () => {
        if (!file.open || file.childElementCount > 1) return;
        const markdown = [
          '# ' + item.title, '', '进展日期（JST） ' + item.from + ' 至 ' + item.date, '', item.summary, '',
          '## 消息来源', ...item.sources.map(source => '- ' + source), ''
        ].join('\n');
        const preview = element('pre', '', path + '\n\n' + markdown);
        const save = button('下载此 Markdown 样例', () => {
          const link = element('a');
          link.href = URL.createObjectURL(new Blob([markdown], {type: 'text/markdown;charset=utf-8'}));
          link.download = item.id + '.md';
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }, 'paper-button');
        file.append(preview, save);
      });
      return file;
    }));
  } catch {
    archiveFiles.replaceChildren(element('p', 'queued', '归档暂时无法读取。'),
      button('重试', renderArchive, 'paper-button'));
  }
}

filters.addEventListener('click', event => {
  if (!ready || event.target.tagName !== 'BUTTON') return;
  active = event.target.textContent;
  for (const option of filters.children) {
    option.setAttribute('aria-pressed', String(option.textContent === active));
  }
  notice('');
  render();
});
refresh.addEventListener('click', () => loadFeed(ready));
closeButton.addEventListener('click', () => closeDetail());
backdrop.addEventListener('click', () => closeDetail());
for (const scroller of [main, overview, detail]) scroller.addEventListener('scroll', syncTopButtons, {passive:true});
overviewTop.addEventListener('click', () => scrollToTop(overviewScroller(), overviewTitle));
detailTop.addEventListener('click', () => scrollToTop(detail, document.querySelector('#detail-title')));
compact.addEventListener('change', syncDrawer);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !archive.open && !photoPanel.open && selected) closeDetail();
});
photoPanel.addEventListener('close', () => {
  if (!photoPanel.open) fullPhoto.removeAttribute('src');
});
document.querySelector('#archive').addEventListener('click', () => {
  archive.showModal();
  renderArchive();
});
loadFeed(false);
