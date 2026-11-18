const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// 只支持当前约定的少量字段，不执行数据库说明或构建JSON Schema平台。
export function validateParameters(spec, params) {
  if (!object(spec)) return { configuration: true };
  const patterns = new Map();
  for (const [name, rule] of Object.entries(spec)) {
    if (!object(rule) || !['string', 'number', 'boolean'].includes(rule.type)
      || Object.keys(rule).some(key => !['type', 'required', 'pattern'].includes(key))
      || (Object.hasOwn(rule, 'required') && typeof rule.required !== 'boolean')
      || (Object.hasOwn(rule, 'pattern') && (rule.type !== 'string' || typeof rule.pattern !== 'string'))) {
      return { configuration: true };
    }
    if (Object.hasOwn(rule, 'pattern')) {
      try { patterns.set(name, new RegExp(rule.pattern)); } catch { return { configuration: true }; }
    }
  }
  if (!object(params) || Object.keys(params).some(key => !Object.hasOwn(spec, key))) return { valid: false };
  for (const [name, rule] of Object.entries(spec)) {
    if (!Object.hasOwn(params, name)) { if (rule.required) return { valid: false }; else continue; }
    const value = params[name];
    if (typeof value !== rule.type || (rule.type === 'number' && !Number.isFinite(value))
      || (patterns.has(name) && !patterns.get(name).test(value))) return { valid: false };
  }
  return { valid: true };
}
