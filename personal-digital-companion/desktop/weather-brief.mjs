import {tokyoDay} from './conversation-history.mjs';

const HOUR = 60 * 60_000;
const TEMPERATURE_DAYS = 14;
const RAIN_PROBABILITY = 0.6;
const tokyoTime = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const precipitationLabels = {rain: '降雨', snow: '降雪', mixed: '雨夹雪'};

export function parseUpcomingPrecipitation(data, now) {
  const hours = Array.isArray(data.hours) ? data.hours.map(hour => ({
    at: Date.parse(hour?.forecastTime), type: hour?.precipitation?.type, probability: hour?.precipitation?.probability,
  })).filter(hour => hour.at > now && hour.at <= now + 6 * HOUR) : [];
  if (!hours.length || hours.some(({type, probability}) => type !== 'none' &&
    (!['rain', 'snow', 'mixed', 'ice'].includes(type) || !Number.isFinite(probability) || probability < 0 || probability > 1))) {
    throw new Error('短时雨雪预报不可用');
  }
  const wet = new Map();
  for (const {at, type, probability} of hours.sort((a, b) => a.at - b.at)) {
    if (!Object.hasOwn(precipitationLabels, type) || probability < RAIN_PROBABILITY) continue;
    const key = type === 'mixed' ? 'snow' : type;
    const previous = wet.get(key);
    if (previous && at > previous.until) continue;
    wet.set(key, {key, at: previous?.at ?? at, until: at + HOUR, label: previous?.label ?? precipitationLabels[type]});
  }
  return [...wet.values()];
}

function precipitationText(forecast, day) {
  const on = tokyoDay(forecast.at);
  return '预计 ' + (on === day ? '' : on.slice(5) + ' ') + tokyoTime.format(forecast.at) + ' 左右有' + forecast.label;
}

function temperatureDetails(row, minimum, old, next, daily, now) {
  const day = minimum?.day ?? new Intl.DateTimeFormat('sv-SE', {timeZone: row.timezone ?? 'Asia/Tokyo'}).format(now);
  const start = new Date(Date.parse(day) - TEMPERATURE_DAYS * 24 * HOUR).toISOString().slice(0, 10);
  const temperatures = Object.fromEntries(Object.entries(old.temperatures ?? {}).filter(([date]) => start <= date && date <= day));
  const past = Object.entries(temperatures).filter(([date]) => date < day).map(([, value]) => value);
  next.temperatures = temperatures;
  next.recordDays = {...old.recordDays};
  if (minimum) {
    temperatures[day] = {...temperatures[day], low: minimum.temperature};
    if (Number.isFinite(minimum.maximum)) temperatures[day].high = minimum.maximum;
  }

  const details = [];
  for (const {key, label, value, direction} of [
    {key: 'low', label: '最低', value: minimum?.temperature, direction: -1},
    {key: 'high', label: '最高', value: minimum?.maximum, direction: 1},
  ]) {
    const values = past.map(entry => entry[key]).filter(Number.isFinite);
    if (!values.length) continue;
    const previous = direction < 0 ? Math.min(...values) : Math.max(...values);
    if (daily) details.push('近14天预报' + label + ' ' + previous + '°C' + (values.length < TEMPERATURE_DAYS ? '（' + values.length + '天）' : ''));
    if (values.length === TEMPERATURE_DAYS && Number.isFinite(value) && direction * (value - previous) > 0 && next.recordDays[key] !== day) {
      details.push('近14天预报' + label + '温新纪录 ' + value + '°C（原 ' + previous + '°C）');
      next.recordDays[key] = day;
    }
  }
  return details;
}

export function weatherBrief(rows, triggers, previous = {}, now = Date.now()) {
  const day = tokyoDay(now);
  const lastDaily = previous.day ?? (Number.isFinite(previous.at) ? tokyoDay(previous.at) : null);
  const daily = lastDaily !== day && rows.some(row => row.current.state === 'ready' || row.minimum.state === 'ready');
  const places = {...previous.places};
  const lines = [];
  for (const row of rows) {
    const old = places[row.id] ?? {};
    const next = {};
    const details = [];
    const reasons = triggers.get(row.id) ?? [];
    const minimum = row.minimum.state === 'ready' ? row.minimum.value : null;
    if (daily) {
      if (row.current.state === 'ready') details.push(row.current.value.text);
      if (minimum) details.push(minimum.maximum === null ? '最低 ' + minimum.temperature + '°C' :
        minimum.temperature + '～' + minimum.maximum + '°C');
      if (!details.length) details.push('天气数据暂不可用');
    }

    next.below = minimum?.below ?? old.below;
    next.coldDay = old.coldDay;
    if (minimum?.below && (daily || (old.below === false && old.coldDay !== day))) {
      if (daily) details.push('留意低温');
      else details.push('低温，最低 ' + minimum.temperature + '°C');
      next.coldDay = day;
    }
    details.push(...temperatureDetails(row, minimum, old, next, daily, now));

    next.precipitation = old.precipitation;
    if (row.hourly?.state === 'ready') {
      next.precipitation = {};
      for (const key of ['rain', 'snow']) {
        const forecast = row.hourly.value.find(item => item.key === key);
        const previous = old.precipitation?.[key];
        // 先有一轮明确的干燥预报，才把新的降水算作一次变化。
        if (forecast && (daily || (previous && !previous.active && forecast.at > previous.until))) {
          details.push(precipitationText(forecast, day));
        }
        next.precipitation[key] = {active: Boolean(forecast), until: Math.max(previous?.until ?? 0, forecast?.until ?? 0)};
      }
    }

    places[row.id] = next;
    if (daily) {
      if (row.alerts?.state === 'ready') {
        const titles = new Set(row.alerts.value.values.map(item => item.shortTitle || item.title));
        for (const reason of reasons) titles.add(reason);
        details.push([...titles].join('、') || '暂无生效预警');
      } else {
        details.push(...reasons, '当前预警暂不可用');
      }
    } else {
      details.push(...new Set(reasons));
    }
    if (details.length) lines.push(row.name + '：' + details.join('，'));
  }
  const state = {day: daily ? day : lastDaily, places};
  if (!lines.length) return {state};
  return {body: lines.join('\n'), title: daily ? '天气简报' : '天气提醒', state};
}
