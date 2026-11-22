'use strict';

const query = new URLSearchParams(location.search);
const eventId = query.get('event');
const index = query.get('report') ?? '';
if (Object.hasOwn(window.weeklyTimelines, eventId) && /^\d+$/.test(index)) {
  const nodes = window.weeklyTimelines[eventId];
  const sources = eventId === 'robot' ? [...nodes, window.weeklyRobotUpdate] : nodes;
  const report = sources.flatMap(node => node[3])[Number(index)];
  if (report) {
    const [publisher, published, title, original] = report;
    const iso = '2026-' + published + ':00+09:00';
    const time = document.createElement('time');
    time.dateTime = iso;
    time.textContent = published.replace('-', '/').replace('T', ' ') + ' JST';
    document.querySelector('#report-byline').append(publisher + ' · ', time);
    document.querySelector('#report-title').textContent = title;
    document.title = title + ' · 来源样例';
    const detail = document.querySelector('#report-detail');
    detail.textContent = sources.find(node => node[3].includes(report))[2];
    detail.hidden = false;
    if (original) {
      const excerpt = document.querySelector('#report-original');
      excerpt.textContent = original;
      excerpt.hidden = false;
    }
  }
}
