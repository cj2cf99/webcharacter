// 对JSON做确定性编码，避免对象字段顺序影响同任务/同结果核对；不允许静默丢字段。
export function encodeJson(value) {
  const visiting = new Set();
  function normalize(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || visiting.has(item)) throw new Error('数据必须为有效JSON');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('数据必须为普通JSON对象');
    if (Object.getOwnPropertySymbols(item).length) throw new Error('JSON不能包含Symbol字段');
    visiting.add(item);
    let normalized;
    if (Array.isArray(item)) {
      normalized = Array.from(item, normalize);
    } else {
      normalized = Object.create(null);
      for (const key of Object.keys(item).sort()) normalized[key] = normalize(item[key]);
    }
    visiting.delete(item);
    return normalized;
  }
  return JSON.stringify(normalize(value));
}

export const copyJson = value => JSON.parse(encodeJson(value));
