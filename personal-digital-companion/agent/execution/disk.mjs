import { statfs } from 'node:fs/promises';

export const DISK_TOOL = Object.freeze({ type: 'disk.query', risk: 'L1' });

export function validateDiskParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)
    || Object.keys(params).length !== 1 || typeof params.drive !== 'string'
    || !/^[a-z]:$/i.test(params.drive)) throw new Error('drive必须是C:这样的单个盘符');
  return { drive: params.drive.toUpperCase() };
}

// 仅有固定的只读文件系统调用；注入点用于测试系统读取失败，不接收任务中的代码。
export async function queryDisk(params, { readStats = statfs, platform = process.platform } = {}) {
  const { drive } = validateDiskParams(params);
  if (platform !== 'win32') throw new Error('磁盘查询目前只支持Windows');
  let stats;
  try { stats = await readStats(`${drive}/`, { bigint: true }); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error('指定磁盘不存在');
    if (error?.code === 'EACCES' || error?.code === 'EPERM') throw new Error('无权查询指定磁盘');
    throw new Error('磁盘查询失败');
  }
  try {
    const bytes = blocks => {
      if (typeof blocks !== 'bigint' || blocks < 0n || typeof stats.bsize !== 'bigint' || stats.bsize <= 0n) throw new Error();
      const value = blocks * stats.bsize;
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error();
      return Number(value);
    };
    const result = { drive, total_bytes: bytes(stats.blocks), free_bytes: bytes(stats.bfree), available_bytes: bytes(stats.bavail) };
    if (result.free_bytes > result.total_bytes || result.available_bytes > result.free_bytes) throw new Error();
    return result;
  } catch { throw new Error('磁盘容量数据无效'); }
}
