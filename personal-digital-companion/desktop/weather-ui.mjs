const api = window.feiyueWeather;
const places = document.querySelector('#places');
const refresh = document.querySelector('#refresh');
const status = document.querySelector('#status');
const sources = document.querySelector('#sources');
const clock = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const timeText = value => Number.isFinite(new Date(value).getTime()) ? clock.format(new Date(value)) + ' JST' : '';
const temperatureText = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2});
function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function icon({icon: code}) {
  const value = Number(code);
  if (value >= 400 && value < 500) return '❄️';
  if (value >= 300 && value < 400) return '🌧️';
  if (value === 100 || value === 150) return '☀️';
  if (value >= 101 && value <= 154) return '☁️';
  if (value >= 500 && value < 600) return '🌫️';
  return '🌡️';
}
function showCurrent(row, card) {
  const {value, state} = row.current;
  const line = element('div', '', 'weather-line');
  const title = element('h2');
  title.append(element('span', row.owner, 'label'), document.createTextNode(row.name));
  const stats = element('p', '', 'stats');
  if (value) {
    stats.append(document.createTextNode(icon(value) + ' '), element('strong', Math.round(value.temperature) + '°'),
      document.createTextNode(' · ' + value.text + ' · 风 ' + value.wind.toFixed(1) + ' m/s'));
  } else {
    stats.textContent = state === 'unconfigured' ? '天气服务待接入' : state === 'error' ? '实况暂不可用' : '正在查询…';
  }
  line.append(title, stats);
  card.append(line);
  if (value) card.append(element('p', timeText(value.time) + (state === 'error' ? ' · 上次数据' : ''), 'age'));
}
function showMinimum(row, card) {
  const {state, value} = row.minimum;
  if (!value) {
    if (state === 'error') card.append(element('p', '最低温预报暂未更新', 'age'));
    return;
  }
  const degree = temperatureText.format(value.temperature);
  const date = value.day.slice(5).replace('-', '/');
  const note = state === 'error' ? ' · 上次预报' : value.below ? ' · 低于 ' + value.threshold + '°C' : '';
  card.append(element('p', date + ' 当地最低温预报 ' + degree + '°C' + note,
    value.below && state === 'ready' ? 'age alert minimum' : 'age minimum'));
}
function showJapan({tracks, bulletins}, card) {
  const block = element('section', '', 'japan-updates');
  const systems = tracks.values?.join('、');
  const trackText = tracks.state === 'error' ? '台风动态暂未更新' + (systems ? ' · 上次 ' + systems : '')
    : tracks.state === 'ready' ? (systems ? '气象厅跟踪中 · ' + systems : '暂无发布中的台风动态') : '正在查询台风动态…';
  block.append(element('p', trackText, 'alert-line'));
  if (bulletins.state === 'error') block.append(element('p', '气象通报暂未更新', 'alert-line'));
  if (bulletins.state === 'ready' && !bulletins.values.some(report => report.local)) {
    block.append(element('p', '暂无福冈或九州北部台风、低温通报', 'alert-line'));
  }
  for (const report of (bulletins.values ?? []).slice(0, 5)) {
    block.append(element('p', [report.scope, report.type, report.title, timeText(report.time)].join(' · '),
      report.local ? 'alert-line alert' : 'alert-line'));
  }
  card.append(block);
}
function showAlerts(row, card, opened) {
  const {state, value} = row.alerts;
  if (state !== 'ready') {
    const label = state === 'error' ? '预警暂未更新' : state === 'unconfigured' ? '预警待配置' : '正在检查预警…';
    card.append(element('p', label + (value?.values.length ? ' · 以下为上次结果' : ''), 'alert-line'));
  }
  if (state === 'ready' && value.values.length === 0) card.append(element('p', '暂无生效预警', 'alert-line'));
  for (const [index, alert] of (value?.values ?? []).entries()) {
    const details = element('details');
    details.dataset.alert = [row.id, alert.key, index].join(':');
    details.open = opened.has(details.dataset.alert);
    const label = alert.focus ? alert.focus + ' · ' + alert.title : alert.title;
    details.append(element('summary', label, alert.level >= 4 ? 'alert urgent' : 'alert'));
    details.append(element('p', [alert.issuer, timeText(alert.time)].filter(Boolean).join(' · '), 'official'));
    if (alert.detail) details.append(element('p', alert.detail, 'detail'));
    card.append(details);
  }
  if (row.id === 'kokurakita') {
    showJapan(row.japan, card);
    const links = element('div', '', 'links');
    for (const [target, title] of [['radar', '雨云雷达'], ['warning', '北九州市官方预警'],
      ['typhoon', '台风路径'], ['bulletin', '福冈气象通报']]) {
      const button = element('button', title);
      button.type = 'button';
      button.onclick = () => void api.openJma(target).catch(() => { status.textContent = '链接暂时打不开'; });
      links.append(button);
    }
    card.append(links);
  }
}
function render(data) {
  const opened = new Set([...places.querySelectorAll('details[open]')].map(item => item.dataset.alert));
  const notices = new Set();
  const cards = data.rows.map(row => {
    const card = element('article');
    showCurrent(row, card);
    showMinimum(row, card);
    showAlerts(row, card, opened);
    for (const result of [row.current, row.alerts, row.minimum]) {
      for (const notice of result.value?.notices ?? []) notices.add(notice);
    }
    return card;
  });
  places.replaceChildren(...cards);
  sources.replaceChildren(...[...notices].map(notice => {
    if (notice === 'https://developer.qweather.com/attribution.html') return element('span', '数据来源　和风天气');
    return element('span', notice);
  }));
  const loading = data.busy || data.rows.some(row => [row.current, row.alerts, row.minimum].some(item => item.state === 'idle'));
  refresh.disabled = loading;
  places.setAttribute('aria-busy', String(loading));
  status.textContent = loading ? '正在刷新…' : '';
}
function fail() {
  refresh.disabled = false;
  places.setAttribute('aria-busy', 'false');
  status.textContent = '天气面板暂不可用，请刷新重试。';
}
refresh.onclick = async () => {
  refresh.disabled = true;
  try { render(await api.refresh()); } catch { fail(); }
};
api.onChange(render);
try {
  const value = await api.get();
  render(value);
  if (!value.busy && value.rows.some(row => row.current.state === 'idle' || row.alerts.state === 'idle')) {
    await api.refresh();
  }
} catch { fail(); }
