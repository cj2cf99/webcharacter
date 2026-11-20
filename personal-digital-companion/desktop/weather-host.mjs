import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow} from './panel-window.mjs';
import {createWeatherService, JMA_WARNING_PAGE, JMA_RADAR_PAGE} from './weather-service.mjs';
import {JMA_TYPOON_PAGE, JMA_BULLETIN_PAGE} from './jma-typhoon.mjs';

const jmaPages = new Map([
  ['radar', JMA_RADAR_PAGE], ['warning', JMA_WARNING_PAGE],
  ['typhoon', JMA_TYPOON_PAGE], ['bulletin', JMA_BULLETIN_PAGE],
]);

export function attachWeather(electron, {bundle, root, profile, service, request, background = true, visible = true}) {
  const {ipcMain, Notification, shell} = electron;
  const noticePath = resolve(profile, 'weather-notices.json');
  let seen = {};
  try {
    const saved = JSON.parse(readFileSync(noticePath, 'utf8'));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) seen = saved;
  } catch {}
  let panel = null;
  let closed = false;
  const timers = [];
  const triggers = new Map();
  function collectReminder(row, items, category = '官方预警') {
    const reasons = triggers.get(row.id) ?? [];
    reasons.push(...items.map(item => ({title: item.title, category})));
    triggers.set(row.id, reasons);
  }
  function publish(data) {
    if (panel && !panel.isDestroyed()) panel.webContents.send('weather:changed', data);
    if (data.busy || !triggers.size) return;
    const body = data.rows.map(row => {
      const reasons = triggers.get(row.id) ?? [];
      const weather = row.current.state === 'ready'
        ? row.current.value.text + ' ' + row.current.value.temperature + '°C' : '实况未更新';
      let warnings = '警报未更新';
      if (row.alerts.state === 'ready') {
        const titles = new Set([
          ...reasons.filter(item => item.category === '官方预警').map(item => item.title),
          ...row.alerts.value.values.map(item => item.title),
        ]);
        warnings = [...titles].join('、') || '暂无生效预警';
      }
      const extra = reasons.filter(item => item.category !== '官方预警').map(item => item.title);
      return row.name + '：' + [weather, warnings, ...extra].join(' · ');
    }).join('\n');
    triggers.clear();
    notify(body);
  }
  function notify(body) {
    const showPanel = () => void open(false).catch(() => {});
    if (!Notification?.isSupported()) { showPanel(); return; }
    const notice = new Notification({title: '绯月 · 三地天气与警报', body});
    notice.on('click', () => void open().catch(() => {}));
    notice.on('failed', showPanel);
    try { notice.show(); } catch { showPanel(); }
  }
  const api = service ?? createWeatherService({
    request,
    important: collectReminder,
    seen,
    saveSeen: value => {
      try {
        writeFileSync(noticePath + '.tmp', JSON.stringify(value));
        renameSync(noticePath + '.tmp', noticePath);
      } catch {}
    },
    onChange: publish,
  });
  function trusted(event) {
    return panel && !panel.isDestroyed() && event.sender === panel.webContents && event.senderFrame === panel.webContents.mainFrame;
  }
  const handlers = {
    'weather:get': () => api.snapshot(),
    'weather:refresh': () => api.refreshAll(),
    'weather:jma': (_event, page) => {
      const url = jmaPages.get(page);
      if (url) return shell.openExternal(url);
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, value) => {
      if (!trusted(event)) throw new Error('仅天气窗口可使用');
      return handler(event, value);
    });
  }
  async function open(activate = true) {
    if (closed) return;
    if (panel && !panel.isDestroyed()) {
      if (visible && activate) { panel.show(); panel.focus(); }
      else if (visible && !panel.isVisible()) panel.showInactive();
      return;
    }
    const created = createPanelWindow(electron,{title: '绯月 · 三地天气', width: 560, height: 465,
      minWidth: 360, minHeight: 330, show: false, autoHideMenuBar: true,
      webPreferences: {preload: resolve(root, 'desktop/weather-preload.cjs'), sandbox: true,
        nodeIntegration: false, contextIsolation: true, webSecurity: true, offscreen: !visible}},root);
    panel = created;
    const entry = resolve(bundle, 'weather.html');
    created.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    created.webContents.on('will-navigate', (event, url) => {
      if (url !== pathToFileURL(entry).href) event.preventDefault();
    });
    created.on('closed', () => { if (panel === created) panel = null; });
    try {
      await created.loadFile(entry);
      if (closed || panel !== created || created.isDestroyed()) return;
      if (visible && activate) created.show();
      else if (visible) created.showInactive();
    } catch (error) {
      if (!created.isDestroyed()) created.destroy();
      throw error;
    }
  }
  async function start() {
    if (!background || !process.versions.electron || service || closed || !request) return;
    void api.refreshAll();
    timers.push(setInterval(api.refreshAlerts, 10 * 60_000), setInterval(api.refreshCurrent, 30 * 60_000));
  }
  function close() {
    closed = true;
    for (const timer of timers) clearInterval(timer);
    api.close();
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
    if (panel && !panel.isDestroyed()) panel.destroy();
  }
  return {open, start, close, get panel() {return panel;}};
}
