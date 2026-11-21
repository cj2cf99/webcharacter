import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow,showPanel} from './panel-window.mjs';

export function attachReminderReview(electron, {bundle, root, flow, visible = true}) {
  const {ipcMain}=electron;
  const entry = resolve(bundle, 'reminder-review.html');
  const url = pathToFileURL(entry).href;
  const handlers = {'reminder-review:load': () => flow.load(), 'reminder-review:apply': choices => flow.apply(choices)};
  let panel = null;
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, value) => {
      if (!panel || panel.isDestroyed() || event.sender !== panel.webContents
        || event.senderFrame !== panel.webContents.mainFrame) throw Error('仅今日任务窗口可以操作。');
      return handler(value);
    });
  }
  return {
    async open() {
      if (panel && !panel.isDestroyed()) {
        if (visible) { showPanel(panel); panel.focus(); }
        return;
      }
      const window = createPanelWindow(electron,{title: '绯月 · 今日任务', width: 565, height: 565, minWidth: 360, minHeight: 365,
        show: false, autoHideMenuBar: true, webPreferences: {preload: resolve(root, 'desktop/reminder-review-preload.cjs'),
          nodeIntegration: false, contextIsolation: true, sandbox: true}},root);
      panel = window;
      window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
      window.webContents.on('will-navigate', (event, target) => { if (target !== url) event.preventDefault(); });
      window.on('closed', () => { if (panel === window) panel = null; });
      try { await window.loadFile(entry); }
      catch (error) { if (!window.isDestroyed()) window.destroy(); throw error; }
      if (visible && panel === window && !window.isDestroyed()) { showPanel(window); window.focus(); }
    },
    get panel() { return panel; },
    close() {
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
      if (panel && !panel.isDestroyed()) panel.destroy();
    },
  };
}
