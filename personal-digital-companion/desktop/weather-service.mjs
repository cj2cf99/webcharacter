import {parseJapanBulletins, parseTyphoonTracks} from './jma-typhoon.mjs';

import {WEATHER_PLACES, parseCurrent, parseDailyMinimum, parseChinaAlerts, parseJapaneseAlerts} from '../agent/weather/data.mjs';
export {WEATHER_PLACES, parseCurrent, parseDailyMinimum, parseChinaAlerts, parseJapaneseAlerts};

export const JMA_WARNING_PAGE = 'https://www.jma.go.jp/bosai/warning/#area_type=class20s&area_code=4010000';
export const JMA_RADAR_PAGE = 'https://www.jma.go.jp/bosai/nowc/#lat:33.88/lon:130.88/zoom:10';

export function createWeatherService({request, clock = Date.now, remindersEnabled = () => true,
  onChange = () => {}, important = () => {}, seen = {}, saveSeen = () => {}}) {
  const rows = WEATHER_PLACES.map(({id, owner, name}) => ({
    id, owner, name, current: {state: 'idle'}, alerts: {state: 'idle'}, minimum: {state: 'idle'},
  }));
  rows[0].japan = {tracks: {state: 'idle'}, bulletins: {state: 'idle'}};
  const lifecycle = new AbortController();
  const pending = {};
  const snapshot = () => ({rows, busy: Object.keys(pending).length > 0});
  async function query(place, part) {
    if (!request) throw Object.assign(Error(), {code: 'WEATHER_NOT_CONFIGURED'});
    const response = await request(`/api/weather/${place}/${part}`, {method: 'GET', signal: lifecycle.signal});
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error(), {code: result?.error?.code});
    return result;
  }
  const failureState = error => error?.code === 'WEATHER_NOT_CONFIGURED' ? 'unconfigured' : 'error';
  async function refreshJapan(part, parse) {
    const previous = rows[0].japan[part];
    try {
      const values = parse(await query('kokurakita', part), clock());
      if (lifecycle.signal.aborted) return;
      rows[0].japan[part] = {state: 'ready', values};
      if (part !== 'bulletins' || !remindersEnabled()) return;
      const notified = new Set(Array.isArray(seen.japanBulletins) ? seen.japanBulletins : []);
      const fresh = values.filter(item => {
        if (!item.local || notified.has(item.key)) return false;
        notified.add(item.key);
        return true;
      });
      if (fresh.length) {
        important(rows[0], fresh, '气象通报');
        seen.japanBulletins = [...notified].slice(-64);
        saveSeen(seen);
      }
    } catch (error) {
      if (!lifecycle.signal.aborted) rows[0].japan[part] = {...previous, state: failureState(error)};
    }
  }
  function checkMinimum(row, value) {
    if (!value.below || lifecycle.signal.aborted || seen.minimumDates?.[row.id] === value.day) return;
    important(row, [{title: '当地 ' + value.day.slice(5) + ' 预报最低 ' + value.temperature
      + '°C，低于 ' + value.threshold + '°C'}], '低温提醒');
    seen.minimumDates = {...seen.minimumDates, [row.id]: value.day};
    saveSeen(seen);
  }
  async function refreshRow(place, row, target) {
    const previous = row[target];
    try {
      let value;
      if (place.id === 'kokurakita' && target === 'alerts') {
        value = parseJapaneseAlerts(await query(place.id, target));
      } else {
        const data = await query(place.id, target);
        if (target === 'current') value = parseCurrent(data);
        else if (target === 'minimum') value = parseDailyMinimum(data, place, clock());
        else value = parseChinaAlerts(data, clock());
      }
      if (lifecycle.signal.aborted) return;
      row[target] = {state: 'ready', checked: clock(), value};
      if (!remindersEnabled()) return;
      if (target === 'minimum') checkMinimum(row, value);
      if (target === 'alerts' && !lifecycle.signal.aborted) {
        const mostImportant = new Map();
        for (const item of value.values) {
          if (item.level > (mostImportant.get(item.key)?.level ?? -1)) mostImportant.set(item.key, item);
        }
        const current = Object.fromEntries([...mostImportant].map(([key, item]) => [key, item.level]));
        const previousLevels = seen[place.id] ?? {};
        const threshold = place.id === 'kokurakita' ? 3 : 4;
        const notable = [...mostImportant.values()].filter(item =>
          (item.focus || item.level >= threshold) && item.level > (Object.hasOwn(previousLevels, item.key) ? previousLevels[item.key] : -1));
        if (notable.length) important(row, notable);
        if (JSON.stringify(current) !== JSON.stringify(previousLevels)) {
          seen[place.id] = current;
          saveSeen(seen);
        }
      }
    } catch (error) {
      if (!lifecycle.signal.aborted) row[target] = {...previous, state: failureState(error)};
    }
  }
  function refresh(target) {
    if (!pending[target] && !lifecycle.signal.aborted) {
      const work = WEATHER_PLACES.map((place, index) => refreshRow(place, rows[index], target));
      if (target === 'alerts') work.push(refreshJapan('tracks', parseTyphoonTracks), refreshJapan('bulletins', parseJapanBulletins));
      pending[target] = Promise.all(work)
        .finally(() => { delete pending[target]; if (!lifecycle.signal.aborted) onChange(snapshot()); });
      onChange(snapshot());
    }
    return pending[target];
  }
  const refreshCurrent = () => Promise.all([refresh('current'), refresh('minimum')]);
  return {
    snapshot,
    whenIdle: () => Promise.all(Object.values(pending)),
    async refreshAll() { await Promise.all([refreshCurrent(), refresh('alerts')]); return snapshot(); },
    refreshCurrent,
    refreshAlerts: () => refresh('alerts'),
    close: () => lifecycle.abort(),
  };
}
