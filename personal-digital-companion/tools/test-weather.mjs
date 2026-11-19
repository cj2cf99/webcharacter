import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPairSync, verify} from 'node:crypto';
import {qweatherAuth} from '../desktop/weather-credentials.mjs';
import {createWorker} from '../agent/worker.mjs';
import {createWeatherService, parseChinaAlerts, parseJapaneseAlerts, parseDailyMinimum, WEATHER_PLACES} from '../desktop/weather-service.mjs';
import {JMA_TRACKS, JMA_BULLETINS, parseTyphoonTracks, parseJapanBulletins} from '../desktop/jma-typhoon.mjs';

const timestamp = '2026-11-19T01:00:00.000Z';
const at = Date.parse(timestamp);
const current = {validTime: timestamp, condition: {text: '阴', code: '104'}, temperature: {value: 11.7}, wind: {speed: {value: 3.3}}};
const report = (...kinds) => ({reportDatetime: timestamp, publishingOffice: '福岡管区気象台',
  warning: {class20Items: [{areaCode: '4010000', kinds}]}});
const warning = (id, code, supersedes = [], color = 'orange') => ({
  id, messageType: {code, supersedes}, senderName: '气象台', eventType: {name: '大风', code: '1006'}, color: {code: color},
  expireTime: '2026-11-20T01:00:00Z',
});
const proxyKey = generateKeyPairSync('ed25519');
const proxyEnv = {API_TOKEN: 'isolated-test', QWEATHER_HOST: 'test.re.qweatherapi.com',
  QWEATHER_DEVELOPER_ID: 'Q000000000', QWEATHER_PROJECT_ID: 'P000000000', QWEATHER_CREDENTIAL_ID: 'K000000000',
  QWEATHER_PRIVATE_KEY: proxyKey.privateKey.export({format: 'pem', type: 'pkcs8'})};
function viaServer(fetcher) {
  const worker = createWorker({weatherOptions: {fetcher, now: () => at}});
  return (path, options) => {
    assert.match(path, /^\/api\/weather\//);
    return worker.fetch(new Request('https://worker.test' + path, {...options,
      headers: {Authorization: 'Bearer isolated-test'}}), proxyEnv);
  };
}

test('JWT 按真实接口声明签名并包含开发者、项目和凭据标识', () => {
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  const auth = qweatherAuth({host: 'test.re.qweatherapi.com', developerId: 'Q000000000',
    projectId: 'P000000000', credentialId: 'K000000000', privatePem: privateKey.export({format: 'pem', type: 'pkcs8'})}, () => at);
  const [header, claims, signature] = auth.header().Authorization.slice('Bearer '.length).split('.');
  assert.equal(verify(null, Buffer.from(header + '.' + claims), publicKey, Buffer.from(signature, 'base64url')), true);
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {alg: 'EdDSA', kid: 'K000000000'});
  assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).sub, 'P000000000');
});

test('中日预警采用各自的发布和解除语义，拒绝把未知状态显示为无预警', () => {
  const china = parseChinaAlerts({alerts: [warning('a', 'alert'), warning('b', 'update', ['a']),
    warning('c', 'alert'), warning('d', 'cancel', ['c'])]}, at);
  assert.equal(china.values.length, 1);
  assert.equal(china.values[0].level, 4);
  assert.equal(china.values[0].focus, '暴风');
  const japan = parseJapaneseAlerts([
    report({code: '15', status: '継続'}, {code: '43', status: '解除'}),
    report({code: '16', status: '発表'}),
  ]);
  assert.deepEqual(japan.values.map(x => x.title), ['強風注意報', '波浪注意報']);
  assert.deepEqual(japan.values.map(x => x.focus), ['暴风', '']);
  assert.throws(() => parseJapaneseAlerts([{areaTypes: []}]), /北九州市/);
  assert.throws(() => parseJapaneseAlerts([report({code: '15', status: 'unexpected'})]), /不可识别/);
});

test('三地实况、分源预警、升级去重与失败后的上次数据', async () => {
  const notifications = [];
  let cn = [warning('a', 'alert')];
  let unavailable = false;
  let reportCode = '03';
  const api = createWeatherService({
    clock: () => at,
    important: (row, alerts) => notifications.push([row.id, ...alerts.map(a => a.level)]),
    request: viaServer(async (url, {headers, redirect}) => {
      assert.equal(redirect, 'manual');
      if (unavailable) return new Response(null, {status: 503});
      if (url.includes('www.jma.go.jp')) {
        assert.equal(headers, undefined);
        if (url === JMA_TRACKS || url === JMA_BULLETINS) return Response.json([]);
        return Response.json([report({code: reportCode, status: '発表'})]);
      }
      assert.match(url, /^https:\/\/test\.re\.qweatherapi\.com\//);
      const [header, claims, signature] = headers.Authorization.slice('Bearer '.length).split('.');
      assert.equal(verify(null, Buffer.from(header + '.' + claims), proxyKey.publicKey, Buffer.from(signature, 'base64url')), true);
      if (url.includes('/weather/v1/daily/')) return Response.json({days: [dayForecast('2026-11-19', '+09:00', 12)]});
      if (url.includes('/weather/v1/')) return Response.json(current);
      return Response.json({alerts: url.includes('108.14') ? cn : []});
    }),
  });
  const value = await api.refreshAll();
  assert.equal(value.rows.length, 3);
  assert.deepEqual(value.rows.map(row => [row.current.state, row.alerts.state]), Array.from({length: 3}, () => ['ready', 'ready']));
  await api.refreshAlerts();
  assert.deepEqual(notifications, [['kokurakita', 3], ['yongshou', 4]]);
  cn = [warning('b', 'update', ['a'], 'red')];
  reportCode = '43';
  await api.refreshAlerts();
  assert.deepEqual(notifications.slice(2), [['kokurakita', 4], ['yongshou', 5]]);
  unavailable = true;
  const stale = await api.refreshAll();
  assert.ok(stale.rows.every(row => row.current.state === 'error' && row.current.value.temperature === 11.7));
  assert.equal(stale.rows[2].alerts.value.values.length, 1);
  assert.equal(stale.rows[0].japan.tracks.state, 'error');
  assert.deepEqual(stale.rows[0].japan.tracks.values, []);
  api.close();
});

function dayForecast(day, offset, temperature) {
  const start = day + 'T00:00' + offset;
  return {forecastStartTime: start, forecastEndTime: new Date(Date.parse(start) + 86400_000).toISOString(),
    temperatureMin: {value: temperature, unit: '°C'}};
}

const bulletin = ({header = 'VPFJ51', areaCode = '400000', eventId = 'a', title = '福岡県気象解説情報（台風第２号）',
  datetime = timestamp, infoType = '発表', valid = '2026-11-20T01:00:00Z', infoTag = []} = {}) =>
  ({header, areaCode, eventId, headTitle: title, reportDatetime: datetime, infoType, validMap: valid, infoTag});

test('台风路径、全国通报与福冈／九州北部通报分别识别，排除无关与取消信息', () => {
  assert.deepEqual(parseTyphoonTracks([]), []);
  assert.deepEqual(parseTyphoonTracks([{tropicalCyclone: '202602', typhoonNumber: '02'},
    {tropicalCyclone: '2026A', typhoonNumber: 'a'}]), ['台风第2号', '发展中的热带低气压 a']);
  assert.throws(() => parseTyphoonTracks({items: []}), /格式/);
  const local = bulletin();
  const national = bulletin({header: 'VPZJ51', areaCode: '010000', eventId: 'n'});
  const list = parseJapanBulletins([national, local,
    bulletin({header: 'VPCJ51', areaCode: '010900', eventId: 'c', title: '強い寒気に関する九州北部地方気象解説情報'}),
    bulletin({header: 'VPCJ51', areaCode: '010800', eventId: 's'}),
    bulletin({eventId: 'former', title: '福岡県気象解説情報（元台風の低気圧）'}),
    bulletin({eventId: 'expired', valid: timestamp}),
    bulletin({eventId: 'ordinary', title: '発達する低気圧に関する情報'}),
  ], at);
  assert.deepEqual(list.map(item => [item.scope, item.type, item.local]), [
    ['福冈县', '台风', true], ['九州北部', '寒潮／低温', true], ['日本全国', '台风', false],
  ]);
  assert.equal(list[0].key, list[2].key);
  assert.deepEqual(parseJapanBulletins([local, bulletin({datetime: '2026-11-19T01:00:01Z',
    title: '', infoType: '取消'})], at + 1000), []);
});

test('日本 10°C 和中国 5°C 使用严格小于；东京跨日时按地点日期选择预报', () => {
  const midnightTokyo = Date.parse('2026-11-19T15:00:00Z');
  const japan = (temperature) => parseDailyMinimum({days: [dayForecast('2026-11-20', '+09:00', temperature)]},
    WEATHER_PLACES[0], midnightTokyo);
  const china = (temperature) => parseDailyMinimum({days: [dayForecast('2026-11-19', '+08:00', temperature)]},
    WEATHER_PLACES[1], midnightTokyo);
  assert.deepEqual([japan(10).below, japan(9.99).below, china(5).below, china(4.99).below], [false, true, false, true]);
  assert.deepEqual([japan(10).day, china(5).day], ['2026-11-20', '2026-11-19']);
  assert.throws(() => parseDailyMinimum({days: [dayForecast('2026-11-19', '+09:00', 3)]}, WEATHER_PLACES[0], midnightTokyo), /不可用/);
});

test('关注项提醒包含低等级正式预警；本地台风与最低温跨服务重建不重复', async () => {
  const notifications = [];
  let seen = {};
  let date = '2026-11-19';
  let now = at;
  let localBulletin = [];
  const options = {
    clock: () => now,
    important: (row, alerts, kind = '官方预警') => notifications.push([row.id, kind, alerts[0].title]),
    saveSeen: value => { seen = structuredClone(value); },
    request: viaServer(async url => {
      if (url === JMA_TRACKS) return Response.json([{tropicalCyclone: '202602', typhoonNumber: 2}]);
      if (url === JMA_BULLETINS) return Response.json([bulletin({header: 'VPZJ51', areaCode: '010000'}), ...localBulletin]);
      if (url.includes('www.jma.go.jp')) return Response.json([report({code: '23', status: '発表'})]);
      if (url.includes('/daily/')) return Response.json({days: [dayForecast(date, url.includes('130.88') ? '+09:00' : '+08:00', 4.99)]});
      if (url.includes('/weather/v1/')) return Response.json(current);
      return Response.json({alerts: []});
    }),
  };
  let service = createWeatherService({...options, seen});
  await service.refreshAll();
  assert.equal(notifications.filter(([, k]) => k === '低温提醒').length, 3);
  assert.equal(notifications.filter(([, k]) => k === '气象通报').length, 0);
  assert.deepEqual(notifications.find(([, k]) => k === '官方预警'), ['kokurakita', '官方预警', '低温注意報']);
  localBulletin = [bulletin()];
  await service.refreshAlerts();
  assert.equal(notifications.filter(([, k]) => k === '气象通报').length, 1);
  service.close();
  service = createWeatherService({...options, seen});
  await service.refreshAll();
  assert.equal(notifications.length, 5);
  date = '2026-11-20';
  now += 86400_000;
  await service.refreshCurrent();
  assert.equal(notifications.filter(([, k]) => k === '低温提醒').length, 6);
  service.close();
});

test('天气 Worker 按既有鉴权和固定路由处理，客户端无服务时不外联', async () => {
  let calls = 0;
  const worker = createWorker({weatherOptions: {fetcher: () => { calls++; return Response.json([]); }}});
  const get = (suffix, authenticated = true) => worker.fetch(new Request('https://worker.test/api/weather/' + suffix, {
    headers: authenticated ? {Authorization: 'Bearer isolated-test'} : {},
  }), {API_TOKEN: 'isolated-test'});
  assert.equal((await get('kokurakita/tracks', false)).status, 401);
  assert.equal((await get('kokurakita/tracks?url=https://somewhere.test')).status, 404);
  assert.equal((await get('weiyang/current')).status, 503);
  assert.equal((await get('kokurakita/tracks')).status, 200);
  assert.equal(calls, 1);
  const desktop = createWeatherService({});
  const result = await desktop.refreshAll();
  assert.equal(result.rows[0].japan.tracks.state, 'unconfigured');
  assert.ok(result.rows.every(row => row.current.state === 'unconfigured'));
  desktop.close();
});
