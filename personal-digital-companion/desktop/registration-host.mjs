import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {createPanelWindow} from './panel-window.mjs';

export function attachRegistration(electron, { bundle, root, flow, visible = true }) {
  const {ipcMain}=electron;
  let panel = null;
  const entry = resolve(bundle, 'registration.html');
  const url = pathToFileURL(entry).href;
  const channel = 'registration:run';

  ipcMain.handle(channel, (event, action, text) => {
    if (!panel || panel.isDestroyed() || event.sender !== panel.webContents
      || event.senderFrame !== panel.webContents.mainFrame) throw Error('仅登记窗口可以操作');
    if (action === 'submit') return flow.submit(text);
    if (action === 'resume') return flow.resume();
    return flow.decide(action);
  });

  async function open() {
    if (panel && !panel.isDestroyed()) {
      if (visible) { panel.show(); panel.focus(); }
      return;
    }
    const created = createPanelWindow(electron,{
      width: 468, height: 410, minWidth: 360, minHeight: 320, show: false,
      autoHideMenuBar: true, title: '绯月 · 随口登记',
      webPreferences: {
        preload: resolve(root, 'desktop/registration-preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true,
      },
    },root);
    panel = created;
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    created.webContents.on('will-navigate', (event, target) => { if (target !== url) event.preventDefault(); });
    created.on('closed', () => { if (panel === created) panel = null; });
    try { await created.loadFile(entry); }
    catch (error) { if (!created.isDestroyed()) created.destroy(); throw error; }
    if (visible && panel === created && !created.isDestroyed()) { created.show(); created.focus(); }
  }

  return {
    open,
    get panel() { return panel; },
    close() { ipcMain.removeHandler(channel); if (panel && !panel.isDestroyed()) panel.destroy(); },
  };
}
