import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPairSync, verify} from 'node:crypto';
import {qweatherAuth} from '../desktop/weather-credentials.mjs';
import {createWorker} from '../agent/worker.mjs';
import {matchWeatherQuestion} from '../agent/weather/question.mjs';
import {createScreenQuestionClient} from '../desktop/screen-question-client.mjs';
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

test('天气分流区分实况、预报、预警、未覆盖地点和普通问题', () => {
  for (const text of ['今天天气好不好？', '帮我看下今天的天气', '现在外面几度？']) {
    const result = matchWeatherQuestion(text);
    assert.equal(result.kind, 'current', text);
  }
  assert.equal(matchWeatherQuestion('父母那边今天有没有雨').kind, 'current');
  assert.equal(matchWeatherQuestion('三地现在有天气预警吗').kind, 'current');
  assert.match(matchWeatherQuestion('上海今天气温如何').notice, /本地小仓北区/);
  assert.match(matchWeatherQuestion('下周天气如何').notice, /今明/);
  for (const text of ['CPU温度是多少', '帮我翻译天气预报', '天气API怎么用', '解释截图里的天气图标', '提醒我明天查天气']) {
    assert.equal(matchWeatherQuestion(text), null, text);
  }
});

test('文字与旧版截图接口通过已鉴权的天气代理答复；上游失败不触发模型', async () => {
  const urls = [];
  let failed = false, models = 0;
  const model = () => { models++; throw Error('不应调用模型'); };
  const worker = createWorker({createAiClient:model, createVisionClient:model, weatherOptions:{now:()=>at,
    fetcher:async url => {
      urls.push(url);
      return failed ? new Response(null,{status:502}) : Response.json(url.includes('jma.go.jp') ? [report({code:'03',status:'発表'})] : current);
    }}});
  async function ask(screen, token = 'isolated-test') {
    const question = '我爸妈那边天气如何？';
    const body = screen ? {question,image:{mime_type:'image/jpeg',data_base64:'/9j/'}} : {messages:[{role:'user',content:question}]};
    const path = screen ? 'screen-question' : 'message';
    return worker.fetch(new Request('https://worker.test/api/assistant/'+path, {method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}),proxyEnv);
  }
  assert.equal((await ask(false,'wrong')).status,401);
  assert.equal(urls.length,0);
  const message = await (await ask(false)).json(), screen = await (await ask(true)).json();
  assert.match(message.reply, /北九州市小仓北区.*阴.*11.7°C.*JST/);
  assert.match(message.reply, /当前警报：.*大雨.*警報/);
  assert.doesNotMatch(message.reply, /未央|永寿/);
  assert.equal(message.proposal,null);
  assert.deepEqual(screen,{ok:true,answer:message.reply});
  failed = true;
  for (const withScreen of [true,false]) assert.equal((await (await ask(withScreen)).json()).error.code,'WEATHER_UNAVAILABLE');
  assert.equal(urls.length,8);
  assert.equal(urls.filter(url => url.includes('/current/33.88/130.88')).length,4);
  assert.equal(urls.filter(url => url.includes('jma.go.jp/bosai/warning/')).length,4);
  assert.equal(models,0);
});

test('气泡两种提交方式和重试只发天气 GET；勾选截图也不采集屏幕', async () => {
  const calls = [];
  let failed = false, captures = 0;
  const client = await createScreenQuestionClient({screen:{getCursorScreenPoint(){captures++;throw Error();}},
    request:async (path, options) => {
      calls.push([path,options.method,options.body]);
      if (failed) return Response.json({error:{code:'WEATHER_UPSTREAM_ERROR'}},{status:502});
      return path.endsWith('/alerts') ? Response.json([report()]) : Response.json(current);
    }});
  assert.match((await client.askText('今天天气怎么样')).text,/小仓北区.*11.7°C/);
  assert.match((await client.captureAndAsk('妻子那边有天气预警吗')).text,/小仓北区.*11.7°C[\s\S]*暂无生效预警/);
  failed = true;
  const error = await client.captureAndAsk('妻子那边有天气预警吗');
  assert.equal(error.code,'WEATHER_UNAVAILABLE');
  failed = false;
  assert.equal((await client.retryLast()).state,'answer');
  assert.deepEqual(calls.map(([path])=>path),Array(5).fill(['/api/weather/kokurakita/current','/api/weather/kokurakita/alerts']).flat());
  assert.ok(calls.every(([,method,body]) => method === 'GET' && body === undefined));
  assert.equal(captures,0);
});

test('明天带伞只取小仓当地明日预报，附上当前警报', async () => {
  const worker = createWorker({weatherOptions:{now:()=>Date.parse('2026-11-19T15:30:00Z'),fetcher:async url => {
    if (url.includes('jma.go.jp')) return Response.json([report()]);
    assert.match(url,/daily\/33.88\/130.88/);
    return Response.json({days:[{...dayForecast('2026-11-21','+09:00',7),
      daytime:{condition:{text:'小雨'},precipitation:{probability:0.8}},nighttime:{condition:{text:'多云'}}}]});
  }}});
  const response = await worker.fetch(new Request('https://worker.test/api/assistant/message',{method:'POST',
    headers:{Authorization:'Bearer isolated-test'},body:JSON.stringify({messages:[{role:'user',content:'老婆那边明天出门要带伞吗？'}]})}),proxyEnv);
  assert.match((await response.json()).reply,/小仓北区.*11-21.*白天小雨.*80%.*夜间多云.*最低7°C[\s\S]*当前警报：暂无生效预警/);
});

test('只缺一项时，气泡保留本地查到的天气或警报', async () => {
  let alertsFailed = true;
  const client = await createScreenQuestionClient({request: async path => {
    const alerts = path.endsWith('/alerts');
    if (alerts === alertsFailed) return new Response(null,{status:502});
    return Response.json(alerts ? [report({code:'03',status:'発表'})] : current);
  }});
  const weather = await client.askText('今天天气怎么样');
  assert.match(weather.text,/小仓北区.*11.7°C[\s\S]*当前警报暂不可用/);
  assert.doesNotMatch(weather.text,/暂无生效预警/);
  alertsFailed = false;
  const alerts = await client.askText('有警报吗');
  assert.match(alerts.text,/小仓北区：天气数据暂不可用[\s\S]*大雨.*警報/);
});

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
