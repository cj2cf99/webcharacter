// 已停止的第五组草稿，未测试/未接线；用户要求加密最后处理，不能作为当前依赖。
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEVICE_ID_PATTERN } from './identity.mjs';

export const DEVICE_TOKEN_PATTERN = /^pcd_[0-9a-f]{64}$/;

// 只在Windows主进程app.whenReady后使用。safeStorage由宿主注入，不向renderer暴露。
export function createCredentialStore({ directory, deviceId, safeStorage, platform = process.platform } = {}) {
  if (platform !== 'win32') throw new Error('设备凭据存储目前仅支持Windows');
  if (typeof directory !== 'string' || !isAbsolute(directory)) throw new Error('必须指定凭据目录的绝对路径');
  if (typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) throw new Error('设备标识无效');
  if (!safeStorage || ['isAsyncEncryptionAvailable', 'encryptStringAsync', 'decryptStringAsync'].some(key => typeof safeStorage[key] !== 'function')) {
    throw new Error('需要Electron主进程异步安全存储');
  }
  const path = join(directory, 'device-credential.bin');
  const validate = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
      || value.device_id !== deviceId || typeof value.token !== 'string' || !DEVICE_TOKEN_PATTERN.test(value.token)) {
      throw new Error('凭据格式或设备归属不正确');
    }
    return { device_id: deviceId, token: value.token };
  };
  async function available() {
    let enabled = false;
    try { enabled = await safeStorage.isAsyncEncryptionAvailable(); } catch { /* 不输出底层错误。 */ }
    if (enabled !== true) throw new Error('系统安全存储不可用，未使用明文保存');
  }
  return {
    async save(value) {
      const credential = validate(value);
      await available();
      let encrypted;
      try { encrypted = await safeStorage.encryptStringAsync(JSON.stringify(credential)); }
      catch { throw new Error('凭据加密失败，旧凭据未更改'); }
      if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw new Error('凭据加密结果无效');
      // 明文只在内存，连临时文件也只写入safeStorage密文。
      const temporary = join(directory, `.device-credential-${randomUUID()}.tmp`);
      try {
        await mkdir(directory, { recursive: true });
        await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 });
        await rename(temporary, path);
      } catch { throw new Error('凭据密文保存失败'); }
      finally { await unlink(temporary).catch(() => {}); }
    },
    async load() {
      await available();
      let encrypted;
      try { encrypted = await readFile(path); }
      catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error('无法读取凭据密文');
      }
      try { return validate(JSON.parse(await safeStorage.decryptStringAsync(encrypted))); }
      catch { throw new Error('凭据损坏、设备不匹配或无法解密，未自动重新登记'); }
    },
    async remove() {
      try { await unlink(path); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('无法移除本机凭据密文'); }
    },
  };
}
