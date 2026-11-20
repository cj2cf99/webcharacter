export const JMA_TRACKS = 'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json';
export const JMA_BULLETINS = 'https://www.jma.go.jp/bosai/information/data/r8/information.json';
export const JMA_TYPOON_PAGE = 'https://www.jma.go.jp/bosai/map.html?contents=typhoon';
export const JMA_BULLETIN_PAGE = 'https://www.jma.go.jp/bosai/information/#area_type=offices&area_code=400000';

const areas = new Map([
  ['VPZJ51/010000', '日本全国'],
  ['VPCJ51/010900', '九州北部'],
  ['VPFJ51/400000', '福冈县'],
]);

export function parseTyphoonTracks(payload) {
  if (!Array.isArray(payload) || payload.some(item => typeof item?.tropicalCyclone !== 'string'
    || !item.tropicalCyclone || !['string', 'number'].includes(typeof item.typhoonNumber))) {
    throw new Error('台风路径列表格式异常');
  }
  return [...new Map(payload.map(item => {
    const number = String(item.typhoonNumber).normalize('NFKC');
    const title = /^\d+$/.test(number) && Number(number) > 0 ? '台风第' + Number(number) + '号' : '发展中的热带低气压 ' + number;
    return [item.tropicalCyclone, title];
  })).values()];
}

export function parseJapanBulletins(payload, now = Date.now()) {
  if (!Array.isArray(payload) || payload.some(item => typeof item?.header !== 'string')) {
    throw new Error('日本气象通报列表格式异常');
  }
  const latest = new Map();
  for (const item of payload) {
    const source = item.header + '/' + item.areaCode;
    const scope = areas.get(source);
    if (!scope || !item.eventId) continue;
    const key = source + '/' + item.eventId;
    const order = Date.parse(item.datetime || item.reportDatetime);
    if (!Number.isFinite(order) || order > now + 5 * 60_000 || order < (latest.get(key)?.order ?? -Infinity)) continue;
    latest.set(key, {item, scope, order});
  }
  const values = [];
  for (const {item, scope} of latest.values()) {
    if (!['発表', '訂正'].includes(item.infoType) || item.mapValidOut === true
      || !(Date.parse(item.validMap || item.valid) > now) || !item.headTitle) continue;
    const tags = Array.isArray(item.infoTag) ? item.infoTag : [];
    const tagged = tags.filter(tag => tag.name === '情報タグ').map(tag => tag.condition).join(' ');
    const text = (item.headTitle + ' ' + tagged).normalize('NFKC');
    const local = scope !== '日本全国';
    const typhoon = !text.includes('元台風')
      && (/台風第\s*\d+\s*号|発達する熱帯低気圧/.test(text) || /(?:^|\s)台風(?:$|\s)/.test(tagged));
    const cold = local && /寒波|強い寒気|強烈な寒気|著しい低温|低温/.test(text);
    if (!typhoon && !cold) continue;
    const type = typhoon ? '台风' : '寒潮／低温';
    const number = (String(tags.find(tag => tag.name === '台風番号')?.condition ?? '').normalize('NFKC').match(/\d+$/)
      ?? text.match(/台風第\s*(\d+)\s*号/))?.at(-1);
    const year = String(item.reportDatetime).slice(0, 4);
    const key = typhoon && number ? year + '/typhoon/' + Number(number) : item.eventId;
    values.push({key, type, scope, local, title: item.headTitle, issuer: item.publishingOffice || '気象庁', time: item.reportDatetime});
  }
  return values.sort((a, b) => Number(b.local) - Number(a.local) || Date.parse(b.time) - Date.parse(a.time));
}
