// 已停止的旧设备凭据/心跳草稿，未测试/未接线；现行第五组不使用本模块。
import { DEVICE_ID_PATTERN } from './identity.mjs';
import { DEVICE_TOKEN_PATTERN } from './credential-store.mjs';

// Windows主进程的单源设备请求；没有主人API_TOKEN或自动重新签发逻辑。
export function createDeviceRequest({ baseUrl, deviceId, credentialStore, fetchImpl = fetch } = {}) {
  let base;
  try { base = new URL(baseUrl); } catch { throw new Error('服务地址无效'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback))
      || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('服务地址必须为HTTPS或本机环回HTTP根地址');
  }
  if (typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) throw new Error('设备标识无效');
  if (!credentialStore || typeof credentialStore.load !== 'function' || typeof fetchImpl !== 'function') throw new Error('需要本机凭据存储和请求函数');

  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('只允许配置服务的API相对路径');
    let destination;
    try { destination = new URL(path, base); } catch { throw new Error('请求路径无效'); }
    if (destination.origin !== base.origin || !destination.pathname.startsWith('/api/')
        || destination.username || destination.password || destination.hash) throw new Error('不能向其它服务发送设备凭据');
    const credential = await credentialStore.load();
    if (!credential) throw new Error('本机尚未保存设备凭据');
    if (credential.device_id !== deviceId || typeof credential.token !== 'string' || !DEVICE_TOKEN_PATTERN.test(credential.token)) {
      throw new Error('本机设备凭据不匹配');
    }
    const headers = new Headers(options.headers);
    // 主人认证、cookie和调用方重定向配置不会被带入设备请求。
    headers.set('Authorization', `Bearer ${credential.token}`);
    headers.delete('Cookie');
    try {
      return await fetchImpl(destination.href, { ...options, headers, redirect: 'error', credentials: 'omit', cache: 'no-store' });
    } catch { throw new Error('设备请求失败，本地凭据和任务记录保留'); }
  }
  async function heartbeat(capabilities = []) {
    const response = await request('/api/device/heartbeat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capabilities }),
    });
    if (!response.ok) throw Object.assign(new Error('设备心跳未获确认'), { status: response.status });
    let data;
    try { data = await response.json(); } catch { throw new Error('设备心跳响应无效'); }
    if (data?.device_id !== deviceId || typeof data.last_seen_at !== 'string') throw new Error('设备心跳确认不匹配');
    return data;
  }
  return { request, heartbeat };
}
