// request由宿主在完成登录后提供；本模块不读取/存储任何服务端令牌。
export function createTerminalClient(request) {
  if (typeof request !== 'function') throw new TypeError('需要宿主提供已认证请求函数');
  let active = null;

  async function call(path, method = 'GET', body) {
    const response = await request(path, {
      method, credentials: 'same-origin', mode: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw Object.assign(new Error('终端接口响应不是有效JSON'), { status: response.status }); }
    if (!response.ok) {
      const message = typeof payload.error === 'string' ? payload.error : payload.error?.message;
      throw Object.assign(new Error(message || '终端请求失败'), { status: response.status, code: payload.error?.code });
    }
    return payload;
  }

  function ready(payload) {
    if (!payload.terminal || typeof payload.terminal.device_id !== 'string') throw new Error('终端接口缺少关联结果');
    return { state: 'ready', terminal: payload.terminal };
  }

  // 同一动作连点复用在途请求；不同动作交回页面等待，不自动排队/重试。
  function action(key, work) {
    if (active) return active.key === key ? active.promise : Promise.reject(new Error('当前终端操作尚未结束'));
    const promise = Promise.resolve().then(work).finally(() => { active = null; });
    active = { key, promise };
    return promise;
  }

  return {
    check() {
      return action('check', async () => {
        const payload = await call('/api/terminal');
        if (payload.registration_required === true && payload.terminal === null) return { state: 'registration' };
        if (payload.registration_required === false) return ready(payload);
        throw new Error('终端接口返回未知登记状态');
      });
    },
    accept(browserLabel) {
      return action(`accept:${JSON.stringify(browserLabel)}`, async () => ready(await call('/api/terminal/register', 'POST', {
        accepted: true, ...(browserLabel === undefined ? {} : { browser_label: browserLabel }),
      })));
    },
    decline() {
      return action('decline', async () => {
        const payload = await call('/api/devices');
        if (!Array.isArray(payload.devices)) throw new Error('终端接口缺少设备清单');
        return { state: 'management', devices: payload.devices };
      });
    },
    claim(deviceId) {
      return action(`claim:${deviceId}`, async () => ready(await call('/api/terminal/claim', 'POST', { device_id: deviceId })));
    },
  };
}
