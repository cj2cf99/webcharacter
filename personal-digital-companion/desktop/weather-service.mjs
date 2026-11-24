import {parseJapanBulletins, parseTyphoonTracks} from './jma-typhoon.mjs';
import {parseUpcomingPrecipitation} from './weather-brief.mjs';
import {createHourlyWeatherRequest} from './weather-credentials.mjs';

import {WEATHER_PLACES, parseCurrent, parseDailyMinimum, parseChinaAlerts, parseJapaneseAlerts} from '../agent/weather/data.mjs';
export {WEATHER_PLACES, parseCurrent, parseDailyMinimum, parseChinaAlerts, parseJapaneseAlerts};

export const JMA_WARNING_PAGE = 'https://www.jma.go.jp/bosai/warning/#area_type=class20s&area_code=4010000';
export const JMA_RADAR_PAGE = 'https://www.jma.go.jp/bosai/nowc/#lat:33.88/lon:130.88/zoom:10';

export function createWeatherService({request, requestHourly = createHourlyWeatherRequest(), clock = Date.now, remindersEnabled = () => true,
  onChange = () => {}, important = () => {}, seen = {}, saveSeen = () => {}}) {
  const rows = WEATHER_PLACES.map(({id, owner, name, timezone}) => ({
    id, owner, name, timezone, current: {state: 'idle'}, alerts: {state: 'idle'}, minimum: {state: 'idle'},
    hourly: {state: 'idle'},
  }));
  rows[0].japan = {tracks: {state: 'idle'}, bulletins: {state: 'idle'}};
  const lifecycle = new AbortController();
  const pending = {};
  const snapshot = () => ({rows, busy: Object.keys(pending).length > 0});
  async function query(place, part) {
    if (!request && part !== 'hourly') throw Object.assign(Error(), {code: 'WEATHER_NOT_CONFIGURED'});
    const signal = lifecycle.signal;
    const response = part === 'hourly' ? await requestHourly(place.coordinates, signal) :
      await request(`/api/weather/${place.id}/${part}`, {method: 'GET', signal});
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error(), {code: result?.error?.code});
    return result;
  }
  const failureState = error => error?.code === 'WEATHER_NOT_CONFIGURED' ? 'unconfigured' : 'error';
  async function refreshJapan(part, parse) {
    const previous = rows[0].japan[part];
    try {
      const values = parse(await query(WEATHER_PLACES[0], part), clock());
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
  async function refreshRow(place, row, target) {
    const previous = row[target];
    try {
      let value;
      if (place.id === 'kokurakita' && target === 'alerts') {
        value = parseJapaneseAlerts(await query(place, target));
      } else {
        const data = await query(place, target);
        if (target === 'current') value = parseCurrent(data);
        else if (target === 'minimum') value = parseDailyMinimum(data, place, clock());
        else if (target === 'hourly') value = parseUpcomingPrecipitation(data, clock());
        else value = parseChinaAlerts(data, clock());
      }
      if (lifecycle.signal.aborted) return;
      row[target] = {state: 'ready', checked: clock(), value};
      if (!remindersEnabled()) return;
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
    async refreshAll({includeHourly = false} = {}) {
      const work = [refreshCurrent(), refresh('alerts')];
      if (includeHourly) work.push(refresh('hourly'));
      await Promise.all(work);
      return snapshot();
    },
    refreshCurrent,
    refreshAlerts: () => refresh('alerts'),
    close: () => lifecycle.abort(),
  };
}
