import {WEATHER_PLACES, parseCurrent, parseJapaneseAlerts} from './data.mjs';

const localPlace = WEATHER_PLACES[0];
const placeWords = /(?:日本)?北九州市?|小[仓倉](?:北区)?|我这里|我这边|我所在的地方|(?:中国)?西安市?|未央区?|父母|爸妈|爸爸|妈妈|(?:中国)?咸阳市?|永寿县?|妻子|老婆|媳妇/g;
const weatherWords = /天气预报|气象预警|气象警报|天气|气象|预警|警报|预报|气温|温度|多少度|几度|有没有[雨雪]|下不下[雨雪]|[下有降暴大][雨雪]|雨[量天势]|带雨?伞|降水|风速|风大不大|风大|刮风|晴还是阴|阴天|晴[天朗]|冷不冷|热不热|会不会[冷热]|[冷热]吗|寒潮|台风|暴风/;
const otherIntent = /截图|屏幕|图中|图上|图片里|图里|CPU|GPU|硬盘|显卡|电脑|处理器|体温|空调|烤箱|水温|歌词|歌名|小说|代码|接口|软件|应用|API|组件|报错|插件|图标|翻译|写诗|作文|讲个故事|原理|为什么|怎么形成|(?:写|编).*(?:诗|故事|程序)|提醒我|帮我记|记录一下|设置提醒/i;
const queryWords = [
  /好不好|怎么样|怎么[样查]|怎样|咋样|如何|什么样|什么|情况|好|说说|说|最高|最低|概率|可能性|大概|大约|比较|多少|有没有|会不会|要不要|需不需要|是否|需要|是不是|适合/,
  /绯月|能不能|能否|可以|你知道|你能|想知道|告诉我|帮忙|帮我|麻烦|请问|查询|查一查|查查|看一看|看看|[看查]一下|[看查]下|一下|出门/,
  /现在|当前|此刻|目前|今日|今天|明天|明日|明早|明晚|今晚|早上|上午|下午|晚上|白天|当地|本地|外面|室外|这里|这边|那边|那儿|这儿|三个地方|三个地点|三地|各地/,
  /[我家和跟与的是有会要查看请都还很不吗呢么呀啊了吧嘛]/,
];
// 一次扫描，避免将“今天气温”跨词拆成“今 / 天气 / 温”。
const understood = new RegExp([weatherWords, ...queryWords].map(pattern => pattern.source).join('|'), 'g');
const scope = '主动问天气时只查本地小仓北区的天气和当前警报。';

export function matchWeatherQuestion(text) {
  if (!weatherWords.test(text) || otherIntent.test(text)) return null;
  if (/昨天|昨日|后天|下周|下星期|周末|未来|一周|[0-9一二三四五六七八九十]+[月号日点时]|星期[一二三四五六日天]|周[一二三四五六日天]/.test(text)) {
    return {notice: '现有天气接口可查实况、当前预警及今明两天的预报。'};
  }
  const rest = text.replace(placeWords, '').replace(understood, '').replace(/[\s\p{P}]/gu, '');
  if (rest) return {notice: scope};
  const tomorrow = /明天|明日|明早|明晚/.test(text);
  const forecast = tomorrow || /预报|概率|可能性|最高|最低|会.*[雨雪]|[雨雪]会|带雨?伞|今晚|下午|晚上/.test(text);
  return {kind: forecast ? 'minimum' : 'current', tomorrow};
}

const tokyoTime = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
function dailySummary(data, place, tomorrow, now) {
  const date = new Intl.DateTimeFormat('sv-SE', {timeZone: place.timezone}).format(now + (tomorrow ? 86400000 : 0));
  const day = data.days?.find(item => item.forecastStartTime?.startsWith(date));
  if (!day) return date + ' 当地预报暂无数据';
  const fields = [];
  for (const [label, period] of [['白天', day.daytime], ['夜间', day.nighttime]]) {
    if (period?.condition?.text) fields.push(label + period.condition.text);
    const probability = period?.precipitation?.probability;
    if (Number.isFinite(probability)) fields.push(label + '降水概率 ' + Math.round(probability * 100) + '%');
  }
  for (const [label, temp] of [['最低', day.temperatureMin], ['最高', day.temperatureMax]]) {
    if (Number.isFinite(temp?.value) && temp.unit === '°C') fields.push(label + temp.value + '°C');
  }
  return date + ' 当地预报：' + (fields.join('，') || '暂无数据');
}

export async function answerWeatherQuestion(query, request, signal, now = Date.now()) {
  if (query.notice) return query.notice;
  async function read(kind) {
    const response = await request('/api/weather/' + localPlace.id + '/' + kind, {method: 'GET', signal});
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw Object.assign(new Error('天气查询失败'), {status: response.status, code: failure?.error?.code});
    }
    const data = await response.json();
    if (kind === 'alerts') {
      const {values} = parseJapaneseAlerts(data);
      const titles = values.map(item => item.title).join('、') || '暂无生效预警';
      return '当前警报：' + titles + '（日本气象厅）';
    }
    let summary;
    if (kind === 'minimum') {
      summary = dailySummary(data, localPlace, query.tomorrow, now);
    } else {
      const current = parseCurrent(data);
      summary = current.text + '，' + current.temperature + '°C，风速 ' + current.wind + ' m/s（' + tokyoTime.format(Date.parse(current.time)) + ' JST）';
    }
    const extra = (data.metadata?.attributions ?? []).filter(value => typeof value === 'string' && value !== 'https://developer.qweather.com/attribution.html');
    return summary + '（' + ['和风天气', ...extra].join('、') + '）';
  }
  const [weather, alerts] = await Promise.allSettled([read(query.kind), read('alerts')]);
  if (weather.status === 'rejected' && alerts.status === 'rejected') throw weather.reason;
  const conditions = weather.status === 'fulfilled' ? weather.value : '天气数据暂不可用';
  const warnings = alerts.status === 'fulfilled' ? alerts.value : '当前警报暂不可用';
  const answer = [...(localPlace.name + '：' + conditions + '\n' + warnings)];
  return answer.length <= 2000 ? answer.join('') : answer.slice(0, 1999).join('') + '…';
}
