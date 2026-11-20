export const WEATHER_PLACES = [
  {id: 'kokurakita', owner: '我', name: '北九州市小仓北区', coordinates: '33.88/130.88', timezone: 'Asia/Tokyo', low: 10},
  {id: 'weiyang', owner: '父母', name: '西安市未央区', coordinates: '34.31/108.95', timezone: 'Asia/Shanghai', low: 5},
  {id: 'yongshou', owner: '妻子', name: '咸阳市永寿县', coordinates: '34.69/108.14', timezone: 'Asia/Shanghai', low: 5},
];

// 気象庁新版市町村代码。河川氾濫有独立发布区域及编号。
const jmaKinds = [
  ['大雨', ['10', '03', '43', '33']],
  ['土砂災害', ['29', '09', '49', '39']],
  ['高潮', ['19', '08', '48', '38']],
  ['風', ['15', '05', '', '35'], ['強風', '暴風', '', '暴風']],
  ['風雪', ['13', '02', '', '32'], ['風雪', '暴風雪', '', '暴風雪']],
  ['大雪', ['12', '06', '', '36'], ['大雪', '大雪', '', '大雪']],
  ['波浪', ['16', '07', '', '37'], ['波浪', '波浪', '', '波浪']],
  ...[['雷','14'],['融雪','17'],['濃霧','20'],['乾燥','21'],['なだれ','22'],
    ['低温','23'],['霜','24'],['着氷','25'],['着雪','26']].map(([name, code]) => [name, [code], [name]]),
];
const jmaCodes = new Map(jmaKinds.flatMap(([kind, codes, names]) => codes.flatMap((code, index) => {
  const level = index + 2;
  const title = (names ? names[index] : 'レベル' + level + kind) + ['注意報', '警報', '危険警報', '特別警報'][index];
  return code ? [[code, {kind, title, level}]] : [];
})));
const activeJma = new Set(['発表', '継続']);
const inactiveJma = new Set(['解除', '発表警報・注意報はなし']);
const cnLevel = {minor: 2, moderate: 3, severe: 4, extreme: 5};
const cnColor = {blue: 2, yellow: 3, orange: 4, red: 5};
const focusTypes = [
  ['台风', /台[风風]/],
  ['降雪', /暴雪|大雪|降雪|雨雪|[风風]雪|[着著]雪/],
  ['寒潮／低温', /寒潮|寒波|低[温溫]|强降[温溫]|強い寒気/],
  ['大雨', /暴雨|大雨|强降雨/],
  ['暴风', /[暴大强強][风風]/],
];

function weatherFocus(name) {
  return focusTypes.find(([, matching]) => matching.test(name))?.[0] ?? '';
}

export function parseCurrent(data) {
  const temperature = data.temperature?.value;
  const wind = data.wind?.speed?.value;
  if (![temperature, wind].every(Number.isFinite) || !data.condition?.text || !Number.isFinite(Date.parse(data.validTime))) {
    throw new Error('实况数据格式异常');
  }
  return {
    temperature, wind, text: data.condition.text, icon: data.condition.code,
    time: data.validTime, notices: attribution(data),
  };
}

export function parseDailyMinimum(data, {timezone, low}, now = Date.now()) {
  const day = new Intl.DateTimeFormat('sv-SE', {timeZone: timezone}).format(now);
  const forecast = data.days?.find(value => value.forecastStartTime?.slice(0, 10) === day
    && Date.parse(value.forecastStartTime) <= now && now < Date.parse(value.forecastEndTime));
  const temperature = forecast?.temperatureMin?.value;
  if (!Number.isFinite(temperature) || forecast.temperatureMin.unit !== '°C') throw new Error('今日最低温预报不可用');
  return {day, temperature, threshold: low, below: temperature < low, notices: attribution(data)};
}

function attribution(data) {
  return (data.metadata?.attributions ?? []).filter(value => typeof value === 'string');
}

function chinaLevel(alert) {
  if (Object.hasOwn(cnColor, alert.color?.code)) return cnColor[alert.color.code];
  return Object.hasOwn(cnLevel, alert.severity) ? cnLevel[alert.severity] : 0;
}

export function parseChinaAlerts(data, now = Date.now()) {
  if (!Array.isArray(data.alerts) || data.alerts.some(a => !a?.id ||
      !['alert', 'update', 'cancel'].includes(a.messageType?.code))) {
    throw new Error('预警数据格式异常');
  }
  const superseded = new Set(data.alerts.flatMap(alert => alert.messageType.supersedes ?? []));
  const values = data.alerts.filter(alert => alert.messageType.code !== 'cancel'
    && !superseded.has(alert.id) && !(Date.parse(alert.expireTime) <= now)).map(alert => ({
      key: [alert.senderName, alert.eventType?.code ?? alert.eventType?.name ?? alert.id].join('/'),
      title: alert.headline || alert.eventType?.name || '气象预警',
      focus: weatherFocus(alert.eventType?.name || alert.headline || ''),
      issuer: alert.senderName ?? '',
      level: chinaLevel(alert),
      time: alert.issuedTime,
      detail: [alert.description, alert.instruction].filter(Boolean).join('\n'),
    }));
  return {values, notices: attribution(data)};
}

export function parseJapaneseAlerts(reports) {
  if (!Array.isArray(reports)) throw new Error('日本气象厅预警数据格式异常');
  let areaFound = false;
  const values = [];
  for (const report of reports) {
    const area = report?.warning?.class20Items?.find(item => item.areaCode === '4010000');
    if (!area) continue;
    if (!Array.isArray(area.kinds)) throw new Error('日本气象厅预警状态不可识别');
    areaFound = true;
    for (const item of area.kinds) {
      if (inactiveJma.has(item.status)) continue;
      if (!activeJma.has(item.status)) throw new Error('日本气象厅预警状态不可识别');
      const {title, level, kind} = jmaCodes.get(item.code) ??
        {title: '気象警報・注意報 (' + (item.code ?? '?') + ')', level: 0, kind: item.code};
      values.push({key: kind, title, level, focus: weatherFocus(title), issuer: report.publishingOffice ?? '気象庁',
        time: report.reportDatetime, detail: report.headlineText ?? ''});
    }
  }
  if (!areaFound) throw new Error('日本气象厅预警未返回北九州市');
  return {values, notices: ['数据来源　日本气象厅，按北九州市发布']};
}
