import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {protectWeatherBytes as protect} from './weather-credentials.mjs';

const invalid = () => Object.assign(new Error('云端连接配置无效'), {code: 'CONFIG_INVALID'});
const validToken = token => typeof token === 'string' && /^[\x21-\x7e]+$/.test(token);
export const credentialFilename = 'cloud-access.bin';

export function accessCredentials(credentials) {
  const {client_id, client_secret} = credentials ?? {};
  if (!validToken(client_id) || !validToken(client_secret)) throw invalid();
  return {'CF-Access-Client-Id': client_id, 'CF-Access-Client-Secret': client_secret};
}

async function access(profile, decrypt) {
  const encrypted = await readFile(join(profile, credentialFilename)).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw invalid();
  });
  if (!encrypted) return null;
  let clear;
  try {
    clear = await decrypt(encrypted, false);
    return accessCredentials(JSON.parse(clear.toString('utf8')));
  } catch { throw invalid(); }
  finally { clear?.fill(0); }
}

export async function loadCloudConnection(profile, {fetcher = fetch, decrypt = protect} = {}) {
  const service = await access(profile, decrypt);
  const filename = service ? new URL('./release-connection.json', import.meta.url) : join(profile, 'task-config.json');
  let config, base;
  try {
    config = JSON.parse(await readFile(filename, 'utf8'));
    base = new URL(config.base_url);
  } catch (error) {
    if (!service && error.code === 'ENOENT') return null;
    throw invalid();
  }
  const prefix = config.api_prefix ?? '/api';
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
    || !['/api', '/api/companion'].includes(prefix)
    || !(base.protocol === 'https:' || !service && base.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname))
    || !service && !validToken(config.api_token)) throw invalid();
  const credentials = service ?? {Authorization: 'Bearer ' + config.api_token};
  return {origin: base.origin, mode: service ? 'Access' : '开发连接',
    request(path, options = {}) {
      if (!path.startsWith('/api/') || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path.split('?')[0]) || path.includes('\\')) throw invalid();
      return fetcher(new URL(prefix + path.slice('/api'.length), base),
        {...options, redirect: 'error', headers: {...options.headers, Origin: base.origin, ...credentials}});
    },
  };
}

export async function loadStudyConnection(profile, options) {
  const client = await loadCloudConnection(profile, options);
  if (!client) return null;
  if (client.mode === '开发连接') {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(client.origin).hostname) ? client : null;
  }
  return {...client, request(path, options) {
    const languageRead=/^\/api\/language\/(?:dialogues|scenes)(?:\/[A-Za-z0-9_-]{1,120})?$/u.test(path.split('?')[0]) &&
      (options?.method??'GET')==='GET';
    if (!path.startsWith('/api/study/v1/') && !languageRead) throw Error('该材料尚未接入学习服务，可使用缓存或导入文件');
    return client.request(path, options);
  }};
}
