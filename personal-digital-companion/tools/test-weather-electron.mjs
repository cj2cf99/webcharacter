import * as electron from 'electron';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {attachWeather} from '../desktop/weather-host.mjs';
import {createReminderChecks} from '../desktop/reminder-checks.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';
import {loadWeatherAuth} from '../desktop/weather-credentials.mjs';
import {loadCloudConnection} from '../desktop/cloud-connection.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = process.env.FEIYUE_WEATHER_SETUP_PROFILE;
async function run() {
  if (!profile) throw new Error('需要隔离测试配置目录');
  await mkdir(profile, {recursive: true});
  electron.app.setName('绯月桌宠试验');
  electron.app.setPath('userData', profile);
  await electron.app.whenReady();
  const isolated = process.argv.includes('--isolated');
  let request;
  if (isolated) {
    request = async path => {
      const [, , , place, kind] = path.split('/');
      if (kind === 'current') return Response.json({validTime:new Date().toISOString(), condition:{text:'小雨'}, temperature:{value:12}, wind:{speed:{value:2}}});
      if (kind === 'minimum') {
        const japan = place === 'kokurakita';
        const zone = japan ? 'Asia/Tokyo' : 'Asia/Shanghai';
        const date = new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(Date.now());
        const start = date + (japan ? 'T00:00+09:00' : 'T00:00+08:00');
        return Response.json({days:[{forecastStartTime:start,forecastEndTime:new Date(Date.parse(start)+86400000).toISOString(),temperatureMin:{unit:'°C',value:2},temperatureMax:{unit:'°C',value:17}}]});
      }
      if (kind !== 'alerts') return Response.json([]);
      if (place === 'kokurakita') return Response.json([{warning:{class20Items:[{areaCode:'4010000',kinds:[{code:'03',status:'発表'}]}]}}]);
      return Response.json({alerts:[]});
    };
  } else {
    const credentials = await loadWeatherAuth();
    assert.ok(credentials, '未加载本机天气凭据');
    const live = await fetch(credentials.origin + '/weather/v1/current/33.88/130.88?lang=zh', {
      headers: credentials.header(), redirect: 'error', signal: AbortSignal.timeout(9000),
    });
    assert.equal(live.status, 200, 'Electron 中的和风天气鉴权失败');
    await live.body?.cancel();
    request = (await loadCloudConnection(profile))?.request;
    assert.equal(typeof request, 'function', '需要已配置的天气 Worker 连接');
  }
  const notifications = [];
  class ObservedNotification {
    static isSupported() { return true; }
    constructor(value) { this.value = value; }
    on() {}
    show() { notifications.push(this.value); }
  }
  const requestTimes=[],checks=createReminderChecks({profile,isBusy:()=>false,handlers:{weather:()=>host.check()}});
  const host = attachWeather({...electron, Notification: ObservedNotification},
    {root, bundle: resolve(root, 'output/desktop-bundle'), profile, background: true, visible: false,
      checks,recordCheck:checks.record,request: (...args) => { requestTimes.push(Date.now()); return request(...args); }});
  try {
    const startupTime=Date.now();
    checks.start();
    assert.equal(requestTimes.length,0,'启动不发自动天气请求');
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
    assert.equal(notifications.length,0,'首分钟手动查询可读，自动提醒仍在等待');
    const manualRequests=requestTimes.length;
    while(requestTimes.length===manualRequests && Date.now()-startupTime<75_000)
      await new Promise(resolve=>setTimeout(resolve,100));
    const firstCheckDelay=requestTimes[manualRequests]-startupTime;
    assert.ok(firstCheckDelay>=60_000,'自动检查应在启动满一分钟后发起');
    await until('window.feiyueWeather.get().then(data=>!data.busy)');
    console.log('首次自动天气检查在启动后 '+(firstCheckDelay/1000).toFixed(1)+' 秒发起。');
    assert.deepEqual(result.rows.map(row => [row.current.state, row.alerts.state]), Array.from({length: 3}, () => ['ready', 'ready']));
    assert.ok(result.rows.every(row => row.minimum.state === 'ready'));
    assert.equal(result.rows[0].japan.tracks.state, 'ready');
    assert.equal(result.rows[0].japan.bulletins.state, 'ready');
    assert.ok(notifications.length <= 1);
    if (isolated) {
      const log=checks.read(tokyoDay(Date.now()));
      const places=log.events.filter(row=>row.project.startsWith('天气 · '));
      assert.equal(places.length,3,'首次自动检查为每个地点保留一条检查回执');
      assert.ok(places.every(row=>row.status==='已检查'&&row.detail.includes('全天 2～17°C')));
      assert.ok(Math.abs(log.nextWeatherAt-checks.weatherState().lastCheck-3600_000)<2000);
      assert.equal(notifications.length,0,'不弹系统通知');
      const notices=checks.notices();assert.equal(notices.unread,1);
      const lines = notices.events[0].body.split('\n');
      assert.equal(lines.length,3);
      for (const [index, row] of result.rows.entries()) {
        assert.ok(lines[index].startsWith(row.name));
        assert.doesNotMatch(lines[index], /小雨|暂无生效预警/);
        if(index===0)assert.match(lines[index],/大雨.*警報/);
        assert.match(lines[index], /最低 2°C/);
      }
    }
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
    console.log((isolated ? '原生面板隔离验证' : '原生面板真实接口验证') + '通过 · 三地天气与警报汇总、提醒去重及双主题窄窗');
    console.log(JSON.stringify(result.rows.map(({id, current, alerts, minimum, japan}) => ({
      place: id, temperature: current.value.temperature, validTime: current.value.time,
      dailyMinimum: minimum.value.temperature, date: minimum.value.day, belowThreshold: minimum.value.below,
      cyclones: japan?.tracks.values, bulletins: japan?.bulletins.values.length,
      activeAlerts: alerts.value.values.map(a => ({issuer: a.issuer, title: a.title})),
    }))));
  } finally {
    host.close();
    checks.close();
  }
}
run().then(() => electron.app.exit(0), error => {
  console.error(error);
  electron.app.exit(1);
});
