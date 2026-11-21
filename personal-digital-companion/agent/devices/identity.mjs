import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

export const DEVICE_ID_PATTERN = /^pc-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDeviceBinding(text) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('绑定文件不是有效的 JSON'); }
  if (!data || Object.keys(data).length !== 1 ||
      typeof data.device_id !== 'string' || !DEVICE_ID_PATTERN.test(data.device_id)) {
    throw new Error('请选择包含电脑终端 ID 的绑定文件');
  }
  return data.device_id;
}

async function replaceIdentityFile(path, data) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary,data,{flag:'wx',mode:0o600});
    await rename(temporary,path);
  } finally { await rm(temporary,{force:true}); }
}

export async function restoreDeviceIdentity(directory, deviceId) {
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('必须提供应用数据目录');
  if (typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) throw new Error('电脑终端 ID 无效');
  await mkdir(directory,{recursive:true});
  const path = join(directory,'device-identity.json');
  const previous = await readFile(path,'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (previous !== null) {
    let current;
    try { current = JSON.parse(previous)?.device_id; } catch {}
    if (current === deviceId) return;
    await replaceIdentityFile(join(directory,'device-identity.previous.json'),previous);
  }
  await replaceIdentityFile(path,JSON.stringify({device_id:deviceId}));
}

// 目录由桌面主进程提供；此文件只保存设备标识，不保存认证凭据。
export async function getDeviceIdentity(directory) {
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('必须提供应用数据目录');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'device-identity.json');
  let data;
  try {
    data = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const value = JSON.stringify({ device_id: `pc-${randomUUID()}` });
    try {
      await writeFile(path, value, { flag: 'wx', mode: 0o600 });
      data = value;
    } catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError;
      data = await readFile(path, 'utf8');
    }
  }
  let saved;
  try { saved = JSON.parse(data); } catch { throw new Error('设备身份文件损坏，请核对原文件；未创建新身份'); }
  if (!saved || !DEVICE_ID_PATTERN.test(saved.device_id ?? '')) {
    throw new Error('设备身份文件中的标识无效；未创建新身份');
  }
  return { device_id: saved.device_id, computer_name: hostname() };
}
