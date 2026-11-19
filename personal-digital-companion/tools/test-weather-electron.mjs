import * as electron from 'electron';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {attachWeather} from '../desktop/weather-host.mjs';
import {loadWeatherAuth} from '../desktop/weather-credentials.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = process.env.FEIYUE_WEATHER_SETUP_PROFILE;
async function run() {
  if (!profile) throw new Error('需要隔离测试配置目录');
  await mkdir(profile, {recursive: true});
  electron.app.setName('绯月桌宠试验');
  electron.app.setPath('userData', profile);
  await electron.app.whenReady();
  const credentials = await loadWeatherAuth();
  assert.ok(credentials, '未加载本机天气凭据');
  const live = await fetch(credentials.origin + '/weather/v1/current/33.88/130.88?lang=zh', {
    headers: credentials.header(), redirect: 'error', signal: AbortSignal.timeout(9000),
  });
  assert.equal(live.status, 200, 'Electron 中的和风天气鉴权失败');
  await live.body?.cancel();
  const notifications = [];
  class ObservedNotification {
    static isSupported() { return true; }
    constructor(value) { this.value = value; }
    on() {}
    show() { notifications.push(this.value); }
  }
  const host = attachWeather({...electron, Notification: ObservedNotification},
    {root, bundle: resolve(root, 'output/desktop-bundle'), profile, background: false, visible: false});
  try {
    await host.open();
    const panel = host.panel;
    const dom = expression => panel.webContents.executeJavaScript(expression);
    const until = async expression => {
      const end = Date.now() + 16_000;
      while (Date.now() < end) {
        if (await dom(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      throw new Error('页面迟迟未加载');
    };
    await until("document.querySelectorAll('article').length === 3 && document.querySelector('#places').ariaBusy === 'false'");
    const result = await dom('window.feiyueWeather.get()');
    assert.deepEqual(result.rows.map(row => [row.current.state, row.alerts.state]), Array.from({length: 3}, () => ['ready', 'ready']));
    assert.ok(result.rows.every(row => row.minimum.state === 'ready'));
    assert.equal(result.rows[0].japan.tracks.state, 'ready');
    assert.equal(result.rows[0].japan.bulletins.state, 'ready');
    assert.equal(notifications.filter(item => item.title.endsWith(' · 低温提醒')).length,
      result.rows.filter(row => row.minimum.value.below).length);
    const notified = notifications.length;
    await dom('window.feiyueWeather.refresh()');
    assert.equal(notifications.length, notified);
    assert.ok(result.rows.every(row => Math.abs(Date.now() - Date.parse(row.current.value.time)) < 3 * 3600_000));
    assert.ok(!/Authorization|privatePem|credentialId/.test(JSON.stringify(result)));
    assert.deepEqual(result.rows.map(row => row.id), ['kokurakita', 'weiyang', 'yongshou']);
    for (const theme of ['dark', 'light']) {
      electron.nativeTheme.themeSource = theme;
      panel.setSize(370, 360);
      await until('document.documentElement.scrollWidth <= innerWidth');
      assert.equal(await dom("document.querySelectorAll('.stats strong').length"), 3);
      assert.equal(await dom("document.querySelectorAll('.minimum').length"), 3);
      assert.equal(await dom("document.querySelectorAll('.links button').length"), 4);
    }
    console.log('原生面板真实接口通过 · 3 地实况、3 地预警及最低温、JMA 台风动态、双主题窄窗、提醒触发与去重');
    console.log(JSON.stringify(result.rows.map(({id, current, alerts, minimum, japan}) => ({
      place: id, temperature: current.value.temperature, validTime: current.value.time,
      dailyMinimum: minimum.value.temperature, date: minimum.value.day, belowThreshold: minimum.value.below,
      cyclones: japan?.tracks.values, bulletins: japan?.bulletins.values.length,
      activeAlerts: alerts.value.values.map(a => ({issuer: a.issuer, title: a.title})),
    }))));
  } finally {
    host.close();
  }
}
run().then(() => electron.app.exit(0), error => {
  console.error(error);
  electron.app.exit(1);
});
