import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWeatherService, JMA_WARNING_PAGE, JMA_RADAR_PAGE} from './weather-service.mjs';
import {JMA_TYPOON_PAGE, JMA_BULLETIN_PAGE} from './jma-typhoon.mjs';

const jmaPages = new Map([
  ['radar', JMA_RADAR_PAGE], ['warning', JMA_WARNING_PAGE],
  ['typhoon', JMA_TYPOON_PAGE], ['bulletin', JMA_BULLETIN_PAGE],
]);

export function attachWeather(electron, {bundle, root, profile, service, request, background = true, visible = true}) {
  const {BrowserWindow, ipcMain, Notification, shell} = electron;
  const noticePath = resolve(profile, 'weather-notices.json');
  let seen = {};
  try {
    const saved = JSON.parse(readFileSync(noticePath, 'utf8'));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) seen = saved;
  } catch {}
  let panel = null;
  let closed = false;
  const timers = [];
  function publish(data) {
    if (panel && !panel.isDestroyed()) panel.webContents.send('weather:changed', data);
  }
  function notify(row, alerts, category = '官方预警') {
    const showPanel = () => void open(false).catch(() => {});
    if (!Notification?.isSupported()) { showPanel(); return; }
    const body = alerts.slice(0, 3).map(alert => alert.title).join('\n');
    const notice = new Notification({title: row.name + ' · ' + category, body});
    notice.on('click', () => void open().catch(() => {}));
    notice.on('failed', showPanel);
    try { notice.show(); } catch { showPanel(); }
  }
  const api = service ?? createWeatherService({
    request,
    important: notify,
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
    const created = new BrowserWindow({title: '绯月 · 三地天气', width: 560, height: 465,
      minWidth: 360, minHeight: 330, show: false, autoHideMenuBar: true,
      webPreferences: {preload: resolve(root, 'desktop/weather-preload.cjs'), sandbox: true,
        nodeIntegration: false, contextIsolation: true, webSecurity: true, offscreen: !visible}});
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
