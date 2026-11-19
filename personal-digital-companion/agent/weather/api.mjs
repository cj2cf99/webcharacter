const locations = new Map([
  ['kokurakita', '33.88/130.88'], ['weiyang', '34.31/108.95'], ['yongshou', '34.69/108.14'],
]);
const japan = new Map([
  ['alerts', 'warning/data/r8/400000.json'], ['tracks', 'typhoon/data/targetTc.json'],
  ['bulletins', 'information/data/r8/information.json'],
]);
const endpoints = new Map([
  ['current', ['/weather/v1/current/', '?lang=zh']],
  ['minimum', ['/weather/v1/daily/', '?days=2&localTime=true&lang=zh']],
  ['alerts', ['/weatheralert/v1/current/', '?lang=zh']],
]);
const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
const error = (status, code) => reply({error: {code}}, status);
const base64Url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_');
const part = value => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function qweather(env, now) {
  const {QWEATHER_HOST: host, QWEATHER_DEVELOPER_ID: iss, QWEATHER_PROJECT_ID: sub,
    QWEATHER_CREDENTIAL_ID: kid, QWEATHER_PRIVATE_KEY: secret} = env;
  if (!/^[a-z0-9]+(?:\.[a-z0-9]+)*\.qweatherapi\.com$/i.test(host ?? '') || !/^Q[A-Z0-9]{9}$/.test(iss ?? '')
    || ![sub, kid].every(value => /^[A-Z0-9]{10}$/.test(value ?? '')) || typeof secret !== 'string') return null;
  try {
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(secret.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0)),
      'Ed25519', false, ['sign']);
    const iat = Math.floor(now / 1000) - 30;
    const text = part({alg: 'EdDSA', kid}) + '.' + part({iss, sub, iat, exp: iat + 600});
    const signed = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(text));
    return {origin: 'https://' + host, headers: {Authorization: 'Bearer ' + text + '.' + base64Url(new Uint8Array(signed))}};
  } catch { return null; }
}

export async function handleWeather(request, env, {fetcher = fetch, now = Date.now} = {}) {
  if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED');
  const url = new URL(request.url);
  const [, place, kind] = /^\/api\/weather\/([a-z]+)\/([a-z]+)$/.exec(url.pathname) ?? [];
  if (url.search || !locations.has(place)) return error(404, 'WEATHER_NOT_FOUND');
  const official = place === 'kokurakita' ? japan.get(kind) : null;
  const endpoint = endpoints.get(kind);
  if (!official && !endpoint) return error(404, 'WEATHER_NOT_FOUND');
  let target, headers;
  if (official) target = 'https://www.jma.go.jp/bosai/' + official;
  else {
    const auth = await qweather(env, now());
    if (!auth) return error(503, 'WEATHER_NOT_CONFIGURED');
    target = auth.origin + endpoint[0] + locations.get(place) + endpoint[1];
    headers = auth.headers;
  }
  try {
    const response = await fetcher(target, {headers, redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(9000)])});
    if (!response.ok) return error(502, 'WEATHER_UPSTREAM_ERROR');
    return reply(await response.json());
  } catch { return error(502, 'WEATHER_UPSTREAM_ERROR'); }
}
